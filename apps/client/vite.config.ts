import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as {
  version: string;
};

// Веб-версия. Renderer общий с Tauri-клиентом (apps/client-tauri грузит
// src/renderer отсюда же); здесь только своя entry с браузерным window.api.
// VITE_LOBBY_URL берётся из .env.<mode>: dev — `--mode local-server`,
// build — `production`.
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: { '@': resolve(__dirname, 'src/renderer') },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
