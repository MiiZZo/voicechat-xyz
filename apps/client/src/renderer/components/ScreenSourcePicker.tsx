import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog.js';
import type { ScreenSource } from '../../shared/types.js';

type Props = { onPick: (source: ScreenSource) => void; onCancel: () => void };

export function ScreenSourcePicker({ onPick, onCancel }: Props) {
  const [sources, setSources] = useState<ScreenSource[] | null>(null);

  useEffect(() => {
    window.api.getScreenSources().then(setSources);
  }, []);

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Демонстрация экрана</DialogTitle>
          <DialogDescription>Выберите окно или экран для трансляции</DialogDescription>
        </DialogHeader>
        {!sources ? (
          <div className="py-12 text-center text-sm text-fg-subtle">Загрузка источников…</div>
        ) : (
          <div className="grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto pr-1 md:grid-cols-3">
            {sources.map((s) => (
              <button
                key={s.id}
                onClick={() => onPick(s)}
                className="group flex flex-col gap-2 rounded-lg border border-border bg-bg-muted/30 p-2 text-left transition-all hover:border-accent hover:bg-bg-muted"
              >
                <img
                  src={s.thumbnailDataUrl}
                  alt={s.name}
                  className="aspect-video w-full rounded-md object-cover ring-1 ring-border transition group-hover:ring-accent/50"
                />
                <div className="truncate text-xs text-fg-muted group-hover:text-fg">{s.name}</div>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
