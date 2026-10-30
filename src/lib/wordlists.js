// The word lists offered on the Wizardly Words page, in menu order.
// To add one: drop a .txt file (one word or phrase per line) into /wordlists
// and add an entry here. Models are rebuilt automatically on the next build.

export const WORD_LISTS = [
  { id: 'english-words', name: 'English words' },
  { id: 'female-names', name: 'Female names' },
  { id: 'male-names', name: 'Male names' },
  { id: 'parsed-words', name: 'Parsed words' },
  { id: 'french-words', name: 'French words' },
  { id: 'city-names', name: 'City names' },
  { id: 'african-geography', name: 'African geography' },
  { id: 'us-companies', name: 'U.S. companies' },
  { id: 'latin-words', name: 'Latin words' },
  { id: 'music', name: 'Music' },
];

export const COHESION_LEVELS = [1, 2, 3, 4, 5];

export const modelPath = (id, cohesion) => `/models/${id}-${cohesion}.json`;
