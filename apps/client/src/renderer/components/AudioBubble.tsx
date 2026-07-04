import { useEffect, useRef, useState } from 'react';
import { Play, Pause, Download } from 'lucide-react';
import type { FileMessage } from '../state/store.js';
import { cn } from '../lib/cn.js';

/** Расширения, которые считаем аудио даже когда mime приходит как
 *  application/octet-stream (сервер не всегда угадывает тип при загрузке). */
const AUDIO_EXT_RE = /\.(mp3|ogg|oga|wav|m4a|aac|flac|opus|webm)$/i;

/** true, если файловое сообщение стоит показывать аудиоплеером. Вызывается из
 *  FileBubble только для готовых (status='done') сообщений с непустым url. */
export function isAudioMessage(message: FileMessage): boolean {
  return message.mime.startsWith('audio/') || AUDIO_EXT_RE.test(message.name);
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Компактный inline-плеер для аудиофайлов в чате: play/pause, кликабельная
 *  полоса перемотки, время и кнопка скачивания. Стиль совпадает с обычным
 *  файловым пузырьком (жемчужный для своих сообщений, стеклянный для чужих). */
export function AudioBubble({
  message,
  isLocal,
  onDownload,
}: {
  message: FileMessage;
  isLocal: boolean;
  onDownload: () => void | Promise<void>;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(NaN);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onLoadedMeta = () => setDuration(audio.duration);
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      setCurrentTime(0);
    };
    audio.addEventListener('loadedmetadata', onLoadedMeta);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('loadedmetadata', onLoadedMeta);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      // play() может отклониться (autoplay policy) — клик пользователя, но
      // проглатываем reject, чтобы не ловить unhandled rejection.
      void audio.play().catch(() => undefined);
    } else {
      audio.pause();
    }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    audio.currentTime = frac * audio.duration;
    setCurrentTime(audio.currentTime);
  };

  const progress =
    Number.isFinite(duration) && duration > 0
      ? Math.min(1, currentTime / duration)
      : 0;

  return (
    <div
      className={cn(
        'flex max-w-full items-center gap-3 rounded-2xl px-3 py-2',
        isLocal
          ? 'vo-lift-bubble-pearl border border-transparent bg-[linear-gradient(180deg,hsl(240_6%_96%)_0%,hsl(240_6%_80%)_100%)] text-bg rounded-tr-sm'
          : 'vo-lift-bubble border border-white/[0.08] bg-white/[0.06] text-fg backdrop-blur-xl backdrop-saturate-150 rounded-tl-sm',
      )}
    >
      <audio ref={audioRef} src={message.url} preload="metadata" />

      <button
        type="button"
        aria-label={playing ? 'Пауза' : 'Воспроизвести'}
        onClick={toggle}
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors',
          isLocal
            ? 'border-black/15 bg-black/10 text-bg hover:bg-black/20'
            : 'border-white/[0.08] bg-white/[0.08] text-fg hover:bg-white/[0.14]',
        )}
      >
        {playing ? (
          <Pause size={15} strokeWidth={2.25} />
        ) : (
          <Play size={15} strokeWidth={2.25} className="translate-x-[1px]" />
        )}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span
          className={cn('truncate text-[13px] font-medium [overflow-wrap:anywhere]', isLocal ? 'text-bg' : 'text-fg')}
          title={message.name}
        >
          {message.name}
        </span>
        <div className="flex items-center gap-2">
          <div
            onClick={seek}
            className={cn(
              'group relative h-1.5 flex-1 cursor-pointer rounded-full',
              isLocal ? 'bg-black/15' : 'bg-white/[0.12]',
            )}
          >
            <div
              className={cn(
                'absolute inset-y-0 left-0 rounded-full',
                isLocal ? 'bg-bg/70' : 'bg-white/70',
              )}
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <span
            className={cn(
              'shrink-0 font-mono text-[11px] tabular-nums tracking-[0.02em]',
              isLocal ? 'text-bg/55' : 'text-fg-subtle',
            )}
          >
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
      </div>

      <button
        type="button"
        aria-label="Скачать"
        onClick={() => void onDownload()}
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors',
          isLocal
            ? 'border-black/15 bg-black/10 text-bg/70 hover:bg-black/20 hover:text-bg'
            : 'border-white/[0.08] bg-white/[0.06] text-fg-muted hover:bg-white/[0.1] hover:text-fg',
        )}
      >
        <Download size={13} />
      </button>
    </div>
  );
}
