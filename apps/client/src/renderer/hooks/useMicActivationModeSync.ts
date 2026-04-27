import { useEffect, useRef } from 'react';
import type { Room } from 'livekit-client';
import { useStore } from '../state/store.js';

/**
 * Reconciles the LiveKit mic state when the user switches mic-activation mode.
 *
 * Without this, transitioning PTT/VAD → "always on" would leave the mic muted
 * (because the previous hook's last action was to mute it), forcing the user
 * to click the mic button manually. We watch for the moment the mode becomes
 * "always" and re-enable the mic. We do *not* fire on first mount: the
 * initial mic state is owned by `useLiveKitRoom`'s connect flow, which
 * respects `prefs.initialDeviceState.mic`.
 *
 * Switching *into* PTT or VAD is handled by those hooks themselves (they
 * mute on activation), so this hook only needs to handle the always-on edge.
 */
export function useMicActivationModeSync(room: Room | null): void {
  const { prefs } = useStore();
  const mode = prefs?.micActivationMode;
  // Skip the first run — initial mic state is set by useLiveKitRoom on connect.
  const prevMode = useRef<typeof mode | null>(null);

  useEffect(() => {
    if (!room || !mode) {
      prevMode.current = mode ?? null;
      return;
    }
    const previous = prevMode.current;
    prevMode.current = mode;
    // Only react to genuine transitions, not the first observation.
    if (previous === null || previous === mode) return;
    if (mode === 'always' && (previous === 'ptt' || previous === 'vad')) {
      // Coming back from a gated mode — open the mic so the user doesn't
      // have to click it. Errors (no permission) are surfaced elsewhere.
      room.localParticipant.setMicrophoneEnabled(true).catch(() => undefined);
    }
  }, [room, mode]);
}
