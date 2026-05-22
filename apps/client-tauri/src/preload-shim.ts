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
import { emitTo, listen } from '@tauri-apps/api/event';
import { getCurrentWindow, primaryMonitor } from '@tauri-apps/api/window';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { LogicalPosition } from '@tauri-apps/api/dpi';
import { getVersion } from '@tauri-apps/api/app';
import { applyGlobalShortcuts } from './global-shortcuts';
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

// Notification overlay — позиция и размер должны совпадать с tauri.conf.json
// (notification window). Если поменять там — поменять и здесь, иначе тост
// "уедет" мимо угла монитора. Размер вынесен сюда для арифметики позиции.
const NOTIF_W = 360;
const NOTIF_H = 84;
const NOTIF_MARGIN = 16;
// Грубая поправка на panel задач Windows. У большинства setups 40-48 px при
// 100% DPI, у 125% уезжает до ~60. Используем только для нижних углов;
// верхние ничем не мешают (там нет системных панелей по дефолту).
const TASKBAR_GUESS = 56;
// Кэшируем последнюю выставленную позицию, чтобы не дёргать setPosition
// при каждом notify(). Сравниваем по строковому ключу.
let lastPositionedAs: string | null = null;

type Corner = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

async function positionNotificationWindow(corner: Corner): Promise<void> {
  if (lastPositionedAs === corner) return;
  const win = await WebviewWindow.getByLabel('notification');
  if (!win) return;
  const mon = await primaryMonitor();
  if (!mon) return;
  const logicalW = mon.size.width / mon.scaleFactor;
  const logicalH = mon.size.height / mon.scaleFactor;
  const isRight = corner === 'bottom-right' || corner === 'top-right';
  const isBottom = corner === 'bottom-right' || corner === 'bottom-left';
  const x = isRight ? logicalW - NOTIF_W - NOTIF_MARGIN : NOTIF_MARGIN;
  const y = isBottom
    ? logicalH - NOTIF_H - NOTIF_MARGIN - TASKBAR_GUESS
    : NOTIF_MARGIN;
  await win.setPosition(new LogicalPosition(x, y));
  lastPositionedAs = corner;
}

const api = {
  getPrefs: (): Promise<Prefs> => invoke('prefs_get'),
  setPrefs: (patch: Partial<Prefs>): Promise<Prefs> => invoke('prefs_set', { patch }),
  getScreenSources: (): Promise<ScreenSource[]> => invoke('screen_get_sources'),
  checkUpdate: (): Promise<void> => invoke('update_check'),
  installUpdate: (): Promise<void> => invoke('update_install'),
  // Версия приложения для отображения в Settings. Tauri читает из
  // tauri.conf.json (productName/version), не из package.json.
  getAppVersion: (): Promise<string> => getVersion(),
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
  // Своё in-app уведомление через отдельное Tauri-окно с label 'notification'.
  // Окно объявлено статически в tauri.conf.json (visible: false), мы только
  // позиционируем его в правый нижний угол primary monitor, эмитим payload и
  // показываем. NotificationOverlay в том окне слушает событие и рендерит UI.
  //
  // Web Notification API в WebView2 не работает (permission='denied', нельзя
  // запросить), plugin-notification даёт OS toast без кастомизации — поэтому
  // полностью своё окно. Бонус: клик-фокус работает в dev и prod без AUMID.
  // Переключить иконку трея на "mic muted" (красная точка) или обратно.
  // App.tsx дёргает при изменении micMutedByUser + нахождения в комнате.
  setTrayMicMuted: (muted: boolean): Promise<void> =>
    invoke('set_tray_mic_muted', { muted }),
  // Windows-only: overlay-бэйдж на app-иконке в панели задач. На других
  // платформах команда no-op в Rust, фронт может звать безусловно.
  setTaskbarOverlayMuted: (muted: boolean): Promise<void> =>
    invoke('set_taskbar_overlay_muted', { muted }),
  // Сообщить кастомному tray-menu окну актуальное состояние (in-room / muted).
  // Вызывается из App.tsx при изменении соответствующих store-полей —
  // tray-menu хранит копию, чтобы по правому клику моментально показать
  // правильные пункты без round-trip'а к main-окну.
  syncTrayMenu: (state: { inRoom: boolean; muted: boolean }): Promise<void> =>
    emitTo('tray-menu', 'tray-menu:state', state),
  // Применить набор глобальных хоткеев из prefs. App.tsx дёргает на загрузке
  // и при каждом изменении соответствующих полей. В Electron этот метод
  // отсутствует — там нет Tauri-плагина, useEffect просто optional-chain'ит.
  setGlobalShortcuts: (opts: {
    globalShortcutToggleMute: string;
    globalShortcutLeaveRoom: string;
  }): Promise<void> => applyGlobalShortcuts(opts),
  notify: async (opts: {
    title: string;
    body: string;
    corner?: Corner;
  }): Promise<void> => {
    try {
      await positionNotificationWindow(opts.corner ?? 'bottom-right');
      const win = await WebviewWindow.getByLabel('notification');
      if (!win) return;
      // emitTo нужен, чтобы payload улетел именно в notification-окно: иначе
      // listen в main тоже мог бы сработать (если бы вдруг подписался).
      await emitTo('notification', 'notify:show', {
        title: opts.title,
        body: opts.body,
      });
      await win.show();
    } catch (e) {
      console.warn('[notify] failed', e);
    }
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

// Бридж tray → renderer event bus. Подписываемся только в main-окне:
// notification-окно тоже грузит этот shim, но там ControlBar/RoomView не
// существуют и события стали бы no-op'ами с лишним overhead'ом.
if (getCurrentWindow().label === 'main') {
  void listen('tray:toggle-mute', () => {
    window.dispatchEvent(new CustomEvent('app:toggle-mute'));
  });
  void listen('tray:leave-room', () => {
    window.dispatchEvent(new CustomEvent('app:leave-room'));
  });
}

// Глобальный link-handler. WebView2 на <a target="_blank"> ничего не делает,
// поэтому ловим клик в capture-фазе, отменяем дефолт и шлём URL в Rust, где
// open::that открывает его системным браузером. В Electron-клиенте то же делает
// main-process через setWindowOpenHandler — здесь повторяем поведение.
document.addEventListener(
  'click',
  (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    if (!href) return;
    if (!/^https?:\/\//i.test(href)) return;
    e.preventDefault();
    void invoke('open_external', { url: href });
  },
  // capture: ловим раньше React-handler'ов, чтобы их preventDefault не помешал.
  true,
);

export type Api = typeof api;
declare global {
  interface Window {
    api: Api;
  }
}
