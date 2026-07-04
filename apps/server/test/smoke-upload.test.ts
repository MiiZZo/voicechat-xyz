// Integration smoke: spin up Fastify, upload a file, download it back.
// Run with: npx tsx --test test/smoke-upload.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AccessToken } from 'livekit-server-sdk';
import type { Config } from '../src/config.js';
import { FileStore } from '../src/files/file-store.js';
import { registerFileRoutes } from '../src/files/routes.js';

const KEY = 'devkey';
const SECRET = 'devsecret-must-be-32-chars-long-12345';

async function buildApp() {
  const root = await mkdtemp(join(tmpdir(), 'vc-smoke-'));
  const config = {
    PORT: 0,
    LIVEKIT_URL: 'http://localhost:7880',
    LIVEKIT_API_KEY: KEY,
    LIVEKIT_API_SECRET: SECRET,
    ROOMS_FILE: '',
    LOG_LEVEL: 'silent',
    UPLOAD_DIR: root,
    UPLOAD_TTL_HOURS: 24,
  } as Config;
  const store = new FileStore(root);
  const app = Fastify({ logger: false, bodyLimit: 60 * 1024 * 1024 });
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024, files: 1 } });
  registerFileRoutes(app, { config, store });
  await app.ready();
  return { app, root, config };
}

async function makeToken(roomId: string): Promise<string> {
  const tok = new AccessToken(KEY, SECRET, { identity: 'tester#1234', ttl: 60 });
  tok.addGrant({ roomJoin: true, room: roomId, canPublishData: true });
  return tok.toJwt();
}

function multipartBody(filename: string, mime: string, content: Buffer): { body: Buffer; headers: Record<string, string> } {
  const boundary = '----testboundary' + Math.random().toString(16).slice(2);
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([head, content, tail]);
  return {
    body,
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
      'content-length': String(body.length),
    },
  };
}

