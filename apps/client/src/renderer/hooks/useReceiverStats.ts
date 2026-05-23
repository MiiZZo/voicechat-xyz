import { useEffect, useState } from 'react';
import {
  ParticipantEvent,
  Track,
  type Participant,
  type RemoteAudioTrack,
  type RemoteVideoTrack,
} from 'livekit-client';

export type ReceiverStats = {
  /** Текущий FPS входящего видеопотока (округлено). */
  fps: number;
  /** Средний битрейт за последний интервал в Mbps (1 знак после запятой). */
  bitrateMbps: number;
};

/**
 * Опрашивает RTCRtpReceiver.getStats() раз в 1 сек для указанного source у
 * remote-участника. Возвращает null пока трек не подписан или статистика не
 * доступна. Перезапускается на смену publication (TrackSubscribed/Unsubscribed).
 *
 * Замечание про simulcast: getStats() может вернуть несколько inbound-rtp video
 * записей при receiver-side simulcast. В нашем кейсе LiveKit subscriber всегда
 * получает один поток, так что берём последнюю встретившуюся запись (поведение
 * деградирует gracefully на simulcast — просто показывает один из layer'ов).
 */
export function useReceiverStats(p: Participant, source: Track.Source): ReceiverStats | null {
  const [stats, setStats] = useState<ReceiverStats | null>(null);
  // Принудительная перезапись основного effect-а при появлении/исчезновении
  // подписки: publication может существовать до того, как трек подписан, и
  // без re-trigger мы один раз получили null и больше не пытались бы.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    p.on(ParticipantEvent.TrackSubscribed, bump);
    p.on(ParticipantEvent.TrackUnsubscribed, bump);
    return () => {
      p.off(ParticipantEvent.TrackSubscribed, bump);
      p.off(ParticipantEvent.TrackUnsubscribed, bump);
    };
  }, [p]);

  useEffect(() => {
    const pub = p.getTrackPublication(source);
    const track = pub?.track;
    // RemoteVideoTrack / RemoteAudioTrack экспозят .receiver. Базовый Track
    // его не имеет — нужен type-narrow.
    const receiver =
      track && 'receiver' in track
        ? (track as RemoteVideoTrack | RemoteAudioTrack).receiver
        : null;
    if (!receiver) {
      setStats(null);
      return;
    }
    let prevBytes = 0;
    let prevTs = 0;
    const id = setInterval(async () => {
      let report;
      try {
        report = await receiver.getStats();
      } catch {
        return;
      }
      let fps = 0;
      let bytes = 0;
      let ts = 0;
      report.forEach((s) => {
        if (s.type === 'inbound-rtp' && s.kind === 'video') {
          fps = s.framesPerSecond ?? 0;
          bytes = s.bytesReceived ?? 0;
          ts = s.timestamp;
        }
      });
      if (prevTs > 0 && ts > prevTs) {
        const dtSec = (ts - prevTs) / 1000;
        const dBytes = bytes - prevBytes;
        const bps = (dBytes * 8) / dtSec;
        setStats({
          fps: Math.round(fps),
          bitrateMbps: Number((bps / 1_000_000).toFixed(1)),
        });
      }
      prevBytes = bytes;
      prevTs = ts;
    }, 1000);
    return () => clearInterval(id);
  }, [p, source, tick]);

  return stats;
}
