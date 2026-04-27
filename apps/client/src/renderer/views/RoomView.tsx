import { useEffect, useState } from 'react';
import { RoomEvent, Track, type Participant } from 'livekit-client';
import { useStore } from '../state/store.js';
import { useLiveKitRoom } from '../hooks/useLiveKitRoom.js';
import { useMicLevel } from '../hooks/useMicLevel.js';
import { usePushToTalk } from '../hooks/usePushToTalk.js';
import { ParticipantTile } from '../components/ParticipantTile.js';
import { ControlBar } from '../components/ControlBar.js';
import { ScreenSourcePicker } from '../components/ScreenSourcePicker.js';
import { ChatPanel } from '../components/ChatPanel.js';
import { ToastTray } from '../components/Toast.js';
import { SettingsModal } from '../components/SettingsModal.js';
import { ChevronLeft, Settings } from 'lucide-react';
import { Button } from '../components/ui/button.js';
import type { ScreenSource } from '../../shared/types.js';

export function RoomView() {
  const { activeRoom, leaveRoom, prefs } = useStore();
  const { room, state } = useLiveKitRoom();
  const level = useMicLevel(room);
  const pttHeld = usePushToTalk(room);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [screenShareParticipant, setScreenShareParticipant] = useState<Participant | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

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
    <div className="flex h-screen flex-col bg-bg text-fg">
      <header className="flex items-center justify-between border-b border-border bg-bg-elevated/40 px-5 py-3 backdrop-blur">
        <Button variant="ghost" size="sm" onClick={leaveRoom} className="-ml-2 gap-2">
          <ChevronLeft />
          <span className="text-base font-medium">{activeRoom.roomName}</span>
          <span className="font-mono text-xs tabular-nums text-fg-subtle">
            {participants.length}/8
          </span>
        </Button>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-subtle">
            {state}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSettingsOpen(true)}
            aria-label="Настройки"
          >
            <Settings />
          </Button>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden">
        <section className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
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
        {room && <ChatPanel room={room} />}
      </main>

      {room && (
        <ControlBar
          room={room}
          onLeave={leaveRoom}
          remoteSharing={remoteSharing}
          onToggleScreenShare={onToggleScreenShare}
          level={level}
          pttHeld={pttHeld}
          pttEnabled={!!prefs?.pushToTalk.enabled}
        />
      )}

      {pickerOpen && (
        <ScreenSourcePicker onPick={startShare} onCancel={() => setPickerOpen(false)} />
      )}

      <ToastTray />

      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
