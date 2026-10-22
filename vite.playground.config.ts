import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(__dirname, 'playground'),
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
