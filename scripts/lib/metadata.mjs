// Metadata scrubbing shared by build-photos.mjs and build-designs.mjs.

import { readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// Strips metadata from an original in place. `dir` is the folder's URL and
// `folder` its name for messages. Returns the (possibly new) file name, and a
// note for the log if the file was changed.
export async function scrub(dir, folder, name) {
  const file = new URL(encodeURIComponent(name), dir);
  const { mtime } = await stat(file);
  const input = await readFile(file);
  let meta;
  try {
    meta = await sharp(input).metadata();
  } catch (error) {
    fail(`Can't read ${folder}/${name} (${error.message}). Export it as a JPEG and try again.`);
  }

  let output = null;
  let outName = name;
  // Rotating a PNG in Finder or Preview doesn't turn its pixels: it writes the
  // turn as tiff:Orientation in the file's XMP, which sharp doesn't read as an
  // orientation. Look there too, or stripping the XMP would undo the rotation.
  const orientation = meta.orientation ?? xmpOrientation(meta.xmp) ?? 1;
  const rotated = orientation !== 1;
  let note = null;

  if (meta.format === 'jpeg' && !rotated) {
    output = cleanJpeg(input, `${folder}/${name}`);
  } else if (meta.format === 'png' && !rotated) {
    output = cleanPng(input, `${folder}/${name}`);
  } else if (meta.format === 'png') {
    // Bake the rotation into the pixels (the tag that described it is going).
    // Stays a lossless PNG, so transparency is kept. Only happens once.
    output = await (await oriented(input, orientation)).png({ compressionLevel: 9 }).toBuffer();
    output = cleanPng(output, `${folder}/${name}`);
    note = `Rotated ${folder}/${name} to match how it's shown in Finder`;
  } else {
    // Bake the rotation into the pixels and re-encode at high quality. Only
    // happens once: the result is a clean JPEG.
    output = await (await oriented(input, orientation))
      .jpeg({ quality: 95, chromaSubsampling: '4:4:4', mozjpeg: true })
      .toBuffer();
    // keepIccProfile keeps only the color profile, but make sure.
    output = cleanJpeg(output, `${folder}/${name}`);
    outName = name.replace(/\.[^.]+$/, '.jpg');
  }

  if (outName !== name || !output.equals(input)) {
    const target = new URL(encodeURIComponent(outName), dir);
    if (outName !== name && (await exists(target))) {
      fail(`Can't convert ${folder}/${name} to ${outName}: that file already exists.`);
    }
    await writeFile(target, output);
    if (outName !== name) await rm(file);
    // Keep the original date, so the file still sorts and looks the same in Finder.
    await utimes(target, mtime, mtime);
    note ??= `Removed metadata from ${folder}/${outName === name ? name : `${name} (now ${outName})`}`;
  }
  await assertClean(new URL(encodeURIComponent(outName), dir), `${folder}/${outName}`, { icc: false });
  return { name: outName, note };
}

// The EXIF orientation (1–8) written in XMP as tiff:Orientation, if any.
function xmpOrientation(xmp) {
  const match = xmp?.toString('utf8').match(/tiff:Orientation(?:="(\d)"|>\s*(\d)\s*<)/);
  const value = Number(match?.[1] ?? match?.[2]);
  return value >= 1 && value <= 8 ? value : undefined;
}

// A sharp pipeline of `input` turned upright from EXIF `orientation`. Two-step
// orientations run each step in its own pipeline, since sharp applies flips
// before rotation whatever order they're called in. The color profile is kept.
export async function oriented(input, orientation) {
  const steps = {
    2: ['flop'],
    3: [['rotate', 180]],
    4: ['flip'],
    5: [['rotate', 90], 'flop'],
    6: [['rotate', 90]],
    7: [['rotate', 90], 'flip'],
    8: [['rotate', 270]],
  }[orientation] ?? [];
  const apply = (image, step) => (Array.isArray(step) ? image[step[0]](step[1]) : image[step]()).keepIccProfile();
  let buffer = input;
  for (const step of steps.slice(0, -1)) {
    buffer = await apply(sharp(buffer), step).png().toBuffer();
  }
  return steps.length ? apply(sharp(buffer), steps.at(-1)) : sharp(buffer).keepIccProfile();
}

// Rebuilds a JPEG from only the segments needed to show it. Drops EXIF and XMP
// (APP1), IPTC (APP13), comments, maker data, and any extra images appended after
// the main one (iPhone gain maps and depth maps carry their own EXIF). Keeps the
// JFIF header, the ICC color profile and the Adobe color marker.
function cleanJpeg(buf, path) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) fail(`${path} isn't a valid JPEG.`);
  const parts = [buf.subarray(0, 2)];
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) fail(`${path} has a damaged JPEG header.`);
    const marker = buf[i + 1];
    if (marker === 0xff) {
      i++; // fill byte
      continue;
    }
    if (marker === 0xda) {
      // Start of scan: copy image data up to the end-of-image marker. Inside scan
      // data a literal 0xFF is always followed by 0x00 or a restart marker, so the
      // first FF D9 is the true end of the main image.
      const end = buf.indexOf(Buffer.from([0xff, 0xd9]), i);
      if (end === -1) fail(`${path} is truncated.`);
      parts.push(buf.subarray(i, end + 2));
      break;
    }
    const length = buf.readUInt16BE(i + 2);
    const segment = buf.subarray(i, i + 2 + length);
    const tag = segment.subarray(4, 18).toString('latin1');
    const keep =
      (marker < 0xe0 || marker > 0xef) && marker !== 0xfe // not APPn or COM
        ? true
        : (marker === 0xe0 && tag.startsWith('JFIF')) ||
          (marker === 0xe2 && tag.startsWith('ICC_PROFILE')) ||
          (marker === 0xee && tag.startsWith('Adobe'));
    if (keep) parts.push(segment);
    i += 2 + length;
  }
  return Buffer.concat(parts);
}

// Rebuilds a PNG from its image and color chunks only. Drops text, EXIF and
// timestamp chunks.
function cleanPng(buf, path) {
  const KEEP = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'iCCP', 'sBIT', 'cICP', 'acTL', 'fcTL', 'fdAT']);
  const parts = [buf.subarray(0, 8)];
  let i = 8;
  while (i < buf.length) {
    const length = buf.readUInt32BE(i);
    const type = buf.subarray(i + 4, i + 8).toString('latin1');
    const chunk = buf.subarray(i, i + 12 + length);
    if (chunk.length !== 12 + length) fail(`${path} is truncated.`);
    if (KEEP.has(type)) parts.push(chunk);
    i += 12 + length;
    if (type === 'IEND') break;
  }
  return Buffer.concat(parts);
}

// `file` is the file's URL, `path` how to name it in messages.
export async function assertClean(file, path, { icc }) {
  // fileURLToPath, not .pathname, so names with spaces resolve.
  const meta = await sharp(fileURLToPath(file)).metadata();
  const found = ['exif', 'xmp', 'iptc', ...(icc ? ['icc'] : [])].filter((key) => meta[key]);
  if (meta.comments?.length) found.push('comments');
  if (found.length) fail(`${path} still contains metadata (${found.join(', ')}).`);
}

export async function exists(url) {
  try {
    await stat(url);
    return true;
  } catch {
    return false;
  }
}

export function fail(message) {
  console.error(message);
  process.exit(1);
}
