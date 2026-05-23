import { X } from 'lucide-react';
import { useToasts } from '../state/toast-store.js';
import { cn } from '../lib/cn.js';

export function ToastTray() {
  const { toasts, dismiss } = useToasts();
  // Velvet Onyx: bottom-LEFT so the tray doesn't fight the floating ControlBar
  // (centered to stage area) or overlap the chat panel on the right.
  return (
    <div className="pointer-events-none fixed bottom-[88px] left-4 z-[60] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'pointer-events-auto flex max-w-[340px] items-center gap-2.5 rounded-md border px-3 py-2.5',
            'backdrop-blur-2xl backdrop-saturate-150',
            'shadow-[0_16px_48px_-16px_rgba(0,0,0,0.8),inset_0_1px_0_hsla(240,10%,92%,0.08)]',
            t.kind === 'error' && 'border-destructive/40 bg-destructive/15 text-rose-100',
            t.kind === 'success' && 'border-white/[0.12] bg-bg-elevated/85 text-fg',
            t.kind === 'info' && 'border-white/[0.12] bg-bg-elevated/85 text-fg',
          )}
        >
          {t.kind !== 'error' && <span className="vo-toast-dot" aria-hidden />}
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium leading-snug">{t.text}</div>
            {t.sub && <div className="mt-0.5 text-[11px] text-fg-subtle">{t.sub}</div>}
          </div>
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            aria-label="Закрыть"
            className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded text-fg-subtle transition-colors hover:bg-white/[0.06] hover:text-fg"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
