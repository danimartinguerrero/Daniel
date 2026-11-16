// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';

export default defineConfig({
  site: 'https://mugar123.github.io',
  output: 'static',
  build: { inlineStylesheets: 'auto' },
  integrations: [react()],
  // The client router prefetches on its own; this also lets the island ask for the music page as it
  // opens (IslandNav.tsx), so the song opens its page with no wait.
  prefetch: true,
  // Dev only: the React renderer reaches react-dom/client through a nested package, which Vite
  // otherwise serves as raw CommonJS (no createRoot export) and the island never hydrates.
  vite: { optimizeDeps: { include: ['react-dom/client'] } },
});