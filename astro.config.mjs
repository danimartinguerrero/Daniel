// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';

export default defineConfig({
  site: 'https://mugar123.github.io',
  output: 'static',
  redirects: {
    '/music/fl-studio': '/music/#fl-studio',
    '/music/fl-studio/piano-roll': '/music/#fl-studio',
  },
  build: { inlineStylesheets: 'auto' },
  integrations: [react()],
  // Dev only: the React renderer reaches react-dom/client through a nested package, which Vite
  // otherwise serves as raw CommonJS (no createRoot export) and the island never hydrates.
  vite: { optimizeDeps: { include: ['react-dom/client'] } },
});
