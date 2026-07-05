import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mimeToCategory,
  filterMessages,
  isSearchActive,
  splitHighlight,
  type SearchFilters,
} from './chat-search.js';
import type { ChatMessage } from '../state/store.js';

describe('mimeToCategory', () => {
  it('maps image/* to image', () => {
    assert.equal(mimeToCategory('image/png', 'a.png'), 'image');
  });
  it('maps audio/* to audio', () => {
    assert.equal(mimeToCategory('audio/webm', 'voice.webm'), 'audio');
  });
  it('maps video/* to video', () => {
    assert.equal(mimeToCategory('video/mp4', 'clip.mp4'), 'video');
  });
  it('maps pdf and office mimes to document', () => {
    assert.equal(mimeToCategory('application/pdf', 'a.pdf'), 'document');
    assert.equal(
      mimeToCategory(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'a.docx',
      ),
      'document',
    );
  });
  it('falls back to extension for generic octet-stream', () => {
    assert.equal(mimeToCategory('application/octet-stream', 'report.pdf'), 'document');
    assert.equal(mimeToCategory('application/octet-stream', 'notes.txt'), 'document');
  });
  it('maps unknown binaries to other', () => {
    assert.equal(mimeToCategory('application/zip', 'a.zip'), 'other');
    assert.equal(mimeToCategory('application/octet-stream', 'game.exe'), 'other');
  });
});

const txt = (id: string, from: string, text: string): ChatMessage => ({
  kind: 'text',
  id,
  fromIdentity: from,
  fromName: from,
  timestamp: Number(id),
  text,
});
const file = (id: string, from: string, name: string, mime: string): ChatMessage => ({
  kind: 'file',
  id,
  fromIdentity: from,
  fromName: from,
  timestamp: Number(id),
  fileId: id,
  url: `http://x/${id}`,
  name,
  size: 1,
  mime,
  status: 'done',
});

const CHAT: ChatMessage[] = [
  txt('1', 'anya', 'привет Боб'),
  txt('2', 'bob', 'смотри картинку'),
  file('3', 'anya', 'photo.png', 'image/png'),
  file('4', 'bob', 'report.pdf', 'application/pdf'),
  file('5', 'anya', 'voice.webm', 'audio/webm'),
];

const base: SearchFilters = {
  query: '',
  author: null,
  contentType: 'all',
  fileCategory: 'all',
};

describe('isSearchActive', () => {
  it('is false for all-default filters', () => {
    assert.equal(isSearchActive(base), false);
  });
  it('is true when any dimension is set', () => {
    assert.equal(isSearchActive({ ...base, query: 'x' }), true);
    assert.equal(isSearchActive({ ...base, author: 'bob' }), true);
    assert.equal(isSearchActive({ ...base, contentType: 'file' }), true);
    assert.equal(isSearchActive({ ...base, fileCategory: 'image' }), true);
  });
  it('treats a whitespace-only query as inactive', () => {
    assert.equal(isSearchActive({ ...base, query: '   ' }), false);
  });
});

describe('filterMessages', () => {
  it('returns all when inactive', () => {
    assert.equal(filterMessages(CHAT, base).length, CHAT.length);
  });
  it('query matches text case-insensitively', () => {
    const r = filterMessages(CHAT, { ...base, query: 'БОБ' });
    assert.deepEqual(
      r.map((m) => m.id),
      ['1'],
    );
  });
  it('query also matches file names', () => {
    const r = filterMessages(CHAT, { ...base, query: 'report' });
    assert.deepEqual(
      r.map((m) => m.id),
      ['4'],
    );
  });
  it('author filters by fromIdentity', () => {
    const r = filterMessages(CHAT, { ...base, author: 'anya' });
    assert.deepEqual(
      r.map((m) => m.id),
      ['1', '3', '5'],
    );
  });
  it('contentType text keeps only text', () => {
    const r = filterMessages(CHAT, { ...base, contentType: 'text' });
    assert.deepEqual(
      r.map((m) => m.id),
      ['1', '2'],
    );
  });
  it('contentType file keeps only files', () => {
    const r = filterMessages(CHAT, { ...base, contentType: 'file' });
    assert.deepEqual(
      r.map((m) => m.id),
      ['3', '4', '5'],
    );
  });
  it('fileCategory image keeps only images (and excludes text)', () => {
    const r = filterMessages(CHAT, { ...base, fileCategory: 'image' });
    assert.deepEqual(
      r.map((m) => m.id),
      ['3'],
    );
  });
  it('fileCategory is ignored when contentType is text', () => {
    const r = filterMessages(CHAT, { ...base, contentType: 'text', fileCategory: 'image' });
    assert.deepEqual(
      r.map((m) => m.id),
      ['1', '2'],
    );
  });
  it('combines dimensions with AND', () => {
    const r = filterMessages(CHAT, {
      ...base,
      author: 'anya',
      contentType: 'file',
      fileCategory: 'audio',
    });
    assert.deepEqual(
      r.map((m) => m.id),
      ['5'],
    );
  });
});

describe('splitHighlight', () => {
  it('returns one non-match segment when term is empty', () => {
    assert.deepEqual(splitHighlight('hello', ''), [{ text: 'hello', match: false }]);
  });
  it('splits case-insensitively, preserving original casing', () => {
    assert.deepEqual(splitHighlight('Hello WORLD hello', 'hello'), [
      { text: 'Hello', match: true },
      { text: ' WORLD ', match: false },
      { text: 'hello', match: true },
    ]);
  });
  it('handles no match', () => {
    assert.deepEqual(splitHighlight('abc', 'z'), [{ text: 'abc', match: false }]);
  });
  it('handles a term with regex-special characters literally', () => {
    assert.deepEqual(splitHighlight('a.b', '.'), [
      { text: 'a', match: false },
      { text: '.', match: true },
      { text: 'b', match: false },
    ]);
  });
});
