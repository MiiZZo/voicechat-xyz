import Store from 'electron-store';
import os from 'node:os';
import type { Prefs } from '../shared/types.js';

const defaults: Prefs = {
  displayName: os.userInfo().username || '',
  audioInputDeviceId: null,
  audioOutputDeviceId: null,
  videoInputDeviceId: null,
  audioConstraints: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: false,
  },
  micActivationMode: 'always',
  pushToTalk: { enabled: false, key: 'AltRight' },
  voiceActivation: {
    thresholdDb: -45,
    releaseMs: 400,
    hysteresisDb: 6,
  },
  participantVolumes: {},
  participantMuted: {},
  initialDeviceState: { mic: true, camera: false },
  closeToTray: true,
  screenSharePreset: 'smooth',
  // VP8 — самый предсказуемый кодек для софт-WebRTC в Electron-Chromium.
  screenShareCodec: 'vp8',
};

export const prefsStore = new Store<Prefs>({ name: 'voicechat-prefs', defaults });

/**
 * Migrate legacy stored prefs into the current shape. Required because
 * electron-store persists whatever was last saved on disk, so adding a new
 * required field (e.g. `micActivationMode`) won't surface its default for
 * existing users without an explicit merge.
 *
 * Also infers `micActivationMode` from the legacy `pushToTalk.enabled` flag
 * so users who already had PTT on don't suddenly find themselves in
 * always-on mode after upgrading.
 */
function migrate(stored: Prefs): Prefs {
  const merged: Prefs = {
    ...defaults,
    ...stored,
    audioConstraints: { ...defaults.audioConstraints, ...stored.audioConstraints },
    pushToTalk: { ...defaults.pushToTalk, ...stored.pushToTalk },
    voiceActivation: { ...defaults.voiceActivation, ...stored.voiceActivation },
    initialDeviceState: { ...defaults.initialDeviceState, ...stored.initialDeviceState },
  };
  if (!merged.micActivationMode) {
    merged.micActivationMode = merged.pushToTalk.enabled ? 'ptt' : 'always';
  }
  return merged;
}

export function getPrefs(): Prefs {
  return migrate(prefsStore.store);
}

export function setPrefs(patch: Partial<Prefs>): Prefs {
  const next = migrate({ ...prefsStore.store, ...patch });
  prefsStore.store = next;
  return next;
}
