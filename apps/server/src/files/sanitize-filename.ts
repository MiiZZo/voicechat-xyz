// Forbidden chars: control (\x00-\x1F\x7F), path separators, NUL, bidi overrides.
// Bidi overrides (U+202A-U+202E, U+2066-U+2069) are filename spoofing classics —
// e.g. "safe<RLO>gnp.exe" displays as "safeexe.png".
const FORBIDDEN_RE = /[\x00-\x1F\x7F\\/‪-‮⁦-⁩]/g;
const MAX_LEN = 200;

export function sanitizeFilename(input: string): string {
  let s = input.replace(FORBIDDEN_RE, '');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/^\.+/, '');
  if (s.length === 0) return 'file';

  if (s.length <= MAX_LEN) return s;

  const { base, ext } = splitExt(s);
  if (ext.length === 0 || ext.length >= MAX_LEN) {
    return s.slice(0, MAX_LEN);
  }
  const keep = MAX_LEN - ext.length;
  return base.slice(0, keep) + ext;
}

/**
 * Splits a filename into base + extension. The dot is included in `ext`.
 * Returns ext='' if there's no plausible extension (no dot, leading dot only,
 * extension contains non-alphanumerics, or extension is too long).
 */
export function splitExt(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return { base: name, ext: '' };
  const ext = name.slice(dot);
  // Plausible extension: 1-10 alphanumerics after the dot.
  if (!/^\.[a-zA-Z0-9]{1,10}$/.test(ext)) return { base: name, ext: '' };
  return { base: name.slice(0, dot), ext };
}
