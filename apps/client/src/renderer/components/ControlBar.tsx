import { useEffect, useState } from 'react';
import { RoomEvent, Track, type Room } from 'livekit-client';
import { Mic, MicOff, Video, VideoOff, MonitorUp, PhoneOff } from 'lucide-react';
import { cn } from '../lib/cn.js';

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

  // Subscribe to every room event that could change local mic/cam/share state.
  // Reading via room-level events (rather than LocalParticipant.on) is the
  // reliable path: setMicrophoneEnabled emits LocalTrackPublished on the Room,
  // not always on LocalParticipant.
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
    return () => {
      events.forEach((e) => room.off(e, rerender));
    };
  }, [room]);

  // Derive directly from LiveKit on each render — no local state to drift.
  const lp = room.localParticipant;
  const micPub = lp.getTrackPublication(Track.Source.Microphone);
  const camPub = lp.getTrackPublication(Track.Source.Camera);
  const sharePub = lp.getTrackPublication(Track.Source.ScreenShare);

  const micOn = !!micPub && !micPub.isMuted;
  const camOn = !!camPub && !camPub.isMuted;
  const localSharing = !!sharePub;

  const toggleMic = async () => {
    await lp.setMicrophoneEnabled(!micOn);
  };
  const toggleCam = async () => {
    await lp.setCameraEnabled(!camOn);
  };

  return (
    <div className="flex items-center justify-center gap-3 border-t border-zinc-800 bg-zinc-950 px-4 py-3">
      <CtlButton on={micOn} onClick={toggleMic} label="Mic" iconOn={<Mic size={18} />} iconOff={<MicOff size={18} />} />
      <CtlButton on={camOn} onClick={toggleCam} label="Camera" iconOn={<Video size={18} />} iconOff={<VideoOff size={18} />} />
      <CtlButton
        on={localSharing}
        disabled={!localSharing && remoteSharing}
        onClick={onToggleScreenShare}
        label={remoteSharing && !localSharing ? 'Уже идёт демонстрация' : 'Demo'}
        iconOn={<MonitorUp size={18} />}
        iconOff={<MonitorUp size={18} />}
      />
      {pttEnabled && (
        <span
          className={cn(
            'ml-3 rounded px-2 py-0.5 text-[10px] uppercase tracking-wide',
            pttHeld ? 'bg-emerald-500 text-emerald-950' : 'bg-zinc-800 text-zinc-400',
          )}
        >
          PTT
        </span>
      )}
      <div className="ml-3 flex items-center gap-0.5">
        {[0.1, 0.25, 0.45, 0.65, 0.85].map((thr, i) => (
          <span
            key={i}
            className={cn(
              'h-3 w-1 rounded-sm transition',
              level > thr ? 'bg-emerald-500' : 'bg-zinc-800',
            )}
          />
        ))}
      </div>
      <button
        onClick={onLeave}
        className="ml-4 flex items-center gap-2 rounded-md bg-red-900/80 px-4 py-2 text-sm hover:bg-red-900"
      >
        <PhoneOff size={16} /> Выйти
      </button>
    </div>
  );
}

function CtlButton({
  on,
  onClick,
  label,
  iconOn,
  iconOff,
  disabled,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  iconOn: React.ReactNode;
  iconOff: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={cn(
        'flex h-10 w-10 items-center justify-center rounded-full transition',
        on ? 'bg-zinc-100 text-zinc-900' : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      {on ? iconOn : iconOff}
    </button>
  );
}
