import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: 'src/renderer',
  base: './',
  resolve: {
    alias: {
      '@renderer': path.join(__dirname, 'src/renderer/src'),
      '@shared': path.join(__dirname, 'src/shared'),
    },
  },
  build: {
    outDir: '../../dist-renderer',
    emptyOutDir: true,
  },
});
