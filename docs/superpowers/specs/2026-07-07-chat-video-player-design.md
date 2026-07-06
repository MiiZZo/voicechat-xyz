# Chat video player — design

Date: 2026-07-07
Status: approved (design), implementing

## Goal

Play video attachments in chat with a full-featured, Velvet Onyx-styled player.
Today `FileBubble` renders `video/*` as a plain download bubble — no playback.

## Scope / decisions

- **Interaction (C):** an inline player in the message bubble **and** a rich
  fullscreen mode.
- **Controls (A):** custom Velvet Onyx controls (not native `<video controls>`),
  reusing the `Bar` scrub/volume component and playback logic patterns from
  `AudioBubble`.
- **Fullscreen (A):** native Fullscreen API (`requestFullscreen()`) on the player
  container — a single `<video>` element, playback never interrupted, controls
  restyle for size. Not a Radix modal.
- **Features beyond base:** playback speed menu, hover frame preview on the scrub
  bar (fullscreen only), keyboard shortcuts. No Picture-in-Picture.
- Base controls: play/pause, scrub, volume, timecode, fullscreen, download.

## Architecture

Shared renderer UI (Electron + Tauri both consume it) — no main-process / Rust /
prefs changes, mirroring how `AudioBubble` deliberately stayed renderer-only.

### Files

1. `lib/media.ts` (+ `lib/media.test.ts`) — pure, testable helpers:
   - `formatTime(seconds)` — `m:ss` / `--:--`.
   - `clampFraction(x)` — clamp to `0..1`.
   - `stepVolume(current, delta)` — clamp `0..1`.
   - `seekBy(current, delta, duration)` — clamp `0..duration`.
   - `cyclePlaybackRate(current)` — advance through `[0.5, 1, 1.25, 1.5, 2]`.
   Tests run via existing `tsx --test src/renderer/lib/*.test.ts`.

2. `chat-search.ts` — add `isVideoMessage(message)`: `mime` starts with `video/`,
   or (generic/empty mime) the name extension is in
   `mp4|webm|mov|m4v|ogv|ogg`-style video set. Sits beside `mimeToCategory`
   (same type-detection home). Unit-tested.

3. `components/media-controls.tsx` — extract the existing `Bar` component (and let
   it import `formatTime` where needed) so both `AudioBubble` and `VideoBubble`
   share one Velvet Onyx scrub/volume bar. `AudioBubble` refactored to import it —
   **no behavior change**.

4. `components/VideoBubble.tsx` — the whole video player (inline + fullscreen).

### `FileBubble` dispatch (ChatPanel.tsx)

Branch order: `image → video → audio → generic`.
Video branch active when `!errored && !uploading && message.url &&
isVideoMessage(message)`. If Chromium cannot decode the file (mkv/avi/unsupported
codec), the `<video>` `onError` sets local state that makes `FileBubble` render
the **generic download bubble** instead — graceful fallback, file still saveable.

## Inline player (in bubble)

- `<video preload="metadata">`, width in line with image bubbles
  (`max-h-[150px]`-class scale), rounded glass container.
- First frame as poster (seek to ~0.1s after metadata) with a centered glass Play
  button overlay before first play.
- Controls overlay appears on hover / while paused: play/pause, `Bar` scrub,
  timecode, volume popover (same pattern as `AudioBubble`), speed, fullscreen,
  download. Compact sizing.
- Playback/seek/volume/ended handling ported from `AudioBubble` (same media event
  listeners).

## Fullscreen (Fullscreen API)

- `requestFullscreen()` on the player wrapper; track `isFullscreen` via
  `fullscreenchange`.
- Same `<video>` + same state → playback continues seamlessly.
- Larger bottom control bar; controls auto-hide after ~2.5s of no cursor movement.
- Hover frame preview enabled here (bar is wide enough to be useful).

## Features

- **Speed:** menu `0.5× / 1× / 1.25× / 1.5× / 2×` → `video.playbackRate`.
- **Hover frame preview (fullscreen only):** a hidden second `<video muted>` with
  the same `src`; on hover over `Bar`, throttled-seek it to the hovered position,
  draw the frame to a `<canvas>` in a tooltip above the bar. Inline mode shows a
  timecode-only tooltip (no frame).
- **Keyboard (player focused / fullscreen):** Space = play/pause, ←/→ = ±5s,
  ↑/↓ = volume ±10%, `F` = toggle fullscreen, `M` = mute.
- Player volume kept in a session-scoped module variable `sharedVideoVolume`
  (mirrors `AudioBubble`'s `sharedVolume`, separate from audio).

## Style

Velvet Onyx: glass controls, neutral zinc palette, no italic — consistent with
`AudioBubble` and the theme rules.

## Testing

- Pure logic (`isVideoMessage`, `media.ts` helpers) covered by `node:test` units
  in `lib/`.
- The DOM player is not e2e-tested (jsdom does not play media); verified manually
  in the real client: inline playback, fullscreen, speed, scrub, keyboard,
  unsupported-codec fallback.

## Out of scope (YAGNI)

- Picture-in-Picture.
- Subtitles/captions.
- Server-side transcoding of unsupported containers (mkv/avi just fall back to
  download).
- Persisting volume/speed to prefs (session-scoped only).
