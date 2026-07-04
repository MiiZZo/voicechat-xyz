import { createReadStream } from 'node:fs';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Config } from '../config.js';
import type { FileStore } from './file-store.js';
import { verifyLiveKitToken } from './verify-livekit-token.js';
import { signFileToken, verifyFileToken } from './signed-url.js';

const SIGNED_TTL_MS = 60 * 60 * 1000; // 1h
const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFastify = FastifyInstance<any, any, any, any>;

export type FileRouteDeps = {
  config: Config;
  store: FileStore;
};

export function registerFileRoutes(app: AnyFastify, deps: FileRouteDeps): void {
  app.post('/api/uploads/:roomId', async (req, reply) => {
    const { roomId } = req.params as { roomId: string };
    const auth = await authorize(req, deps.config);
    if (!auth.ok) return reply.code(401).send({ error: auth.reason });
    if (auth.roomId !== roomId) {
      return reply.code(403).send({ error: 'token room mismatch' });
    }

    if (!req.isMultipart()) {
      return reply.code(400).send({ error: 'expected multipart' });
    }

    const file = await req.file({ limits: { fileSize: MAX_FILE_BYTES, files: 1 } });
    if (!file) return reply.code(400).send({ error: 'no file' });

    const buf = await file.toBuffer().catch(() => null);
    if (!buf) return reply.code(400).send({ error: 'read failed' });

    // @fastify/multipart sets file.file.truncated when limit was hit
    if (file.file.truncated) {
      return reply.code(413).send({ error: 'file too large (max 50MB)' });
    }

    const meta = await deps.store.save({
      roomId,
      originalName: file.filename ?? 'file',
      mime: file.mimetype || 'application/octet-stream',
      data: buf,
    });

    const token = signFileToken(deps.config.LIVEKIT_API_SECRET, roomId, meta.id, SIGNED_TTL_MS);
    const url = `${publicBase(req, deps.config)}/api/files/${roomId}/${meta.id}?t=${encodeURIComponent(token)}`;
    return reply.send({
      id: meta.id,
      url,
      name: meta.name,
      size: meta.size,
      mime: meta.mime,
    });
  });

  app.get('/api/files/:roomId/:fileId', async (req, reply) => {
    const { roomId, fileId } = req.params as { roomId: string; fileId: string };
    const { t } = req.query as { t?: string };
    if (!t) return reply.code(401).send({ error: 'missing token' });

    const v = verifyFileToken(deps.config.LIVEKIT_API_SECRET, roomId, fileId, t);
    if (!v.ok) return reply.code(401).send({ error: v.reason });

    const meta = await deps.store.readMeta(roomId, fileId);
    if (!meta) return reply.code(404).send({ error: 'not found' });

    const path = deps.store.filePath(roomId, meta);
    const total = meta.size;
    const isImage = meta.mime.startsWith('image/');
    const dispositionType = isImage ? 'inline' : 'attachment';
    const filenameStar = encodeURIComponent(meta.name);
    // ASCII-only fallback for old user agents — strip non-ASCII so the header is valid
    const asciiFallback = meta.name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");
    reply
      .header('Content-Type', meta.mime)
      .header(
        'Content-Disposition',
        `${dispositionType}; filename="${asciiFallback}"; filename*=UTF-8''${filenameStar}`,
      )
      .header('X-Content-Type-Options', 'nosniff')
      // Advertise range support so <audio>/<video> know the resource is
      // seekable (browsers issue a Range request when currentTime is set;
      // without this they treat the media as non-seekable and reset to 0).
      .header('Accept-Ranges', 'bytes');

    const range = parseRange(req.headers['range'], total);
    if (range === 'unsatisfiable') {
      return reply
        .code(416)
        .header('Content-Range', `bytes */${total}`)
        // Override the media Content-Type set above so Fastify serializes the
        // JSON error body instead of rejecting it as an invalid payload type.
        .type('application/json')
        .send({ error: 'range not satisfiable' });
    }
    if (range) {
      return reply
        .code(206)
        .header('Content-Range', `bytes ${range.start}-${range.end}/${total}`)
        .header('Content-Length', String(range.end - range.start + 1))
        .send(createReadStream(path, { start: range.start, end: range.end }));
    }
    return reply.header('Content-Length', String(total)).send(createReadStream(path));
  });
}

/** Parse a single-range HTTP `Range` header against a resource of `total`
 *  bytes. Returns a byte interval for a 206 response, `'unsatisfiable'` for a
 *  416, or `null` to send the full body (no header, or a form we don't honor
 *  such as multi-range). `end` is inclusive, matching `createReadStream`. */
function parseRange(
  header: string | string[] | undefined,
  total: number,
): { start: number; end: number } | 'unsatisfiable' | null {
  if (typeof header !== 'string') return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const startStr = m[1];
  const endStr = m[2];
  if (startStr === '' && endStr === '') return null;

  let start: number;
  let end: number;
  if (startStr === '') {
    // Suffix range: last N bytes.
    const suffix = Number(endStr);
    if (!Number.isFinite(suffix) || suffix <= 0) return 'unsatisfiable';
    start = Math.max(0, total - suffix);
    end = total - 1;
  } else {
    start = Number(startStr);
    if (!Number.isFinite(start)) return null;
    end = endStr === '' ? total - 1 : Number(endStr);
    if (!Number.isFinite(end)) end = total - 1;
  }

  if (start >= total) return 'unsatisfiable';
  if (end >= total) end = total - 1;
  if (start > end) return 'unsatisfiable';
  return { start, end };
}

async function authorize(
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

function publicBase(req: FastifyRequest, _config: Config): string {
  // Honor reverse-proxy headers (Caddy sets X-Forwarded-Proto/Host).
  const proto =
    (req.headers['x-forwarded-proto'] as string | undefined) ?? req.protocol ?? 'http';
  const host =
    (req.headers['x-forwarded-host'] as string | undefined) ??
    (req.headers['host'] as string | undefined) ??
    'localhost';
  return `${proto}://${host}`;
}

// Re-export for use in unused-import-suppression / future internal callers.
export { FastifyReply };
