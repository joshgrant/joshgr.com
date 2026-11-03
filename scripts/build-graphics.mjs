// Prepares the graphics in graphics/ for the Graphics page. Runs before `dev` and `build`.
//
// 1. Scrubs every original in graphics/ of metadata, in place, the same way as
//    the photos (see lib/metadata.mjs).
// 2. Writes a list image and a large preview of each graphic to public/graphics/,
//    uncropped and with transparency kept, named by a hash so no file name leaks.
// 3. Writes public/graphics/manifest.json, which the Graphics page reads.
//
// Graphics are shown in the order of the number their file name starts with.
// Captions come from graphics/captions.json, keyed by file name with or without
// the extension, or else from the file name: "6_WattCheck.png" is "Watt Check".

import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { assertClean, exists, fail, scrub } from './lib/metadata.mjs';

const sourceDir = new URL('../graphics/', import.meta.url);
const outDir = new URL('../public/graphics/', import.meta.url);

// Bump when the output settings change, so every graphic is rebuilt.
const PIPELINE = 3;
// The list shows every graphic at the area of a 360px square: twice that for
// high-density screens.
const LIST_AREA = 720 * 720;
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
  if (error.code !== 'ENOENT') fail(`graphics/captions.json isn't valid JSON: ${error.message}`);
}

const scrubbed = [];
const graphics = [];
let built = 0;

for (const original of names) {
  const { name, note } = await scrub(sourceDir, 'graphics', original);
  if (note) scrubbed.push(note);
  const bytes = await readFile(new URL(name, sourceDir));
  const slug = createHash('sha256').update(bytes).update(String(PIPELINE)).digest('hex').slice(0, 12);
  const thumb = `${slug}-list.webp`;
  const full = `${slug}-full.webp`;

  const meta = await sharp(bytes).metadata();
  const fullScale = Math.min(1, FULL / Math.max(meta.width, meta.height));
  const listScale = Math.min(1, Math.sqrt(LIST_AREA / (meta.width * meta.height)));
  const width = Math.round(meta.width * fullScale);
  const height = Math.round(meta.height * fullScale);
  const listWidth = Math.round(meta.width * listScale);
  const listHeight = Math.round(meta.height * listScale);

  if (!(await exists(new URL(thumb, outDir))) || !(await exists(new URL(full, outDir)))) {
    // sharp writes no metadata unless asked to (withMetadata / keepExif / keepIccProfile).
    await sharp(bytes)
      .resize(listWidth, listHeight)
      .toColorspace('srgb')
      .webp({ quality: 90, alphaQuality: 100, smartSubsample: true })
      .toFile(new URL(thumb, outDir).pathname);
    await sharp(bytes)
      .resize(width, height)
      .toColorspace('srgb')
      .webp({ quality: 92, alphaQuality: 100, smartSubsample: true })
      .toFile(new URL(full, outDir).pathname);
    built++;
  }
  await assertClean(new URL(thumb, outDir), `public/graphics/${thumb}`, { icc: true });
  await assertClean(new URL(full, outDir), `public/graphics/${full}`, { icc: true });

  const key = name.replace(/\.[^.]+$/, '');
  graphics.push({
    slug,
    caption: captions[key] ?? captions[name] ?? captionFrom(key),
    thumb: `/graphics/${thumb}`,
    full: `/graphics/${full}`,
    width,
    height,
  });
}

// Remove outputs for graphics that were deleted or changed.
const keep = new Set(['manifest.json', ...graphics.flatMap((g) => [g.thumb, g.full].map((f) => f.slice(10)))]);
for (const file of await readdir(outDir)) {
  if (!keep.has(file)) await rm(new URL(file, outDir));
}
await writeFile(new URL('manifest.json', outDir), JSON.stringify(graphics, null, 2));

for (const note of scrubbed) console.warn(note);
console.log(
  built
    ? `Prepared ${built} graphic${built === 1 ? '' : 's'} in ${((Date.now() - started) / 1000).toFixed(1)}s`
    : `Graphics are up to date (${graphics.length})`,
);

// "7_ProgressiveDeviceDetection" → "Progressive Device Detection".
function captionFrom(key) {
  return key
    .replace(/^\d+[_\-\s]*/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim();
}
