// Prepares the photos in photos/ for the Photos page. Runs before `dev` and `build`.
//
// 1. Scrubs every original in photos/ of EXIF, GPS, XMP, IPTC and comments, in
//    place, so the files committed to Git carry no metadata either. JPEG and PNG
//    are cleaned losslessly. Anything else (or a photo that relies on an EXIF
//    rotation) is re-encoded once as a high-quality JPEG.
// 2. Writes a square grid image and a large preview of each photo to
//    public/photos/, named by a hash of the photo so no file name leaks, and
//    checks that neither contains any metadata.
// 3. Writes public/photos/manifest.json, which the Photos page reads.

import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const sourceDir = new URL('../photos/', import.meta.url);
const outDir = new URL('../public/photos/', import.meta.url);

// Bump when the output settings change, so every photo is rebuilt.
const PIPELINE = 1;
const THUMB = 800;
const FULL = 2400;
const INPUT = /\.(jpe?g|png|webp|avif|tiff?|heic|heif)$/i;

await mkdir(sourceDir, { recursive: true });
await mkdir(outDir, { recursive: true });

const started = Date.now();
const names = (await readdir(sourceDir))
  .filter((name) => INPUT.test(name))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

let captions = {};
try {
  captions = JSON.parse(await readFile(new URL('captions.json', sourceDir), 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') fail(`photos/captions.json isn't valid JSON: ${error.message}`);
}

const scrubbed = [];
const photos = [];
let built = 0;

for (const original of names) {
  const name = await scrub(original);
  const source = new URL(name, sourceDir);
  const bytes = await readFile(source);
  const slug = createHash('sha256').update(bytes).update(String(PIPELINE)).digest('hex').slice(0, 12);
  const thumb = `${slug}-${THUMB}.webp`;
  const full = `${slug}-${FULL}.jpg`;

  const { width, height } = await sharp(bytes).metadata();
  const side = Math.min(width, height);
  const square = () =>
    sharp(bytes).extract({
      left: Math.floor((width - side) / 2),
      top: Math.floor((height - side) / 2),
      width: side,
      height: side,
    });

  const fullSize = Math.min(side, FULL);
  if (!(await exists(new URL(thumb, outDir))) || !(await exists(new URL(full, outDir)))) {
    // sharp writes no metadata unless asked to (withMetadata / keepExif / keepIccProfile).
    await square()
      .resize(Math.min(side, THUMB))
      .toColorspace('srgb')
      .webp({ quality: 82, smartSubsample: true })
      .toFile(new URL(thumb, outDir).pathname);
    await square()
      .resize(fullSize)
      .toColorspace('srgb')
      .jpeg({ quality: 88, mozjpeg: true, progressive: true })
      .toFile(new URL(full, outDir).pathname);
    built++;
  }
  await assertClean(`public/photos/${thumb}`, { icc: true });
  await assertClean(`public/photos/${full}`, { icc: true });

  const key = name.replace(/\.[^.]+$/, '');
  photos.push({
    slug,
    alt: captions[key] ?? captions[name] ?? 'Photo',
    thumb: `/photos/${thumb}`,
    full: `/photos/${full}`,
    size: fullSize,
  });
}

// Remove outputs for photos that were deleted or changed.
const keep = new Set(['manifest.json', ...photos.flatMap((p) => [p.thumb, p.full].map((f) => f.slice(8)))]);
for (const file of await readdir(outDir)) {
  if (!keep.has(file)) await rm(new URL(file, outDir));
}
await writeFile(new URL('manifest.json', outDir), JSON.stringify(photos, null, 2));

for (const name of scrubbed) console.warn(`Removed metadata from photos/${name}`);
console.log(
  built
    ? `Prepared ${built} photo${built === 1 ? '' : 's'} in ${((Date.now() - started) / 1000).toFixed(1)}s`
    : `Photos are up to date (${photos.length})`,
);

// Strips metadata from an original in place and returns its (possibly new) file name.
async function scrub(name) {
  const file = new URL(name, sourceDir);
  const { mtime } = await stat(file);
  const input = await readFile(file);
  let meta;
  try {
    meta = await sharp(input).metadata();
  } catch (error) {
    fail(`Can't read photos/${name} (${error.message}). Export it as a JPEG and try again.`);
  }

  let output = null;
  let outName = name;
  const rotated = (meta.orientation ?? 1) !== 1;

  if (meta.format === 'jpeg' && !rotated) {
    output = cleanJpeg(input, name);
  } else if (meta.format === 'png' && !rotated) {
    output = cleanPng(input, name);
  } else {
    // Bake the rotation into the pixels (the EXIF tag that described it is going)
    // and re-encode at high quality. Only happens once: the result is a clean JPEG.
    output = await sharp(input)
      .rotate()
      .keepIccProfile()
      .jpeg({ quality: 95, chromaSubsampling: '4:4:4', mozjpeg: true })
      .toBuffer();
    // keepIccProfile keeps only the color profile, but make sure.
    output = cleanJpeg(output, name);
    outName = name.replace(/\.[^.]+$/, '.jpg');
  }

  if (outName !== name || !output.equals(input)) {
    const target = new URL(outName, sourceDir);
    if (outName !== name && (await exists(target))) {
      fail(`Can't convert photos/${name} to ${outName}: that file already exists.`);
    }
    await writeFile(target, output);
    if (outName !== name) await rm(file);
    // Keep the original date, so the file still sorts and looks the same in Finder.
    await utimes(target, mtime, mtime);
    scrubbed.push(outName === name ? name : `${name} (now ${outName})`);
  }
  await assertClean(`photos/${outName}`, { icc: false });
  return outName;
}

// Rebuilds a JPEG from only the segments needed to show it. Drops EXIF and XMP
// (APP1), IPTC (APP13), comments, maker data, and any extra images appended after
// the main one (iPhone gain maps and depth maps carry their own EXIF). Keeps the
// JFIF header, the ICC color profile and the Adobe color marker.
function cleanJpeg(buf, name) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) fail(`photos/${name} isn't a valid JPEG.`);
  const parts = [buf.subarray(0, 2)];
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) fail(`photos/${name} has a damaged JPEG header.`);
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
      if (end === -1) fail(`photos/${name} is truncated.`);
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
function cleanPng(buf, name) {
  const KEEP = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'iCCP', 'sBIT', 'cICP', 'acTL', 'fcTL', 'fdAT']);
  const parts = [buf.subarray(0, 8)];
  let i = 8;
  while (i < buf.length) {
    const length = buf.readUInt32BE(i);
    const type = buf.subarray(i + 4, i + 8).toString('latin1');
    const chunk = buf.subarray(i, i + 12 + length);
    if (chunk.length !== 12 + length) fail(`photos/${name} is truncated.`);
    if (KEEP.has(type)) parts.push(chunk);
    i += 12 + length;
    if (type === 'IEND') break;
  }
  return Buffer.concat(parts);
}

async function assertClean(path, { icc }) {
  const meta = await sharp(new URL(`../${path}`, import.meta.url).pathname).metadata();
  const found = ['exif', 'xmp', 'iptc', ...(icc ? ['icc'] : [])].filter((key) => meta[key]);
  if (meta.comments?.length) found.push('comments');
  if (found.length) fail(`${path} still contains metadata (${found.join(', ')}).`);
}

async function exists(url) {
  try {
    await stat(url);
    return true;
  } catch {
    return false;
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
