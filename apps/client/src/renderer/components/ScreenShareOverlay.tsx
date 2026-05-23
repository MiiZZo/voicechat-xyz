import { useEffect, useState } from 'react';
import { PictureInPicture2, Volume2, VolumeX } from 'lucide-react';
import { type Participant, Track } from 'livekit-client';
import { Slider } from './ui/slider.js';
import { useStore } from '../state/store.js';
import { useReceiverStats } from '../hooks/useReceiverStats.js';

type Props = {
  participant: Participant;
  participantKey: string;
  videoElement: HTMLVideoElement | null;
  hasScreenShareAudio: boolean;
};

/**
 * Полупрозрачная панель в правом верхнем углу большого тайла шарера.
 * Скрыта по умолчанию, показывается при group-hover родителя или focus-within.
 *
 * Содержит:
 *  - mini-slider громкости screen-share audio + mute (только если hasScreenShareAudio)
 *  - кнопку Picture-in-Picture
 *  - индикатор fps / bitrate
 */
export function ScreenShareOverlay({
  participant,
  participantKey,
  videoElement,
  hasScreenShareAudio,
}: Props) {
  const { prefs, setPrefs } = useStore();
  const stats = useReceiverStats(participant, Track.Source.ScreenShare);

  // Source of truth для "сейчас в PiP" — document.pictureInPictureElement.
  // Локального бул-state не держим. setPipTick — re-render trigger, чтобы
  // isInPip ниже (read из document) переоценивался после enter/leave событий.
  const [, setPipTick] = useState(0);
  useEffect(() => {
    if (!videoElement) return;
    const bump = () => setPipTick((n) => n + 1);
    videoElement.addEventListener('enterpictureinpicture', bump);
    videoElement.addEventListener('leavepictureinpicture', bump);
    return () => {
      videoElement.removeEventListener('enterpictureinpicture', bump);
      videoElement.removeEventListener('leavepictureinpicture', bump);
    };
  }, [videoElement]);
  const isInPip = !!videoElement && document.pictureInPictureElement === videoElement;

  const togglePip = async () => {
    if (!videoElement) return;
    try {
      if (isInPip) {
        await document.exitPictureInPicture();
      } else {
        await videoElement.requestPictureInPicture();
      }
    } catch (e) {
      console.warn('[pip] toggle failed', e);
    }
  };

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

  return (
    <>
      {/* right-12 keeps the panel clear of status chips pinned at right-2 in the parent tile */}
      <div
        className={
          'absolute right-12 top-2 flex items-center gap-2 rounded-md bg-black/60 px-2 py-1.5 backdrop-blur ' +
          'opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100'
        }
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        {hasScreenShareAudio && (
          <>
            <button
              type="button"
              onClick={toggleScreenMute}
              className="flex h-6 w-6 items-center justify-center rounded text-fg hover:bg-white/10"
              title={screenMuted ? 'Включить звук демки' : 'Отключить звук демки'}
              aria-label={screenMuted ? 'Включить звук демки' : 'Отключить звук демки'}
            >
              {screenMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            <Slider
              className="w-20"
              value={[screenVolume]}
              min={0}
              max={2}
              step={0.05}
              disabled={screenMuted}
              onValueChange={(v) => setScreenVolume(v[0] ?? 1)}
              aria-label="Громкость демки"
            />
            <span className="w-9 text-right font-mono text-[10px] tabular-nums text-fg-subtle">
              {Math.round(screenVolume * 100)}%
            </span>
          </>
        )}
        <button
          type="button"
          onClick={togglePip}
          disabled={!videoElement}
          className="flex h-6 w-6 items-center justify-center rounded text-fg hover:bg-white/10 disabled:opacity-40"
          title={isInPip ? 'Закрыть Picture-in-Picture' : 'Picture-in-Picture'}
          aria-label={isInPip ? 'Закрыть Picture-in-Picture' : 'Picture-in-Picture'}
        >
          <PictureInPicture2 size={14} />
        </button>
        {stats && (
          <span className="min-w-[6.5rem] font-mono text-[10px] tabular-nums text-fg-subtle">
            {stats.fps} fps · {stats.bitrateMbps} Mbps
          </span>
        )}
      </div>
    </>
  );
}
