import { useEffect, useState } from 'react';
import type { Room } from 'livekit-client';
import { useStore } from '../state/store.js';

function isEditableTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA';
}

/** Push-to-talk: while enabled, mic stays muted; key hold unmutes. Returns held state. */
export function usePushToTalk(room: Room | null): boolean {
  const { prefs } = useStore();
  const [held, setHeld] = useState(false);

  // Activated only when PTT is the chosen mic activation mode. Falls back to
  // the legacy `pushToTalk.enabled` flag for backwards compatibility, in case
  // a prefs migration somehow misses setting `micActivationMode`.
  const active =
    prefs?.micActivationMode === 'ptt' ||
    (prefs?.micActivationMode === undefined && prefs?.pushToTalk.enabled === true);

  useEffect(() => {
    if (!room || !active) {
      setHeld(false);
      return;
    }
    const key = prefs?.pushToTalk.key ?? 'AltRight';

    // Initial mute
    room.localParticipant.setMicrophoneEnabled(false).catch(() => undefined);

    const onDown = (e: KeyboardEvent) => {
      if (e.code !== key) return;
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      if (!e.repeat) {
        room.localParticipant.setMicrophoneEnabled(true).catch(() => undefined);
        setHeld(true);
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code !== key) return;
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      room.localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
      setHeld(false);
    };

    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      setHeld(false);
    };
  }, [room, active, prefs?.pushToTalk.key]);

  return held;
}
