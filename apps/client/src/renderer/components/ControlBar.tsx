import { useEffect, useRef, useState } from 'react';
import { RoomEvent, Track, type Room } from 'livekit-client';
import { Mic, MicOff, Video, VideoOff, MonitorUp, MonitorX, PhoneOff, Settings } from 'lucide-react';
import { cn } from '../lib/cn.js';
import type { MicActivationMode } from '../../shared/types.js';
import { useStore } from '../state/store.js';
import { onToggleMute } from '../lib/app-actions.js';
import { Button } from './ui/button.js';
import { Separator } from './ui/separator.js';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip.js';

type Props = {
  room: Room;
  onLeave: () => void;
  onOpenSettings: () => void;
  onToggleScreenShare: () => void;
  remoteSharing: boolean;
  micActivationMode: MicActivationMode;
  pttHeld: boolean;
  vadOpen: boolean;
};

export function ControlBar({
  room,
  onLeave,
  onOpenSettings,
  onToggleScreenShare,
  remoteSharing,
  micActivationMode,
  pttHeld,
  vadOpen,
}: Props) {
  const [, force] = useState(0);

  useEffect(() => {
    const rerender = () => force((n) => n + 1);
    const events = [
      RoomEvent.LocalTrackPublished,
      RoomEvent.LocalTrackUnpublished,
      RoomEvent.TrackMuted,
      RoomEvent.TrackUnmuted,
      RoomEvent.TrackPublished,
      RoomEvent.TrackUnpublished,
    ] as const;
    events.forEach((e) => room.on(e, rerender));
    return () => events.forEach((e) => room.off(e, rerender));
  }, [room]);

  const lp = room.localParticipant;
  const camOn = !!lp.getTrackPublication(Track.Source.Camera) && !lp.getTrackPublication(Track.Source.Camera)!.isMuted;
  const localSharing = !!lp.getTrackPublication(Track.Source.ScreenShare);

  // The mic button represents user intent, not the live LiveKit track state.
  // In VAD/PTT modes the track gets toggled many times per second by the
  // activation hooks; binding the button to that state made the icon flicker
  // and made it impossible to "really" mute (the hook would immediately
  // unmute again). Source of truth for the button is now the explicit
  // `micMutedByUser` flag; the activation hooks read it as a master override.
  const micMutedByUser = useStore((s) => s.micMutedByUser);
  const setMicMutedByUser = useStore((s) => s.setMicMutedByUser);
  const micOn = !micMutedByUser;
  // "Действительно транслирует" — для подсветки иконки. В always-on микрофон
  // транслирует пока юзер сам не выключил. В PTT — только пока удерживается
  // клавиша. В VAD — только пока VAD-гейт открыт. Идея: подсветка accent (белая)
  // означает "тебя сейчас слышат"; secondary (серая) — "мик включён, но молчит".
  // Так юзер по одному взгляду понимает реальное состояние без ошибочного
  // ощущения "я как будто всегда транслирую".
  const transmitting =
    micOn &&
    (micActivationMode === 'always' ||
      (micActivationMode === 'ptt' && pttHeld) ||
      (micActivationMode === 'vad' && vadOpen));

  const toggleMic = () => {
    const nextMuted = !micMutedByUser;
    setMicMutedByUser(nextMuted);
    if (nextMuted) {
      // User just muted — force the track off regardless of activation mode.
      lp.setMicrophoneEnabled(false).catch(() => undefined);
    } else if (micActivationMode === 'always') {
      // Un-mute in always-on mode → open the track immediately.
      lp.setMicrophoneEnabled(true).catch(() => undefined);
    }
    // VAD / PTT modes: leave the track muted; the activation hook will
    // unmute on voice / keypress now that the master override is cleared.
  };
  const toggleCam = () => void lp.setCameraEnabled(!camOn);

  // Внешний триггер (трей, глобальный хоткей) → дёргаем toggleMic. Ref-pattern
  // нужен потому, что useEffect с пустым deps хранит первую версию замыкания,
  // а toggleMic читает свежие micMutedByUser/lp/micActivationMode.
  const toggleMicRef = useRef(toggleMic);
  toggleMicRef.current = toggleMic;
  useEffect(() => onToggleMute(() => toggleMicRef.current()), []);

  return (
    <TooltipProvider delayDuration={150}>
      {/* Velvet Onyx: floating "voice dock" — absolute-positioned glass pill
          centered within the stage area (excluding the chat panel on the right).
          Parent <main> is position:relative, so left math respects --chat-w. */}
      <div
        className={cn(
          // Exact match to mockup .controlbar: 6px/8px padding, blur 32px / saturate 160%,
          // hsl-based bg + border (white-based opacity reads slightly cooler than zinc-90).
          // vo-dock-rim adds the diagonal gradient hairline via ::before.
          'vo-lift-dock vo-dock-rim absolute bottom-[18px] z-[5] inline-flex items-center gap-1 rounded-full py-1.5 px-2',
          'bg-[hsla(240,6%,8%,0.72)] backdrop-blur-[32px] backdrop-saturate-[1.6]',
          // No static uniform border — vo-dock-rim provides the diagonal
          // highlight at top-left and the rest fades to transparent. A uniform
          // border-white/[0.08] curved around the dock's bottom and visually
          // read as a "micro white line under each button" because the pill's
          // bottom radius sits ~6px below the buttons.
          'left-[calc((100%-var(--chat-w))/2)] -translate-x-1/2',
        )}
      >
        <ToolButton
          label={micOn ? 'Выключить микрофон' : 'Включить микрофон'}
          active={transmitting}
          icon={micOn ? <Mic /> : <MicOff />}
          onClick={toggleMic}
          mutedStyle={!micOn}
        />
        <ToolButton
          label={camOn ? 'Выключить камеру' : 'Включить камеру'}
          active={camOn}
          icon={camOn ? <Video /> : <VideoOff />}
          onClick={toggleCam}
          mutedStyle={!camOn}
        />
        <ToolButton
          label={
            localSharing
              ? 'Остановить демонстрацию'
              : remoteSharing
                ? 'Уже идёт демонстрация'
                : 'Демонстрация экрана'
          }
          active={localSharing}
          disabled={!localSharing && remoteSharing}
          icon={localSharing ? <MonitorX /> : <MonitorUp />}
          onClick={onToggleScreenShare}
        />
        <ToolButton
          label="Настройки"
          active={false}
          icon={<Settings />}
          onClick={onOpenSettings}
        />

        <Separator orientation="vertical" className="mx-1.5 h-5 bg-white/10" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="destructive" size="sm" onClick={onLeave} className="h-10 gap-2 rounded-full px-4">
              <PhoneOff />
              <span>Выйти</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Покинуть комнату</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}

/** Velvet Onyx dock button — uses shadcn Button with `tool` variant
 *  (no own backdrop-blur, dark inner gradient) so it doesn't stack a second
 *  glass layer on top of the dock's existing one. */
function ToolButton({
  label,
  active,
  disabled,
  icon,
  onClick,
  mutedStyle,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  icon: React.ReactNode;
  onClick: () => void;
  mutedStyle?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={active ? 'accent' : 'tool'}
          size="icon"
          disabled={disabled}
          onClick={onClick}
          aria-label={label}
          className={cn(
            // Dock buttons are 40×40 round (Button's "icon" size is 36×36 by default).
            'h-10 w-10 rounded-full',
            // Suppress ALL focus halo/border on dock buttons:
            //   - Outer ring (Button's default `focus-visible:ring-2`) leaks
            //     past the dock's pill as a pearl halo after Radix returns
            //     focus from the closed Settings modal.
            //   - Inset 1.5px ring (previous attempt) shows as "top cut +
            //     white strip bottom" along the button's rounded edge.
            // Instead, on focus-visible apply the SAME styles hover gives —
            // a brighter bg + soft border. Clean, no artifacts, still a clear
            // keyboard-focus indicator.
            'focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:shadow-none focus:outline-none',
            // No border on focus either — same anti-aliasing line issue. Just
            // apply hover bg + brighter text on keyboard focus.
            !active && 'focus-visible:text-fg focus-visible:bg-[linear-gradient(180deg,hsla(240,10%,28%,0.6)_0%,hsla(240,8%,14%,0.6)_100%)]',
            // Active (pearl mic transmitting): inset top sheen only — no outer
            // drop shadow (Button's `accent` variant adds one that would leak
            // past the dock's bottom edge as a white strip).
            active && 'shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]',
            !active && mutedStyle && 'text-rose-300/90 hover:text-rose-200',
          )}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
