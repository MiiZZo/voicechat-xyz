import { ipcMain, desktopCapturer } from 'electron';
import { IPC } from '../shared/types.js';
import type { ScreenSource } from '../shared/types.js';
import { getPrefs, setPrefs } from './prefs.js';

export function registerIpc(): void {
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
}
