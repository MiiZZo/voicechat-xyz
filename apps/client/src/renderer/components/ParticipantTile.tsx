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
import { Avatar, AvatarFallback, AvatarImage, avatarColor, customAvatar } from './ui/avatar.js';
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
  // Web Audio graph for remote audio: MediaStreamAudioSourceNode -> GainNode -> destination.
  // We route audio through Web Audio (instead of the <audio> element's own output)
  // so we can amplify above 100% via GainNode. The <audio> element still receives
  // the stream (LiveKit needs an attached element to pump frames in some browsers)
  // but is force-muted so only the WebAudio path produces sound.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const sourceStreamIdRef = useRef<string | null>(null);
  const [audioGraphTick, setAudioGraphTick] = useState(0);
  // Параллельный WebAudio-граф для Track.Source.ScreenShareAudio.
  // Полностью независим от микрофонного: свой AudioContext, GainNode, source.
  // Зачем отдельный AudioContext: ставить sinkId на ctx можно один раз, и
  // переключение output device не должно дёргать гейн микрофонного графа.
  const screenAudioCtxRef = useRef<AudioContext | null>(null);
  const screenGainNodeRef = useRef<GainNode | null>(null);
  const screenSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const screenSourceStreamIdRef = useRef<string | null>(null);
  const screenAudioRef = useRef<HTMLAudioElement | null>(null);
  const [screenAudioGraphTick, setScreenAudioGraphTick] = useState(0);
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
  const screenMuted = !p.isLocal && !!prefs?.participantScreenShareMuted[participantKey];
  const persistedScreenVolume = prefs?.participantScreenShareVolumes[participantKey];

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
  const screenAudioPub = p.getTrackPublication(Track.Source.ScreenShareAudio);
  const screenAudioTrackSid = screenAudioPub?.trackSid;
  const screenAudioMuted = screenAudioPub?.isMuted;
  const screenAudioTrackReady = !!screenAudioPub?.track;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const hasScreenShareAudio = !!screenAudioPub;

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

  // Attach remote audio track:
  //   1. attach() to <audio> element so LiveKit pumps the WebRTC stream;
  //      we force-mute that element so it produces no sound itself.
  //   2. build a Web Audio graph from the underlying MediaStreamTrack:
  //      MediaStreamAudioSourceNode -> GainNode -> ctx.destination.
  //      The GainNode is the single point that controls per-participant
  //      volume (0..2) and mute (gain = 0). Using MediaStreamAudioSourceNode
  //      (not MediaElementAudioSourceNode) avoids the one-shot-per-element
  //      constraint, racing with LiveKit attach/detach, and lets us rebuild
  //      the source cleanly when the track is re-subscribed.
  useEffect(() => {
    if (p.isLocal) return;
    const pub = p.getTrackPublication(Track.Source.Microphone);
    const track = pub?.track;
    const el = audioRef.current;
    if (!track || !el) return;

    track.attach(el);
    el.muted = true;
    el.volume = 0;

    let ctx = audioCtxRef.current;
    if (!ctx) {
      try {
        ctx = new AudioContext();
        audioCtxRef.current = ctx;
      } catch {
        // Web Audio unavailable — fall back to <audio> element.
        el.muted = false;
        el.volume = 1;
        return () => {
          track.detach(el);
        };
      }
    }

    let gain = gainNodeRef.current;
    if (!gain) {
      gain = ctx.createGain();
      gain.connect(ctx.destination);
      gainNodeRef.current = gain;
    }

    // (Re)build the MediaStreamAudioSourceNode whenever the underlying
    // MediaStreamTrack identity changes (track unsubscribe/resubscribe,
    // republish, etc.). MediaStreamAudioSourceNode is bound to the stream
    // it was created from, so we can't reuse the old node across track changes.
    const mst = track.mediaStreamTrack;
    if (mst) {
      const streamId = mst.id;
      if (sourceStreamIdRef.current !== streamId) {
        try {
          sourceNodeRef.current?.disconnect();
        } catch {
          // already disconnected
        }
        try {
          const stream = new MediaStream([mst]);
          const source = ctx.createMediaStreamSource(stream);
          source.connect(gain);
          sourceNodeRef.current = source;
          sourceStreamIdRef.current = streamId;
          // Bump tick so the volume effect re-applies gain after graph rebuild.
          setAudioGraphTick((n) => n + 1);
        } catch {
          // If MediaStreamAudioSourceNode construction fails, fall back to
          // letting the <audio> element play directly so audio still works.
          el.muted = false;
          el.volume = 1;
        }
      }
    }

    ctx.resume().catch(() => undefined);

    const deviceId = prefs?.audioOutputDeviceId;
    if (deviceId) {
      const ctxWithSink = ctx as AudioContext & {
        setSinkId?: (id: string) => Promise<void>;
      };
      if (typeof ctxWithSink.setSinkId === 'function') {
        ctxWithSink.setSinkId(deviceId).catch(() => undefined);
      } else if ('setSinkId' in HTMLMediaElement.prototype) {
        // setSinkId on the <audio> element won't help while the WebAudio path
        // produces the actual sound, but set it anyway for the fallback case.
        (el as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> })
          .setSinkId(deviceId)
          .catch(() => undefined);
      }
    }

    return () => {
      track.detach(el);
    };
  }, [p, audioTrackSid, audioMuted, audioTrackReady, prefs?.audioOutputDeviceId]);

  // Параллельный к микрофонному пути attach-эффект для ScreenShareAudio.
  // Структурно делает то же самое: attach к скрытому <audio> чтобы LiveKit
  // прокачал поток, force-mute элемента, реальный звук через WebAudio с
  // независимым GainNode (для громкости 0..200% и индивидуального mute).
  useEffect(() => {
    if (p.isLocal) return;
    const pub = p.getTrackPublication(Track.Source.ScreenShareAudio);
    const track = pub?.track;
    const el = screenAudioRef.current;
    if (!track || !el) return;

    track.attach(el);
    el.muted = true;
    el.volume = 0;

    let ctx = screenAudioCtxRef.current;
    if (!ctx) {
      try {
        ctx = new AudioContext();
        screenAudioCtxRef.current = ctx;
      } catch {
        // Web Audio недоступен — fallback на нативный <audio>.
        el.muted = false;
        el.volume = 1;
        return () => {
          track.detach(el);
        };
      }
    }

    let gain = screenGainNodeRef.current;
    if (!gain) {
      gain = ctx.createGain();
      gain.connect(ctx.destination);
      screenGainNodeRef.current = gain;
    }

    // Пересобираем MediaStreamAudioSourceNode при смене underlying MediaStreamTrack
    // (resubscribe, republish и т.п. меняют идентичность track'а).
    const mst = track.mediaStreamTrack;
    if (mst) {
      const streamId = mst.id;
      if (screenSourceStreamIdRef.current !== streamId) {
        try {
          screenSourceNodeRef.current?.disconnect();
        } catch {
          // already disconnected
        }
        try {
          const stream = new MediaStream([mst]);
          const source = ctx.createMediaStreamSource(stream);
          source.connect(gain);
          screenSourceNodeRef.current = source;
          screenSourceStreamIdRef.current = streamId;
          // Bump tick — заставляет gain-effect перенакатить громкость.
          setScreenAudioGraphTick((n) => n + 1);
        } catch {
          // Если не получилось — fallback на нативное воспроизведение.
          el.muted = false;
          el.volume = 1;
        }
      }
    }

    ctx.resume().catch(() => undefined);

    const deviceId = prefs?.audioOutputDeviceId;
    if (deviceId) {
      const ctxWithSink = ctx as AudioContext & {
        setSinkId?: (id: string) => Promise<void>;
      };
      if (typeof ctxWithSink.setSinkId === 'function') {
        ctxWithSink.setSinkId(deviceId).catch(() => undefined);
      } else if ('setSinkId' in HTMLMediaElement.prototype) {
        (el as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> })
          .setSinkId(deviceId)
          .catch(() => undefined);
      }
    }

    return () => {
      track.detach(el);
    };
  }, [p, screenAudioTrackSid, screenAudioMuted, screenAudioTrackReady, prefs?.audioOutputDeviceId]);

  // Tear down Web Audio graph on unmount.
  useEffect(() => {
    return () => {
      try {
        sourceNodeRef.current?.disconnect();
      } catch {
        // ignore
      }
      try {
        gainNodeRef.current?.disconnect();
      } catch {
        // ignore
      }
      audioCtxRef.current?.close().catch(() => undefined);
      sourceNodeRef.current = null;
      sourceStreamIdRef.current = null;
      gainNodeRef.current = null;
      audioCtxRef.current = null;
    };
  }, []);

  // Teardown для screen-share WebAudio графа при размонтировании тайла.
  useEffect(() => {
    return () => {
      try {
        screenSourceNodeRef.current?.disconnect();
      } catch {
        // ignore
      }
      try {
        screenGainNodeRef.current?.disconnect();
      } catch {
        // ignore
      }
      screenAudioCtxRef.current?.close().catch(() => undefined);
      screenSourceNodeRef.current = null;
      screenSourceStreamIdRef.current = null;
      screenGainNodeRef.current = null;
      screenAudioCtxRef.current = null;
    };
  }, []);

  // Apply volume + mute to the GainNode. Runs on every prefs change and
  // every time the audio graph is (re)built.
  useEffect(() => {
    if (p.isLocal) return;
    const gain = gainNodeRef.current;
    const ctx = audioCtxRef.current;
    const el = audioRef.current;
    const vol = typeof persistedVolume === 'number' ? persistedVolume : 1;
    if (gain && ctx) {
      // Use setTargetAtTime for a tiny ramp to avoid clicks on abrupt changes.
      const target = muted ? 0 : vol;
      try {
        gain.gain.setTargetAtTime(target, ctx.currentTime, 0.01);
      } catch {
        gain.gain.value = target;
      }
      if (el) {
        el.muted = true;
        el.volume = 0;
      }
      if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);
    } else if (el) {
      // WebAudio not available — fall back to native element controls.
      el.muted = muted;
      el.volume = Math.min(1, vol);
    }
  }, [p, muted, persistedVolume, audioGraphTick]);

  // Применяет screen-share громкость/mute к GainNode. Запускается на каждое
  // изменение prefs.participantScreenShareVolumes/Muted и при пересборке графа.
  useEffect(() => {
    if (p.isLocal) return;
    const gain = screenGainNodeRef.current;
    const ctx = screenAudioCtxRef.current;
    const el = screenAudioRef.current;
    const vol = typeof persistedScreenVolume === 'number' ? persistedScreenVolume : 1;
    if (gain && ctx) {
      const target = screenMuted ? 0 : vol;
      try {
        gain.gain.setTargetAtTime(target, ctx.currentTime, 0.01);
      } catch {
        gain.gain.value = target;
      }
      if (el) {
        el.muted = true;
        el.volume = 0;
      }
      if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);
    } else if (el) {
      // Web Audio недоступен — нативные controls с потолком 100%.
      el.muted = screenMuted;
      el.volume = Math.min(1, vol);
    }
  }, [p, screenMuted, persistedScreenVolume, screenAudioGraphTick]);

  // AudioContexts may start suspended in Electron until first user gesture.
  // Resume both mic and screen-share contexts on the next pointer/key event.
  useEffect(() => {
    const micCtx = audioCtxRef.current;
    const screenCtx = screenAudioCtxRef.current;
    const needsMic = micCtx && micCtx.state === 'suspended';
    const needsScreen = screenCtx && screenCtx.state === 'suspended';
    if (!needsMic && !needsScreen) return;
    const resume = () => {
      if (needsMic) micCtx.resume().catch(() => undefined);
      if (needsScreen) screenCtx.resume().catch(() => undefined);
    };
    window.addEventListener('pointerdown', resume, { once: true });
    window.addEventListener('keydown', resume, { once: true });
    return () => {
      window.removeEventListener('pointerdown', resume);
      window.removeEventListener('keydown', resume);
    };
  }, [audioGraphTick, screenAudioGraphTick]);

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
            {customAvatar(participantKey) && (
              <AvatarImage src={customAvatar(participantKey)!} alt={participantKey} />
            )}
            <AvatarFallback className={cn('text-2xl font-semibold', avatarColor(participantKey), big && 'text-4xl')}>
              {initial}
            </AvatarFallback>
          </Avatar>
        </div>
      )}

      {!p.isLocal && <audio ref={audioRef} autoPlay />}
      {!p.isLocal && <audio ref={screenAudioRef} autoPlay />}

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
