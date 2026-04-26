import Fastify from 'fastify';
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

const app = Fastify({ logger });
await app.register(cors, { origin: true });
await registerRoutes(app, { config, rooms, livekit, tokens });

await app.listen({ port: config.PORT, host: '0.0.0.0' });
logger.info({ port: config.PORT }, 'lobby server listening');
