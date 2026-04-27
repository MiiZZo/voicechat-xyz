import { LOBBY_URL } from './env.js';

export type RoomSummary = {
  id: string;
  displayName: string;
  maxParticipants: number;
  participants: { identity: string; name: string }[];
};

export type JoinResponse = { token: string; livekitUrl: string; identity: string };

export type JoinError =
  | { kind: 'invalid_name' }
  | { kind: 'not_found' }
  | { kind: 'full' }
  | { kind: 'duplicate_name' }
  | { kind: 'network' }
  | { kind: 'server' };

export async function fetchRooms(): Promise<RoomSummary[]> {
  const res = await fetch(`${LOBBY_URL}/api/rooms`);
  if (!res.ok) throw new Error(`rooms fetch failed: ${res.status}`);
  return res.json();
}

export async function postJoin(
  roomId: string,
  displayName: string,
): Promise<JoinResponse | JoinError> {
  let res: Response;
  try {
    res = await fetch(`${LOBBY_URL}/api/join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ roomId, displayName }),
    });
  } catch {
    return { kind: 'network' };
  }
  if (res.ok) return (await res.json()) as JoinResponse;
  if (res.status === 400) return { kind: 'invalid_name' };
  if (res.status === 404) return { kind: 'not_found' };
  if (res.status === 409) {
    const body = (await res.json().catch(() => ({}))) as { reason?: string };
    if (body.reason === 'full') return { kind: 'full' };
    if (body.reason === 'duplicate_name') return { kind: 'duplicate_name' };
  }
  return { kind: 'server' };
}
