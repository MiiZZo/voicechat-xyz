// Дефолт указывает на prod, не на localhost — см. apps/client-tauri/vite.config.ts
// для обоснования. Локальная разработка должна явно задать VITE_LOBBY_URL=http://localhost:3000
// в .env.local-server, иначе клиент пойдёт в prod (это лучше, чем молча в никуда).
const url = import.meta.env.VITE_LOBBY_URL ?? 'https://app.voicechat-xyz.ru';
export const LOBBY_URL = url.replace(/\/$/, '');
