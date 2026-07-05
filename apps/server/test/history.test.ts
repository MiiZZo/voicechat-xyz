// Integration: chat history store + routes.
// Run with: npx tsx --test test/history.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AccessToken } from 'livekit-server-sdk';
import type { Config } from '../src/config.js';
import { HistoryStore, type HistoryRecord } from '../src/history/history-store.js';
import { registerHistoryRoutes } from '../src/history/routes.js';
import { verifyFileToken } from '../src/files/signed-url.js';

const KEY = 'devkey';
const SECRET = 'devsecret-must-be-32-chars-long-12345';

async function buildApp() {
  const root = await mkdtemp(join(tmpdir(), 'vc-hist-'));
  const config = {
    PORT: 0,
    LIVEKIT_URL: 'http://localhost:7880',
    LIVEKIT_API_KEY: KEY,
    LIVEKIT_API_SECRET: SECRET,
    ROOMS_FILE: '',
    LOG_LEVEL: 'silent',
    UPLOAD_DIR: root,
    UPLOAD_TTL_HOURS: 168,
    HISTORY_DIR: root,
    HISTORY_TTL_DAYS: 7,
  } as Config;
  const store = new HistoryStore(root);
  const app = Fastify({ logger: false });
  registerHistoryRoutes(app, { config, store });
  await app.ready();
  return { app, root, store };
}

async function makeToken(roomId: string): Promise<string> {
  const tok = new AccessToken(KEY, SECRET, { identity: 'tester#1234', ttl: 60 });
  tok.addGrant({ roomJoin: true, room: roomId, canPublishData: true });
  return tok.toJwt();
}

function textRecord(over: Partial<HistoryRecord> = {}): HistoryRecord {
  return {
    id: 'm-' + Math.random().toString(16).slice(2),
    kind: 'text',
    fromIdentity: 'tester#1234',
    fromName: 'tester',
    timestamp: Date.now(),
    text: 'hello',
    ...over,
  };
}

test('store: append then read returns chronological records', async () => {
  const { app, root, store } = await buildApp();
  try {
    await store.append('lounge', textRecord({ text: 'first', timestamp: 1000 }));
    await store.append('lounge', textRecord({ text: 'second', timestamp: 2000 }));
    const out = await store.read('lounge', { ttlMs: Number.MAX_SAFE_INTEGER, limit: 200 });
    assert.equal(out.length, 2);
    assert.equal(out[0]?.text, 'first');
    assert.equal(out[1]?.text, 'second');
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('store: read drops records older than ttl', async () => {
  const { app, root, store } = await buildApp();
  try {
    const old = Date.now() - 10 * 24 * 60 * 60 * 1000; // 10 days ago
    await store.append('lounge', textRecord({ text: 'stale', timestamp: old }));
    await store.append('lounge', textRecord({ text: 'fresh', timestamp: Date.now() }));
    const ttlMs = 7 * 24 * 60 * 60 * 1000;
    const out = await store.read('lounge', { ttlMs, limit: 200 });
    assert.equal(out.length, 1);
    assert.equal(out[0]?.text, 'fresh');
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('store: cleanupExpired rewrites file without stale records', async () => {
  const { app, root, store } = await buildApp();
  try {
    const old = Date.now() - 10 * 24 * 60 * 60 * 1000;
    await store.append('lounge', textRecord({ text: 'stale', timestamp: old }));
    await store.append('lounge', textRecord({ text: 'fresh', timestamp: Date.now() }));
    const r = await store.cleanupExpired(7 * 24 * 60 * 60 * 1000);
    assert.equal(r.removed, 1);
    const out = await store.read('lounge', { ttlMs: Number.MAX_SAFE_INTEGER, limit: 200 });
    assert.equal(out.length, 1);
    assert.equal(out[0]?.text, 'fresh');
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

function fileRecord(over: Partial<HistoryRecord> = {}): HistoryRecord {
  return {
    id: 'm-' + Math.random().toString(16).slice(2),
    kind: 'file',
    fromIdentity: 'tester#1234',
    fromName: 'tester',
    timestamp: Date.now(),
    fileId: 'f-abc123',
    // A stale/expired signed URL, as stored in history at upload time.
    url: 'http://old-host/api/files/lounge/f-abc123?t=1.deadbeef',
    name: 'photo.png',
    size: 42,
    mime: 'image/png',
    ...over,
  };
}

test('route: GET re-signs file URLs with a fresh valid token', async () => {
  const { app, root } = await buildApp();
  try {
    const token = await makeToken('lounge');
    const post = await app.inject({
      method: 'POST',
      url: '/api/history/lounge',
      headers: { authorization: `Bearer ${token}` },
      payload: fileRecord(),
    });
    assert.equal(post.statusCode, 200, post.body);

    const get = await app.inject({
      method: 'GET',
      url: '/api/history/lounge',
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(get.statusCode, 200);
    const list = get.json() as HistoryRecord[];
    assert.equal(list.length, 1);
    const rec = list[0];
    assert.equal(rec?.kind, 'file');

    // The returned URL must carry a freshly-signed, currently-valid token
    // for the record's fileId — not the 1h-expired one persisted at upload.
    const u = new URL(rec!.url!);
    assert.match(u.pathname, /\/api\/files\/lounge\/f-abc123$/);
    const t = u.searchParams.get('t');
    assert.ok(t, 'expected a token query param');
    const v = verifyFileToken(SECRET, 'lounge', 'f-abc123', t!);
    assert.equal(v.ok, true);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('route: POST persists and GET returns it', async () => {
  const { app, root } = await buildApp();
  try {
    const token = await makeToken('lounge');
    const rec = textRecord({ text: 'persisted', timestamp: Date.now() });
    const post = await app.inject({
      method: 'POST',
      url: '/api/history/lounge',
      headers: { authorization: `Bearer ${token}` },
      payload: rec,
    });
    assert.equal(post.statusCode, 200, post.body);

    const get = await app.inject({
      method: 'GET',
      url: '/api/history/lounge',
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(get.statusCode, 200);
    const list = get.json() as HistoryRecord[];
    assert.equal(list.length, 1);
    assert.equal(list[0]?.text, 'persisted');
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('route: POST rejects without auth', async () => {
  const { app, root } = await buildApp();
  try {
    const res = await app.inject({
      method: 'POST',
      url: '/api/history/lounge',
      payload: textRecord(),
    });
    assert.equal(res.statusCode, 401);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('route: POST rejects room mismatch', async () => {
  const { app, root } = await buildApp();
  try {
    const token = await makeToken('lounge');
    const res = await app.inject({
      method: 'POST',
      url: '/api/history/other',
      headers: { authorization: `Bearer ${token}` },
      payload: textRecord(),
    });
    assert.equal(res.statusCode, 403);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('route: POST rejects invalid body (400)', async () => {
  const { app, root } = await buildApp();
  try {
    const token = await makeToken('lounge');
    const res = await app.inject({
      method: 'POST',
      url: '/api/history/lounge',
      headers: { authorization: `Bearer ${token}` },
      payload: { kind: 'text', id: 'x' }, // missing required fields
    });
    assert.equal(res.statusCode, 400);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('route: GET rejects without auth (401)', async () => {
  const { app, root } = await buildApp();
  try {
    const res = await app.inject({ method: 'GET', url: '/api/history/lounge' });
    assert.equal(res.statusCode, 401);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
