import { useEffect, useState } from 'react';
import { RoomEvent, Track, type Participant } from 'livekit-client';
import { useStore } from '../state/store.js';
import { useLiveKitRoom } from '../hooks/useLiveKitRoom.js';
import { ParticipantTile } from '../components/ParticipantTile.js';
import { ControlBar } from '../components/ControlBar.js';
import { ScreenSourcePicker } from '../components/ScreenSourcePicker.js';
import { ToastTray } from '../components/Toast.js';
import { ChevronLeft } from 'lucide-react';
import type { ScreenSource } from '../../shared/types.js';

export function RoomView() {
  const { activeRoom, leaveRoom } = useStore();
  const { room, state } = useLiveKitRoom();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [screenShareParticipant, setScreenShareParticipant] = useState<Participant | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!room) return;
    const refresh = () => {
      const all = [room.localParticipant, ...Array.from(room.remoteParticipants.values())];
      setParticipants(all);
      const sharer = all.find((p) => p.getTrackPublication(Track.Source.ScreenShare));
      setScreenShareParticipant(sharer ?? null);
    };
    refresh();
    const events = [
      RoomEvent.ParticipantConnected,
      RoomEvent.ParticipantDisconnected,
      RoomEvent.TrackPublished,
      RoomEvent.TrackUnpublished,
      RoomEvent.TrackSubscribed,
      RoomEvent.TrackUnsubscribed,
      RoomEvent.LocalTrackPublished,
      RoomEvent.LocalTrackUnpublished,
      RoomEvent.ActiveSpeakersChanged,
    ] as const;
    events.forEach((e) => room.on(e, refresh));
    return () => {
      events.forEach((e) => room.off(e, refresh));
    };
  }, [room]);

  if (!activeRoom) return null;
  const remoteSharing =
    !!screenShareParticipant && screenShareParticipant !== room?.localParticipant;

  const stopShare = async () => {
    if (!room) return;
    const pub = room.localParticipant.getTrackPublication(Track.Source.ScreenShare);
    if (pub?.track) {
      await room.localParticipant.unpublishTrack(pub.track);
      pub.track.stop();
    }
  };

  const startShare = async (source: ScreenSource) => {
    if (!room) return;
    setPickerOpen(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          // @ts-expect-error chromium-only desktopCapturer constraints
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: source.id,
            maxFrameRate: 30,
          },
        },
      });
      const track = stream.getVideoTracks()[0];
      if (!track) throw new Error('no video track');
      await room.localParticipant.publishTrack(track, {
        source: Track.Source.ScreenShare,
        simulcast: false,
      });
      track.addEventListener('ended', () => {
        stopShare();
      });
    } catch (err) {
      console.error(err);
    }
  };

  const onToggleScreenShare = () => {
    const localSharing = !!room?.localParticipant.getTrackPublication(Track.Source.ScreenShare);
    if (localSharing) stopShare();
    else setPickerOpen(true);
  };

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
        <button onClick={leaveRoom} className="flex items-center gap-1 rounded p-2 text-sm hover:bg-zinc-800">
          <ChevronLeft size={16} /> {activeRoom.roomName} ({participants.length}/8)
        </button>
        <span className="text-xs text-zinc-500">{state}</span>
      </header>

      <main className="flex flex-1 overflow-hidden">
        <section className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {participants.map((p) => (
              <ParticipantTile
                key={p.identity}
                p={p}
                big={p === screenShareParticipant}
                videoSource={p === screenShareParticipant ? Track.Source.ScreenShare : Track.Source.Camera}
              />
            ))}
          </div>
        </section>
      </main>

      {room && (
        <ControlBar
          room={room}
          onLeave={leaveRoom}
          remoteSharing={remoteSharing}
          onToggleScreenShare={onToggleScreenShare}
        />
      )}

      {pickerOpen && (
        <ScreenSourcePicker onPick={startShare} onCancel={() => setPickerOpen(false)} />
      )}

      <ToastTray />
    </div>
  );
}
