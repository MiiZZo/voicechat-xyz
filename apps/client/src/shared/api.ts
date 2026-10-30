import type {
  FileDownloadRequest,
  FileDownloadResult,
  NotificationCorner,
  Prefs,
  UpdateStatus,
} from './types.js';

/**
 * Контракт `window.api` — всё, что renderer'у нужно от платформы.
 *
 * Реализации:
 *  - apps/client-tauri/src/preload-shim.ts — Tauri commands/events;
 *  - apps/client/src/web/api.ts — браузерные API.
 *
 * Необязательные поля — возможности, которых в браузере нет (окно, трей,
 * глобальные хоткеи, автообновление). Renderer проверяет их наличие и прячет
 * соответствующий UI, а не ветвится по платформе.
 */
export type Api = {
  getPrefs: () => Promise<Prefs>;
  setPrefs: (patch: Partial<Prefs>) => Promise<Prefs>;
  getAppVersion: () => Promise<string>;
  downloadFile: (req: FileDownloadRequest) => Promise<FileDownloadResult>;
  /** Уведомление о сообщении, пока окно вне фокуса. */
  notify: (opts: { title: string; body: string; corner?: NotificationCorner }) => Promise<void>;

  // === Только desktop ===
  checkUpdate?: () => Promise<void>;
  installUpdate?: () => Promise<void>;
  onUpdateStatus?: (cb: (s: UpdateStatus) => void) => () => void;
  setTrayMicMuted?: (muted: boolean) => Promise<void>;
  setTaskbarOverlayMuted?: (muted: boolean) => Promise<void>;
  syncTrayMenu?: (state: { inRoom: boolean; muted: boolean }) => Promise<void>;
  setGlobalShortcuts?: (opts: {
    globalShortcutToggleMute: string;
    globalShortcutLeaveRoom: string;
  }) => Promise<void>;
  /** Управление frameless-окном (кнопки в TitleBar). */
  window?: {
    minimize: () => Promise<void>;
    toggleMaximize: () => Promise<void>;
    close: () => Promise<void>;
    isMaximized: () => Promise<boolean>;
    onMaximizedChange: (cb: (maximized: boolean) => void) => () => void;
  };
};

declare global {
  interface Window {
    api: Api;
  }
}
