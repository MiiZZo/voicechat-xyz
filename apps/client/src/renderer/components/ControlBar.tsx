import { useEffect, useRef, useState } from 'react';
import { RoomEvent, Track, type Room } from 'livekit-client';
import { Mic, MicOff, Video, VideoOff, MonitorUp, MonitorX, PhoneOff } from 'lucide-react';
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
  onToggleScreenShare: () => void;
  remoteSharing: boolean;
  micActivationMode: MicActivationMode;
  pttHeld: boolean;
  vadOpen: boolean;
};

export function ControlBar({
  room,
  onLeave,
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
      <div className="flex items-center justify-center gap-2 border-t border-border bg-bg-elevated/80 px-4 py-3 backdrop-blur">
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

        <Separator orientation="vertical" className="mx-2 h-6" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="destructive" size="sm" onClick={onLeave} className="gap-2">
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
          variant={active ? 'accent' : 'secondary'}
          size="icon"
          disabled={disabled}
          onClick={onClick}
          className={cn('rounded-full', mutedStyle && 'text-rose-300/90 hover:text-rose-200')}
          aria-label={label}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
