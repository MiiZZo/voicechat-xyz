import test from 'node:test';
import assert from 'node:assert/strict';
import { AccessToken } from 'livekit-server-sdk';
import { verifyLiveKitToken } from '../src/files/verify-livekit-token.js';

const KEY = 'devkey';
const SECRET = 'devsecret-must-be-32-chars-long-12345';

async function makeToken(roomId: string, identity: string, name = 'tester'): Promise<string> {
  const tok = new AccessToken(KEY, SECRET, { identity, name, ttl: 60 });
  tok.addGrant({
    roomJoin: true,
    room: roomId,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });
  return tok.toJwt();
}

test('verifies a valid token and returns roomId+identity', async () => {
  const jwt = await makeToken('lounge', 'alice#abcd');
  const res = await verifyLiveKitToken(jwt, KEY, SECRET);
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.roomId, 'lounge');
    assert.equal(res.identity, 'alice#abcd');
  }
});

test('rejects a token signed with a different secret', async () => {
  const jwt = await makeToken('lounge', 'alice#abcd');
  const res = await verifyLiveKitToken(jwt, KEY, 'wrong-secret-must-be-32-chars-long-1');
  assert.equal(res.ok, false);
});

test('rejects garbage', async () => {
  assert.equal((await verifyLiveKitToken('not-a-jwt', KEY, SECRET)).ok, false);
  assert.equal((await verifyLiveKitToken('', KEY, SECRET)).ok, false);
});

test('rejects token whose roomJoin grant is missing', async () => {
  const tok = new AccessToken(KEY, SECRET, { identity: 'bob', ttl: 60 });
  // No addGrant call — no room
  const jwt = await tok.toJwt();
  const res = await verifyLiveKitToken(jwt, KEY, SECRET);
  assert.equal(res.ok, false);
});
