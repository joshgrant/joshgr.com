// Prepares the photos in photos/ for the Photos page. Runs before `dev` and `build`.
//
// 1. Scrubs every original in photos/ of EXIF, GPS, XMP, IPTC and comments, in
//    place, so the files committed to Git carry no metadata either. JPEG and PNG
//    are cleaned losslessly. Anything else (or a photo that relies on an EXIF
//    rotation) is re-encoded once as a high-quality JPEG.
// 2. Writes a square grid image and a large preview of each photo to
//    public/photos/, named by a hash of the photo so no file name leaks, and
//    checks that neither contains any metadata.
// 3. Writes public/photos/manifest.json, which the Photos page reads, newest
//    photo first.
//
// A photo's date is when its file was created, recorded in photos/dates.json the
// first time the build sees it. The metadata that held the date is scrubbed and
// Git doesn't keep file dates, so that file is what keeps the order. Edit a date
// there to move a photo.

import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
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

let dates = {};
try {
  dates = JSON.parse(await readFile(new URL('dates.json', sourceDir), 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') fail(`photos/dates.json isn't valid JSON: ${error.message}`);
}
const datesBefore = JSON.stringify(dates);

const scrubbed = [];
const photos = [];
let built = 0;

for (const original of names) {
  // Before scrubbing, which may replace the file with a new one.
  const key = original.replace(/\.[^.]+$/, '');
  if (!dates[key]) {
    const { birthtime, mtime } = await stat(new URL(original, sourceDir));
    // Some file systems don't record a creation time and report 0.
    dates[key] = (birthtime.getTime() > 0 ? birthtime : mtime).toISOString();
  }

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

  photos.push({
    key,
    date: dates[key],
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

// Newest first. Photos from the same moment fall back to name order.
photos.sort((a, b) => b.date.localeCompare(a.date) || b.key.localeCompare(a.key, undefined, { numeric: true }));
await writeFile(new URL('manifest.json', outDir), JSON.stringify(photos.map(({ key, ...photo }) => photo), null, 2));

// Only keep dates for photos that are still here, in the page's order.
dates = Object.fromEntries(photos.map((p) => [p.key, p.date]));
if (JSON.stringify(dates) !== datesBefore) {
  await writeFile(new URL('dates.json', sourceDir), `${JSON.stringify(dates, null, 2)}\n`);
}

for (const note of scrubbed) console.warn(note);
console.log(
  built
    ? `Prepared ${built} photo${built === 1 ? '' : 's'} in ${((Date.now() - started) / 1000).toFixed(1)}s`
    : `Photos are up to date (${photos.length})`,
);
