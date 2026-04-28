import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { loadConfig } from './config.js';
import { logger } from './logger.js';
import { RoomsRegistry } from './rooms-registry.js';
import { LiveKitClient } from './livekit-client.js';
import { TokenIssuer } from './token-issuer.js';
import { registerRoutes } from './routes.js';
import { FileStore } from './files/file-store.js';
import { registerFileRoutes } from './files/routes.js';

const config = loadConfig();
const rooms = new RoomsRegistry(config.ROOMS_FILE);
await rooms.start();

const livekit = new LiveKitClient(config);
const tokens = TokenIssuer.fromConfig(config);
const fileStore = new FileStore(config.UPLOAD_DIR);
const stopCleanup = fileStore.startCleanup(config.UPLOAD_TTL_HOURS * 60 * 60 * 1000);

const app = Fastify({ logger, bodyLimit: 60 * 1024 * 1024 });
await app.register(cors, { origin: true });
await app.register(multipart, {
  limits: { fileSize: 50 * 1024 * 1024, files: 1, fields: 0 },
});
await registerRoutes(app, { config, rooms, livekit, tokens });
registerFileRoutes(app, { config, store: fileStore });

const shutdown = async () => {
  stopCleanup();
  await app.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port: config.PORT, host: '0.0.0.0' });
logger.info({ port: config.PORT }, 'lobby server listening');
