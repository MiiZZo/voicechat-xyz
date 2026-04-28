import { TokenVerifier } from 'livekit-server-sdk';

export type VerifiedToken =
  | { ok: true; roomId: string; identity: string }
  | { ok: false; reason: string };

/**
 * Verify a LiveKit JWT and extract the roomId from its `video.room` grant.
 * Used to authorize file uploads by reusing the same token the client got from /api/join.
 */
export async function verifyLiveKitToken(
  jwt: string,
  apiKey: string,
  apiSecret: string,
): Promise<VerifiedToken> {
  if (!jwt || typeof jwt !== 'string') return { ok: false, reason: 'empty' };
  try {
    const verifier = new TokenVerifier(apiKey, apiSecret);
    const claims = (await verifier.verify(jwt)) as {
      sub?: string;
      identity?: string;
      video?: { room?: string; roomJoin?: boolean };
    };
    const roomId = claims.video?.room;
    const identity = claims.identity ?? claims.sub;
    if (!roomId || !identity) return { ok: false, reason: 'no_grant' };
    return { ok: true, roomId, identity };
  } catch (err) {
    return { ok: false, reason: (err as Error).message ?? 'verify_failed' };
  }
}
