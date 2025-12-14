import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@main': path.join(__dirname, 'src/main'),
      '@shared': path.join(__dirname, 'src/shared'),
    },
  },
  build: {
    outDir: 'dist-main',
    lib: {
      entry: 'src/main/index.ts',
      formats: ['cjs'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: [
        'electron',
        'electron-store',
        '@xhayper/discord-rpc',
        'winston',
        ...require('module').builtinModules,
      ],
    },
    minify: false,
  },
});
