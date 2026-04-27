import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  main: { build: { outDir: 'out/main' } },
  preload: { build: { outDir: 'out/preload' } },
  renderer: {
    root: '.',
    plugins: [react()],
    resolve: { alias: { '@': resolve(__dirname, 'src/renderer') } },
    build: { outDir: 'out/renderer', rollupOptions: { input: 'index.html' } },
  },
});
