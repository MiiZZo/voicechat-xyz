import { useToasts } from '../state/toast-store.js';
import { cn } from '../lib/cn.js';

export function ToastTray() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={cn(
            'rounded-md border px-4 py-2 text-sm shadow-lg backdrop-blur',
            t.kind === 'error' && 'border-red-900/50 bg-red-950/90 text-red-100',
            t.kind === 'success' && 'border-emerald-900/50 bg-emerald-950/90 text-emerald-100',
            t.kind === 'info' && 'border-zinc-800 bg-zinc-900/90 text-zinc-100',
          )}
        >
          {t.text}
        </button>
      ))}
    </div>
  );
}
