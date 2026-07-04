import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Config } from '../config.js';
import { authorizeRoom } from '../authorize.js';
import type { HistoryStore, HistoryRecord } from './history-store.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFastify = FastifyInstance<any, any, any, any>;

/** Newest-N messages returned on room join. */
const LOAD_LIMIT = 200;
const MAX_TEXT_LEN = 500;

export type HistoryRouteDeps = {
  config: Config;
  store: HistoryStore;
};

const RecordSchema = z.discriminatedUnion('kind', [
  z.object({
    id: z.string().min(1).max(200),
    kind: z.literal('text'),
    fromIdentity: z.string().min(1).max(200),
    fromName: z.string().min(1).max(200),
    timestamp: z.number().int().nonnegative(),
    text: z.string().min(1).max(MAX_TEXT_LEN),
  }),
  z.object({
    id: z.string().min(1).max(200),
    kind: z.literal('file'),
    fromIdentity: z.string().min(1).max(200),
    fromName: z.string().min(1).max(200),
    timestamp: z.number().int().nonnegative(),
    fileId: z.string().min(1).max(200),
    url: z.string().min(1).max(2000),
    name: z.string().min(1).max(500),
    size: z.number().int().nonnegative(),
    mime: z.string().min(1).max(200),
  }),
]);

export function registerHistoryRoutes(app: AnyFastify, deps: HistoryRouteDeps): void {
  const ttlMs = deps.config.HISTORY_TTL_DAYS * 24 * 60 * 60 * 1000;

  app.post('/api/history/:roomId', async (req, reply) => {
    const { roomId } = req.params as { roomId: string };
    const auth = await authorizeRoom(req, deps.config);
    if (!auth.ok) return reply.code(401).send({ error: auth.reason });
    if (auth.roomId !== roomId) return reply.code(403).send({ error: 'token room mismatch' });

    const parsed = RecordSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid record' });
    }

    await deps.store.append(roomId, parsed.data as HistoryRecord);
    return reply.send({ ok: true });
  });

  app.get('/api/history/:roomId', async (req, reply) => {
    const { roomId } = req.params as { roomId: string };
    const auth = await authorizeRoom(req, deps.config);
    if (!auth.ok) return reply.code(401).send({ error: auth.reason });
    if (auth.roomId !== roomId) return reply.code(403).send({ error: 'token room mismatch' });

    const records = await deps.store.read(roomId, { ttlMs, limit: LOAD_LIMIT });
    return reply.send(records);
  });
}
