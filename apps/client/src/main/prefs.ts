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
  pushToTalk: { enabled: false, key: 'AltRight' },
  participantVolumes: {},
  participantMuted: {},
  initialDeviceState: { mic: true, camera: false },
  closeToTray: true,
};

export const prefsStore = new Store<Prefs>({ name: 'voicechat-prefs', defaults });

export function getPrefs(): Prefs {
  return prefsStore.store;
}

export function setPrefs(patch: Partial<Prefs>): Prefs {
  prefsStore.store = { ...prefsStore.store, ...patch };
  return prefsStore.store;
}
