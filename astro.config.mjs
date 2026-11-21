// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';

// Published by GitHub Pages from the "Daniel" repository, so the site lives under /Daniel.
// If the repository is ever renamed to danimartinguerrero.github.io, drop `base`.
export default defineConfig({
  site: 'https://danimartinguerrero.github.io',
  base: '/Daniel',
  output: 'static',
  build: { inlineStylesheets: 'auto' },
  integrations: [react()],
  // Dev only: the React renderer reaches react-dom/client through a nested package, which Vite
  // otherwise serves as raw CommonJS (no createRoot export) and the island never hydrates.
  vite: { optimizeDeps: { include: ['react-dom/client'] } },
});
