import type { Prefs } from './types.js';

/** Дефолты префов. Зеркало — apps/client-tauri/src-tauri/src/prefs.rs (там
 *  displayName по умолчанию берётся из имени пользователя ОС). */
export const DEFAULT_PREFS: Prefs = {
  displayName: '',
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
  participantScreenShareVolumes: {},
  participantScreenShareMuted: {},
  initialDeviceState: { mic: true, camera: false },
  closeToTray: true,
  screenSharePreset: 'smooth',
  screenShareCodec: 'vp8',
  soundsEnabled: true,
  soundsVolume: 0.4,
  notificationsEnabled: true,
  notificationPosition: 'bottom-right',
  globalShortcutToggleMute: 'CommandOrControl+Shift+M',
  globalShortcutLeaveRoom: '',
};

/**
 * Приводит сохранённые префы к текущей форме: новые поля получают дефолты,
 * вложенные объекты мержатся по ключам. `micActivationMode` для старых
 * сохранений выводится из legacy-флага `pushToTalk.enabled`.
 */
export function migratePrefs(stored: Partial<Prefs>): Prefs {
  const merged: Prefs = {
    ...DEFAULT_PREFS,
    ...stored,
    audioConstraints: { ...DEFAULT_PREFS.audioConstraints, ...stored.audioConstraints },
    pushToTalk: { ...DEFAULT_PREFS.pushToTalk, ...stored.pushToTalk },
    voiceActivation: { ...DEFAULT_PREFS.voiceActivation, ...stored.voiceActivation },
    initialDeviceState: { ...DEFAULT_PREFS.initialDeviceState, ...stored.initialDeviceState },
  };
  if (!merged.micActivationMode) {
    merged.micActivationMode = merged.pushToTalk.enabled ? 'ptt' : 'always';
  }
  return merged;
}
