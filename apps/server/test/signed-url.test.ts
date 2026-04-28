import test from 'node:test';
import assert from 'node:assert/strict';
import { signFileToken, verifyFileToken } from '../src/files/signed-url.js';

const SECRET = 'test-secret-key-do-not-use-in-prod';

test('round-trip: signed token verifies for matching room+file', () => {
  const token = signFileToken(SECRET, 'lounge', 'abc123', 60_000);
  const result = verifyFileToken(SECRET, 'lounge', 'abc123', token);
  assert.equal(result.ok, true);
});

test('rejects token with wrong roomId', () => {
  const token = signFileToken(SECRET, 'lounge', 'abc123', 60_000);
  const result = verifyFileToken(SECRET, 'other', 'abc123', token);
  assert.equal(result.ok, false);
});

test('rejects token with wrong fileId', () => {
  const token = signFileToken(SECRET, 'lounge', 'abc123', 60_000);
  const result = verifyFileToken(SECRET, 'lounge', 'xyz', token);
  assert.equal(result.ok, false);
});

test('rejects expired token', () => {
  // ttl = -1 → token already expired
  const token = signFileToken(SECRET, 'lounge', 'abc123', -1);
  const result = verifyFileToken(SECRET, 'lounge', 'abc123', token);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'expired');
});

test('rejects token signed with different secret', () => {
  const token = signFileToken(SECRET, 'lounge', 'abc123', 60_000);
  const result = verifyFileToken('other-secret', 'lounge', 'abc123', token);
  assert.equal(result.ok, false);
});

test('rejects malformed token', () => {
  assert.equal(verifyFileToken(SECRET, 'lounge', 'abc', 'garbage').ok, false);
  assert.equal(verifyFileToken(SECRET, 'lounge', 'abc', '').ok, false);
  assert.equal(verifyFileToken(SECRET, 'lounge', 'abc', 'a.b').ok, false);
});

test('token is URL-safe (no slashes, plus, equals)', () => {
  const token = signFileToken(SECRET, 'lounge', 'abc123', 60_000);
  assert.ok(!/[/+=]/.test(token), `token should be url-safe: ${token}`);
});
