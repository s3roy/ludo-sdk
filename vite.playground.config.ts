import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/** GitHub Pages project site → https://s3roy.github.io/ludo-sdk/ */
const pages = process.env.GITHUB_PAGES === '1';

export default defineConfig({
  root: resolve(__dirname, 'playground'),
  base: pages ? '/ludo-sdk/' : '/',
  publicDir: resolve(__dirname, 'public'),
  server: { port: 5195, host: true },
  preview: { port: 5195 },
  build: {
    outDir: resolve(__dirname, 'dist-playground'),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@ludorush/sdk': resolve(__dirname, 'src/index.ts'),
    },
  },
});
