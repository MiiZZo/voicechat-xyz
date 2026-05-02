import { BrowserWindow, ipcMain, desktopCapturer, dialog, net, app } from 'electron';
import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { IPC } from '../shared/types.js';
import type { ScreenSource, FileDownloadRequest, FileDownloadResult } from '../shared/types.js';
import { getPrefs, setPrefs } from './prefs.js';

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IPC.GetPrefs, () => getPrefs());
  ipcMain.handle(IPC.SetPrefs, (_evt, patch) => setPrefs(patch));

  ipcMain.handle(IPC.GetScreenSources, async (): Promise<ScreenSource[]> => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: false,
    });
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      thumbnailDataUrl: s.thumbnail.toDataURL(),
    }));
  });

  ipcMain.handle(IPC.CheckUpdate, async () => {
    const { manualCheck } = await import('./updater.js');
    await manualCheck();
  });
  ipcMain.handle(IPC.InstallUpdate, async () => {
    const { quitAndInstall } = await import('./updater.js');
    quitAndInstall();
  });

  ipcMain.handle(IPC.WindowMinimize, () => {
    getWindow()?.minimize();
  });
  ipcMain.handle(IPC.WindowMaximizeToggle, () => {
    const win = getWindow();
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.handle(IPC.WindowClose, () => {
    getWindow()?.close();
  });
  ipcMain.handle(IPC.WindowIsMaximized, () => getWindow()?.isMaximized() ?? false);

  ipcMain.handle(IPC.OpenInternalUrl, async (_evt, url: string) => {
    if (!/^(chrome|devtools):\/\//.test(url)) return;
    const win = new BrowserWindow({ width: 1100, height: 800 });
    await win.loadURL(url);
  });

  ipcMain.handle(
    IPC.FileDownload,
    async (_evt, req: FileDownloadRequest): Promise<FileDownloadResult> => {
      const win = getWindow();
      if (!win) return { kind: 'error', message: 'no window' };
      const ext = path.extname(req.suggestedName);
      const result = await dialog.showSaveDialog(win, {
        defaultPath: path.join(app.getPath('downloads'), req.suggestedName),
        filters: ext
          ? [{ name: ext.slice(1).toUpperCase(), extensions: [ext.slice(1)] }]
          : undefined,
      });
      if (result.canceled || !result.filePath) return { kind: 'canceled' };

      try {
        await streamToFile(req.url, result.filePath);
        return { kind: 'saved', path: result.filePath };
      } catch (err) {
        return { kind: 'error', message: (err as Error).message };
      }
    },
  );
}

function streamToFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = net.request(url);
    request.on('response', (response) => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      const out = createWriteStream(dest);
      response.on('data', (chunk: Buffer) => out.write(chunk));
      response.on('end', () => {
        out.end();
        out.on('finish', () => resolve());
        out.on('error', (e) => reject(e));
      });
      response.on('error', (e: Error) => {
        out.destroy();
        reject(e);
      });
    });
    request.on('error', (err) => reject(err));
    request.end();
  });
}

/** Forwards Electron maximize/unmaximize events to the renderer. */
export function watchWindowState(win: BrowserWindow): void {
  const send = () => win.webContents.send(IPC.WindowMaximizedChanged, win.isMaximized());
  win.on('maximize', send);
  win.on('unmaximize', send);
  win.on('restore', send);
}
