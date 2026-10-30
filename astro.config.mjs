import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { site } from './src/site.config.js';

export default defineConfig({
  site: site.url,
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  markdown: {
    // Code blocks stay black on light gray, so color is saved for things you can click.
    syntaxHighlight: false,
  },
});
