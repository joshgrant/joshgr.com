// Prepares the designs in designs/ for the Designs page. Runs before `dev` and `build`.
//
// Each folder in designs/ is a section of the page: designs/app_icons/ is "App Icons".
//
// 1. Scrubs every original of metadata, in place, the same way as the photos
//    (see lib/metadata.mjs).
// 2. Writes a list image and a large preview of each design to public/designs/,
//    uncropped and with transparency kept, named by a hash so no file name leaks.
// 3. Writes public/designs/manifest.json, which the Designs page reads.
//
// Sections follow ORDER below; any other folder comes after them, alphabetically.
// Within a section, designs whose file name starts with a number come first,
// highest number first, then the rest alphabetically.
// Captions come from designs/captions.json, keyed by "folder/name" or just the
// file name, with or without the extension, or else from the file name:
// "6_WattCheck.png" is "Watt Check".

import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { assertClean, exists, fail, scrub } from './lib/metadata.mjs';

const sourceDir = new URL('../designs/', import.meta.url);
const outDir = new URL('../public/designs/', import.meta.url);
// Where these used to be written. Removed so the old images aren't deployed.
const oldOutDir = new URL('../public/graphics/', import.meta.url);

// The order of the sections on the page, by folder name.
const ORDER = ['app_icons', 'stickers', 'people', 'places', 'things', 'ideas'];

// Bump when the output settings change, so every design is rebuilt.
const PIPELINE = 3;
// The list shows every design at the area of a 360px square: twice that for
// high-density screens.
const LIST_AREA = 720 * 720;
const FULL = 2400;
const INPUT = /\.(jpe?g|png|webp|avif|tiff?|heic|heif)$/i;
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

await mkdir(sourceDir, { recursive: true });
await mkdir(outDir, { recursive: true });
await rm(oldOutDir, { recursive: true, force: true });

const started = Date.now();

let captions = {};
try {
  captions = JSON.parse(await readFile(new URL('captions.json', sourceDir), 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') fail(`designs/captions.json isn't valid JSON: ${error.message}`);
}

const entries = await readdir(sourceDir, { withFileTypes: true });
for (const entry of entries) {
  if (entry.isFile() && INPUT.test(entry.name)) {
    console.warn(`Skipped designs/${entry.name}: move it into a section folder to show it.`);
  }
}
const folders = entries
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
  .map((entry) => entry.name)
  .sort((a, b) => rank(a) - rank(b) || collator.compare(a, b));

const scrubbed = [];
const sections = [];
const outputs = new Set(['manifest.json']);
let built = 0;

for (const folder of folders) {
  const dir = new URL(`${encodeURIComponent(folder)}/`, sourceDir);
  const names = (await readdir(dir)).filter((name) => INPUT.test(name));
  const items = [];

  for (const original of names) {
    const { name, note } = await scrub(dir, `designs/${folder}`, original);
    if (note) scrubbed.push(note);
    const bytes = await readFile(new URL(encodeURIComponent(name), dir));
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
        .toFile(fileURLToPath(new URL(thumb, outDir)));
      await sharp(bytes)
        .resize(width, height)
        .toColorspace('srgb')
        .webp({ quality: 92, alphaQuality: 100, smartSubsample: true })
        .toFile(fileURLToPath(new URL(full, outDir)));
      built++;
    }
    await assertClean(new URL(thumb, outDir), `public/designs/${thumb}`, { icc: true });
    await assertClean(new URL(full, outDir), `public/designs/${full}`, { icc: true });
    outputs.add(thumb).add(full);

    const key = name.replace(/\.[^.]+$/, '');
    items.push({
      slug,
      key,
      caption:
        captions[`${folder}/${key}`] ?? captions[`${folder}/${name}`] ?? captions[key] ?? captions[name] ?? captionFrom(key),
      thumb: `/designs/${thumb}`,
      full: `/designs/${full}`,
      width,
      height,
    });
  }

  if (items.length === 0) continue;
  items.sort(byName);
  sections.push({
    slug: folder.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    title: titleFrom(folder),
    items: items.map(({ key, ...item }) => item),
  });
}

// Remove outputs for designs that were deleted or changed.
for (const file of await readdir(outDir)) {
  if (!outputs.has(file)) await rm(new URL(file, outDir));
}
await writeFile(new URL('manifest.json', outDir), JSON.stringify(sections, null, 2));

for (const note of scrubbed) console.warn(note);
const count = sections.reduce((sum, section) => sum + section.items.length, 0);
console.log(
  built
    ? `Prepared ${built} design${built === 1 ? '' : 's'} in ${((Date.now() - started) / 1000).toFixed(1)}s`
    : `Designs are up to date (${count} in ${sections.length} sections)`,
);

// Folders in ORDER come first, in that order; the rest after.
function rank(folder) {
  const i = ORDER.indexOf(folder.toLowerCase());
  return i === -1 ? ORDER.length : i;
}

// Numbered designs first, highest number (newest) first; then the rest alphabetically.
function byName(a, b) {
  const na = a.key.match(/^\d+/)?.[0];
  const nb = b.key.match(/^\d+/)?.[0];
  if (na && nb) return Number(nb) - Number(na) || collator.compare(a.key, b.key);
  if (na) return -1;
  if (nb) return 1;
  return collator.compare(a.key, b.key);
}

// "app_icons" → "App Icons".
function titleFrom(folder) {
  return folder
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// "7_ProgressiveDeviceDetection" → "Progressive Device Detection".
function captionFrom(key) {
  return key
    .replace(/^\d+[_\-\s]*/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim();
}
