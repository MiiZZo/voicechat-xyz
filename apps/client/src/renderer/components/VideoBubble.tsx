import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  Play,
  Pause,
  Download,
  Volume2,
  Volume1,
  VolumeX,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import type { FileMessage } from '../state/store.js';
import { cn } from '../lib/cn.js';
import { formatTime, clampFraction, stepVolume, seekBy, PLAYBACK_RATES } from '../lib/media.js';
import { Bar } from './media-controls.js';

/** Громкость запоминается между разными видео в рамках сессии (отдельно от
 *  аудиоплеера). Модульная переменная — осознанно лёгкий вариант без правок
 *  стора/prefs (потребовало бы дублирования в Rust-слое Tauri). */
let sharedVideoVolume = 1;

const HIDE_CONTROLS_MS = 2500;

/** Полноценный видеоплеер для чата в стиле Velvet Onyx: инлайн в пузыре + полный
 *  экран (Fullscreen API — тот же элемент, воспроизведение не прерывается).
 *  Play/pause, перемотка, громкость, таймкод, скорость, скачивание, клавиши, и
 *  превью-кадр при наведении на полосу (в полноэкранном режиме). При ошибке
 *  декодирования (mkv/avi/неподдерживаемый кодек) зовёт onError — FileBubble
 *  показывает обычный файловый пузырёк со скачиванием. */
