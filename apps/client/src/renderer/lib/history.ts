import { LOBBY_URL } from './env.js';

/** One persisted chat message. Must match the server's HistoryRecord shape
 *  (apps/server/src/history/history-store.ts). */
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

/** Load a room's chat history (newest ~200 within the retention window). */
export async function fetchHistory(roomId: string, token: string): Promise<HistoryRecord[]> {
  const res = await fetch(`${LOBBY_URL}/api/history/${encodeURIComponent(roomId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`history fetch failed (${res.status})`);
  return (await res.json()) as HistoryRecord[];
}

/** Persist one message to the room history. Fire-and-forget: a failure here
 *  must not affect live p2p delivery, so callers ignore rejections. */
export async function postHistory(
  roomId: string,
  token: string,
  record: HistoryRecord,
): Promise<void> {
  const res = await fetch(`${LOBBY_URL}/api/history/${encodeURIComponent(roomId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(record),
  });
  if (!res.ok) throw new Error(`history post failed (${res.status})`);
}
