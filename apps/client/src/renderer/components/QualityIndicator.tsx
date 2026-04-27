import { ConnectionQuality } from 'livekit-client';
import { cn } from '../lib/cn.js';

type Props = {
  quality: ConnectionQuality | undefined;
  className?: string;
};

const heights = [4, 7, 10];

function activeBars(q: ConnectionQuality | undefined): number {
  switch (q) {
    case ConnectionQuality.Excellent:
      return 3;
    case ConnectionQuality.Good:
      return 2;
    case ConnectionQuality.Poor:
      return 1;
    default:
      return 0;
  }
}

function tone(q: ConnectionQuality | undefined): string {
  switch (q) {
    case ConnectionQuality.Excellent:
      return 'bg-emerald-400';
    case ConnectionQuality.Good:
      return 'bg-fg';
    case ConnectionQuality.Poor:
      return 'bg-amber-400';
    default:
      return 'bg-fg-subtle/40';
  }
}

export function QualityIndicator({ quality, className }: Props) {
  const lit = activeBars(quality);
  const litColor = tone(quality);
  return (
    <span
      className={cn('inline-flex items-end gap-[2px]', className)}
      role="img"
      aria-label="Качество соединения"
    >
      {heights.map((h, i) => (
        <span
          key={i}
          style={{ height: h }}
          className={cn(
            'w-[3px] rounded-[1px] transition-colors',
            i < lit ? litColor : 'bg-fg-subtle/25',
          )}
        />
      ))}
    </span>
  );
}
