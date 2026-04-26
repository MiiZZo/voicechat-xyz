import { RoomServiceClient, type ParticipantInfo } from 'livekit-server-sdk';
import type { Config } from './config.js';

export type ParticipantSummary = { identity: string; name: string };

export class LiveKitClient {
  private readonly svc: RoomServiceClient;
  private cache = new Map<string, { at: number; data: ParticipantSummary[] }>();
  private static readonly CACHE_TTL_MS = 1000;

  constructor(config: Config) {
    // RoomServiceClient wants HTTP(S), not WSS — convert.
    const httpUrl = config.LIVEKIT_URL.replace(/^ws/, 'http');
    this.svc = new RoomServiceClient(httpUrl, config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET);
  }

  /** Cached list — used by GET /api/rooms (1s TTL to dedupe polling). */
  async listParticipantsCached(roomId: string): Promise<ParticipantSummary[]> {
    const hit = this.cache.get(roomId);
    if (hit && Date.now() - hit.at < LiveKitClient.CACHE_TTL_MS) return hit.data;
    const fresh = await this.listParticipantsFresh(roomId);
    this.cache.set(roomId, { at: Date.now(), data: fresh });
    return fresh;
  }

  /** Bypass-cache list — used by POST /api/join for full/duplicate checks. */
  async listParticipantsFresh(roomId: string): Promise<ParticipantSummary[]> {
    try {
      const participants: ParticipantInfo[] = await this.svc.listParticipants(roomId);
      return participants.map((p) => ({
        identity: p.identity,
        name: p.name || p.identity.split('#')[0] || p.identity,
      }));
    } catch (err: unknown) {
      // LiveKit returns 404-ish for empty/nonexistent rooms; treat as empty.
      const code = (err as { status?: number; code?: number })?.status;
      if (code === 404) return [];
      throw err;
    }
  }
}
