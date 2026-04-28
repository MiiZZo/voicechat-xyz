import { app, BrowserWindow, desktopCapturer, ipcMain, session, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { IPC } from '../shared/types.js';
import type {
  ScreenShareRequestPayload,
  ScreenShareResponsePayload,
} from '../shared/types.js';
import { registerIpc, watchWindowState } from './ipc.js';
import { setupAutoUpdate } from './updater.js';
import { setupTray } from './tray.js';
import { buildAppIconImage } from './icon.js';
import { getPrefs } from './prefs.js';

app.commandLine.appendSwitch(
  'enable-features',
  [
    'ScreenCaptureKitMac',
    'WebRtcAllowH264MediaFoundationEncoder',
  ].join(','),
);
app.commandLine.appendSwitch('enable-webrtc-allow-wgc-screen-capturer');
app.commandLine.appendSwitch('enable-webrtc-allow-wgc-window-capturer');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('force-high-performance-gpu');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 800,
    minHeight: 560,
    backgroundColor: '#09090b',
    autoHideMenuBar: true,
    icon: buildAppIconImage(),
    // Fully frameless — we draw our own min/max/close in TitleBar.tsx.
    // Trade-off: Win11 Snap layouts hover doesn't fire on custom buttons,
    // but visual fidelity is exact.
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Hide-to-tray on close, if the user opted in. The window stays alive in the
  // background; quit happens via Tray menu, app.quit(), or app.on('before-quit').
  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    if (!getPrefs().closeToTray) return;
    event.preventDefault();
    mainWindow?.hide();
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

const requestQuit = () => {
  isQuitting = true;
  app.quit();
};

app.on('before-quit', () => {
  isQuitting = true;
});

function registerDisplayMediaHandler(win: BrowserWindow | null): void {
  session.defaultSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      const target = win ?? mainWindow;
      if (!target || target.isDestroyed()) {
        callback({});
        return;
      }
      try {
        const sources = await desktopCapturer.getSources({
          types: ['screen', 'window'],
          thumbnailSize: { width: 320, height: 180 },
          fetchWindowIcons: true,
        });
        const requestId = randomUUID();
        const payload: ScreenShareRequestPayload = {
          requestId,
          sources: sources.map((s) => ({
            id: s.id,
            name: s.name,
            thumbnailDataUrl: s.thumbnail.toDataURL(),
          })),
        };

        const sourceId = await new Promise<string | null>((resolve) => {
          const onResponse = (
            _evt: Electron.IpcMainEvent,
            resp: ScreenShareResponsePayload,
          ) => {
            if (resp.requestId !== requestId) return;
            ipcMain.removeListener(IPC.ScreenShareResponse, onResponse);
            resolve(resp.sourceId);
          };
          ipcMain.on(IPC.ScreenShareResponse, onResponse);
          target.webContents.send(IPC.ScreenShareRequest, payload);
        });

        if (!sourceId) {
          callback({});
          return;
        }
        const chosen = sources.find((s) => s.id === sourceId);
        if (!chosen) {
          callback({});
          return;
        }
        callback({ video: chosen });
      } catch (err) {
        console.error('[display-media] handler error', err);
        callback({});
      }
    },
    { useSystemPicker: process.platform === 'darwin' },
  );
}

app.whenReady().then(async () => {
  registerIpc(() => mainWindow);
  await createWindow();
  if (mainWindow) watchWindowState(mainWindow);
  registerDisplayMediaHandler(mainWindow);
  setupTray({ getWindow: () => mainWindow, onQuit: requestQuit });
  setupAutoUpdate(() => mainWindow);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // If the user opted into hide-to-tray, the window doesn't actually close —
  // it just hides. This handler only fires on a real close, in which case quit.
  if (process.platform !== 'darwin') app.quit();
});
