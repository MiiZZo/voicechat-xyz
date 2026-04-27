import { useEffect, useState } from 'react';
import { RoomEvent, Track, type Participant } from 'livekit-client';
import { useStore } from '../state/store.js';
import { useLiveKitRoom } from '../hooks/useLiveKitRoom.js';
import { usePushToTalk } from '../hooks/usePushToTalk.js';
import { useConnectionQuality, qualityLabel } from '../hooks/useConnectionQuality.js';
import { ParticipantTile } from '../components/ParticipantTile.js';
import { ControlBar } from '../components/ControlBar.js';
import { ScreenSourcePicker } from '../components/ScreenSourcePicker.js';
import { ChatPanel } from '../components/ChatPanel.js';
import { ToastTray } from '../components/Toast.js';
import { SettingsModal } from '../components/SettingsModal.js';
import { QualityIndicator } from '../components/QualityIndicator.js';
import { ChevronLeft, Settings } from 'lucide-react';
import { Button } from '../components/ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip.js';
import type { ScreenSource } from '../../shared/types.js';

export function RoomView() {
  const { activeRoom, leaveRoom, prefs } = useStore();
  const { room, state } = useLiveKitRoom();
  const pttHeld = usePushToTalk(room);
  const { qualities, rttMs } = useConnectionQuality(room);
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
      <header
        className="flex h-10 items-center justify-between border-b border-border bg-bg-elevated/40 pl-2 pr-[150px] backdrop-blur"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={leaveRoom}
          className="h-7 gap-2 px-2"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <ChevronLeft />
          <span className="text-sm font-medium">{activeRoom.roomName}</span>
          <span className="font-mono text-xs tabular-nums text-fg-subtle">
            {participants.length}/8
          </span>
        </Button>
        <div
          className="flex items-center gap-2"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {room && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex cursor-default items-center gap-1.5 rounded-md px-2 py-1 text-fg-muted hover:bg-bg-muted/40">
                  <QualityIndicator quality={qualities.get(room.localParticipant.identity)} />
                  <span className="font-mono text-[10px] tabular-nums">
                    {rttMs !== null ? `${Math.round(rttMs)} ms` : '— ms'}
                  </span>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Соединение: {qualityLabel(qualities.get(room.localParticipant.identity))}
                {rttMs !== null && ` · ${Math.round(rttMs)} мс до сервера`}
              </TooltipContent>
            </Tooltip>
          )}
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-subtle">
            {state}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSettingsOpen(true)}
            aria-label="Настройки"
            className="h-7 w-7"
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
                quality={qualities.get(p.identity)}
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
