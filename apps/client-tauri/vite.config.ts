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
  // Источник env: сначала свой .env в apps/client-tauri/ (если есть),
  // затем общие из apps/client/ — так оба клиента симметричны по умолчанию,
  // но Tauri можно собирать на чистой машине без Electron-пакета.
  const ownEnv = loadEnv(mode, __dirname, '');
  const sharedEnv = loadEnv(mode, electronClientRoot, '');
  const env = { ...sharedEnv, ...ownEnv };

  return {
    root: __dirname,
    publicDir: false,
    define: {
      // Дефолт нарочно указывает на prod, не на localhost. Если CI по любой
      // причине не пробросит .env (как уже было между v0.1.1 и v0.1.2),
      // build всё равно соберётся с рабочим URL, а не молча умрёт против
      // несуществующего localhost:3000. Локальную разработку это не ломает —
      // .env.local-server в apps/client-tauri/ или apps/client/ перебивает дефолт.
      'import.meta.env.VITE_LOBBY_URL': JSON.stringify(
        env.VITE_LOBBY_URL ?? 'https://app.voicechat-xyz.ru',
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
      // Vite по умолчанию не пускает за пределы workspace root'а; явно разрешаем
      // чтение из соседнего пакета — там лежит shared renderer.
      fs: { allow: [__dirname, electronClientRoot] },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: { input: resolve(__dirname, 'index.html') },
    },
  };
});
