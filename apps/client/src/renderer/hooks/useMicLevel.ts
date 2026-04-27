import { useEffect, useState } from 'react';
import { Track, type Room } from 'livekit-client';

/** Returns RMS level 0..1 of the local microphone track, sampled ~10x/sec. */
export function useMicLevel(room: Room | null): number {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!room) return;
    const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
    const track = pub?.audioTrack;
    const stream = track?.mediaStream;
    if (!stream) {
      setLevel(0);
      return;
    }
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < 100) return;
      last = now;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const x = ((data[i] ?? 128) - 128) / 128;
        sum += x * x;
      }
      setLevel(Math.min(1, Math.sqrt(sum / data.length) * 2));
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      source.disconnect();
      ctx.close().catch(() => undefined);
    };
  }, [room, room?.localParticipant.isMicrophoneEnabled]);

  return level;
}
