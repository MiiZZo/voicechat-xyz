import { mkdir, writeFile, readdir, stat, unlink, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { logger } from '../logger.js';
import { sanitizeFilename, splitExt } from './sanitize-filename.js';

export type StoredFileMeta = {
  id: string;
  name: string; // sanitized original name (for download UX)
  mime: string;
  size: number;
  createdAt: number; // ms
};

export class FileStore {
  constructor(private readonly root: string) {}

  /** Save a buffer to disk under <root>/<roomId>/<id><ext> with a sidecar JSON. */
  async save(args: {
    roomId: string;
    originalName: string;
    mime: string;
    data: Buffer;
  }): Promise<StoredFileMeta> {
    const cleanName = sanitizeFilename(args.originalName);
    const { ext } = splitExt(cleanName);
    const id = randomUUID().replace(/-/g, '');
    const dir = this.roomDir(args.roomId);
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, `${id}${ext}`);
    const metaPath = join(dir, `${id}.json`);
    const meta: StoredFileMeta = {
      id,
      name: cleanName,
      mime: args.mime,
      size: args.data.byteLength,
      createdAt: Date.now(),
    };
    await writeFile(filePath, args.data);
    await writeFile(metaPath, JSON.stringify(meta), 'utf8');
    return meta;
  }

  async readMeta(roomId: string, fileId: string): Promise<StoredFileMeta | null> {
    if (!isSafeId(roomId) || !isSafeId(fileId)) return null;
    const metaPath = join(this.roomDir(roomId), `${fileId}.json`);
    if (!existsSync(metaPath)) return null;
    try {
      const raw = await readFile(metaPath, 'utf8');
      return JSON.parse(raw) as StoredFileMeta;
    } catch {
      return null;
    }
  }

  /** Resolves to the on-disk path of the actual file (not the sidecar). */
  filePath(roomId: string, meta: StoredFileMeta): string {
    const { ext } = splitExt(meta.name);
    return join(this.roomDir(roomId), `${meta.id}${ext}`);
  }

  /** Delete files older than ttlMs. Best-effort. */
  async cleanupExpired(ttlMs: number): Promise<{ removed: number }> {
    if (!existsSync(this.root)) return { removed: 0 };
    let removed = 0;
    const cutoff = Date.now() - ttlMs;
    const rooms = await readdir(this.root, { withFileTypes: true });
    for (const room of rooms) {
      if (!room.isDirectory()) continue;
      const dir = join(this.root, room.name);
      let entries;
      try {
        entries = await readdir(dir);
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.endsWith('.json')) continue;
        const metaPath = join(dir, entry);
        try {
          const raw = await readFile(metaPath, 'utf8');
          const meta = JSON.parse(raw) as StoredFileMeta;
          if (meta.createdAt > cutoff) continue;
          const filePath = this.filePath(room.name, meta);
          await unlink(filePath).catch(() => undefined);
          await unlink(metaPath).catch(() => undefined);
          removed++;
        } catch (err) {
          logger.warn({ err, metaPath }, 'cleanup: failed to process meta');
        }
      }
      // Remove empty room dirs
      try {
        const remaining = await readdir(dir);
        if (remaining.length === 0) await rm(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
    if (removed > 0) logger.info({ removed }, 'file cleanup');
    return { removed };
  }

  /** Periodic background cleanup. Returns a stop() handle. */
  startCleanup(ttlMs: number, intervalMs = 60 * 60 * 1000): () => void {
    void this.cleanupExpired(ttlMs).catch((err) => logger.error({ err }, 'initial cleanup'));
    const handle = setInterval(() => {
      void this.cleanupExpired(ttlMs).catch((err) =>
        logger.error({ err }, 'periodic cleanup'),
      );
    }, intervalMs);
    return () => clearInterval(handle);
  }

  private roomDir(roomId: string): string {
    if (!isSafeId(roomId)) throw new Error(`unsafe roomId: ${roomId}`);
    return resolve(this.root, roomId);
  }

  /** Used by tests / introspection. */
  async statFor(roomId: string, fileId: string): Promise<{ size: number } | null> {
    const meta = await this.readMeta(roomId, fileId);
    if (!meta) return null;
    try {
      const s = await stat(this.filePath(roomId, meta));
      return { size: s.size };
    } catch {
      return null;
    }
  }
}

function isSafeId(s: string): boolean {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(s);
}
