# Chat Search with Filters — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add in-panel chat search with filters by free-text query, author, content type (text/file), and broad file category, running entirely client-side over the loaded `chat` array.

**Architecture:** A pure, unit-tested module `lib/chat-search.ts` (`mimeToCategory`, `filterMessages`, `splitHighlight`) holds all logic. `ChatPanel.tsx` gains ephemeral local search state, a toggle button in the header, a filter panel, and wires filtering + match highlighting into the existing `MessageRow` list. No server, wire-protocol, history, `Prefs`, or Tauri-Rust changes.

**Tech Stack:** React + TypeScript renderer (shared by Electron & Tauri clients), Zustand store, Radix `Select` primitive (`components/ui/select.tsx`), lucide icons, Tailwind (Velvet Onyx theme). Tests: `node:test` via `tsx --test` (mirrors `apps/server`).

**Spec:** `docs/superpowers/specs/2026-07-05-chat-search-filters-design.md`

---

## File Structure

- **Create** `apps/client/src/renderer/lib/chat-search.ts` — pure logic: `FileCategory` type, `mimeToCategory(mime, name)`, `filterMessages(chat, filters)`, `splitHighlight(text, term)`, `isSearchActive(filters)`. Type-only import of `ChatMessage` (erased at runtime → no zustand load in tests).
- **Create** `apps/client/src/renderer/lib/chat-search.test.ts` — `node:test` unit tests for the above.
- **Modify** `apps/client/src/renderer/components/ChatPanel.tsx` — search state, header toggle, filter panel UI, filtered list + highlight, empty state, guarded auto-scroll.
- **Modify** `apps/client/package.json` — add `"test": "tsx --test src/renderer/lib/*.test.ts"` script and `tsx` devDependency.

---

## Chunk 1: Pure search logic + tests

### Task 1: `FileCategory` + `mimeToCategory`

**Files:**
- Create: `apps/client/src/renderer/lib/chat-search.ts`
- Test: `apps/client/src/renderer/lib/chat-search.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/client/src/renderer/lib/chat-search.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mimeToCategory } from './chat-search.js';

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
      mimeToCategory('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'a.docx'),
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/client && npx tsx --test src/renderer/lib/chat-search.test.ts`
Expected: FAIL — cannot find module `./chat-search.js` / `mimeToCategory` is not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/client/src/renderer/lib/chat-search.ts
import type { ChatMessage } from '../state/store.js';

export type FileCategory = 'all' | 'image' | 'audio' | 'video' | 'document' | 'other';

const DOC_MIME_RE = /^(application\/pdf|application\/msword|application\/vnd\.(openxmlformats-officedocument|ms-excel|ms-powerpoint)|text\/)/;
const DOC_EXTS = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'csv', 'rtf', 'odt',
]);

function extOf(name: string): string {
  const m = /\.([^./\\]+)$/.exec(name);
  return m?.[1]?.toLowerCase() ?? '';
}

/** Broad attachment category from mime, falling back to the file-name
 *  extension when the mime is generic (application/octet-stream). */
export function mimeToCategory(mime: string, name: string): Exclude<FileCategory, 'all'> {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  if (DOC_MIME_RE.test(mime)) return 'document';
  if ((mime === 'application/octet-stream' || mime === '') && DOC_EXTS.has(extOf(name))) {
    return 'document';
  }
  return 'other';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/client && npx tsx --test src/renderer/lib/chat-search.test.ts`
Expected: PASS (all `mimeToCategory` tests).

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/renderer/lib/chat-search.ts apps/client/src/renderer/lib/chat-search.test.ts
git commit -m "feat(chat-search): mimeToCategory with mime + extension fallback"
```

### Task 2: `filterMessages` + `isSearchActive`

**Files:**
- Modify: `apps/client/src/renderer/lib/chat-search.ts`
- Test: `apps/client/src/renderer/lib/chat-search.test.ts`

- [ ] **Step 1: Write the failing test**

Append to the test file. Use a small fixture builder to keep cases readable.

```ts
import { filterMessages, isSearchActive, type SearchFilters } from './chat-search.js';
import type { ChatMessage } from '../state/store.js';

const txt = (id: string, from: string, text: string): ChatMessage => ({
  kind: 'text', id, fromIdentity: from, fromName: from, timestamp: Number(id), text,
});
const file = (id: string, from: string, name: string, mime: string): ChatMessage => ({
  kind: 'file', id, fromIdentity: from, fromName: from, timestamp: Number(id),
  fileId: id, url: `http://x/${id}`, name, size: 1, mime, status: 'done',
});

