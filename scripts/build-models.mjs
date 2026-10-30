// Prebuilds a model for every word list at every cohesion level, so the
// Wizardly Words page can generate instantly. Runs before `dev` and `build`.
// Skips models that are already newer than their word list.

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { WORD_LISTS, COHESION_LEVELS } from '../src/lib/wordlists.js';
import { buildModel } from '../src/lib/wordmodel.js';

const listDir = new URL('../wordlists/', import.meta.url);
const outDir = new URL('../public/models/', import.meta.url);
const engine = new URL('../src/lib/wordmodel.js', import.meta.url);

const mtime = async (url) => {
  try {
    return (await stat(url)).mtimeMs;
  } catch {
    return 0;
  }
};

await mkdir(outDir, { recursive: true });
const engineTime = await mtime(engine);
let built = 0;
const started = Date.now();

for (const list of WORD_LISTS) {
  const source = new URL(`${list.id}.txt`, listDir);
  const sourceTime = await mtime(source);
  if (!sourceTime) {
    console.error(`Missing word list: wordlists/${list.id}.txt`);
    process.exit(1);
  }
  let text = null;
  for (const cohesion of COHESION_LEVELS) {
    const out = new URL(`${list.id}-${cohesion}.json`, outDir);
    if ((await mtime(out)) > Math.max(sourceTime, engineTime)) continue;
    text ??= await readFile(source, 'utf8');
    const model = buildModel(text, cohesion);
    await writeFile(out, JSON.stringify(model));
    built++;
  }
}

console.log(
  built
    ? `Built ${built} word model${built === 1 ? '' : 's'} in ${((Date.now() - started) / 1000).toFixed(1)}s`
    : 'Word models are up to date',
);
