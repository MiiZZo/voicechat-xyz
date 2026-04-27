import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/types.js';
import type { Prefs, ScreenSource, UpdateStatus } from '../shared/types.js';

const api = {
  getPrefs: (): Promise<Prefs> => ipcRenderer.invoke(IPC.GetPrefs),
  setPrefs: (patch: Partial<Prefs>): Promise<Prefs> => ipcRenderer.invoke(IPC.SetPrefs, patch),
  getScreenSources: (): Promise<ScreenSource[]> => ipcRenderer.invoke(IPC.GetScreenSources),
  checkUpdate: (): Promise<void> => ipcRenderer.invoke(IPC.CheckUpdate),
  installUpdate: (): Promise<void> => ipcRenderer.invoke(IPC.InstallUpdate),
  onUpdateStatus: (cb: (s: UpdateStatus) => void) => {
    const listener = (_evt: unknown, s: UpdateStatus) => cb(s);
    ipcRenderer.on(IPC.UpdateStatus, listener);
    return () => ipcRenderer.removeListener(IPC.UpdateStatus, listener);
  },
};

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;
declare global {
  interface Window {
    api: Api;
  }
}
