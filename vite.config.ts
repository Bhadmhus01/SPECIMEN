import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Relative base so the static build works from any host or sub-path (GitHub Pages, itch.io, S3...).
export default defineConfig({
  base: './',
  server: {
    host: true,
    // Allow the Arena/E2B preview proxy (*.e2b.app) without disabling host checking entirely.
    allowedHosts: ['.e2b.app'],
  },
  preview: {
    host: true,
    allowedHosts: ['.e2b.app'],
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        gallery: resolve(import.meta.dirname, 'gallery.html'),
      },
    },
  },
});
