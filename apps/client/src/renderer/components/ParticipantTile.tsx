import { useEffect, useRef, useState } from 'react';
import {
  ParticipantEvent,
  Track,
  type Participant,
  type TrackPublication,
} from 'livekit-client';
import { Mic, MicOff, Video, VideoOff, VolumeX } from 'lucide-react';
import { cn } from '../lib/cn.js';
import { useStore } from '../state/store.js';
import { ParticipantContextMenu } from './ParticipantContextMenu.js';

type Props = {
  p: Participant;
  big?: boolean;
  videoSource?: Track.Source;
};

export function ParticipantTile({ p, big = false, videoSource = Track.Source.Camera }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { prefs } = useStore();
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);

  const participantKey = p.name ?? p.identity;
  const muted = !p.isLocal && !!prefs?.participantMuted[participantKey];
  const persistedVolume = prefs?.participantVolumes[participantKey];

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

  // Stable deps for attach effects
  const videoPub = p.getTrackPublication(videoSource);
  const videoTrackSid = videoPub?.trackSid;
  const videoMuted = videoPub?.isMuted;
  const audioPub = p.getTrackPublication(Track.Source.Microphone);
  const audioTrackSid = audioPub?.trackSid;
  const audioMuted = audioPub?.isMuted;

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

  // Attach remote audio
  useEffect(() => {
    if (p.isLocal) return;
    const pub = p.getTrackPublication(Track.Source.Microphone);
    const el = audioRef.current;
    if (pub?.track && el) {
      pub.track.attach(el);
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

  // Live volume + mute sync
  useEffect(() => {
    if (p.isLocal) return;
    const el = audioRef.current;
    if (!el) return;
    el.muted = muted;
    el.volume = typeof persistedVolume === 'number' ? persistedVolume : 1;
  }, [p, muted, persistedVolume]);

  const micPub = p.getTrackPublication(Track.Source.Microphone);
  const camPub = p.getTrackPublication(videoSource);
  const speaking = p.isSpeaking;
  const showVideo = camPub && !camPub.isMuted;

  const tile = (
    <div
      className={cn(
        'relative flex aspect-video items-center justify-center rounded-lg border bg-zinc-900',
        speaking ? 'border-emerald-500' : 'border-zinc-800',
        big && 'col-span-2 row-span-2',
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
        {muted && <VolumeX size={12} className="ml-1 text-red-400" />}
      </div>
    </div>
  );

  if (p.isLocal) return tile;

  return <ParticipantContextMenu participantName={participantKey}>{tile}</ParticipantContextMenu>;
}
