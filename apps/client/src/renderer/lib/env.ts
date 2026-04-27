const url = import.meta.env.VITE_LOBBY_URL ?? 'http://localhost:3000';
export const LOBBY_URL = url.replace(/\/$/, '');
