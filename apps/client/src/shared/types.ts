/**
 * How the local microphone gate is driven.
 *  - 'always' — mic is open whenever the user enables it from the ControlBar (default).
 *  - 'ptt'    — push-to-talk: mic stays muted, key hold opens it.
 *  - 'vad'    — voice activation: an analyser opens the gate when input level
 *               crosses {@link Prefs.voiceActivation.thresholdDb}.
 * The three modes are mutually exclusive.
 */
export type MicActivationMode = 'always' | 'ptt' | 'vad';

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
  micActivationMode: MicActivationMode;
  pushToTalk: { enabled: boolean; key: string };
  voiceActivation: {
    /** Open-gate threshold in dBFS, typically -60..0. Higher = less sensitive. */
    thresholdDb: number;
    /** How long the gate stays open after level drops below threshold (ms). */
    releaseMs: number;
    /** Hysteresis: once open, gate uses (threshold - hysteresisDb) to prevent flapping. */
    hysteresisDb: number;
  };
  participantVolumes: Record<string, number>;
  participantMuted: Record<string, boolean>;
  initialDeviceState: { mic: boolean; camera: boolean };
  closeToTray: boolean;
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
  WindowMinimize: 'window:minimize',
  WindowMaximizeToggle: 'window:maximize-toggle',
  WindowClose: 'window:close',
  WindowIsMaximized: 'window:is-maximized',
  WindowMaximizedChanged: 'window:maximized-changed',
  FileDownload: 'file:download',
  ScreenShareRequest: 'screen-share:request',
  ScreenShareResponse: 'screen-share:response',
} as const;

export type ScreenShareRequestPayload = {
  requestId: string;
  sources: ScreenSource[];
};
export type ScreenShareResponsePayload = {
  requestId: string;
  sourceId: string | null;
};

export type FileDownloadRequest = {
  url: string;
  suggestedName: string;
};
export type FileDownloadResult =
  | { kind: 'saved'; path: string }
  | { kind: 'canceled' }
  | { kind: 'error'; message: string };
