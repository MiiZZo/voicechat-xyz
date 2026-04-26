import { loadConfig } from './config.js';
import { logger } from './logger.js';
import { RoomsRegistry } from './rooms-registry.js';

const config = loadConfig();
const rooms = new RoomsRegistry(config.ROOMS_FILE);
await rooms.start();
logger.info({ rooms: rooms.list().map((r) => r.id) }, 'registry ready');
