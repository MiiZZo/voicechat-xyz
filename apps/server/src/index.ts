import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { loadConfig } from './config.js';
import { logger } from './logger.js';
import { RoomsRegistry } from './rooms-registry.js';
import { LiveKitClient } from './livekit-client.js';
import { TokenIssuer } from './token-issuer.js';
import { registerRoutes } from './routes.js';

const config = loadConfig();
const rooms = new RoomsRegistry(config.ROOMS_FILE);
await rooms.start();

const livekit = new LiveKitClient(config);
const tokens = TokenIssuer.fromConfig(config);

// Cast: passing a pino instance narrows Fastify's logger generic in a way that
// breaks plugin compatibility; widening back to FastifyBaseLogger keeps the
// instance API consistent across the rest of the app.
const app = Fastify({ logger: logger as unknown as FastifyBaseLogger }) as FastifyInstance;
await app.register(cors, { origin: true });
await registerRoutes(app, { config, rooms, livekit, tokens });

await app.listen({ port: config.PORT, host: '0.0.0.0' });
logger.info({ port: config.PORT }, 'lobby server listening');
