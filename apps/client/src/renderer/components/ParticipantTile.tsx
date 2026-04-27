import { useEffect, useRef, useState } from 'react';
import {
  ConnectionQuality,
  ParticipantEvent,
  Track,
  type Participant,
  type TrackPublication,
} from 'livekit-client';
import { Mic, MicOff, VideoOff, VolumeX, Maximize2 } from 'lucide-react';
import { cn } from '../lib/cn.js';
import { useStore } from '../state/store.js';
import { Avatar, AvatarFallback, avatarColor } from './ui/avatar.js';
import { ParticipantContextMenu } from './ParticipantContextMenu.js';
import { QualityIndicator } from './QualityIndicator.js';

type Props = {
  p: Participant;
  big?: boolean;
  videoSource?: Track.Source;
  quality?: ConnectionQuality;
};

export function ParticipantTile({ p, big = false, videoSource = Track.Source.Camera, quality }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const tileRef = useRef<HTMLDivElement | null>(null);
  const { prefs } = useStore();
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);

  const requestFullscreen = (e?: React.MouseEvent | React.SyntheticEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    const target = videoRef.current ?? tileRef.current;
    if (!target) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    } else {
      target.requestFullscreen?.().catch(() => undefined);
    }
  };

  const participantKey = p.name ?? p.identity;
  const muted = !p.isLocal && !!prefs?.participantMuted[participantKey];
  const persistedVolume = prefs?.participantVolumes[participantKey];

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
    return () => events.forEach((e) => p.off(e, rerender));
  }, [p]);

  const videoPub = p.getTrackPublication(videoSource);
  const videoTrackSid = videoPub?.trackSid;
  const videoMuted = videoPub?.isMuted;
  // Track-presence is tracked separately because a publication may exist
  // (TrackPublished fired) before the track is actually subscribed
  // (TrackSubscribed fires later). Without this in deps we'd skip attach.
  const videoTrackReady = !!videoPub?.track;
  const audioPub = p.getTrackPublication(Track.Source.Microphone);
  const audioTrackSid = audioPub?.trackSid;
  const audioMuted = audioPub?.isMuted;
  const audioTrackReady = !!audioPub?.track;

  useEffect(() => {
    const pub: TrackPublication | undefined = p.getTrackPublication(videoSource);
    const el = videoRef.current;
    if (pub?.track && el && !pub.isMuted) {
      pub.track.attach(el);
      return () => {
        pub.track?.detach(el);
      };
    }
  }, [p, videoSource, videoTrackSid, videoMuted, videoTrackReady]);

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
  }, [p, audioTrackSid, audioMuted, audioTrackReady, prefs?.audioOutputDeviceId]);

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
  const micOff = !micPub || micPub.isMuted;
  const camOff = !camPub || camPub.isMuted;
  const initial = (p.name ?? p.identity).slice(0, 1).toUpperCase();

  const tile = (
    <div
      ref={tileRef}
      onDoubleClick={(e) => showVideo && requestFullscreen(e)}
      className={cn(
        'group relative flex aspect-video items-center justify-center overflow-hidden rounded-xl border bg-bg-elevated transition-shadow',
        speaking ? 'border-accent/80 shadow-[0_0_0_1px_hsl(0_0%_100%/0.3)]' : 'border-border',
        speaking && 'animate-speaking-pulse',
        big && 'col-span-2 row-span-2',
      )}
    >
      {showVideo ? (
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          autoPlay
          playsInline
          muted={p.isLocal}
        />
      ) : (
        <div className="flex flex-col items-center gap-3">
          <Avatar className={cn('h-16 w-16 shadow-lg', big && 'h-24 w-24')}>
            <AvatarFallback className={cn('text-2xl font-semibold', avatarColor(participantKey), big && 'text-4xl')}>
              {initial}
            </AvatarFallback>
          </Avatar>
        </div>
      )}

      {!p.isLocal && <audio ref={audioRef} autoPlay />}

      {showVideo && (
        <button
          type="button"
          onClick={requestFullscreen}
          className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-md bg-black/60 text-fg opacity-0 backdrop-blur transition-opacity hover:bg-black/80 group-hover:opacity-100 focus-visible:opacity-100"
          aria-label="Открыть на весь экран"
          title="Открыть на весь экран (двойной клик)"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Status chips — top right */}
      <div className="absolute right-2 top-2 flex items-center gap-1">
        {quality !== undefined && quality !== ConnectionQuality.Excellent && (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/70 backdrop-blur" title="Качество соединения">
            <QualityIndicator quality={quality} />
          </span>
        )}
        {micOff && (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-rose-300 backdrop-blur">
            <MicOff size={12} />
          </span>
        )}
        {camOff && !micOff && showVideo === false && (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-fg-subtle backdrop-blur">
            <VideoOff size={12} />
          </span>
        )}
        {muted && (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-950/80 text-rose-300 backdrop-blur" title="Замьючен локально">
            <VolumeX size={12} />
          </span>
        )}
      </div>

      {/* Name pill — bottom left */}
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-xs backdrop-blur">
        {!micOff && (
          <Mic size={11} className={cn(speaking ? 'text-fg' : 'text-fg-subtle')} />
        )}
        <span className="font-medium text-fg">{p.name}</span>
        {p.isLocal && <span className="text-fg-subtle">·  ты</span>}
      </div>
    </div>
  );

  if (p.isLocal) return tile;
  return <ParticipantContextMenu participantName={participantKey}>{tile}</ParticipantContextMenu>;
}
