import { z } from 'zod';

// Forbidden: '#', control chars (\x00-\x1F\x7F), bidi-overrides (U+202A-U+202E, U+2066-U+2069).
const FORBIDDEN_RE = /[\x00-\x1F\x7F#\u202A-\u202E\u2066-\u2069]/;

export const DisplayNameSchema = z
  .string()
  .transform((s) => s.trim())
  .pipe(
    z
      .string()
      .min(1, 'displayName required')
      .max(32, 'displayName too long')
      .refine((s) => !FORBIDDEN_RE.test(s), 'displayName contains forbidden characters'),
  );

export const JoinBodySchema = z.object({
  roomId: z.string().min(1).max(48),
  displayName: DisplayNameSchema,
});
