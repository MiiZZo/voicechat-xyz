import { useEffect, useState } from 'react';
import { RoomEvent, Track, type Room } from 'livekit-client';
import { Mic, MicOff, Video, VideoOff, MonitorUp, MonitorX, PhoneOff } from 'lucide-react';
import { cn } from '../lib/cn.js';
import { Button } from './ui/button.js';
import { Separator } from './ui/separator.js';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip.js';

type Props = {
  room: Room;
  onLeave: () => void;
  onToggleScreenShare: () => void;
  remoteSharing: boolean;
  level: number;
  pttHeld: boolean;
  pttEnabled: boolean;
};

export function ControlBar({
  room,
  onLeave,
  onToggleScreenShare,
  remoteSharing,
  level,
  pttHeld,
  pttEnabled,
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
  const micOn = !!lp.getTrackPublication(Track.Source.Microphone) && !lp.getTrackPublication(Track.Source.Microphone)!.isMuted;
  const camOn = !!lp.getTrackPublication(Track.Source.Camera) && !lp.getTrackPublication(Track.Source.Camera)!.isMuted;
  const localSharing = !!lp.getTrackPublication(Track.Source.ScreenShare);

  const toggleMic = () => void lp.setMicrophoneEnabled(!micOn);
  const toggleCam = () => void lp.setCameraEnabled(!camOn);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex items-center justify-center gap-2 border-t border-border bg-bg-elevated/80 px-4 py-3 backdrop-blur">
        <ToolButton
          label={micOn ? 'Выключить микрофон' : 'Включить микрофон'}
          active={micOn}
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

        <div className="flex items-end gap-0.5" aria-label="Уровень микрофона">
          {[0.08, 0.2, 0.36, 0.56, 0.78].map((thr, i) => (
            <span
              key={i}
              style={{ height: `${4 + i * 3}px` }}
              className={cn(
                'w-[3px] rounded-sm transition',
                level > thr ? 'bg-accent' : 'bg-bg-muted',
              )}
            />
          ))}
        </div>

        {pttEnabled && (
          <span
            className={cn(
              'rounded-md px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.15em] transition-colors',
              pttHeld ? 'bg-accent text-accent-fg' : 'bg-bg-muted text-fg-subtle',
            )}
          >
            PTT
          </span>
        )}

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
