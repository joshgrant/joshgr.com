import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Every .md file in src/content/posts becomes a post at /writing/<file-name>/
const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    // One or two sentences. Used in the RSS feed (and so by Buffer) and in link previews.
    description: z.string().optional(),
    // Drafts are visible locally with `npm run dev` but never published.
    draft: z.boolean().default(false),
  }),
});

export const collections = { posts };