export function VideoBubble({
  message,
  isLocal,
  onDownload,
  onError,
}: {
  message: FileMessage;
  isLocal: boolean;
  onDownload: () => void | Promise<void>;
  onError: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const posteredRef = useRef(false);

  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(NaN);
  const [volume, setVolume] = useState(sharedVideoVolume);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [volOpen, setVolOpen] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const [preview, setPreview] = useState<{ x: number; time: number } | null>(null);

  // Слушатели событий видеоэлемента.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onLoadedMeta = () => {
      setDuration(video.duration);
      // Показать первый кадр как постер: короткий seek подгружает картинку
      // (preload="metadata" сам по себе часто оставляет чёрный кадр).
      if (!posteredRef.current) {
        posteredRef.current = true;
        try {
          video.currentTime = Math.min(0.1, video.duration || 0.1);
        } catch {
          /* ignore */
        }
      }
    };
    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onPlay = () => {
      setPlaying(true);
      setStarted(true);
    };
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      setCurrentTime(0);
      video.currentTime = 0;
    };
    video.addEventListener('loadedmetadata', onLoadedMeta);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);
    video.addEventListener('error', onError);
    return () => {
      video.removeEventListener('loadedmetadata', onLoadedMeta);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('error', onError);
    };
  }, [onError]);

  // Применяем громкость/mute к элементу и запоминаем на сессию.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
    video.muted = muted;
    sharedVideoVolume = volume;
  }, [volume, muted]);

  // Применяем скорость.
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = rate;
  }, [rate]);

  // Отслеживаем вход/выход из полноэкранного режима (в т.ч. по Esc).
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const clearHideTimer = () => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  // Показать контролы и (если играет) запланировать автоскрытие.
  const bumpControls = useCallback(() => {
    setControlsVisible(true);
    clearHideTimer();
    if (playing) {
      hideTimerRef.current = window.setTimeout(() => {
        setControlsVisible(false);
        setVolOpen(false);
        setRateOpen(false);
      }, HIDE_CONTROLS_MS);
    }
  }, [playing]);

  useEffect(() => {
    bumpControls();
    return clearHideTimer;
  }, [bumpControls]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => undefined);
    else video.pause();
  }, []);

  const seekToFraction = useCallback((frac: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration)) return;
    video.currentTime = clampFraction(frac) * video.duration;
    setCurrentTime(video.currentTime);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement === el) {
      void document.exitFullscreen().catch(() => undefined);
    } else {
      void el.requestFullscreen().catch(() => undefined);
    }
  }, []);

  const toggleMute = useCallback(() => setMuted((m) => !m), []);

  // Превью-кадр: при наведении на полосу (только в полноэкранном режиме) перематываем
  // скрытый видеоэлемент и рисуем кадр на canvas.
  useEffect(() => {
    if (!preview) return;
    const pv = previewVideoRef.current;
    if (!pv || !Number.isFinite(pv.duration)) return;
    // Небольшой порог, чтобы не долбить seek на каждый пиксель.
    if (Math.abs(pv.currentTime - preview.time) < 0.2) return;
    pv.currentTime = preview.time;
  }, [preview]);

  // Пере-навешиваем слушатель на isFullscreen: скрытый превью-элемент монтируется
  // только в полноэкранном режиме, поэтому на первом маунте (инлайн) его ещё нет.
  useEffect(() => {
    const pv = previewVideoRef.current;
    if (!pv) return;
    const draw = () => {
      const canvas = previewCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(pv, 0, 0, canvas.width, canvas.height);
    };
    pv.addEventListener('seeked', draw);
    return () => pv.removeEventListener('seeked', draw);
  }, [isFullscreen]);

  const onKeyDown = (e: ReactKeyboardEvent) => {
    switch (e.key) {
      case ' ':
      case 'k':
        e.preventDefault();
        togglePlay();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        seekToFraction(seekBy(currentTime, -5, duration) / (duration || 1));
        break;
      case 'ArrowRight':
        e.preventDefault();
        seekToFraction(seekBy(currentTime, 5, duration) / (duration || 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setMuted(false);
        setVolume((v) => stepVolume(v, 0.1));
        break;
      case 'ArrowDown':
        e.preventDefault();
        setMuted(false);
        setVolume((v) => stepVolume(v, -0.1));
        break;
      case 'f':
      case 'F':
        e.preventDefault();
        toggleFullscreen();
        break;
      case 'm':
      case 'M':
        e.preventDefault();
        toggleMute();
        break;
      default:
        break;
    }
    bumpControls();
  };

  const progress =
    Number.isFinite(duration) && duration > 0 ? clampFraction(currentTime / duration) : 0;
  const effectiveVol = muted ? 0 : volume;
  const VolumeIcon = effectiveVol === 0 ? VolumeX : effectiveVol < 0.5 ? Volume1 : Volume2;
  const iconBtn =
    'flex items-center justify-center rounded-full text-white/85 transition-colors hover:bg-white/15 hover:text-white';

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerMove={bumpControls}
      onPointerLeave={() => {
        if (playing && !isFullscreen) setControlsVisible(false);
      }}
      className={cn(
        'group relative overflow-hidden outline-none',
        isFullscreen
          ? 'flex h-full w-full items-center justify-center bg-black'
          : cn(
              'vo-lift-bubble w-fit max-w-full rounded-2xl border border-white/[0.08] bg-black/40 backdrop-blur-xl',
              isLocal ? 'rounded-tr-sm' : 'rounded-tl-sm',
            ),
      )}
    >
      <video
        ref={videoRef}
        src={message.url}
        preload="metadata"
        onClick={togglePlay}
        className={cn(
          'block cursor-pointer',
          isFullscreen
            ? 'max-h-screen max-w-full'
            : 'max-h-[220px] max-w-[340px] object-contain',
        )}
      />

      {/* Скрытый элемент + canvas для превью-кадров (только fullscreen). */}
      {isFullscreen && (
        <>
          <video
            ref={previewVideoRef}
            src={message.url}
            preload="metadata"
            muted
            className="pointer-events-none absolute h-0 w-0 opacity-0"
          />
          {preview && (
            <div
              className="pointer-events-none absolute bottom-16 z-10 -translate-x-1/2 overflow-hidden rounded-md border border-white/15 bg-black/80 shadow-xl"
              style={{ left: preview.x }}
            >
              <canvas ref={previewCanvasRef} width={160} height={90} className="block" />
              <div className="py-0.5 text-center font-mono text-[11px] tabular-nums text-white/80">
                {formatTime(preview.time)}
              </div>
            </div>
          )}
        </>
      )}

      {/* Крупная кнопка Play до первого запуска. */}
      {!started && (
        <button
          type="button"
          aria-label="Воспроизвести"
          onClick={togglePlay}
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/20 transition-colors hover:bg-black/10"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full border border-white/25 bg-black/45 backdrop-blur-md">
            <Play size={24} strokeWidth={2} className="translate-x-[2px] text-white" />
          </span>
        </button>
      )}

      {/* Панель контролов снизу. */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'absolute inset-x-0 bottom-0 z-20 flex flex-col gap-1.5 bg-gradient-to-t from-black/70 via-black/35 to-transparent transition-opacity',
          isFullscreen ? 'px-5 pb-4 pt-10' : 'px-2.5 pb-2 pt-6',
          controlsVisible ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        <Bar
          fraction={progress}
          onScrub={seekToFraction}
          isLocal={false}
          ariaLabel="Перемотка"
          onHover={
            isFullscreen && Number.isFinite(duration)
              ? (frac, clientX) => {
                  const rect = containerRef.current?.getBoundingClientRect();
                  const x = rect ? clientX - rect.left : clientX;
                  setPreview({ x, time: clampFraction(frac) * duration });
                }
              : undefined
          }
          onLeave={isFullscreen ? () => setPreview(null) : undefined}
        />

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={playing ? 'Пауза' : 'Воспроизвести'}
            onClick={togglePlay}
            className={cn(iconBtn, isFullscreen ? 'h-9 w-9' : 'h-7 w-7')}
          >
            {playing ? (
              <Pause size={isFullscreen ? 20 : 16} />
            ) : (
              <Play size={isFullscreen ? 20 : 16} className="translate-x-[1px]" />
            )}
          </button>

          {/* Громкость: кнопка + всплывающая полоса. */}
          <div className="relative flex items-center">
            <button
              type="button"
              aria-label="Громкость"
              aria-expanded={volOpen}
              onClick={() => {
                setVolOpen((v) => !v);
                setRateOpen(false);
              }}
              className={cn(iconBtn, isFullscreen ? 'h-9 w-9' : 'h-7 w-7')}
            >
              <VolumeIcon size={isFullscreen ? 19 : 15} />
            </button>
            {volOpen && (
              <div className="absolute bottom-full left-0 mb-2 flex w-28 items-center gap-2 rounded-full border border-white/10 bg-black/85 px-3 py-2 backdrop-blur">
                <Bar
                  fraction={effectiveVol}
                  onScrub={(f) => {
                    setMuted(false);
                    setVolume(f);
                  }}
                  isLocal={false}
                  ariaLabel="Громкость"
                />
              </div>
            )}
          </div>

          <span className="font-mono text-[11px] tabular-nums tracking-[0.02em] text-white/75">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <div className="flex-1" />

          {/* Скорость. */}
          <div className="relative flex items-center">
            <button
              type="button"
              aria-label="Скорость воспроизведения"
              aria-expanded={rateOpen}
              onClick={() => {
                setRateOpen((v) => !v);
                setVolOpen(false);
              }}
              className={cn(
                'rounded-full px-2 font-mono text-[11px] tabular-nums text-white/85 transition-colors hover:bg-white/15 hover:text-white',
                isFullscreen ? 'h-9' : 'h-7',
              )}
            >
              {rate}×
            </button>
            {rateOpen && (
              <div className="absolute bottom-full right-0 mb-2 flex flex-col overflow-hidden rounded-lg border border-white/10 bg-black/90 backdrop-blur">
                {PLAYBACK_RATES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      setRate(r);
                      setRateOpen(false);
                    }}
                    className={cn(
                      'px-4 py-1.5 text-left font-mono text-[12px] tabular-nums transition-colors hover:bg-white/10',
                      r === rate ? 'text-white' : 'text-white/70',
                    )}
                  >
                    {r}×
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            aria-label="Скачать"
            onClick={() => void onDownload()}
            className={cn(iconBtn, isFullscreen ? 'h-9 w-9' : 'h-7 w-7')}
          >
            <Download size={isFullscreen ? 18 : 14} />
          </button>

          <button
            type="button"
            aria-label={isFullscreen ? 'Выйти из полноэкранного режима' : 'На весь экран'}
            onClick={toggleFullscreen}
            className={cn(iconBtn, isFullscreen ? 'h-9 w-9' : 'h-7 w-7')}
          >
            {isFullscreen ? (
              <Minimize2 size={isFullscreen ? 18 : 15} />
            ) : (
              <Maximize2 size={15} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
