import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/** GitHub Pages project site → https://s3roy.github.io/ludo-sdk/ */
const pages = process.env.GITHUB_PAGES === '1';

export default defineConfig({
  root: resolve(__dirname, 'playground'),
  base: pages ? '/ludo-sdk/' : '/',
  publicDir: resolve(__dirname, 'public'),
  server: {
    port: 5195,
    strictPort: true,
    host: true,
    // Cloudflare quick tunnels rotate hostnames
    allowedHosts: true,
    proxy: {
      // Same-origin cash host (Cloudflare tunnel → one URL)
      '/api': { target: 'http://127.0.0.1:8790', changeOrigin: true },
      '/health': { target: 'http://127.0.0.1:8790', changeOrigin: true },
      '/ws': { target: 'http://127.0.0.1:8790', ws: true, changeOrigin: true },
      // Free multiplayer lobby (multi.html) — WS on :8787
      '/mp': { target: 'http://127.0.0.1:8787', ws: true, changeOrigin: true },
    },
  },
  preview: {
    port: 5195,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8790', changeOrigin: true },
      '/health': { target: 'http://127.0.0.1:8790', changeOrigin: true },
      '/ws': { target: 'http://127.0.0.1:8790', ws: true, changeOrigin: true },
      '/mp': { target: 'http://127.0.0.1:8787', ws: true, changeOrigin: true },
    },
  },
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
