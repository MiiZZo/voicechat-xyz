// Единая точка входа для Vite. Сначала ставим shim window.api,
// потом импортируем shared renderer — порядок гарантирован спецификацией ES modules.
// Debug-bridge подтягивается транзитивно из main.tsx, отдельный импорт не нужен.
import './preload-shim';
import '@/main.tsx';
