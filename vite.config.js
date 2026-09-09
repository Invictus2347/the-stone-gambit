import { defineConfig } from 'vite';
import { readFile } from 'node:fs/promises';
import { publicAssets } from './src/public-assets.js';
export default defineConfig({
  plugins: [
    {
      name: 'allowlisted-public-assets',
      apply: 'build',
      async generateBundle() {
        for (const fileName of publicAssets)
          this.emitFile({
            type: 'asset',
            fileName,
            source: await readFile(new URL(`./public/${fileName}`, import.meta.url)),
          });
      },
    },
  ],
  build: {
    copyPublicDir: false,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('node_modules/chess.js')) return 'chess';
        },
      },
    },
    chunkSizeWarningLimit: 750,
  },
});
