import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import '@livekit/components-styles';
import { App } from './App.js';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('root element missing');
createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
