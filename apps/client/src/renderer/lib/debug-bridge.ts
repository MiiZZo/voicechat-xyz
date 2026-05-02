// Хелперы для замера WebRTC-стат из DevTools-консоли. Подцепляются к обоим
// клиентам через main.tsx — рендерер один и тот же. В прод-сборке оверхед
// нулевой кроме одного console.log и тонкого подкласса RTCPeerConnection.

declare global {
  interface Window {
    __pcs?: RTCPeerConnection[];
    __lkScreenStats?: () => Promise<ScreenStats | null>;
    __lkScreenWatch?: (intervalMs?: number) => () => void;
  }
}

type ScreenStats = {
  width: number;
  height: number;
  /** реальный outbound fps (что улетело по сети после всех дропов) */
  fps: number;
  /** fps capture pipeline — то, что отдаёт screen capturer до энкодера */
  captureFps: number;
  /** fps на входе энкодера (без сетевых дропов) */
  encodeFps: number;
  kbps: number;
  codec: string;
  encoderImpl?: string;
  /** "none" / "cpu" / "bandwidth" / "other" — главный диагностический сигнал */
  qualityLimitationReason?: string;
  /** доли времени по причинам ограничения качества за всю сессию */
  qualityLimitationDurations?: Record<string, number>;
  ssrc?: number;
};

const pcs: RTCPeerConnection[] = [];
window.__pcs = pcs;

const Native = window.RTCPeerConnection;
class TrackedRTCPeerConnection extends Native {
  constructor(...args: ConstructorParameters<typeof Native>) {
    super(...args);
    pcs.push(this);
    this.addEventListener('connectionstatechange', () => {
      if (this.connectionState === 'closed') {
        const i = pcs.indexOf(this);
        if (i >= 0) pcs.splice(i, 1);
      }
    });
  }
}
// Подмена конструктора в window — допустимое writable property, в отличие
// от ESM-импорт-биндингов; так мы трекаем ВСЕ peer connection'ы LiveKit.
window.RTCPeerConnection = TrackedRTCPeerConnection as unknown as typeof RTCPeerConnection;

type StatPrev = {
  bytes: number;
  framesEncoded: number;
  framesSent: number;
  ts: number;
};
const prev = new Map<number, StatPrev>();

async function collectScreenStats(): Promise<ScreenStats | null> {
  let best: ScreenStats | null = null;
  for (const pc of pcs) {
    const stats = await pc.getStats();
    let outbound: Record<string, unknown> | null = null;
    let codecId = '';
    stats.forEach((s) => {
      const r = s as unknown as Record<string, unknown>;
      if (r.type === 'outbound-rtp' && r.kind === 'video') {
        const w = (r.frameWidth as number) ?? 0;
        const h = (r.frameHeight as number) ?? 0;
        const cur = (outbound?.frameWidth as number | undefined) ?? 0;
        if (w * h > cur * cur) {
          outbound = r;
          codecId = (r.codecId as string) ?? '';
        }
      }
    });
    if (!outbound) continue;
    const o = outbound as {
      ssrc?: number;
      frameWidth?: number;
      frameHeight?: number;
      framesPerSecond?: number;
      framesEncoded?: number;
      framesSent?: number;
      bytesSent?: number;
      encoderImplementation?: string;
      qualityLimitationReason?: string;
      qualityLimitationDurations?: Record<string, number>;
      mediaSourceId?: string;
      timestamp: number;
    };
    const ssrc = o.ssrc ?? 0;
    const p = prev.get(ssrc);
    let sendFps = o.framesPerSecond ?? 0;
    let encodeFps = 0;
    let kbps = 0;
    if (p && o.timestamp > p.ts) {
      const dt = (o.timestamp - p.ts) / 1000;
      if (!sendFps && o.framesSent != null) {
        sendFps = (o.framesSent - p.framesSent) / dt;
      }
      if (o.framesEncoded != null) {
        encodeFps = (o.framesEncoded - p.framesEncoded) / dt;
      }
      if (o.bytesSent != null) {
        kbps = ((o.bytesSent - p.bytes) * 8) / dt / 1000;
      }
    }
    prev.set(ssrc, {
      bytes: o.bytesSent ?? 0,
      framesEncoded: o.framesEncoded ?? 0,
      framesSent: o.framesSent ?? 0,
      ts: o.timestamp,
    });

    // Capture-side fps берём из media-source записи в getStats — это то,
    // что отдаёт screen capturer ДО энкодера. Если он сам ниже таргета —
    // проблема в WGC/GDI, не в кодеке.
    let captureFps = 0;
    if (o.mediaSourceId) {
      const ms = stats.get(o.mediaSourceId) as unknown as { framesPerSecond?: number } | undefined;
      captureFps = ms?.framesPerSecond ?? 0;
    }

    let codec = '';
    if (codecId) {
      const c = stats.get(codecId) as unknown as { mimeType?: string } | undefined;
      codec = c?.mimeType ?? '';
    }
    const stat: ScreenStats = {
      width: o.frameWidth ?? 0,
      height: o.frameHeight ?? 0,
      fps: Math.round(sendFps),
      captureFps: Math.round(captureFps),
      encodeFps: Math.round(encodeFps),
      kbps: Math.round(kbps),
      codec,
      encoderImpl: o.encoderImplementation,
      qualityLimitationReason: o.qualityLimitationReason,
      qualityLimitationDurations: o.qualityLimitationDurations,
      ssrc,
    };
    if (!best || stat.width * stat.height > best.width * best.height) {
      best = stat;
    }
  }
  return best;
}

window.__lkScreenStats = collectScreenStats;
window.__lkScreenWatch = (intervalMs = 1000) => {
  const id = setInterval(async () => {
    const s = await collectScreenStats();
    if (s) console.table(s);
    else console.log('[debug-bridge] нет активной outbound-video публикации');
  }, intervalMs);
  return () => clearInterval(id);
};

console.log(
  '[debug-bridge] помощники: window.__pcs, window.__lkScreenStats(), window.__lkScreenWatch()',
);
