import type { FastifyRequest } from 'fastify';
import { signFileToken } from './signed-url.js';

/** Lifetime of a signed file URL. Deliberately short: URLs are re-minted
 *  on demand (at upload and on every history read), so a stale token never
 *  outlives its usefulness. The file blob itself lives UPLOAD_TTL_HOURS. */
export const SIGNED_TTL_MS = 60 * 60 * 1000; // 1h

/** Public origin for building absolute file URLs. Honors reverse-proxy
 *  headers (Caddy sets X-Forwarded-Proto/Host). */
export function publicBase(req: FastifyRequest): string {
  const proto =
    (req.headers['x-forwarded-proto'] as string | undefined) ?? req.protocol ?? 'http';
  const host =
    (req.headers['x-forwarded-host'] as string | undefined) ??
    (req.headers['host'] as string | undefined) ??
    'localhost';
  return `${proto}://${host}`;
}

/** Build an absolute, freshly-signed download URL for a file. Used both when a
 *  file is first uploaded and when history records are re-served — the latter
 *  re-signs so links stored days ago (with long-expired tokens) still resolve. */
export function signedFileUrl(
  req: FastifyRequest,
  secret: string,
  roomId: string,
  fileId: string,
): string {
  const token = signFileToken(secret, roomId, fileId, SIGNED_TTL_MS);
  return `${publicBase(req)}/api/files/${roomId}/${fileId}?t=${encodeURIComponent(token)}`;
}
