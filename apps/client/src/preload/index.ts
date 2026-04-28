import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/types.js';
import type {
  Prefs,
  ScreenSource,
  UpdateStatus,
  FileDownloadRequest,
  FileDownloadResult,
  ScreenShareRequestPayload,
  ScreenShareResponsePayload,
} from '../shared/types.js';

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
  downloadFile: (req: FileDownloadRequest): Promise<FileDownloadResult> =>
    ipcRenderer.invoke(IPC.FileDownload, req),
  onScreenShareRequest: (cb: (payload: ScreenShareRequestPayload) => void) => {
    const listener = (_evt: unknown, payload: ScreenShareRequestPayload) => cb(payload);
    ipcRenderer.on(IPC.ScreenShareRequest, listener);
    return () => ipcRenderer.removeListener(IPC.ScreenShareRequest, listener);
  },
  respondScreenShare: (payload: ScreenShareResponsePayload): void => {
    ipcRenderer.send(IPC.ScreenShareResponse, payload);
  },
  window: {
    minimize: (): Promise<void> => ipcRenderer.invoke(IPC.WindowMinimize),
    toggleMaximize: (): Promise<void> => ipcRenderer.invoke(IPC.WindowMaximizeToggle),
    close: (): Promise<void> => ipcRenderer.invoke(IPC.WindowClose),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke(IPC.WindowIsMaximized),
    onMaximizedChange: (cb: (maximized: boolean) => void) => {
      const listener = (_evt: unknown, maximized: boolean) => cb(maximized);
      ipcRenderer.on(IPC.WindowMaximizedChanged, listener);
      return () => ipcRenderer.removeListener(IPC.WindowMaximizedChanged, listener);
    },
  },
};

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;
declare global {
  interface Window {
    api: Api;
  }
}
