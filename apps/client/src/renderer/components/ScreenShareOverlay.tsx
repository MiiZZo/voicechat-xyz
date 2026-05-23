import { useEffect, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { type Participant, Track } from 'livekit-client';
import { Slider } from './ui/slider.js';
import { useStore } from '../state/store.js';
import { useReceiverStats } from '../hooks/useReceiverStats.js';

type Props = {
  participant: Participant;
  participantKey: string;
  hasScreenShareAudio: boolean;
};

/**
 * Fullscreen-only overlay для тайла шарера. Показывается только когда тайл
 * (или какой-то его предок) находится в browser fullscreen — в обычном режиме
 * overlay полностью отсутствует, громкость доступна через RMB-меню.
 *
 * Содержит вертикальный стек:
 *  - строка 1: mute + volume slider + % (если есть screen-share audio)
 *  - строка 2: индикатор fps · Mbps (под основным блоком настройки)
 *
 * Picture-in-Picture и fullscreen-кнопки — это standalone-чипы на самом
 * ParticipantTile (в стиле Maximize2), не часть этой панели.
 */
export function ScreenShareOverlay({
  participant,
  participantKey,
  hasScreenShareAudio,
}: Props) {
  const { prefs, setPrefs } = useStore();
  const stats = useReceiverStats(participant, Track.Source.ScreenShare);

  // Показ overlay'а гейтится на browser fullscreen state. Источник истины —
  // document.fullscreenElement, к которому добавляем listener для re-render'а.
  // Считаем "в fullscreen" когда любой fullscreenElement существует и содержит
  // элемент того же ParticipantTile (через participant.identity мы не получаем
  // DOM, но достаточно проверки, что в принципе кто-то в fullscreen).
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const update = () => setIsFullscreen(!!document.fullscreenElement);
    update();
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);

  const screenVolume = prefs?.participantScreenShareVolumes[participantKey] ?? 1;
  const screenMuted = !!prefs?.participantScreenShareMuted[participantKey];

  // TODO: эта запись срабатывает на каждый onValueChange Radix-слайдера во
  // время drag — десятки IPC/disk-write вызовов на одно движение. Voice-слайдер
  // в ParticipantContextMenu имеет ту же проблему. Будущая итерация: вынести
  // в общий хук useScreenShareVolume и переключить на onValueCommit либо
  // дебаунс ~150мс. Сейчас оставлено для консистентности с voice-паттерном.
  const setScreenVolume = async (v: number) => {
    if (!prefs) return;
    const next = await window.api.setPrefs({
      participantScreenShareVolumes: {
        ...prefs.participantScreenShareVolumes,
        [participantKey]: v,
      },
    });
    setPrefs(next);
  };

  const toggleScreenMute = async () => {
    if (!prefs) return;
    const next = await window.api.setPrefs({
      participantScreenShareMuted: {
        ...prefs.participantScreenShareMuted,
        [participantKey]: !screenMuted,
      },
    });
    setPrefs(next);
  };

  if (!isFullscreen) return null;

  return (
    <div
      // Позиция: ниже status chips (top-2 right-2, w-6 каждый ≈ 24px высотой),
      // справа экрана. top-12 = 48px от верха, безопасно ниже chips.
      // Фиксированная ширина w-72 = 288px чтобы slider имел достаточно места
      // (раньше w-24=96px было визуально мелко в fullscreen). С flex-1 слайдер
      // тянется от mute-кнопки до %-индикатора без неожиданных отступов.
      // WebkitAppRegion: 'no-drag' — defense, на случай если tile-level
      // no-drag будет когда-нибудь убран.
      className="absolute right-2 top-12 flex w-72 flex-col gap-2 rounded-md bg-black/60 px-3 py-2 backdrop-blur opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {hasScreenShareAudio && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleScreenMute}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-fg hover:bg-white/10"
            title={screenMuted ? 'Включить звук' : 'Отключить звук'}
            aria-label={screenMuted ? 'Включить звук' : 'Отключить звук'}
          >
            {screenMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
          <Slider
            className="flex-1"
            value={[screenVolume]}
            min={0}
            max={2}
            step={0.05}
            disabled={screenMuted}
            onValueChange={(v) => setScreenVolume(v[0] ?? 1)}
            aria-label="Громкость"
          />
          <span className="w-10 shrink-0 text-right font-mono text-[11px] tabular-nums text-fg-subtle">
            {Math.round(screenVolume * 100)}%
          </span>
        </div>
      )}
      {stats && (
        <span className="text-right font-mono text-[10px] tabular-nums text-fg-subtle">
          {stats.fps} fps · {stats.bitrateMbps} Mbps
        </span>
      )}
    </div>
  );
}
