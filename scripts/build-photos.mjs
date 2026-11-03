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
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { assertClean, exists, fail, scrub } from './lib/metadata.mjs';

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
  const { name, note } = await scrub(sourceDir, 'photos', original);
  if (note) scrubbed.push(note);
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
  await assertClean(new URL(thumb, outDir), `public/photos/${thumb}`, { icc: true });
  await assertClean(new URL(full, outDir), `public/photos/${full}`, { icc: true });

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

for (const note of scrubbed) console.warn(note);
console.log(
  built
    ? `Prepared ${built} photo${built === 1 ? '' : 's'} in ${((Date.now() - started) / 1000).toFixed(1)}s`
    : `Photos are up to date (${photos.length})`,
);
