export type Prefs = {
  displayName: string;
  audioInputDeviceId: string | null;
  audioOutputDeviceId: string | null;
  videoInputDeviceId: string | null;
  audioConstraints: {
    echoCancellation: boolean;
    noiseSuppression: boolean;
    autoGainControl: boolean;
  };
  pushToTalk: { enabled: boolean; key: string };
  participantVolumes: Record<string, number>;
  initialDeviceState: { mic: boolean; camera: boolean };
};

export type ScreenSource = {
  id: string;
  name: string;
  thumbnailDataUrl: string;
};

export type UpdateStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'available'; version: string }
  | { kind: 'downloading'; percent: number }
  | { kind: 'ready'; version: string }
  | { kind: 'error'; message: string };

export const IPC = {
  GetPrefs: 'prefs:get',
  SetPrefs: 'prefs:set',
  GetScreenSources: 'screen:get-sources',
  CheckUpdate: 'update:check',
  InstallUpdate: 'update:install',
  UpdateStatus: 'update:status',
} as const;
