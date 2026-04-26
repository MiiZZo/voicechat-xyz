import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import yaml from 'js-yaml';
import chokidar from 'chokidar';
import { z } from 'zod';
import { logger } from './logger.js';

const RoomDefSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(48)
    .regex(/^[a-z0-9_-]+$/, 'id must be lowercase slug'),
  name: z.string().min(1).max(48),
});

const FileSchema = z.object({ rooms: z.array(RoomDefSchema) });

export type RoomDef = z.infer<typeof RoomDefSchema>;

export class RoomsRegistry {
  private rooms = new Map<string, RoomDef>();

  constructor(private readonly file: string) {}

  async start(): Promise<void> {
    await this.reload();
    chokidar
      .watch(resolve(this.file), { ignoreInitial: true })
      .on('change', () => {
        this.reload().catch((err) =>
          logger.error({ err }, 'rooms.yaml reload failed; keeping prev state'),
        );
      });
  }

  list(): RoomDef[] {
    return Array.from(this.rooms.values());
  }

  get(id: string): RoomDef | undefined {
    return this.rooms.get(id);
  }

  private async reload(): Promise<void> {
    const raw = await readFile(this.file, 'utf8');
    const parsed = FileSchema.parse(yaml.load(raw));
    const next = new Map<string, RoomDef>();
    for (const room of parsed.rooms) {
      if (next.has(room.id)) throw new Error(`duplicate room id: ${room.id}`);
      next.set(room.id, room);
    }
    this.rooms = next;
    logger.info({ count: next.size }, 'rooms.yaml loaded');
  }
}
