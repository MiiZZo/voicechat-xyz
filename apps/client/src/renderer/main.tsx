import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import '@livekit/components-styles';
// Дебаг-хелперы вешаются на window до createRoot, чтобы быть доступны
// в DevTools на любом этапе жизни приложения. В прод оверхед нулевой.
import './lib/debug-bridge.js';
import { App } from './App.js';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('root element missing');

// Подавляем нативное контекстное меню браузера/Electron'а. Radix ContextMenu
// сам перехватывает onContextMenu на своём trigger'е и вызывает preventDefault
// до того, как событие всплывает сюда — поэтому наши menu'хи продолжат
// открываться, а вот системного "Reload / Save image as..." больше не будет.
window.addEventListener('contextmenu', (e) => e.preventDefault());

createRoot(rootEl).render(
    <App />,
);