test('full upload + signed download cycle', async () => {
  const { app, root } = await buildApp();
  try {
    const token = await makeToken('lounge');
    const content = Buffer.from('hello world!');
    const { body, headers } = multipartBody('greet.txt', 'text/plain', content);

    const upload = await app.inject({
      method: 'POST',
      url: '/api/uploads/lounge',
      headers: { authorization: `Bearer ${token}`, ...headers },
      payload: body,
    });
    assert.equal(upload.statusCode, 200, upload.body);
    const meta = upload.json() as { id: string; url: string; name: string; size: number };
    assert.equal(meta.size, content.length);
    assert.equal(meta.name, 'greet.txt');
    assert.match(meta.url, /\/api\/files\/lounge\/[a-f0-9]+\?t=/);

    // Extract path+query from absolute URL
    const u = new URL(meta.url);
    const dl = await app.inject({ method: 'GET', url: u.pathname + u.search });
    assert.equal(dl.statusCode, 200);
    assert.equal(dl.headers['content-type'], 'text/plain');
    assert.match(String(dl.headers['content-disposition']), /^attachment;/);
    assert.equal(dl.body, 'hello world!');
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('serves byte range as 206 partial content (enables audio/video seeking)', async () => {
  const { app, root } = await buildApp();
  try {
    const token = await makeToken('lounge');
    const content = Buffer.from('0123456789abcdef'); // 16 bytes
    const { body, headers } = multipartBody('clip.mp3', 'audio/mpeg', content);
    const upload = await app.inject({
      method: 'POST',
      url: '/api/uploads/lounge',
      headers: { authorization: `Bearer ${token}`, ...headers },
      payload: body,
    });
    assert.equal(upload.statusCode, 200, upload.body);
    const u = new URL((upload.json() as { url: string }).url);

    // Full response advertises range support.
    const full = await app.inject({ method: 'GET', url: u.pathname + u.search });
    assert.equal(full.statusCode, 200);
    assert.equal(full.headers['accept-ranges'], 'bytes');
    assert.equal(full.headers['content-length'], '16');

    // Ranged request returns just the requested slice as 206.
    const part = await app.inject({
      method: 'GET',
      url: u.pathname + u.search,
      headers: { range: 'bytes=4-9' },
    });
    assert.equal(part.statusCode, 206);
    assert.equal(part.headers['content-range'], 'bytes 4-9/16');
    assert.equal(part.headers['content-length'], '6');
    assert.equal(part.body, '456789');

    // Open-ended range to end of file.
    const tail = await app.inject({
      method: 'GET',
      url: u.pathname + u.search,
      headers: { range: 'bytes=10-' },
    });
    assert.equal(tail.statusCode, 206);
    assert.equal(tail.headers['content-range'], 'bytes 10-15/16');
    assert.equal(tail.body, 'abcdef');
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('unsatisfiable range returns 416', async () => {
  const { app, root } = await buildApp();
  try {
    const token = await makeToken('lounge');
    const content = Buffer.from('short'); // 5 bytes
    const { body, headers } = multipartBody('clip.mp3', 'audio/mpeg', content);
    const upload = await app.inject({
      method: 'POST',
      url: '/api/uploads/lounge',
      headers: { authorization: `Bearer ${token}`, ...headers },
      payload: body,
    });
    const u = new URL((upload.json() as { url: string }).url);
    const res = await app.inject({
      method: 'GET',
      url: u.pathname + u.search,
      headers: { range: 'bytes=100-200' },
    });
    assert.equal(res.statusCode, 416);
    assert.equal(res.headers['content-range'], 'bytes */5');
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects upload without auth', async () => {
  const { app, root } = await buildApp();
  try {
    const { body, headers } = multipartBody('a.txt', 'text/plain', Buffer.from('x'));
    const res = await app.inject({
      method: 'POST',
      url: '/api/uploads/lounge',
      headers,
      payload: body,
    });
    assert.equal(res.statusCode, 401);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects upload to wrong room', async () => {
  const { app, root } = await buildApp();
  try {
    const token = await makeToken('lounge');
    const { body, headers } = multipartBody('a.txt', 'text/plain', Buffer.from('x'));
    const res = await app.inject({
      method: 'POST',
      url: '/api/uploads/other',
      headers: { authorization: `Bearer ${token}`, ...headers },
      payload: body,
    });
    assert.equal(res.statusCode, 403);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects download without signed token', async () => {
  const { app, root } = await buildApp();
  try {
    const res = await app.inject({ method: 'GET', url: '/api/files/lounge/abc123' });
    assert.equal(res.statusCode, 401);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('image upload sets inline disposition', async () => {
  const { app, root } = await buildApp();
  try {
    const token = await makeToken('lounge');
    // Tiny 1-byte fake — disposition logic only cares about mime
    const { body, headers } = multipartBody('pic.png', 'image/png', Buffer.from([0x00]));
    const upload = await app.inject({
      method: 'POST',
      url: '/api/uploads/lounge',
      headers: { authorization: `Bearer ${token}`, ...headers },
      payload: body,
    });
    assert.equal(upload.statusCode, 200);
    const meta = upload.json() as { url: string };
    const u = new URL(meta.url);
    const dl = await app.inject({ method: 'GET', url: u.pathname + u.search });
    assert.match(String(dl.headers['content-disposition']), /^inline;/);
    assert.equal(dl.headers['content-type'], 'image/png');
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('exe upload sets attachment disposition (no inline execution)', async () => {
  const { app, root } = await buildApp();
  try {
    const token = await makeToken('lounge');
    const { body, headers } = multipartBody(
      'evil.exe',
      'application/x-msdownload',
      Buffer.from([0x4d, 0x5a]),
    );
    const upload = await app.inject({
      method: 'POST',
      url: '/api/uploads/lounge',
      headers: { authorization: `Bearer ${token}`, ...headers },
      payload: body,
    });
    assert.equal(upload.statusCode, 200);
    const meta = upload.json() as { url: string };
    const u = new URL(meta.url);
    const dl = await app.inject({ method: 'GET', url: u.pathname + u.search });
    assert.match(String(dl.headers['content-disposition']), /^attachment;/);
    assert.match(String(dl.headers['content-disposition']), /filename="evil\.exe"/);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('sanitizes path-traversal filename on upload', async () => {
  const { app, root } = await buildApp();
  try {
    const token = await makeToken('lounge');
    const { body, headers } = multipartBody('../../etc/passwd', 'text/plain', Buffer.from('pwn'));
    const upload = await app.inject({
      method: 'POST',
      url: '/api/uploads/lounge',
      headers: { authorization: `Bearer ${token}`, ...headers },
      payload: body,
    });
    assert.equal(upload.statusCode, 200);
    const meta = upload.json() as { name: string };
    // No slashes, no leading dots
    assert.ok(!meta.name.includes('/'));
    assert.ok(!meta.name.includes('\\'));
    assert.ok(!meta.name.startsWith('.'));
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('cleanupExpired removes old files', async () => {
  const { app, root } = await buildApp();
  try {
    const token = await makeToken('lounge');
    const { body, headers } = multipartBody('a.txt', 'text/plain', Buffer.from('x'));
    const up = await app.inject({
      method: 'POST',
      url: '/api/uploads/lounge',
      headers: { authorization: `Bearer ${token}`, ...headers },
      payload: body,
    });
    const meta = up.json() as { id: string };

    const store = new FileStore(root);
    // ttl = -1 → everything expired
    const r = await store.cleanupExpired(-1);
    assert.equal(r.removed, 1);
    const after = await store.readMeta('lounge', meta.id);
    assert.equal(after, null);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
