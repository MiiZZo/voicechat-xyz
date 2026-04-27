import { useEffect, useRef, useState } from 'react';
import {
  ParticipantEvent,
  Track,
  type Participant,
  type TrackPublication,
} from 'livekit-client';
import { Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { cn } from '../lib/cn.js';
import { useStore } from '../state/store.js';
import { VolumePopover } from './VolumePopover.js';

type Props = {
  p: Participant;
  big?: boolean;
  videoSource?: Track.Source; // default: Camera
};

export function ParticipantTile({ p, big = false, videoSource = Track.Source.Camera }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { prefs } = useStore();
  const [, force] = useState(0);
  const [volOpen, setVolOpen] = useState(false);
  const rerender = () => force((n) => n + 1);

  // Subscribe to participant track events
  useEffect(() => {
    const events = [
      ParticipantEvent.TrackPublished,
      ParticipantEvent.TrackUnpublished,
      ParticipantEvent.TrackSubscribed,
      ParticipantEvent.TrackUnsubscribed,
      ParticipantEvent.TrackMuted,
      ParticipantEvent.TrackUnmuted,
      ParticipantEvent.IsSpeakingChanged,
    ] as const;
    events.forEach((e) => p.on(e, rerender));
    return () => {
      events.forEach((e) => p.off(e, rerender));
    };
  }, [p]);

  // Track identity for stable deps — re-attach only when track or mute state actually change
  const videoPub = p.getTrackPublication(videoSource);
  const videoTrackSid = videoPub?.trackSid;
  const videoMuted = videoPub?.isMuted;

  // Attach video track
  useEffect(() => {
    const pub: TrackPublication | undefined = p.getTrackPublication(videoSource);
    const el = videoRef.current;
    if (pub?.track && el && !pub.isMuted) {
      pub.track.attach(el);
      return () => {
        pub.track?.detach(el);
      };
    }
  }, [p, videoSource, videoTrackSid, videoMuted]);

  const audioPub = p.getTrackPublication(Track.Source.Microphone);
  const audioTrackSid = audioPub?.trackSid;
  const audioMuted = audioPub?.isMuted;

  // Attach remote audio (local doesn't need attach)
  useEffect(() => {
    if (p.isLocal) return;
    const pub = p.getTrackPublication(Track.Source.Microphone);
    const el = audioRef.current;
    if (pub?.track && el) {
      pub.track.attach(el);
      const persistedVol = prefs?.participantVolumes[p.name ?? p.identity];
      if (typeof persistedVol === 'number') el.volume = persistedVol;
      if (prefs?.audioOutputDeviceId && 'setSinkId' in HTMLMediaElement.prototype) {
        (el as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> })
          .setSinkId(prefs.audioOutputDeviceId)
          .catch(() => undefined);
      }
      return () => {
        pub.track?.detach(el);
      };
    }
  }, [p, audioTrackSid, audioMuted, prefs?.audioOutputDeviceId]);

  // Live-update audio element volume when persisted prefs change
  useEffect(() => {
    if (p.isLocal) return;
    const el = audioRef.current;
    if (!el) return;
    const v = prefs?.participantVolumes[p.name ?? p.identity];
    if (typeof v === 'number') el.volume = v;
  }, [p, prefs?.participantVolumes]);

  const micPub = p.getTrackPublication(Track.Source.Microphone);
  const camPub = p.getTrackPublication(videoSource);
  const speaking = p.isSpeaking;
  const showVideo = camPub && !camPub.isMuted;

  return (
    <div
      onClick={() => !p.isLocal && setVolOpen((v) => !v)}
      className={cn(
        'relative flex aspect-video items-center justify-center rounded-lg border bg-zinc-900',
        speaking ? 'border-emerald-500' : 'border-zinc-800',
        big && 'col-span-2 row-span-2',
        !p.isLocal && 'cursor-pointer',
      )}
    >
      {showVideo ? (
        <video
          ref={videoRef}
          className="h-full w-full rounded-lg object-cover"
          autoPlay
          playsInline
          muted={p.isLocal}
        />
      ) : (
        <div className="text-2xl font-semibold text-zinc-500">{p.name?.[0] ?? '?'}</div>
      )}
      {!p.isLocal && <audio ref={audioRef} autoPlay />}
      <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded bg-black/60 px-2 py-1 text-xs">
        {!micPub || micPub.isMuted ? <MicOff size={12} /> : <Mic size={12} />}
        {!camPub || camPub.isMuted ? <VideoOff size={12} /> : <Video size={12} />}
        <span>{p.name}</span>
      </div>
      {volOpen && !p.isLocal && (
        <VolumePopover
          participantName={p.name ?? p.identity}
          onClose={() => setVolOpen(false)}
        />
      )}
    </div>
  );
}