const CHAT: ChatMessage[] = [
  txt('1', 'anya', 'привет Боб'),
  txt('2', 'bob', 'смотри картинку'),
  file('3', 'anya', 'photo.png', 'image/png'),
  file('4', 'bob', 'report.pdf', 'application/pdf'),
  file('5', 'anya', 'voice.webm', 'audio/webm'),
];

const base: SearchFilters = { query: '', author: null, contentType: 'all', fileCategory: 'all' };

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
    assert.deepEqual(r.map((m) => m.id), ['1']);
  });
  it('query also matches file names', () => {
    const r = filterMessages(CHAT, { ...base, query: 'report' });
    assert.deepEqual(r.map((m) => m.id), ['4']);
  });
  it('author filters by fromIdentity', () => {
    const r = filterMessages(CHAT, { ...base, author: 'anya' });
    assert.deepEqual(r.map((m) => m.id), ['1', '3', '5']);
  });
  it('contentType text keeps only text', () => {
    const r = filterMessages(CHAT, { ...base, contentType: 'text' });
    assert.deepEqual(r.map((m) => m.id), ['1', '2']);
  });
  it('contentType file keeps only files', () => {
    const r = filterMessages(CHAT, { ...base, contentType: 'file' });
    assert.deepEqual(r.map((m) => m.id), ['3', '4', '5']);
  });
  it('fileCategory image keeps only images (and excludes text)', () => {
    const r = filterMessages(CHAT, { ...base, fileCategory: 'image' });
    assert.deepEqual(r.map((m) => m.id), ['3']);
  });
  it('fileCategory is ignored when contentType is text', () => {
    const r = filterMessages(CHAT, { ...base, contentType: 'text', fileCategory: 'image' });
    assert.deepEqual(r.map((m) => m.id), ['1', '2']);
  });
  it('combines dimensions with AND', () => {
    const r = filterMessages(CHAT, { ...base, author: 'anya', contentType: 'file', fileCategory: 'audio' });
    assert.deepEqual(r.map((m) => m.id), ['5']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/client && npx tsx --test src/renderer/lib/chat-search.test.ts`
Expected: FAIL — `filterMessages` / `isSearchActive` / `SearchFilters` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `chat-search.ts`:

```ts
export type ContentType = 'all' | 'text' | 'file';

export type SearchFilters = {
  query: string;
  /** fromIdentity of the selected author, or null for all authors. */
  author: string | null;
  contentType: ContentType;
  fileCategory: FileCategory;
};

export function isSearchActive(f: SearchFilters): boolean {
  return (
    f.query.trim() !== '' ||
    f.author !== null ||
    f.contentType !== 'all' ||
    f.fileCategory !== 'all'
  );
}

/** Searchable haystack for a message: text body or file name. */
function haystack(m: ChatMessage): string {
  return m.kind === 'text' ? m.text : m.name;
}

export function filterMessages(chat: ChatMessage[], f: SearchFilters): ChatMessage[] {
  if (!isSearchActive(f)) return chat;
  const q = f.query.trim().toLowerCase();
  // fileCategory only applies to files, and is meaningless once contentType
  // is restricted to text — treat it as 'all' in that case.
  const effectiveCategory = f.contentType === 'text' ? 'all' : f.fileCategory;
  return chat.filter((m) => {
    if (q && !haystack(m).toLowerCase().includes(q)) return false;
    if (f.author !== null && m.fromIdentity !== f.author) return false;
    if (f.contentType !== 'all' && m.kind !== f.contentType) return false;
    if (effectiveCategory !== 'all') {
      if (m.kind !== 'file') return false;
      if (mimeToCategory(m.mime, m.name) !== effectiveCategory) return false;
    }
    return true;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/client && npx tsx --test src/renderer/lib/chat-search.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/renderer/lib/chat-search.ts apps/client/src/renderer/lib/chat-search.test.ts
git commit -m "feat(chat-search): filterMessages + isSearchActive (AND semantics)"
```

### Task 3: `splitHighlight`

**Files:**
- Modify: `apps/client/src/renderer/lib/chat-search.ts`
- Test: `apps/client/src/renderer/lib/chat-search.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { splitHighlight } from './chat-search.js';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/client && npx tsx --test src/renderer/lib/chat-search.test.ts`
Expected: FAIL — `splitHighlight` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `chat-search.ts`:

```ts
export type HighlightSegment = { text: string; match: boolean };

/** Split `text` into consecutive segments, marking case-insensitive
 *  occurrences of `term`. Pure string logic (no regex specials pitfalls);
 *  an empty/whitespace term yields a single non-match segment. */
export function splitHighlight(text: string, term: string): HighlightSegment[] {
  const t = term.trim();
  if (!t) return [{ text, match: false }];
  const hay = text.toLowerCase();
  const needle = t.toLowerCase();
  const out: HighlightSegment[] = [];
  let i = 0;
  let idx = hay.indexOf(needle, i);
  while (idx !== -1) {
    if (idx > i) out.push({ text: text.slice(i, idx), match: false });
    out.push({ text: text.slice(idx, idx + needle.length), match: true });
    i = idx + needle.length;
    idx = hay.indexOf(needle, i);
  }
  if (i < text.length) out.push({ text: text.slice(i), match: false });
  return out.length ? out : [{ text, match: false }];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/client && npx tsx --test src/renderer/lib/chat-search.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/renderer/lib/chat-search.ts apps/client/src/renderer/lib/chat-search.test.ts
git commit -m "feat(chat-search): splitHighlight for match highlighting"
```

### Task 4: Wire up the `test` script + `tsx` devDependency

**Files:**
- Modify: `apps/client/package.json`

- [ ] **Step 1: Add script + dep**

In `apps/client/package.json`:
- Under `scripts`, add: `"test": "tsx --test src/renderer/lib/*.test.ts"`.
- Under `devDependencies`, add `"tsx": "^4.0.0"` (matches the version already used by `apps/server`). Run `npm install` at repo root to record it in the lockfile.

- [ ] **Step 2: Run the test via the script**

Run: `cd apps/client && npm test`
Expected: PASS — all `chat-search` tests run through the new script.

- [ ] **Step 3: Commit**

```bash
git add apps/client/package.json package-lock.json
git commit -m "chore(client): add test script + tsx devDependency"
```

---

## Chunk 2: ChatPanel UI integration

### Task 5: Search state + header toggle

**Files:**
- Modify: `apps/client/src/renderer/components/ChatPanel.tsx`

- [ ] **Step 1: Add imports and local state**

- Add to the lucide import: `Search`, `X` is already imported. Import from the new lib:
  ```ts
  import { filterMessages, isSearchActive, splitHighlight, type FileCategory, type ContentType, type SearchFilters } from '../lib/chat-search.js';
  ```
- Inside `ChatPanel`, add local state:
  ```ts
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [author, setAuthor] = useState<string | null>(null);
  const [contentType, setContentType] = useState<ContentType>('all');
  const [fileCategory, setFileCategory] = useState<FileCategory>('all');

  const filters: SearchFilters = { query, author, contentType, fileCategory };
  const active = isSearchActive(filters);
  const visibleChat = active ? filterMessages(chat, filters) : chat;

  const closeSearch = () => {
    setSearchOpen(false);
    setQuery('');
    setAuthor(null);
    setContentType('all');
    setFileCategory('all');
  };
  ```
- Derive the author options from `chat` (unique by identity, keep first-seen name):
  ```ts
  const authorOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const m of chat) if (!seen.has(m.fromIdentity)) seen.set(m.fromIdentity, m.fromName);
    return [...seen.entries()].map(([identity, name]) => ({ identity, name }));
  }, [chat]);
  ```
  Add `useMemo` to the React import.

- [ ] **Step 2: Add the header toggle button**

Replace the header block (`<span>Чат</span>` container) so it keeps the centered title and adds a right-aligned search toggle:

```tsx
<div className="relative flex items-center justify-center px-4 py-3.5 after:absolute after:bottom-0 after:left-5 after:right-5 after:h-px after:bg-gradient-to-r after:from-transparent after:via-white/10 after:to-transparent after:content-['']">
  <span className="text-sm font-semibold tracking-tight text-fg">Чат</span>
  <button
    type="button"
    aria-label={searchOpen ? 'Закрыть поиск' : 'Поиск в чате'}
    aria-pressed={searchOpen}
    onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
    className={cn(
      'absolute right-3 flex h-7 w-7 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-white/[0.06] hover:text-fg focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20',
      searchOpen && 'bg-white/[0.06] text-fg',
    )}
  >
    {searchOpen ? <X size={14} strokeWidth={2.25} /> : <Search size={14} strokeWidth={2.25} />}
  </button>
</div>
```

- [ ] **Step 3: Verify it builds / renders**

Run: `cd apps/client && npm run lint`
Expected: clean (0 problems). Note: `tsc --noEmit` is NOT a valid gate here — the client has ~9 pre-existing baseline type errors unrelated to this work; use lint. (Filter panel not rendered yet — button toggles state only.)

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/renderer/components/ChatPanel.tsx
git commit -m "feat(chat): search state + header toggle button"
```

### Task 6: Filter panel UI

**Files:**
- Modify: `apps/client/src/renderer/components/ChatPanel.tsx`

- [ ] **Step 1: Render the filter panel when `searchOpen`**

Insert directly below the header block, above the message list. Uses the existing `Input` and `Select` primitives; the file-category `Select` is disabled when `contentType === 'text'`.

```tsx
{searchOpen && (
  <div className="flex flex-col gap-2 border-b border-white/[0.06] px-3 py-2.5 animate-in fade-in-0 slide-in-from-top-1 duration-150">
    <div className="relative">
      <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Поиск в чате…"
        autoFocus
        className="h-8 rounded-md pl-8 pr-8 text-[13px]"
      />
      {query && (
        <button
          type="button"
          aria-label="Очистить"
          onClick={() => setQuery('')}
          className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-fg-subtle transition-colors hover:bg-white/[0.06] hover:text-fg"
        >
          <X size={12} />
        </button>
      )}
    </div>

    {/* Author + file-category selects */}
    <div className="flex gap-2">
      <Select
        value={author ?? '__all__'}
        onValueChange={(v) => setAuthor(v === '__all__' ? null : v)}
      >
        <SelectTrigger className="h-8 flex-1 text-[12px]"><SelectValue placeholder="Автор" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">Все авторы</SelectItem>
          {authorOptions.map((a) => (
            <SelectItem key={a.identity} value={a.identity}>{a.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={fileCategory}
        onValueChange={(v) => setFileCategory(v as FileCategory)}
        disabled={contentType === 'text'}
      >
        <SelectTrigger className="h-8 flex-1 text-[12px]"><SelectValue placeholder="Файлы" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Все файлы</SelectItem>
          <SelectItem value="image">Изображения</SelectItem>
          <SelectItem value="audio">Аудио</SelectItem>
          <SelectItem value="video">Видео</SelectItem>
          <SelectItem value="document">Документы</SelectItem>
          <SelectItem value="other">Прочее</SelectItem>
        </SelectContent>
      </Select>
    </div>

    {/* Content-type segmented control */}
    <div className="flex gap-1 rounded-md border border-white/[0.08] p-0.5">
      {([
        ['all', 'Все'],
        ['text', 'Текст'],
        ['file', 'Файлы'],
      ] as const).map(([val, label]) => (
        <button
          key={val}
          type="button"
          onClick={() => setContentType(val)}
          className={cn(
            'flex-1 rounded px-2 py-1 text-[11.5px] font-medium transition-colors',
            contentType === val ? 'bg-white/[0.10] text-fg' : 'text-fg-subtle hover:text-fg-muted',
          )}
        >
          {label}
        </button>
      ))}
    </div>

    {/* Only the positive count lives here; the zero-results message is owned
        by the list's empty state (below) to avoid showing it twice. */}
    {active && visibleChat.length > 0 && (
      <div className="px-0.5 text-[11px] text-fg-subtle">
        {`${visibleChat.length} ${plural(visibleChat.length, 'совпадение', 'совпадения', 'совпадений')}`}
      </div>
    )}
  </div>
)}
```

- Add the `Select` imports at the top:
  ```ts
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.js';
  ```
- Add a small Russian plural helper near the other module-scope helpers (e.g. beside `formatBytes`):
  ```ts
  function plural(n: number, one: string, few: string, many: string): string {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
    return many;
  }
  ```

- [ ] **Step 2: Reset `fileCategory` when switching to text**

To avoid a stale (but inert) category, when the user picks `contentType === 'text'`, also reset `fileCategory` to `'all'`. Change the segmented `onClick` for the `text` case, or add an effect:
```ts
onClick={() => { setContentType(val); if (val === 'text') setFileCategory('all'); }}
```

- [ ] **Step 3: Verify build**

Run: `cd apps/client && npm run lint`
Expected: clean (0 problems). Do not use `tsc --noEmit` — pre-existing baseline errors make it unusable as a gate.

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/renderer/components/ChatPanel.tsx
git commit -m "feat(chat): search filter panel (query, author, type, file category)"
```

### Task 7: Filtered list rendering + highlight + empty state + guarded auto-scroll

**Files:**
- Modify: `apps/client/src/renderer/components/ChatPanel.tsx`

- [ ] **Step 1: Render `visibleChat` and pass highlight**

- Change the list map from `chat.map(...)` to `visibleChat.map(...)`.
- Pass the active query to each row:
  ```tsx
  {visibleChat.map((m) => {
    const isLocal = m.fromIdentity === room.localParticipant.identity;
    return <MessageRow key={m.id} message={m} isLocal={isLocal} highlight={active ? query.trim() : undefined} />;
  })}
  ```

- [ ] **Step 2: Empty-state branch**

Replace the single `chat.length === 0` placeholder with:
```tsx
{visibleChat.length === 0 && (
  <div className="my-auto text-center text-xs text-fg-subtle">
    {active ? (
      <div className="flex flex-col items-center gap-2">
        <span>Ничего не найдено</span>
        <button
          type="button"
          onClick={() => { setQuery(''); setAuthor(null); setContentType('all'); setFileCategory('all'); }}
          className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-[11px] text-fg-muted transition-colors hover:bg-white/[0.08] hover:text-fg"
        >
          Сбросить фильтры
        </button>
      </div>
    ) : (
      'Сообщений пока нет'
    )}
  </div>
)}
```

- [ ] **Step 3: Guard the auto-scroll effect**

The existing effect scrolls to bottom on `[chat.length, chat]`. While searching, that would yank the filtered view. Change it to skip when search is active:
```ts
useEffect(() => {
  if (active) return;
  listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
}, [chat.length, chat, active]);
```

- [ ] **Step 4: Add the `highlight` prop to `MessageRow` and apply it**

- Update the signature:
  ```tsx
  function MessageRow({ message, isLocal, highlight }: { message: ChatMessage; isLocal: boolean; highlight?: string }) {
  ```
- Add a module-scope helper that highlights only the string parts of `linkify` output, plus a plain-text variant for file names:
  ```tsx
  function highlightNodes(nodes: ReactNode[], term?: string): ReactNode[] {
    if (!term) return nodes;
    return nodes.map((node, i) => {
      if (typeof node !== 'string') return node;
      return splitHighlight(node, term).map((seg, j) =>
        seg.match ? (
          <mark key={`${i}-${j}`} className="rounded-[3px] bg-white/[0.18] px-0.5 text-fg">
            {seg.text}
          </mark>
        ) : (
          <span key={`${i}-${j}`}>{seg.text}</span>
        ),
      );
    });
  }
  ```
- In the text-bubble render, change `{linkify(message.text)}` to `{highlightNodes(linkify(message.text), highlight)}`.
- In `FileBubble`, pass `highlight` down and wrap the file-name `{message.name}` span content with `highlightNodes([message.name], highlight)` (or a simpler direct `splitHighlight` map). Add `highlight?: string` to `FileBubble`'s props and thread it from `MessageRow`.

- [ ] **Step 5: Verify build**

Run: `cd apps/client && npm run lint`
Expected: clean (0 problems). Do not use `tsc --noEmit` — pre-existing baseline errors make it unusable as a gate.

- [ ] **Step 6: Manual verification (run the app)**

Use the @run skill / `npm run dev:client`. Join a room with existing history, then:
- Toggle 🔍; the filter panel appears, input autofocuses.
- Type a term present in a message and in a file name → list narrows, matches show a subtle `<mark>`.
- Switch author / content-type / file-category → results update; file-category disabled under "Текст".
- Clear to no results → "Ничего не найдено" + reset button works.
- Close 🔍 → filters reset, full chat returns, auto-scroll resumes on new messages.

- [ ] **Step 7: Commit**

```bash
git add apps/client/src/renderer/components/ChatPanel.tsx
git commit -m "feat(chat): filtered list, match highlight, empty state, guarded autoscroll"
```

### Task 8: Full verification sweep

- [ ] **Step 1: Unit tests**

Run: `cd apps/client && npm test`
Expected: all `chat-search` tests PASS.

- [ ] **Step 2: Types + lint**

Run: `cd apps/client && npm run lint`
Expected: clean (0 problems). (`tsc --noEmit` has pre-existing baseline errors and is not the gate.)

- [ ] **Step 3: Confirm Tauri client picks up the shared renderer**

The Tauri client consumes the same renderer sources; no separate change needed. Sanity-check that `apps/client-tauri` references `ChatPanel` via the shared path (grep) — no code change expected.

- [ ] **Step 4: Final review**

Use superpowers:requesting-code-review before wrapping up.
