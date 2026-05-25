// Splash для блокирующего startup-апдейта (Discord-style). Окно объявлено в
// tauri.conf.json как transparent + frameless + alwaysOnTop + skipTaskbar +
// visible:false. Rust (updater::run_startup_blocking) показывает окно и
// эмитит update:status; этот компонент только рендерит статусы.
//
// Контракт жизненного цикла: splash НЕ закрывает себя сам. Все терминальные
// состояния (Idle / Error / Installing→restart) приводят к close() из Rust,
// причём с задержкой (NO_UPDATE_HOLD / ERROR_HOLD) чтобы текст успел прочитаться.
//
// Bundle discipline: никаких импортов из apps/client/src/renderer и никакого
// shared CSS — нужно загружаться мгновенно. Только react/react-dom и тонкая
// прослойка @tauri-apps/api. Velvet Onyx через inline styles (точные hex'ы
// из tailwind.config.ts: zinc-950 / zinc-900 / zinc-800 / zinc-400 / zinc-200).

import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';

type UpdateStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'available'; version: string }
  | { kind: 'downloading'; percent: number }
  | { kind: 'installing'; version: string }
  | { kind: 'ready'; version: string }
  | { kind: 'error'; message: string };

const COLORS = {
  cardBg: '#09090b',
  cardRing: 'rgba(39, 39, 42, 0.6)', // zinc-800/60
  text: '#fafafa', // zinc-50
  dimText: '#a1a1aa', // zinc-400
  barTrack: '#27272a', // zinc-800
  barFill: '#e4e4e7', // zinc-200
  accent: '#a1a1aa', // zinc-400 — пульсация
} as const;

function statusText(status: UpdateStatus): { primary: string; secondary?: string } {
  switch (status.kind) {
    case 'checking':
      return { primary: 'Проверка обновлений…' };
    case 'available':
      return { primary: 'Найдено обновление', secondary: `Версия ${status.version}` };
    case 'downloading':
      return { primary: 'Загрузка обновления', secondary: `${status.percent}%` };
    case 'installing':
      return { primary: 'Установка…', secondary: `Версия ${status.version}` };
    case 'ready':
      // В startup-flow ready не приходит, но если вдруг — покажем нейтрально.
      return { primary: 'Готово к установке' };
    case 'idle':
      return { primary: 'Обновлений нет' };
    case 'error':
      return {
        primary: 'Не удалось обновить',
        secondary: status.message,
      };
  }
}

function Splash() {
  const [status, setStatus] = useState<UpdateStatus>({ kind: 'checking' });

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      // Порядок критичен: listen() должен зарезолвиться (= listener реально
      // зарегистрирован на бэкенде Tauri) до invoke('splash_ready'), иначе
      // первый Checking от Rust уйдёт раньше и splash зависнет на initial state.
      unlisten = await listen<UpdateStatus>('update:status', (event) => {
        if (!cancelled) setStatus(event.payload);
      });
      try {
        await invoke('splash_ready');
      } catch (e) {
        // Если команда не зарегистрирована (старый бинарь) — Rust не пойдёт
        // дальше handshake'а и сам через 5с покажет main. Просто логируем.
        // eslint-disable-next-line no-console
        console.warn('[splash] splash_ready failed', e);
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const { primary, secondary } = statusText(status);
  const showBar = status.kind === 'downloading';
  const barPercent = status.kind === 'downloading' ? status.percent : 0;
  const indeterminate =
    status.kind === 'checking' ||
    status.kind === 'available' ||
    status.kind === 'installing' ||
    (status.kind === 'downloading' && status.percent === 0);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily:
          'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", system-ui, sans-serif',
        // Не даём WebView2 выделять текст / показывать caret на splash'е —
        // splash не интерактивен, никаких полей, никаких клавиатурных фокусов.
        userSelect: 'none',
        WebkitUserSelect: 'none',
        color: COLORS.text,
      }}
    >
      <div
        style={{
          width: 340,
          padding: '22px 24px 20px',
          background: COLORS.cardBg,
          borderRadius: 14,
          boxShadow: `0 0 0 1px ${COLORS.cardRing}, 0 24px 48px -12px rgba(0,0,0,0.65)`,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Logo />
          <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '0.01em' }}>
            VoiceChat
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{primary}</div>
          {secondary && (
            <div style={{ fontSize: 12, color: COLORS.dimText }}>{secondary}</div>
          )}
        </div>

        <div style={{ height: 2, position: 'relative', overflow: 'hidden', borderRadius: 1 }}>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: COLORS.barTrack,
              borderRadius: 1,
            }}
          />
          {showBar && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                width: `${Math.max(0, Math.min(100, barPercent))}%`,
                background: COLORS.barFill,
                borderRadius: 1,
                transition: 'width 200ms ease-out',
              }}
            />
          )}
          {indeterminate && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: COLORS.barFill,
                borderRadius: 1,
                opacity: 0.6,
                animation: 'vc-splash-pulse 1.4s ease-in-out infinite',
                transformOrigin: 'left center',
              }}
            />
          )}
        </div>
      </div>

      <style>{`
        @keyframes vc-splash-pulse {
          0%   { transform: translateX(-100%) scaleX(0.4); opacity: 0.0; }
          40%  { transform: translateX(0%)    scaleX(0.6); opacity: 0.55; }
          100% { transform: translateX(100%)  scaleX(0.4); opacity: 0.0; }
        }
        html, body { background: transparent; margin: 0; padding: 0; }
      `}</style>
    </div>
  );
}

function Logo() {
  // Тот же знак, что в src-tauri/icons/sources/app-icon.svg (taskbar / .exe).
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      style={{ flexShrink: 0 }}
    >
      <rect x="0" y="0" width="100" height="100" rx="22" fill="#09090b" />
      <rect x="22" y="28.75" width="39.2" height="8.5" rx="4.25" fill="#fafafa" />
      <rect x="22" y="45.75" width="56" height="8.5" rx="4.25" fill="#fafafa" />
      <rect x="22" y="62.75" width="30.8" height="8.5" rx="4.25" fill="#fafafa" />
    </svg>
  );
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<Splash />);
}
