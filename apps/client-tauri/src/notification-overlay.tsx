// React-приложение, монтируемое в notification-окне Tauri (label='notification').
// Слушает событие 'notify:show', показывает один тост за раз (новый заменяет
// предыдущий, без стека — см. дизайн в чате), авто-скрывается через 5 сек,
// hover паузит таймер. Клик переключает фокус на main и сам прячет окно.
//
// Окно объявлено в tauri.conf.json как transparent + alwaysOnTop + skipTaskbar.
// Body фон чистится в entry.ts, чтобы прозрачность Tauri-окна реально работала.

import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { X } from 'lucide-react';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  avatarColor,
  customAvatar,
} from '@/components/ui/avatar';
import { cn } from '@/lib/cn';
import '@/index.css';

type Payload = { title: string; body: string };

const VISIBLE_MS = 3000;
const ANIM_MS = 220;

function NotificationAvatar({ name }: { name: string }) {
  // Используем те же Radix-компоненты и хелперы, что и основной UI —
  // ChatPanel/ParticipantTile/RoomCard. Иначе визуально отличается шрифт
  // (font-medium vs semibold) и layering (base bg-bg-muted под цветом).
  const custom = customAvatar(name);
  return (
    <Avatar className="h-10 w-10 shrink-0">
      {custom && <AvatarImage src={custom} alt={name} />}
      <AvatarFallback className={cn('text-sm font-medium', avatarColor(name))}>
        {name.slice(0, 1).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

function NotificationOverlay() {
  const [current, setCurrent] = useState<Payload | null>(null);
  const [shown, setShown] = useState(false);
  const dismissTimer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);
  const paused = useRef(false);

  const clearDismiss = () => {
    if (dismissTimer.current !== null) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
  };

  const scheduleDismiss = () => {
    clearDismiss();
    if (paused.current) return;
    dismissTimer.current = window.setTimeout(hide, VISIBLE_MS);
  };

  const hide = () => {
    setShown(false);
    // Дожидаемся exit-анимации, потом полностью скрываем Tauri-окно — чтобы
    // прозрачный rect не висел над экраном (некоторые WGC capture-сессии
    // ловят его как пустой кадр поверх) и не ловил клики мышью.
    if (hideTimer.current !== null) clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      void getCurrentWindow().hide();
      setCurrent(null);
    }, ANIM_MS);
  };

  useEffect(() => {
    let unlistenFn: (() => void) | null = null;
    let cancelled = false;
    listen<Payload>('notify:show', (e) => {
      // Прервать pending hide — пришёл новый тост, окно остаётся видимым.
      if (hideTimer.current !== null) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
      setCurrent(e.payload);
      setShown(true);
      paused.current = false;
      scheduleDismiss();
    }).then((fn) => {
      if (cancelled) fn();
      else unlistenFn = fn;
    });
    return () => {
      cancelled = true;
      unlistenFn?.();
      clearDismiss();
      if (hideTimer.current !== null) clearTimeout(hideTimer.current);
    };
  }, []);

  const onClick = async () => {
    try {
      const main = await WebviewWindow.getByLabel('main');
      if (main) {
        // unminimize нужен если свёрнуто на таскбар, show — если спрятано в
        // трей через close-to-tray, setFocus — поверх остальных окон.
        try { await main.unminimize(); } catch { /* not minimized */ }
        try { await main.show(); } catch { /* not hidden */ }
        await main.setFocus();
      }
    } catch {
      /* main мог быть закрыт — игнорируем */
    }
    hide();
  };

  return (
    <div
      className="fixed inset-0 flex items-stretch justify-stretch p-0"
      onMouseEnter={() => {
        paused.current = true;
        clearDismiss();
      }}
      onMouseLeave={() => {
        paused.current = false;
        scheduleDismiss();
      }}
    >
      {/* div + role=button вместо <button>, потому что кнопка-крестик внутри —
          вложенные <button> невалидны в HTML и React ругается в dev. */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => void onClick()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            void onClick();
          }
        }}
        className={
          'group relative flex h-full w-full cursor-pointer select-none items-center ' +
          'gap-3 rounded-xl border border-border bg-bg-elevated/95 px-3 py-2.5 pr-9 ' +
          'text-left shadow-2xl backdrop-blur-md transition-all duration-200 ease-out ' +
          'hover:bg-bg-elevated focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ' +
          (shown ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-4 opacity-0')
        }
      >
        {current && (
          <>
            <NotificationAvatar name={current.title} />
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
              <div className="w-full truncate text-sm font-semibold text-fg">
                {current.title}
              </div>
              <div
                className="w-full overflow-hidden text-xs text-fg-muted"
                style={{
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                }}
              >
                {current.body}
              </div>
            </div>
          </>
        )}
        <button
          type="button"
          aria-label="Закрыть"
          // stopPropagation, иначе клик булькнет на родительский div и
          // сфокусирует main вместо тихого закрытия тоста.
          onClick={(e) => {
            e.stopPropagation();
            hide();
          }}
          // Появляется по hover'у на тосте — чтобы в покое UI был чистый,
          // как у Telegram-нотификаций. opacity-0 → 100 на group-hover.
          className={
            'absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center ' +
            'rounded-md text-fg-subtle opacity-0 transition-opacity hover:bg-bg-muted ' +
            'hover:text-fg focus:opacity-100 focus:outline-none focus-visible:ring-2 ' +
            'focus-visible:ring-accent group-hover:opacity-100'
          }
        >
          <X size={14} strokeWidth={2.25} />
        </button>
      </div>
    </div>
  );
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('root element missing');
createRoot(rootEl).render(<NotificationOverlay />);
