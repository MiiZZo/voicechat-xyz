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
createRoot(rootEl).render(
    <App />,
);
