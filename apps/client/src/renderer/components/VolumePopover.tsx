import { useEffect, useState } from 'react';
import { useStore } from '../state/store.js';

type Props = { participantName: string; onClose: () => void };

export function VolumePopover({ participantName, onClose }: Props) {
  const { prefs, setPrefs } = useStore();
  const [value, setValue] = useState(prefs?.participantVolumes[participantName] ?? 1);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onCommit = async (v: number) => {
    setValue(v);
    if (!prefs) return;
    const next = await window.api.setPrefs({
      participantVolumes: { ...prefs.participantVolumes, [participantName]: v },
    });
    setPrefs(next);
  };

  return (
    <div
      className="absolute inset-0 z-10 flex items-end justify-center p-2"
      onClick={onClose}
    >
      <div
        className="flex w-full items-center gap-2 rounded bg-black/85 px-3 py-2 text-xs"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="truncate">{participantName}</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={value}
          onChange={(e) => onCommit(Number(e.target.value))}
          className="flex-1 accent-emerald-500"
        />
        <span className="w-8 text-right">{Math.round(value * 100)}</span>
      </div>
    </div>
  );
}
