import { mkdir, readFile, writeFile, appendFile, readdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { logger } from '../logger.js';

/** One persisted chat message. Mirrors the client's HistoryRecord contract. */
export type HistoryRecord = {
  id: string;
  kind: 'text' | 'file';
  fromIdentity: string;
  fromName: string;
  timestamp: number;
  // kind === 'text'
  text?: string;
  // kind === 'file'
  fileId?: string;
  url?: string;
  name?: string;
  size?: number;
  mime?: string;
};

/** Newest-N cap per room, trimmed during cleanup so a room can't grow without
 *  bound between retention passes. */
const MAX_MESSAGES = 1000;

/** Append-only per-room chat log. One JSONL file per room:
 *  <root>/<roomId>.jsonl, one JSON record per line. Deliberately mirrors the
 *  shape and lifecycle of FileStore (disk-backed, no DB, periodic cleanup). */
export class HistoryStore {
  constructor(private readonly root: string) {}

  async append(roomId: string, record: HistoryRecord): Promise<void> {
    if (!isSafeId(roomId)) throw new Error(`unsafe roomId: ${roomId}`);
    await mkdir(this.root, { recursive: true });
    await appendFile(this.filePath(roomId), JSON.stringify(record) + '\n', 'utf8');
  }

  /** Read records for a room, filtered to those newer than ttlMs and capped to
   *  the newest `limit`. Returns chronological (oldest → newest). */
  async read(
    roomId: string,
    opts: { ttlMs: number; limit: number },
  ): Promise<HistoryRecord[]> {
    if (!isSafeId(roomId)) return [];
    const path = this.filePath(roomId);
    if (!existsSync(path)) return [];
    let raw: string;
    try {
      raw = await readFile(path, 'utf8');
    } catch {
      return [];
    }
    const cutoff = Date.now() - opts.ttlMs;
    const records = parseLines(raw).filter((r) => r.timestamp > cutoff);
    return records.slice(-opts.limit);
  }

  /** Drop records older than ttlMs across all rooms and trim each room to the
   *  newest MAX_MESSAGES. Rewrites files in place; removes empty ones.
   *  Best-effort. */
  async cleanupExpired(ttlMs: number): Promise<{ removed: number }> {
    if (!existsSync(this.root)) return { removed: 0 };
    let removed = 0;
    const cutoff = Date.now() - ttlMs;
    let entries: string[];
    try {
      entries = await readdir(this.root);
    } catch {
      return { removed: 0 };
    }
    for (const entry of entries) {
      if (!entry.endsWith('.jsonl')) continue;
      const path = join(this.root, entry);
      try {
        const raw = await readFile(path, 'utf8');
        const all = parseLines(raw);
        const kept = all.filter((r) => r.timestamp > cutoff).slice(-MAX_MESSAGES);
        removed += all.length - kept.length;
        if (kept.length === 0) {
          await unlink(path).catch(() => undefined);
        } else if (kept.length !== all.length) {
          await writeFile(path, kept.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
        }
      } catch (err) {
        logger.warn({ err, path }, 'history cleanup: failed to process file');
      }
    }
    if (removed > 0) logger.info({ removed }, 'history cleanup');
    return { removed };
  }

  /** Periodic background cleanup. Returns a stop() handle. */
  startCleanup(ttlMs: number, intervalMs = 60 * 60 * 1000): () => void {
    void this.cleanupExpired(ttlMs).catch((err) => logger.error({ err }, 'initial history cleanup'));
    const handle = setInterval(() => {
      void this.cleanupExpired(ttlMs).catch((err) =>
        logger.error({ err }, 'periodic history cleanup'),
      );
    }, intervalMs);
    return () => clearInterval(handle);
  }

  private filePath(roomId: string): string {
    return resolve(this.root, `${roomId}.jsonl`);
  }
}

/** Parse JSONL, skipping blank or corrupt lines. */
function parseLines(raw: string): HistoryRecord[] {
  const out: HistoryRecord[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed) as HistoryRecord);
    } catch {
      /* skip corrupt line */
    }
  }
  return out;
}

function isSafeId(s: string): boolean {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(s);
}
