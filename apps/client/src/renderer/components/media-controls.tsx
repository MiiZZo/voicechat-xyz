import { useRef } from 'react';
import { cn } from '../lib/cn.js';
import { clampFraction } from '../lib/media.js';

/** Кликабельная/перетаскиваемая полоса 0..1 в стиле Velvet Onyx. Использована и
 *  для перемотки, и для громкости в аудио- и видеоплеерах — общий вид для local
 *  (жемчужный) и remote (стеклянный) пузырьков. Pointer capture даёт плавный drag
 *  за пределами бара. `onHover`/`onLeave` (опционально) дают позицию курсора
 *  0..1 для превью-тултипа над полосой. */
export function Bar({
  fraction,
  onScrub,
  isLocal,
  ariaLabel,
  onHover,
  onLeave,
}: {
  fraction: number;
  onScrub: (fraction: number) => void;
  isLocal: boolean;
  ariaLabel: string;
  onHover?: (fraction: number, clientX: number) => void;
  onLeave?: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  const fractionAt = (clientX: number): number => {
    const el = ref.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0) return 0;
    return clampFraction((clientX - rect.left) / rect.width);
  };

  const width = `${clampFraction(fraction) * 100}%`;

  return (
    <div
      ref={ref}
      role="slider"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clampFraction(fraction) * 100)}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onScrub(fractionAt(e.clientX));
      }}
      onPointerMove={(e) => {
        // e.buttons === 1 → тянут с зажатой кнопкой.
        if (e.buttons === 1) onScrub(fractionAt(e.clientX));
        onHover?.(fractionAt(e.clientX), e.clientX);
      }}
      onPointerLeave={() => onLeave?.()}
      className={cn(
        'relative h-1.5 flex-1 cursor-pointer touch-none rounded-full',
        isLocal ? 'bg-black/15' : 'bg-white/[0.12]',
      )}
    >
      <div
        className={cn(
          'pointer-events-none absolute inset-y-0 left-0 rounded-full',
          isLocal ? 'bg-bg/70' : 'bg-white/70',
        )}
        style={{ width }}
      />
    </div>
  );
}
