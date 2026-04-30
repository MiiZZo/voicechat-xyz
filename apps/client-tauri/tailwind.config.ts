// Перенаправляем на конфиг Electron-клиента — токены/цвета/анимации одни.
// Расширяем только список content-путей: добавляем собственный index.html и src/.
import baseConfig from '../client/tailwind.config.js';
import type { Config } from 'tailwindcss';

const config: Config = {
  ...baseConfig,
  content: [
    './index.html',
    '../client/index.html',
    '../client/src/renderer/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
};

export default config;
