import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'LudoSDK',
      fileName: 'ludo-sdk',
      formats: ['es', 'umd'],
    },
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        assetFileNames: 'ludo-sdk.[ext]',
      },
    },
  },
  plugins: [
    dts({
      include: ['src'],
      rollupTypes: true,
      insertTypesEntry: true,
    }),
  ],
});
