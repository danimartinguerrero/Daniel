// @ts-check
import { defineConfig } from 'astro/config';

// Published by GitHub Pages from the "Daniel" repository, so the site lives under /Daniel.
// If the repository is ever renamed to danimartinguerrero.github.io, drop `base`.
export default defineConfig({
  site: 'https://danimartinguerrero.github.io',
  base: '/Daniel',
  output: 'static',
  build: { inlineStylesheets: 'auto' },
});
