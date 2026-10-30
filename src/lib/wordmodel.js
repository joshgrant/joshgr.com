// A character-level Markov model, ported from SmallCharacterModel (Swift).
//
// Training reads text and counts which character follows each run of up to
// `cohesion` characters. Generating walks those counts: start empty, pick a
// likely next character, repeat until the word ends, backtracking when it
// hits a dead end before reaching the target length.
//
// Used in two places: scripts/build-models.mjs prebuilds models for the
// bundled word lists, and the Wizardly Words page trains on files people open.

const WORD_CHAR = /[\p{L}\p{N}'-]/u;
const SURROGATE = /[\uD800-\uDFFF]/;

/** @returns {{ cohesion: number, runs: Record<string, Record<string, number>> }} */
export function buildModel(text, cohesion) {
  const runs = Object.create(null);
  const bump = (key, follower) => {
    const followers = (runs[key] ??= Object.create(null));
    followers[follower] = (followers[follower] ?? 0) + 1;
  };

  let buffer = '';
  for (const ch of text) {
    if (WORD_CHAR.test(ch)) {
      bump(buffer, ch);
      const next = buffer + ch;
      if (next.length <= cohesion) buffer = next;
      else if (SURROGATE.test(next)) buffer = Array.from(next).slice(-cohesion).join('');
      else buffer = next.slice(-cohesion);
    } else {
      bump(buffer, ''); // '' marks the end of a word
      buffer = '';
    }
  }
  bump(buffer, '');
  return { cohesion, runs };
}

function tail(chars, n) {
  return chars.slice(Math.max(0, chars.length - n)).join('');
}

function followersFor(model, suffix) {
  return Object.hasOwn(model.runs, suffix) ? model.runs[suffix] : undefined;
}

function pickFollower(followers, skipping, mustEnd) {
  if (mustEnd) return Object.hasOwn(followers, '') ? '' : null;
  let total = 0;
  const options = [];
  for (const key of Object.keys(followers)) {
    if (skipping && skipping.has(key)) continue;
    options.push([key, followers[key]]);
    total += followers[key];
  }
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (const [key, count] of options) {
    if (r < count) return key;
    r -= count;
  }
  return options[options.length - 1][0];
}

export class GenerationError extends Error {
  /** @param {'prefix' | 'length'} reason */
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}

/** Generates one word of exactly `length` characters (or the prefix length, if longer). */
export function generateWord(model, prefix, length) {
  const word = Array.from(prefix);
  const floor = word.length;
  const skips = new Map();
  const addSkip = (key, value) => {
    if (!skips.has(key)) skips.set(key, new Set());
    skips.get(key).add(value);
  };

  for (let steps = 0; steps < 20000; steps++) {
    const suffix = tail(word, model.cohesion);
    const followers = followersFor(model, suffix);

    if (!followers) {
      if (word.length <= floor) throw new GenerationError('prefix');
      const last = word.pop();
      addSkip(tail(word, model.cohesion), last);
      continue;
    }

    if (word.length < length) addSkip(suffix, ''); // too short to end here
    const next = pickFollower(followers, skips.get(suffix), word.length >= length);

    if (next === null) {
      if (word.length <= floor) throw new GenerationError('length');
      const last = word.pop(); // dead end: back up one character
      addSkip(tail(word, model.cohesion), last);
      continue;
    }
    if (next === '') return word.join('');
    word.push(next);
  }
  throw new GenerationError('length');
}

/**
 * Generates `count` words with lengths between minLength and maxLength.
 * @returns {{ words: string[], error: null | 'prefix' | 'length' }}
 */
export function generateWords(model, { count, minLength, maxLength, prefix = '' }) {
  const words = [];
  let error = null;
  const prefixLength = Array.from(prefix).length;
  for (let i = 0; i < count; i++) {
    const lo = Math.max(minLength, prefixLength);
    const hi = Math.max(lo, maxLength);
    const length = lo + Math.floor(Math.random() * (hi - lo + 1));
    try {
      words.push(generateWord(model, prefix, length));
    } catch (e) {
      if (!(e instanceof GenerationError)) throw e;
      error = e.reason;
    }
  }
  return { words, error: words.length > 0 ? null : error ?? 'length' };
}
