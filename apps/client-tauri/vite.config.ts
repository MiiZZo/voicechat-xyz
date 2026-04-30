import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Renderer источник — единая точка с Electron-клиентом, никакого дублирования.
const electronClientRoot = resolve(__dirname, '../client');
const rendererRoot = resolve(electronClientRoot, 'src/renderer');

// Tauri запускает фронт на фиксированном порту; сетка совпадает с tauri.conf.json.
const TAURI_DEV_PORT = 5174;

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Берём VITE_LOBBY_URL из .env Electron-клиента, чтобы оба клиента были симметричны
  // и переключение local/remote-server работало одной кнопкой.
  const env = loadEnv(mode, electronClientRoot, '');

  return {
    root: __dirname,
    publicDir: false,
    define: {
      'import.meta.env.VITE_LOBBY_URL': JSON.stringify(
        env.VITE_LOBBY_URL ?? 'http://localhost:3000',
      ),
    },
    plugins: [react()],
    resolve: {
      // Тот же alias `@` что в Electron-клиенте — иначе сломаются shadcn-импорты.
      alias: { '@': rendererRoot },
    },
    // PostCSS/Tailwind берутся локально из ./postcss.config.js + ./tailwind.config.ts.
    // Дев-сервер слушает только локалхост — Tauri WebView подключается отсюда.
    server: {
      host: '127.0.0.1',
      port: TAURI_DEV_PORT,
      strictPort: true,
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: { input: resolve(__dirname, 'index.html') },
    },
  };
});
