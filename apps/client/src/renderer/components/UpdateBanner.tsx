import { useEffect, useState } from 'react';
import type { UpdateStatus } from '../../shared/types.js';

export function UpdateBanner() {
  const [status, setStatus] = useState<UpdateStatus>({ kind: 'idle' });
  useEffect(() => window.api.onUpdateStatus(setStatus), []);

  if (status.kind !== 'ready') return null;
  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-3 rounded-md border border-emerald-900 bg-emerald-950/90 px-4 py-2 text-sm">
      <span>Доступна версия {status.version}</span>
      <button
        onClick={() => window.api.installUpdate()}
        className="rounded bg-emerald-100 px-2 py-1 text-xs text-emerald-950"
      >
        Установить и перезапустить
      </button>
    </div>
  );
}
