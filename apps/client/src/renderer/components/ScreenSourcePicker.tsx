import { useEffect, useState } from 'react';
import type { ScreenSource } from '../../shared/types.js';

type Props = { onPick: (source: ScreenSource) => void; onCancel: () => void };

export function ScreenSourcePicker({ onPick, onCancel }: Props) {
  const [sources, setSources] = useState<ScreenSource[] | null>(null);

  useEffect(() => {
    window.api.getScreenSources().then(setSources);
  }, []);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-6">
      <div className="max-h-[80vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Выберите экран или окно</h2>
          <button onClick={onCancel} className="rounded px-3 py-1 text-sm hover:bg-zinc-800">
            Отмена
          </button>
        </div>
        {!sources ? (
          <div className="text-zinc-500">Загрузка…</div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {sources.map((s) => (
              <button
                key={s.id}
                onClick={() => onPick(s)}
                className="flex flex-col gap-2 rounded border border-zinc-800 p-2 hover:border-zinc-600"
              >
                <img src={s.thumbnailDataUrl} alt={s.name} className="aspect-video w-full rounded object-cover" />
                <div className="truncate text-xs">{s.name}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
