import { useState } from 'react';
import { Track, type Room } from 'livekit-client';
import { Mic, MicOff, Video, VideoOff, MonitorUp, PhoneOff } from 'lucide-react';
import { cn } from '../lib/cn.js';

type Props = {
  room: Room;
  onLeave: () => void;
  onToggleScreenShare: () => void;
  remoteSharing: boolean;
};

export function ControlBar({ room, onLeave, onToggleScreenShare, remoteSharing }: Props) {
  const [micOn, setMicOn] = useState(room.localParticipant.isMicrophoneEnabled);
  const [camOn, setCamOn] = useState(room.localParticipant.isCameraEnabled);
  const localSharing = !!room.localParticipant.getTrackPublication(Track.Source.ScreenShare);

  const toggleMic = async () => {
    const next = !micOn;
    await room.localParticipant.setMicrophoneEnabled(next);
    setMicOn(next);
  };
  const toggleCam = async () => {
    const next = !camOn;
    await room.localParticipant.setCameraEnabled(next);
    setCamOn(next);
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
