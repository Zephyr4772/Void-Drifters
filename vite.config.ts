import { defineConfig } from 'vite';

// Relative base so the build works on itch.io and GitHub Pages sub-paths.
export default defineConfig({
  base: './',
  build: { target: 'es2022', assetsInlineLimit: 0 },
});
