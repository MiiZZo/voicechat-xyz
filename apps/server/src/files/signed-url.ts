import { createHmac, timingSafeEqual } from 'node:crypto';

// Token format: `<expMs>.<sigB64Url>`
// Signature is HMAC-SHA256 over `<roomId>|<fileId>|<expMs>`.
// Url-safe base64 (no padding, +/-, /-_).

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' };

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function sign(secret: string, roomId: string, fileId: string, expMs: number): string {
  const mac = createHmac('sha256', secret);
  mac.update(`${roomId}|${fileId}|${expMs}`);
  return b64url(mac.digest());
}

export function signFileToken(
  secret: string,
  roomId: string,
  fileId: string,
  ttlMs: number,
): string {
  const expMs = Date.now() + ttlMs;
  const sig = sign(secret, roomId, fileId, expMs);
  return `${expMs}.${sig}`;
}

export function verifyFileToken(
  secret: string,
  roomId: string,
  fileId: string,
  token: string,
): VerifyResult {
  if (typeof token !== 'string' || token.length === 0) {
    return { ok: false, reason: 'malformed' };
  }
  const dot = token.indexOf('.');
  if (dot <= 0) return { ok: false, reason: 'malformed' };
  const expStr = token.slice(0, dot);
  const sigStr = token.slice(dot + 1);
  if (!/^\d+$/.test(expStr)) return { ok: false, reason: 'malformed' };

  const expected = sign(secret, roomId, fileId, Number(expStr));
  const a = fromB64url(sigStr);
  const b = fromB64url(expected);
  if (!a || !b || a.length !== b.length) return { ok: false, reason: 'bad_signature' };
  if (!timingSafeEqual(a, b)) return { ok: false, reason: 'bad_signature' };

  if (Number(expStr) < Date.now()) return { ok: false, reason: 'expired' };
  return { ok: true };
}
