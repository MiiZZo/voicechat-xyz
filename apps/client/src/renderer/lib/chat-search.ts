import type { ChatMessage } from '../state/store.js';

export type FileCategory = 'all' | 'image' | 'audio' | 'video' | 'document' | 'other';
export type ContentType = 'all' | 'text' | 'file';

export type SearchFilters = {
  query: string;
  /** fromIdentity of the selected author, or null for all authors. */
  author: string | null;
  contentType: ContentType;
  fileCategory: FileCategory;
};

const DOC_MIME_RE =
  /^(application\/pdf|application\/msword|application\/vnd\.(openxmlformats-officedocument|ms-excel|ms-powerpoint)|text\/)/;
const DOC_EXTS = new Set([
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'txt',
  'md',
  'csv',
  'rtf',
  'odt',
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

/** Video containers Chromium will usually attempt to play. Used as a fallback
 *  when the server reports a generic mime (application/octet-stream). Unplayable
 *  codecs still fall back to the download bubble via the <video> error event. */
const VIDEO_EXTS = new Set(['mp4', 'webm', 'm4v', 'mov', 'ogv']);

/** True when a file message should be shown with the video player. Mirrors
 *  {@link isAudioMessage}: mime `video/*`, or a video extension when the mime is
 *  generic. */
export function isVideoMessage(mime: string, name: string): boolean {
  return mime.startsWith('video/') || VIDEO_EXTS.has(extOf(name));
}

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
