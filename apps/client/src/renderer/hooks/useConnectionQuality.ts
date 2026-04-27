import { useEffect, useState } from 'react';
import { ConnectionQuality, RoomEvent, type Room } from 'livekit-client';

export type QualityMap = Map<string, ConnectionQuality>;

/**
 * Subscribes to LiveKit ConnectionQuality events for every participant
 * (including local) and exposes a periodically-sampled RTT (ms) to the SFU
 * via the publisher PeerConnection's candidate-pair stats.
 *
 * RTT is local→server only; SFU architecture has no per-peer RTT.
 */
export function useConnectionQuality(room: Room | null) {
  const [qualities, setQualities] = useState<QualityMap>(new Map());
  const [rttMs, setRttMs] = useState<number | null>(null);

  useEffect(() => {
    if (!room) return;
    const refresh = () => {
      const next: QualityMap = new Map();
      next.set(room.localParticipant.identity, room.localParticipant.connectionQuality);
      for (const p of room.remoteParticipants.values()) {
        next.set(p.identity, p.connectionQuality);
      }
      setQualities(next);
    };
    refresh();
    room.on(RoomEvent.ConnectionQualityChanged, refresh);
    room.on(RoomEvent.ParticipantConnected, refresh);
    room.on(RoomEvent.ParticipantDisconnected, refresh);
    return () => {
      room.off(RoomEvent.ConnectionQualityChanged, refresh);
      room.off(RoomEvent.ParticipantConnected, refresh);
      room.off(RoomEvent.ParticipantDisconnected, refresh);
    };
  }, [room]);

  useEffect(() => {
    if (!room) {
      setRttMs(null);
      return;
    }
    let cancelled = false;

    type EngineShape = {
      engine?: {
        pcManager?: {
          publisher?: { pc?: RTCPeerConnection; getPC?: () => RTCPeerConnection | undefined };
          subscriber?: { pc?: RTCPeerConnection; getPC?: () => RTCPeerConnection | undefined };
        };
      };
    };

    const pickPc = (): RTCPeerConnection | undefined => {
      const e = (room as unknown as EngineShape).engine?.pcManager;
      const pub = e?.publisher;
      const sub = e?.subscriber;
      return pub?.pc ?? pub?.getPC?.() ?? sub?.pc ?? sub?.getPC?.();
    };

    const tick = async () => {
      const pc = pickPc();
      if (!pc) return;
      try {
        const stats = await pc.getStats();
        let rtt: number | null = null;
        stats.forEach((report) => {
          const r = report as RTCIceCandidatePairStats & { nominated?: boolean };
          if (
            r.type === 'candidate-pair' &&
            r.state === 'succeeded' &&
            (r.nominated === undefined || r.nominated === true) &&
            typeof r.currentRoundTripTime === 'number'
          ) {
            const ms = r.currentRoundTripTime * 1000;
            // Pick the lowest succeeded pair if multiple match
            if (rtt === null || ms < rtt) rtt = ms;
          }
        });
        if (!cancelled) setRttMs(rtt);
      } catch {
        /* ignore */
      }
    };

    tick();
    const id = setInterval(tick, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [room]);

  return { qualities, rttMs };
}

export function qualityLabel(q: ConnectionQuality | undefined): string {
  switch (q) {
    case ConnectionQuality.Excellent:
      return 'Отличное';
    case ConnectionQuality.Good:
      return 'Хорошее';
    case ConnectionQuality.Poor:
      return 'Плохое';
    default:
      return 'Неизвестно';
  }
}
