import { app, BrowserWindow, Menu, Tray } from 'electron';
import { buildTrayIconImage } from './icon.js';

let trayInstance: Tray | null = null;

/**
 * Create the system tray icon with a context menu (Open / Quit) and
 * click-to-show behavior. Returns the Tray for cleanup.
 */
export function setupTray(opts: {
  getWindow: () => BrowserWindow | null;
  onQuit: () => void;
}): Tray {
  if (trayInstance) return trayInstance;

  const tray = new Tray(buildTrayIconImage());
  tray.setToolTip('VoiceChat');

  const showWindow = () => {
    const win = opts.getWindow();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  };

  const menu = Menu.buildFromTemplate([
    { label: 'Открыть VoiceChat', click: showWindow },
    { type: 'separator' },
    { label: 'Выйти', click: opts.onQuit },
  ]);
  tray.setContextMenu(menu);
  tray.on('double-click', showWindow);
  tray.on('click', showWindow);

  trayInstance = tray;
  app.on('before-quit', () => {
    if (trayInstance) {
      trayInstance.destroy();
      trayInstance = null;
    }
  });

  return tray;
}
