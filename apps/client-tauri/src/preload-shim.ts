/**
 * Preload shim — зеркальная реализация контракта window.api из
 * apps/client/src/preload/index.ts поверх Tauri commands/events.
 *
 * Renderer импортирует window.api как глобальный объект (см. preload Electron-
 * клиента), поэтому здесь мы должны выставить его до того, как main.tsx начнёт
 * исполняться. В index.html этот скрипт идёт первым в body — Vite транспилирует
 * оба <script type="module"> в зависимости и сохраняет порядок выполнения.
 *
 * Каналы, события и форматы payload'ов идентичны Electron-версии.
 */
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type {
  Prefs,
  ScreenSource,
  UpdateStatus,
  FileDownloadRequest,
  FileDownloadResult,
  ScreenShareRequestPayload,
  ScreenShareResponsePayload,
} from '../../client/src/shared/types';

type Unlisten = () => void;

/** listen() в Tauri возвращает Promise<UnlistenFn>. Контракт Electron-версии
 * требует синхронный () => void. Оборачиваем в proxy, который дожидается
 * подписки и вызывает unlisten при ранней отписке. */
function syncListen<T>(eventName: string, cb: (payload: T) => void): Unlisten {
  let unlisten: Unlisten | null = null;
  let cancelled = false;
  listen<T>(eventName, (evt) => cb(evt.payload)).then((fn) => {
    if (cancelled) fn();
    else unlisten = fn;
  });
  return () => {
    cancelled = true;
    if (unlisten) unlisten();
  };
}

const api = {
  getPrefs: (): Promise<Prefs> => invoke('prefs_get'),
  setPrefs: (patch: Partial<Prefs>): Promise<Prefs> => invoke('prefs_set', { patch }),
  getScreenSources: (): Promise<ScreenSource[]> => invoke('screen_get_sources'),
  checkUpdate: (): Promise<void> => invoke('update_check'),
  installUpdate: (): Promise<void> => invoke('update_install'),
  onUpdateStatus: (cb: (s: UpdateStatus) => void) => syncListen<UpdateStatus>('update:status', cb),
  downloadFile: (req: FileDownloadRequest): Promise<FileDownloadResult> =>
    invoke('file_download', { req }),
  onScreenShareRequest: (cb: (payload: ScreenShareRequestPayload) => void) =>
    syncListen<ScreenShareRequestPayload>('screen-share:request', cb),
  respondScreenShare: (payload: ScreenShareResponsePayload): void => {
    // Канал односторонний (renderer -> main). Используем invoke без await:
    // в Electron это был ipcRenderer.send (fire-and-forget).
    void invoke('screen_share_respond', { payload });
  },
  window: {
    minimize: async (): Promise<void> => {
      await getCurrentWindow().minimize();
    },
    toggleMaximize: async (): Promise<void> => {
      await getCurrentWindow().toggleMaximize();
    },
    close: async (): Promise<void> => {
      // Окно само решит, прятаться в трей или закрываться: логика в Rust
      // close-requested handler, который читает prefs.closeToTray.
      await getCurrentWindow().close();
    },
    isMaximized: (): Promise<boolean> => getCurrentWindow().isMaximized(),
    onMaximizedChange: (cb: (maximized: boolean) => void) => {
      // Tauri не эмитит "maximized-changed" из коробки. Подписываемся на resize
      // и пересчитываем флаг — этого достаточно для UI-индикатора в TitleBar.
      const win = getCurrentWindow();
      let cancelled = false;
      let unlisten: Unlisten | null = null;
      win
        .onResized(async () => {
          const m = await win.isMaximized();
          if (!cancelled) cb(m);
        })
        .then((fn) => {
          if (cancelled) fn();
          else unlisten = fn;
        });
      return () => {
        cancelled = true;
        if (unlisten) unlisten();
      };
    },
  },
};

(window as unknown as { api: typeof api }).api = api;

export type Api = typeof api;
declare global {
  interface Window {
    api: Api;
  }
}
