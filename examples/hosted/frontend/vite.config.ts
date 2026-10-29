import { defineConfig } from 'vite';
import path from 'node:path';

const sdkRoot = path.resolve(__dirname, '../../..');

export default defineConfig({
  root: '.',
  resolve: {
    alias: {
      '@ludorush/sdk': path.resolve(sdkRoot, 'src/index.ts'),
    },
  },
  server: {
    port: 5200,
    host: true,
    fs: { allow: [sdkRoot] },
    proxy: {
      // Optional HTTP helpers on the Node game service
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
});
