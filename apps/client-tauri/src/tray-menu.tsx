// React-приложение для tray-menu окна (label='tray-menu').
// Появляется по правому клику на иконке трея около курсора. Содержит
// быстрые действия: мут/анмут микрофона, покинуть комнату, открыть окно,
// выйти. По blur (юзер кликнул мимо окна) — само скрывается, как любой
// нативный tray menu.
//
// Состояние (in room? muted?) получаем event'ом 'tray-menu:state' от
// main-окна — оно эмитит при каждом изменении соответствующих store-полей
// через window.api.syncTrayMenu (см. preload-shim).

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke } from '@tauri-apps/api/core';
import { emitTo, listen } from '@tauri-apps/api/event';
import { getCurrentWindow, primaryMonitor } from '@tauri-apps/api/window';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { LogicalPosition, LogicalSize } from '@tauri-apps/api/dpi';
import { Mic, MicOff, LogOut, MaximizeIcon, Power } from 'lucide-react';
import { cn } from '@/lib/cn';
import '@/index.css';

type State = { inRoom: boolean; muted: boolean };
type ClickPos = { x: number; y: number };

function hide() {
  void getCurrentWindow().hide();
}

async function openMain() {
  const main = await WebviewWindow.getByLabel('main');
  if (!main) return;
  try { await main.unminimize(); } catch { /* not minimized */ }
  try { await main.show(); } catch { /* not hidden */ }
  await main.setFocus();
}

/** Размещаем окно по умолчанию СНИЗУ-СЛЕВА от курсора: меню "выпадает" вниз
 *  и сдвинуто влево относительно точки клика. Если уходит за левый край
 *  монитора — флипаем вправо; за нижний — флипаем вверх. Clamp по нулю
 *  страхует от уже-краевых ситуаций после флипа. */
async function positionAndShow(rootEl: HTMLElement, click: ClickPos) {
  const win = getCurrentWindow();
  const rect = rootEl.getBoundingClientRect();
  const w = Math.ceil(rect.width);
  const h = Math.ceil(rect.height);
  if (w === 0 || h === 0) return; // ещё не отрендерилось

  const mon = await primaryMonitor();
  // click позиция приходит в физических пикселях (см. Rust PhysicalPosition).
  const scale = mon?.scaleFactor ?? 1;
  const monW = mon ? mon.size.width / scale : 1920;
  const monH = mon ? mon.size.height / scale : 1080;
  const cx = click.x / scale;
  const cy = click.y / scale;

  let x = cx - w; // правый край меню в точке клика
  let y = cy; // верхний край меню в точке клика
  if (x < 0) x = cx; // флип вправо если не хватает места слева
  if (y + h > monH) y = cy - h; // флип вверх если не помещается под курсор
  x = Math.max(0, x);
  y = Math.max(0, y);

  await win.setSize(new LogicalSize(w, h));
  await win.setPosition(new LogicalPosition(x, y));
  await win.show();
  await win.setFocus();
}

function TrayMenu() {
  const [state, setState] = useState<State>({ inRoom: false, muted: false });
  const [pendingShow, setPendingShow] = useState<ClickPos | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Состояние in-room/muted: main-окно эмитит при каждом изменении store'а.
    let unA: (() => void) | null = null;
    let unB: (() => void) | null = null;
    let cancelled = false;
    listen<State>('tray-menu:state', (e) => setState(e.payload)).then((fn) => {
      if (cancelled) fn();
      else unA = fn;
    });
    // Запрос на показ от Rust — содержит physical-координаты курсора.
    listen<ClickPos>('tray-menu:show', (e) => setPendingShow(e.payload)).then((fn) => {
      if (cancelled) fn();
      else unB = fn;
    });
    return () => {
      cancelled = true;
      unA?.();
      unB?.();
    };
  }, []);

  // После того, как React смонтировал/обновил контент — измеряем и показываем.
  // Зависимость от `state` гарантирует пересчёт, если стейт пришёл позже
  // самого click-event'а (race): пока pendingShow не сброшен, любое обновление
  // содержимого триггерит ре-измерение.
  useLayoutEffect(() => {
    if (!pendingShow || !rootRef.current) return;
    void positionAndShow(rootRef.current, pendingShow);
    setPendingShow(null);
  }, [pendingShow, state]);

  useEffect(() => {
    // Blur — юзер кликнул мимо окна (или Alt+Tab'нул). Прячемся как
    // нативный tray menu.
    const onBlur = () => hide();
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, []);

  const onToggleMute = () => {
    void emitTo('main', 'tray:toggle-mute', {});
    hide();
  };

  const onLeave = () => {
    void emitTo('main', 'tray:leave-room', {});
    hide();
  };

  const onOpen = () => {
    void openMain();
    hide();
  };

  const onQuit = () => {
    void invoke('app_quit');
  };

  return (
    <div
      ref={rootRef}
      // inline-flex + width 232px — содержимое определяет высоту, ширина
      // фиксированная (для предсказуемой обрезки длинных лейблов). Меряем
      // ИМЕННО этот элемент для setSize окна.
      className="inline-flex w-[232px] flex-col rounded-xl border border-border bg-bg-elevated/95 p-1.5 shadow-2xl backdrop-blur-md"
    >
      {/* Mute/Leave всегда видны для предсказуемости меню — в лобби они просто
          disabled. Иначе размер меню прыгал бы между состояниями, и юзер не
          знал, что эти действия вообще есть. */}
      <MenuItem
        icon={state.muted ? MicOff : Mic}
        label={state.muted ? 'Включить микрофон' : 'Выключить микрофон'}
        onClick={onToggleMute}
        tone={state.muted ? 'rose' : 'default'}
        disabled={!state.inRoom}
      />
      <MenuItem
        icon={LogOut}
        label="Покинуть комнату"
        onClick={onLeave}
        disabled={!state.inRoom}
      />
      <Separator />
      <MenuItem icon={MaximizeIcon} label="Открыть VoiceChat" onClick={onOpen} />
      <MenuItem icon={Power} label="Выйти" onClick={onQuit} tone="rose" />
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  tone = 'default',
  disabled,
}: {
  icon: typeof Mic;
  label: string;
  onClick: () => void;
  tone?: 'default' | 'rose';
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors focus:outline-none',
        disabled && 'cursor-not-allowed opacity-40',
        !disabled && tone === 'rose' &&
          'text-rose-300/90 hover:bg-rose-500/10 hover:text-rose-200',
        !disabled && tone === 'default' &&
          'text-fg-muted hover:bg-bg-muted/70 hover:text-fg',
        disabled && tone === 'rose' && 'text-rose-300/90',
        disabled && tone === 'default' && 'text-fg-muted',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
      <span className="truncate">{label}</span>
    </button>
  );
}

function Separator() {
  return <div className="my-1 h-px bg-border" />;
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('root element missing');
createRoot(rootEl).render(<TrayMenu />);
