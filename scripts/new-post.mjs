// Usage: npm run new "My post title"
// Creates src/content/posts/my-post-title.md as a draft, dated today.

import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';

const title = process.argv.slice(2).join(' ').trim();
if (!title) {
  console.error('Give the post a title: npm run new "My post title"');
  process.exit(1);
}

const slug = title
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const path = `src/content/posts/${slug}.md`;
if (existsSync(path)) {
  console.error(`${path} already exists.`);
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const body = `---
title: ${JSON.stringify(title)}
date: ${today}
description: ""
draft: true # delete this line (or set it to false) to publish
---

Start writing here.
`;

await writeFile(path, body);
console.log(`Created ${path}`);
