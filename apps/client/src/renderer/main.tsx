import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import '@livekit/components-styles';
// Дебаг-хелперы вешаются на window до createRoot, чтобы быть доступны
// в DevTools на любом этапе жизни приложения. В прод оверхед нулевой.
import './lib/debug-bridge.js';
// Гасит тяжёлые always-on эффекты (halo-blur, backdrop-filter, speaking-pulse)
// когда окно не в фокусе / скрыто в трей. Workaround для бага WebView2:
// document.visibilityState остаётся 'visible' даже после window.hide(),
// и compositor продолжает компоновать кадры в никуда. См. lib/window-power-save.ts.
import './lib/window-power-save.js';
import { App } from './App.js';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('root element missing');

// Подавляем нативное контекстное меню браузера/Electron'а. Radix ContextMenu
// сам перехватывает onContextMenu на своём trigger'е и вызывает preventDefault
// до того, как событие всплывает сюда — поэтому наши menu'хи продолжат
// открываться, а вот системного "Reload / Save image as..." больше не будет.
window.addEventListener('contextmenu', (e) => e.preventDefault());

// Помечаем dev-сборку в системном title окна (видно в taskbar / Alt-Tab /
// при наведении на tray icon). В Tauri document.title не управляет нативным
// заголовком — пробрасываем через @tauri-apps/api/window. В Electron
// document.title пробрасывается автоматически (BrowserWindow подхватывает).
if (import.meta.env.DEV) {
  const devTitle = 'VoiceChat — DEV';
  document.title = devTitle;
  if ('__TAURI_INTERNALS__' in window) {
    void import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) => getCurrentWindow().setTitle(devTitle))
      .catch(() => {}); // не критично — TitleBar badge всё равно покажет DEV
  }
}

createRoot(rootEl).render(
    <App />,
);
