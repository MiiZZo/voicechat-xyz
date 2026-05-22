// Единая точка входа для Vite. Сначала ставим shim window.api (он умеет
// notify и работу с окнами), потом ветвимся по label текущего Tauri-окна:
//   main         → обычное приложение (shared renderer из ../client)
//   notification → лёгкий overlay для тоста, рендерится в собственное окно
// Порядок гарантирован спецификацией ES modules: preload-shim резолвится
// и выполняется до того, как стартует динамический import второй половины.
import './preload-shim';
import { getCurrentWindow } from '@tauri-apps/api/window';

const label = getCurrentWindow().label;
if (label === 'notification') {
  // index.html выставляет body class="dark bg-bg text-fg" для основного окна.
  // Для notification-окна нужен прозрачный body, иначе transparent: true
  // из tauri.conf.json не даст эффекта — будет видна сплошная подложка.
  document.body.classList.remove('bg-bg', 'text-fg');
  document.body.style.background = 'transparent';
  // index.css добавляет body::before с шумовой текстурой на весь экран —
  // в прозрачном notification-окне она прокрасит "пустую" область вокруг
  // тоста еле заметным шумом, который видно на тёмном background'е ОС.
  const s = document.createElement('style');
  s.textContent = 'body::before { display: none !important; }';
  document.head.appendChild(s);
  void import('./notification-overlay');
} else if (label === 'tray-menu') {
  // Tray-menu — тот же transparent-trick, что и для notification: body должен
  // быть полностью прозрачным, тостовой подложкой служит сам React-контейнер.
  document.body.classList.remove('bg-bg', 'text-fg');
  document.body.style.background = 'transparent';
  const s = document.createElement('style');
  s.textContent = 'body::before { display: none !important; }';
  document.head.appendChild(s);
  void import('./tray-menu');
} else {
  // Alias '@' резолвится Vite'ом в renderer/main.tsx. Без расширения — чтобы
  // tsc не требовал allowImportingTsExtensions, и Vite сам подберёт .tsx.
  void import('@/main');
}
