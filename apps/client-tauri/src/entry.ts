// Единая точка входа для Vite. Ветвимся по label текущего Tauri-окна:
//   main         → preload-shim + shared renderer
//   splash       → лёгкий splash без preload-shim (быстрый handshake)
//   notification / tray-menu → прозрачный overlay + preload-shim
import { getCurrentWindow } from '@tauri-apps/api/window';

const label = getCurrentWindow().label;

/** Прозрачный WebView2: убираем tailwind-подложку body и шумовой ::before. */
function setupTransparentOverlay(): void {
  document.documentElement.style.background = 'transparent';
  document.body.style.background = 'transparent';
  document.body.classList.remove('bg-bg', 'text-fg');
  const s = document.createElement('style');
  s.textContent =
    'html, body, #root { background: transparent !important; margin: 0; padding: 0; overflow: hidden; } body::before { display: none !important; }';
  document.head.appendChild(s);
}

if (label === 'splash') {
  setupTransparentOverlay();
  void import('./splash');
} else if (label === 'notification') {
  setupTransparentOverlay();
  void import('./preload-shim').then(() => import('./notification-overlay'));
} else if (label === 'tray-menu') {
  setupTransparentOverlay();
  void import('./preload-shim').then(() => import('./tray-menu'));
} else {
  void import('./preload-shim').then(() => import('@/main'));
}
