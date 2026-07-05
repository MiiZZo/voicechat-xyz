# Chat Search with Filters — Design

**Date:** 2026-07-05
**Status:** Approved (design), pending spec review
**Scope:** Client renderer only (`apps/client/src/renderer`), shared between the Electron and Tauri clients.

## Problem

Chat rooms now retain up to ~200 messages over a 7-day window (`feat(chat): 7-day server-side room history`). Finding a specific message or attachment by scrolling is impractical. Users need to search chat and narrow results by:

- free-text query,
- message author,
- content type (text vs. file),
- file category (broad type of attachment).

## Non-goals (YAGNI)

- No server-side search endpoint. The full history a room can show is already loaded into the client store (`chat: ChatMessage[]`); search runs entirely in memory.
- No search across rooms — only the currently open room's chat.
- No date-range filter, no exact-extension picker (broad categories cover the need), no regex.
- No persistence of the last-used filters across sessions — search UI state is ephemeral.

## Context

- Chat state lives in the Zustand store as `chat: ChatMessage[]` (`apps/client/src/renderer/state/store.ts`). Each message is a discriminated union:
  - `TextMessage`: `{ kind: 'text', id, fromIdentity, fromName, timestamp, text }`
  - `FileMessage`: `{ kind: 'file', id, fromIdentity, fromName, timestamp, fileId, url, name, size, mime, status, progress?, errorReason? }`
- All fields needed for search (`text`, `fromIdentity`, `fromName`, `kind`, `name`, `mime`) are present client-side. No new data model or wire/history changes.
- The chat UI is entirely in `apps/client/src/renderer/components/ChatPanel.tsx`, a `w-80` (320px) panel. Styling follows the **Velvet Onyx** theme: neutral zinc palette, glassmorphic surfaces (`border-white/[0.08]`, `bg-white/[0.06]`, `backdrop-blur`), no bright accent colors, no italic.
- The renderer is shared with the Tauri client, so this single change lands in both apps.

## Interaction model — in-place list filter

Chosen over an overlay/results-view: keeps the familiar chat layout, cheap to build in a narrow panel.

- A search icon button (`Search`, lucide) is added to the "Чат" header. Toggling it opens a filter panel between the header and the message list, animated with `animate-in` in the theme style.
- When search is **active** (open with any non-default filter), the message list renders the filtered subset in place, with query matches highlighted. When **inactive** (query empty and all filters at their defaults), the normal full list renders unchanged.
- Closing the search icon **resets all filter state** and restores the full chat. (Confirmed with user.)

## Component state

Ephemeral local `useState` in `ChatPanel` (not Zustand — resets on room change and on close, no cross-component consumers):

```ts
type FileCategory = 'all' | 'image' | 'audio' | 'video' | 'document' | 'other';

const [searchOpen, setSearchOpen] = useState(false);
const [query, setQuery] = useState('');
const [author, setAuthor] = useState<string | null>(null);      // fromIdentity; null = all authors
const [contentType, setContentType] = useState<'all' | 'text' | 'file'>('all');
const [fileCategory, setFileCategory] = useState<FileCategory>('all');
```

Closing search (`setSearchOpen(false)`) resets `query`, `author`, `contentType`, `fileCategory` to defaults.

## Filter UI (inside the filter panel)

Rendered between the header and the message list, only when `searchOpen`:

1. **Search input** with a clear (`✕`) affordance. Placeholder «Поиск в чате…».
2. **Автор** — dropdown of distinct authors actually present in `chat`, derived on the fly: unique by `fromIdentity`, label = `fromName`, plus an «Все» option. Value stored as `fromIdentity`.
3. **Тип** — segmented control: Все / Текст / Файлы → `contentType`.
4. **Файлы** — dropdown: Все / Изображения / Аудио / Видео / Документы / Прочее → `fileCategory`. **Disabled** (visually muted, non-interactive) when `contentType === 'text'`, since file categories cannot match text messages.
5. **Match count** — «N совпадений» (or a localized zero/one/many form) under the filters.

All controls follow Velvet Onyx: glass surfaces, neutral palette, no bright colors.

