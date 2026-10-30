// Wizardly Words in the browser. Bundled lists load prebuilt models from
// /models (see scripts/build-models.mjs). Files people open are read and
// trained on right here, on their device; nothing is uploaded.

import { buildModel, generateWords } from '../lib/wordmodel.js';
import { modelPath } from '../lib/wordlists.js';

const LIMITS = {
  cohesion: [1, 5],
  count: [1, 100],
  minLength: [1, 20],
  maxLength: [1, 20],
};

const MESSAGES = {
  prefix: (prefix) => `No words in this list continue from “${prefix}”. Try a different prefix.`,
  length: () => 'This list can’t make words of that length. Try a shorter length or lower cohesion.',
  load: () => 'Couldn’t load that word list. Check your connection and try again.',
  emptyFile: () => 'That file has no words in it. Choose a plain text file with one word or phrase per line.',
  readFile: () => 'Couldn’t read that file. Choose a plain text file and try again.',
};

export function start() {
  const $ = (id) => document.getElementById(id);
  const el = {
    form: $('ww-form'),
    source: $('ww-source'),
    file: $('ww-file'),
    fileEmpty: $('ww-file-empty'),
    fileLoaded: $('ww-file-loaded'),
    fileName: $('ww-file-name'),
    fileInfo: $('ww-file-info'),
    fileClear: $('ww-file-clear'),
    prefix: $('ww-prefix'),
    generate: $('ww-generate'),
    building: $('ww-building'),
    error: $('ww-error'),
    empty: $('ww-empty'),
    results: $('ww-results'),
    countLabel: $('ww-result-count'),
    copy: $('ww-copy'),
    words: $('ww-words'),
  };
  if (!el.form) return;

  const state = {
    source: el.source.value,
    file: null, // { key, name, text, lines }
    cohesion: 3,
    count: 10,
    minLength: 4,
    maxLength: 9,
    building: false,
    error: '',
    words: [],
  };

  const models = new Map(); // key -> Promise<model>
  let wantedKey = '';
  let copyTimer;

  const modelKey = () => `${state.file ? state.file.key : state.source}|${state.cohesion}`;

  function loadModel() {
    const key = modelKey();
    wantedKey = key;
    if (!models.has(key)) {
      const { file, source, cohesion } = state;
      const job = file
        ? new Promise((resolve) => setTimeout(resolve, 30)).then(() => buildModel(file.text, cohesion))
        : fetch(modelPath(source, cohesion)).then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
          });
      models.set(key, job);
      job.catch(() => models.delete(key));
    }
    const job = models.get(key);
    let settled = false;
    job.then(() => (settled = true), () => (settled = true));
    // Only show the spinner if loading takes a noticeable moment.
    setTimeout(() => {
      if (!settled && wantedKey === key) update({ building: true });
    }, 120);
    return job.then(
      (model) => {
        if (wantedKey === key) update({ building: false });
        return model;
      },
      (err) => {
        if (wantedKey === key) update({ building: false, error: MESSAGES.load(), words: [] });
        throw err;
      },
    );
  }

  function update(patch) {
    Object.assign(state, patch);
    render();
  }

  function render() {
    for (const output of el.form.querySelectorAll('[data-value]')) {
      output.textContent = String(state[output.dataset.value]);
    }
    for (const button of el.form.querySelectorAll('[data-step]')) {
      const key = button.dataset.step;
      const [min, max] = LIMITS[key];
      button.disabled = Number(button.dataset.delta) < 0 ? state[key] <= min : state[key] >= max;
    }

    el.source.disabled = Boolean(state.file);
    el.fileEmpty.hidden = Boolean(state.file);
    el.fileLoaded.hidden = !state.file;
    if (state.file) {
      el.fileName.textContent = state.file.name;
      const n = state.file.lines;
      el.fileInfo.textContent = `${n.toLocaleString()} ${n === 1 ? 'line' : 'lines'}, read on this device`;
    }

    el.generate.disabled = state.building;
    const idle = !state.building;
    el.building.hidden = idle;
    el.error.hidden = !(idle && state.error);
    el.error.textContent = state.error;
    el.empty.hidden = !(idle && !state.error && state.words.length === 0);
    el.results.hidden = !(idle && !state.error && state.words.length > 0);
  }

  function renderWords() {
    const n = state.words.length;
    el.countLabel.textContent = `${n} ${n === 1 ? 'word' : 'words'}`;
    el.copy.textContent = 'Copy all';
    el.words.replaceChildren(
      ...state.words.map((word) => {
        const li = document.createElement('li');
        li.className = 'text-[28px] leading-[1.3] tracking-[-0.015em] break-words';
        li.textContent = word;
        return li;
      }),
    );
  }

  function settingsChanged() {
    update({ words: [], error: '' });
    loadModel().catch(() => {});
  }

  // Steppers. Raising the minimum past the maximum pushes the maximum up, and vice versa.
  el.form.addEventListener('click', (event) => {
    const button = event.target.closest('[data-step]');
    if (!button) return;
    const key = button.dataset.step;
    const [min, max] = LIMITS[key];
    const value = Math.min(max, Math.max(min, state[key] + Number(button.dataset.delta)));
    const patch = { [key]: value };
    if (key === 'minLength') patch.maxLength = Math.max(state.maxLength, value);
    if (key === 'maxLength') patch.minLength = Math.min(state.minLength, value);
    update(patch);
    if (key === 'cohesion') settingsChanged();
  });

  el.source.addEventListener('change', () => {
    state.source = el.source.value;
    settingsChanged();
  });

  el.file.addEventListener('change', async () => {
    const file = el.file.files && el.file.files[0];
    el.file.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((line) => line.trim()).length;
      if (lines === 0) {
        update({ error: MESSAGES.emptyFile(), words: [] });
        return;
      }
      state.file = { key: `file:${file.name}:${file.size}:${file.lastModified}`, name: file.name, text, lines };
      settingsChanged();
    } catch {
      update({ error: MESSAGES.readFile(), words: [] });
    }
  });

  el.fileClear.addEventListener('click', () => {
    state.file = null;
    settingsChanged();
    el.file.focus();
  });

  el.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    let model;
    try {
      model = await loadModel();
    } catch {
      return;
    }
    const prefix = el.prefix.value.trim();
    const { words, error } = generateWords(model, {
      count: state.count,
      minLength: state.minLength,
      maxLength: state.maxLength,
      prefix,
    });
    update({ words, error: error ? MESSAGES[error](prefix) : '' });
    renderWords();
  });

  el.copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(state.words.join('\n'));
      el.copy.textContent = 'Copied';
    } catch {
      el.copy.textContent = 'Couldn’t copy';
    }
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => (el.copy.textContent = 'Copy all'), 1600);
  });

  render();
  loadModel().catch(() => {});
}
