/** Pure media-player helpers shared by the audio and video chat players.
 *  Kept free of DOM so they can be unit-tested with `node:test`. */

/** Playback-speed steps offered by the video player, in cycle order. */
export const PLAYBACK_RATES = [0.5, 1, 1.25, 1.5, 2] as const;

/** `m:ss`, or `--:--` for non-finite / negative input. */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Clamp any number to the 0..1 progress range (non-finite → 0). */
export function clampFraction(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.min(1, Math.max(0, x));
}

/** Current volume + delta, clamped to 0..1. */
export function stepVolume(current: number, delta: number): number {
  return Math.min(1, Math.max(0, current + delta));
}

/** Current time + delta, clamped to 0..duration. Returns `current` unchanged
 *  when the duration is not yet known (non-finite). */
export function seekBy(current: number, delta: number, duration: number): number {
  if (!Number.isFinite(duration)) return current;
  return Math.min(duration, Math.max(0, current + delta));
}

/** Next playback rate in {@link PLAYBACK_RATES}, wrapping around. An unknown
 *  current rate snaps to the first entry. */
export function cyclePlaybackRate(current: number): number {
  const i = PLAYBACK_RATES.indexOf(current as (typeof PLAYBACK_RATES)[number]);
  if (i === -1) return PLAYBACK_RATES[0];
  return PLAYBACK_RATES[(i + 1) % PLAYBACK_RATES.length] ?? PLAYBACK_RATES[0];
}