## Filtering logic

A pure, unit-testable function, colocated with `ChatPanel` or in a small `lib/chat-search.ts`:

```ts
function mimeToCategory(mime: string, name: string): FileCategory
function filterMessages(
  chat: ChatMessage[],
  f: { query: string; author: string | null; contentType: 'all'|'text'|'file'; fileCategory: FileCategory },
): ChatMessage[]
```

Semantics — **AND across all dimensions**:

- **query** (trimmed, case-insensitive, locale-lowercased): matches when the term is a substring of
  - a text message's `text`, **or**
  - a file message's `name` (file-name search — confirmed kept by user).
  Empty query matches everything.
- **author**: `m.fromIdentity === author`. `null` matches everything.
- **contentType**: `'all'` matches everything; `'text'`/`'file'` compares against `m.kind`.
- **fileCategory**: applies only to `kind === 'file'` messages; `'all'` matches any file. A text message never matches a non-`'all'` fileCategory. Ignored (treated as `'all'`) when `contentType === 'text'`.

`mimeToCategory` mapping:

- `image/*` → `image`
- `audio/*` → `audio`
- `video/*` → `video`
- documents → `document`: `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.*`, `application/vnd.ms-*`, `text/*` (excluding those better classed elsewhere), plus common doc extensions from `name` (`.pdf .doc .docx .xls .xlsx .ppt .pptx .txt .md .csv .rtf .odt`) as a fallback when the mime is generic (`application/octet-stream`).
- everything else → `other` (e.g. archives, unknown binaries).

**Search-active predicate:** `query.trim() !== '' || author !== null || contentType !== 'all' || fileCategory !== 'all'`. When false, bypass filtering and render the untouched list (identical to current behavior).

## Rendering & highlight

- `MessageRow` gains an optional `highlight?: string` prop (the current trimmed query, or undefined). When set, text-message body and file-name rendering wrap case-insensitive matches of `highlight` in a `<mark>` element styled per theme (muted accent background, not bright yellow). Existing `linkify` continues to run; highlight is applied so it does not break links (highlight applied within text segments).
- Filtered list uses the same `MessageRow` so bubbles, avatars, file/audio/image rendering, and context menus are unchanged.
- Auto-scroll-to-bottom effect must not fight the filtered view: only auto-scroll on new-message growth when search is inactive.

## Empty state

When search is active and `filtered.length === 0`, replace the «Сообщений пока нет» placeholder with «Ничего не найдено» plus a «Сбросить фильтры» button that clears all filter state (keeps search open).

## Error handling / edge cases

- In-flight file uploads (`status: 'uploading'`, empty `name`? — `name` is set from `file.name` at push time, so it is available) are searchable by name like any file.
- Author list is recomputed from current `chat` each render (cheap; ≤ ~200 messages). Selecting an author who then has all messages filtered out by another dimension simply yields zero results — handled by the empty state.
- Deduping/sorting of `chat` is already handled by the store; the filter is read-only and preserves order.

## Testing

- **Unit (vitest, mirroring `apps/server/test`):**
  - `mimeToCategory`: image/audio/video/pdf/office/octet-stream-with-extension/unknown.
  - `filterMessages`: each dimension in isolation, AND combinations, empty-query passthrough, fileCategory ignored for text, case-insensitivity, file-name query match.
- **Manual:** open search, type a term, switch author/type/category, verify highlight, empty state, reset-on-close, that inactive search matches current behavior, in both Electron and Tauri builds.

## Files touched

- `apps/client/src/renderer/components/ChatPanel.tsx` — search toggle, filter panel, wire filtering + highlight into the list, empty state.
- `apps/client/src/renderer/lib/chat-search.ts` (new) — `FileCategory`, `mimeToCategory`, `filterMessages`.
- `apps/client/src/renderer/lib/chat-search.test.ts` (new) — unit tests.
- Possibly a small themed `<mark>` style if not expressible with Tailwind utilities inline.

No changes to the server, wire protocol, history store, `Prefs`, or the Tauri Rust side.
