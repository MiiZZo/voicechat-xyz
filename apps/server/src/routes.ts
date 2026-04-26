import type { FastifyInstance } from 'fastify';
import { JoinBodySchema } from './validation.js';
import type { RoomsRegistry } from './rooms-registry.js';
import type { LiveKitClient } from './livekit-client.js';
import type { TokenIssuer } from './token-issuer.js';
import type { Config } from './config.js';

const MAX_PARTICIPANTS = 8;

export type RouteDeps = {
  config: Config;
  rooms: RoomsRegistry;
  livekit: LiveKitClient;
  tokens: TokenIssuer;
};

// Erase all four generics so we accept FastifyInstance<any logger> without variance issues.
// Concrete generic shape: FastifyInstance<RawServer, RawRequest, RawReply, Logger>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFastify = FastifyInstance<any, any, any, any>;

export async function registerRoutes(app: AnyFastify, deps: RouteDeps): Promise<void> {
  app.get('/healthz', async () => ({ status: 'ok' }));

  app.get('/api/rooms', async () => {
    const list = deps.rooms.list();
    const result = await Promise.all(
      list.map(async (room) => ({
        id: room.id,
        displayName: room.name,
        maxParticipants: MAX_PARTICIPANTS,
        participants: await deps.livekit.listParticipantsCached(room.id),
      })),
    );
    return result;
  });

  app.post('/api/join', async (req, reply) => {
    const parsed = JoinBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid input' });
    }
    const { roomId, displayName } = parsed.data;

    if (!deps.rooms.get(roomId)) return reply.code(404).send({ error: 'room not found' });

    const current = await deps.livekit.listParticipantsFresh(roomId);
    if (current.length >= MAX_PARTICIPANTS) {
      return reply.code(409).send({ reason: 'full' });
    }
    const nameTaken = current.some((p) => p.name === displayName);
    if (nameTaken) {
      return reply.code(409).send({ reason: 'duplicate_name' });
    }

    const identity = deps.tokens.buildIdentity(displayName);
    const token = await deps.tokens.issue({ roomId, displayName, identity });
    return { token, livekitUrl: deps.config.LIVEKIT_URL, identity };
  });
}
