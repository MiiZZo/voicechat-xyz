// PostCSS-конфиг загружается Vite относительно css.postcss в vite.config.ts.
// Здесь мы локально подменяем его, чтобы Tailwind подхватил наш tailwind.config.ts
// (а не конфиг соседнего Electron-клиента) и увидел index.html этого пакета.
export default {
  plugins: {
    tailwindcss: { config: './tailwind.config.ts' },
    autoprefixer: {},
  },
};
