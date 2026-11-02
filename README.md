# Josh Grant — personal site

A fast, fully static personal site built with [Astro](https://astro.build) and Tailwind CSS. Posts are Markdown files, your details live in one config file, and Wizardly Words runs entirely in the visitor's browser. Cloudflare serves the result for free.

## Run it on your Mac

You need Node.js 22 or newer (`brew install node`).

```sh
npm install
npm run dev
```

Open http://localhost:4321. The page reloads as you edit files.

## Make it yours

These are the only places with placeholder content:

| What | Where |
| --- | --- |
| Your domain, email, social links and projects | `src/site.config.js` |
| The introduction on the homepage | `src/about.md` (the first paragraph becomes the large lead) |
| Logo | `src/components/Logo.astro` and `public/favicon.svg` |

## Write a post

```sh
npm run new "My post title"
```

This creates `src/content/posts/my-post-title.md`, dated today:

```md
---
title: "My post title"
date: 2026-10-30
description: "One or two sentences. Shown in link previews and sent to Buffer."
draft: true # delete this line (or set it to false) to publish
---

Write in Markdown here.
```

Drafts appear while you run `npm run dev` (marked "Draft") but never on the live site. The file name becomes the address: `/writing/my-post-title/`.

You can also just create the `.md` file yourself, in any editor.

Every Markdown style is supported and styled, including headings, bold and italics, links, lists, quotes, inline code and code blocks, tables, task lists (`- [x]`), footnotes (`[^1]`) and horizontal rules. The sample post, `how-wizardly-words-invents-words.md`, uses all of them.

For images, put the file in `public/images/` and reference it as `![Description of the image](/images/photo.jpg)`.

## Projects

Edit the `projects` list in `src/site.config.js`. Projects marked `featured: true` show on the homepage; all of them show on `/projects/`.

## Photos

Put photos in `photos/` (JPEG, PNG, WebP, AVIF or TIFF; export HEIC from Photos as JPEG first). They show on `/photos/` in file-name order, so prefix names with numbers (`01-`, `02-`…) to choose the order. Photos should be square; anything else is cropped to its center square.

To give a photo alt text, add `photos/captions.json`, keyed by file name without the extension:

```json
{ "01-harbor": "Fishing boats in the harbor at dawn" }
```

Before every `dev` and `build`, `scripts/build-photos.mjs` prepares them:

- It **removes all metadata from your originals in `photos/`**, in place: EXIF (camera, settings, date), GPS location, XMP, IPTC, comments, and the hidden extra images iPhones attach. JPEGs and PNGs are cleaned without re-compressing. Other formats, and photos that rely on a rotation tag, are re-saved once as high-quality JPEGs.
- It writes a grid image and a 2400px preview of each photo to `public/photos/`, named by a hash so not even the file name is published, and stops the build if any of them still contains metadata.

**Run `npm run dev` (or `npm run photos`) after adding photos and before committing them** (restart `dev` if it was already running). The originals are committed to Git, and they're only scrubbed when the script runs. A photo committed before that keeps its metadata in the repository's history.

The film grain is drawn over the photos in the browser, so downloaded photos are clean. The grain texture is `public/grain.webp`. To change its character, edit the settings at the top of `scripts/build-grain.mjs` and run `npm run grain`. To change how strongly it shows, change the `opacity` of `.grain::after` in `src/pages/photos.astro`.

## Wizardly Words

The page is `src/pages/wizardly-words.astro`, and its behavior is in `src/scripts/wizardly.js`. The word model itself (ported from SmallCharacterModel) is `src/lib/wordmodel.js`.

The bundled word lists are in `wordlists/`. Before every `dev` and `build`, `scripts/build-models.mjs` prebuilds a model for each list at each cohesion level into `public/models/`, so generating is instant. It only rebuilds what changed, and the models aren't committed to Git.

To add a word list, drop a `.txt` file (one word or phrase per line) into `wordlists/` and add it to `src/lib/wordlists.js`.

Files visitors open with "Open file…" are read and trained on in their browser. They're never uploaded anywhere.

## Change the look

Colors and fonts are design tokens at the top of `src/styles/global.css`. Change `--color-tint` and every hover, focus ring and text selection follows. Markdown styling is at the bottom of the same file. Everything else is Tailwind classes in the `.astro` files.

## Put it online with Cloudflare

You do this once. After that, every push to GitHub updates the site within a minute or two.

1. Put this folder in a GitHub repository.
2. In the Cloudflare dashboard, go to **Workers & Pages**, create an application, and import your GitHub repository.
3. Use `npm run build` as the build command and `npx wrangler deploy` as the deploy command. `wrangler.jsonc` already tells Cloudflare to serve the built `dist` folder, with your 404 page for missing addresses.
4. Once it's live, add your domain under the project's **Domains & Routes** settings, and set the same domain as `url` in `src/site.config.js` so the RSS feed links correctly.

To deploy straight from your Mac instead, run `npx wrangler login` once, then `npm run deploy` whenever you want to publish.

## Share new posts with Buffer

The site publishes an RSS feed at `/rss.xml`. Buffer recommends connecting a feed through Zapier, and IFTTT and Make have ready-made "new RSS item → Buffer" automations too. Point one of them at `https://your-domain/rss.xml`, and each new post is queued to your Buffer channels automatically, with its title, description and link.

## What's where

```
src/
  site.config.js        Your name, links, projects
  about.md              Homepage introduction
  content/posts/        Blog posts (Markdown)
  pages/                One file per page (index, writing, projects, photos, wizardly-words, 404, rss)
  layouts/Base.astro    Header, menus and footer shared by every page
  components/           Logo, project list, post list
  styles/global.css     Design tokens and Markdown styling
  lib/                  Post helpers, word model, word list registry
  scripts/wizardly.js   Wizardly Words page behavior
scripts/                Model builder, photo and grain builders, "new post" helper
photos/                 Your photos (metadata is stripped automatically)
wordlists/              Source word lists for Wizardly Words
public/                 Files served as-is (favicon, images, grain texture)
wrangler.jsonc          Cloudflare settings
```
