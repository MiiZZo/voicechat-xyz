import type { FastifyRequest } from 'fastify';
import type { Config } from './config.js';
import { verifyLiveKitToken } from './files/verify-livekit-token.js';

/** Verify the `Authorization: Bearer <livekit-jwt>` header and return the room
 *  the token grants access to. Shared by the file and history routes. */
export async function authorizeRoom(
  req: FastifyRequest,
  config: Config,
): Promise<{ ok: true; roomId: string; identity: string } | { ok: false; reason: string }> {
  const header = req.headers['authorization'];
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
    return { ok: false, reason: 'missing bearer token' };
  }
  const jwt = header.slice('Bearer '.length).trim();
  const v = await verifyLiveKitToken(jwt, config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET);
  if (!v.ok) return { ok: false, reason: v.reason };
  return { ok: true, roomId: v.roomId, identity: v.identity };
}
