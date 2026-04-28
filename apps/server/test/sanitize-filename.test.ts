import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeFilename, splitExt } from '../src/files/sanitize-filename.js';

test('strips path separators', () => {
  assert.equal(sanitizeFilename('../../etc/passwd'), 'etcpasswd');
  assert.equal(sanitizeFilename('a\\b/c.txt'), 'abc.txt');
});

test('strips control characters and NUL', () => {
  assert.equal(sanitizeFilename('hello\x00\x01world.txt'), 'helloworld.txt');
  assert.equal(sanitizeFilename('a\x7fb.txt'), 'ab.txt');
});

test('strips leading dots', () => {
  assert.equal(sanitizeFilename('...htaccess'), 'htaccess');
  assert.equal(sanitizeFilename('.env'), 'env');
});

test('collapses whitespace', () => {
  assert.equal(sanitizeFilename('  my   file  .txt  '), 'my file .txt');
});

test('returns "file" for empty/all-stripped names', () => {
  assert.equal(sanitizeFilename(''), 'file');
  assert.equal(sanitizeFilename('////'), 'file');
  assert.equal(sanitizeFilename('   '), 'file');
});

test('truncates to 200 chars while preserving extension', () => {
  const longBase = 'a'.repeat(300);
  const result = sanitizeFilename(`${longBase}.pdf`);
  assert.equal(result.length, 200);
  assert.ok(result.endsWith('.pdf'));
});

test('truncates extension-less name to 200 chars', () => {
  const result = sanitizeFilename('a'.repeat(300));
  assert.equal(result.length, 200);
});

test('preserves Unicode letters', () => {
  assert.equal(sanitizeFilename('файл.txt'), 'файл.txt');
  assert.equal(sanitizeFilename('日本語.png'), '日本語.png');
});

test('strips bidi override characters', () => {
  // Right-to-left override is a classic filename spoofing trick
  assert.equal(sanitizeFilename('safe‮gnp.exe'), 'safegnp.exe');
});

test('splitExt extracts last extension', () => {
  assert.deepEqual(splitExt('archive.tar.gz'), { base: 'archive.tar', ext: '.gz' });
  assert.deepEqual(splitExt('file.pdf'), { base: 'file', ext: '.pdf' });
  assert.deepEqual(splitExt('noext'), { base: 'noext', ext: '' });
  assert.deepEqual(splitExt('.hidden'), { base: '.hidden', ext: '' });
  assert.deepEqual(splitExt('a.b.c.d'), { base: 'a.b.c', ext: '.d' });
});

test('splitExt rejects extensions with non-alphanumerics or too long', () => {
  // ".tar gz" shouldn't be treated as extension — has space
  assert.deepEqual(splitExt('foo.tar gz'), { base: 'foo.tar gz', ext: '' });
  // 20-char "extension" is implausible — treat as part of base
  assert.deepEqual(splitExt('foo.abcdefghijklmnopqrst'), {
    base: 'foo.abcdefghijklmnopqrst',
    ext: '',
  });
});
