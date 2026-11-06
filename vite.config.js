import { defineConfig } from 'vite';

// Relative base so the built site works at https://<user>.github.io/<repo>/
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1000 },
});
