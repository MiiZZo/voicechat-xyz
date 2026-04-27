import { useToasts } from '../state/toast-store.js';
import { cn } from '../lib/cn.js';

export function ToastTray() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={cn(
            'pointer-events-auto rounded-lg border px-4 py-2.5 text-sm shadow-2xl backdrop-blur transition-transform hover:scale-[1.02]',
            t.kind === 'error' && 'border-destructive/40 bg-destructive/15 text-rose-100',
            t.kind === 'success' && 'border-accent/40 bg-accent/15 text-amber-100',
            t.kind === 'info' && 'border-border bg-bg-elevated/90 text-fg',
          )}
        >
          {t.text}
        </button>
      ))}
    </div>
  );
}
