/**
 * How the local microphone gate is driven.
 *  - 'always' — mic is open whenever the user enables it from the ControlBar (default).
 *  - 'ptt'    — push-to-talk: mic stays muted, key hold opens it.
 *  - 'vad'    — voice activation: an analyser opens the gate when input level
 *               crosses {@link Prefs.voiceActivation.thresholdDb}.
 * The three modes are mutually exclusive.
 */
export type MicActivationMode = 'always' | 'ptt' | 'vad';

/**
 * Screen share quality preset. Different points on the
 * resolution × fps × encoder-path triangle:
 *  - 'smooth' — 1080p60, fits HW H264 on most cards (NVENC enumerates
 *    a 1080p@121fps profile), low CPU. Best for motion (games/video).
 *  - 'sharp'  — 1440p30, also HW (NVENC 4K@30 profile covers it),
 *    low CPU, crisp text. Best for static content (code, docs).
 *  - 'max'    — 1440p60, falls back to software OpenH264 because
 *    Media Foundation doesn't enumerate that pair on consumer NVENC.
 *    Burns CPU but gives both resolution and frame rate.
 */
export type ScreenSharePreset = 'smooth' | 'sharp' | 'max';

/**
 * Кодек для screen-share в WebRTC.
 *  - 'h264' — Electron-Chromium почти всегда даёт софт OpenH264 (медленный),
 *    HW-MediaFoundation в стандартной Electron-сборке часто недоступен.
 *  - 'vp8'  — libvpx, в софте обычно быстрее OpenH264. Безопасный дефолт.
 *  - 'vp9'  — лучше сжатие, но в софте дороже; HW-VP9 редко.
 *  - 'av1'  — HW только на RTX 40 / Arc / Ryzen 7000+. В софте неподъёмен.
 */
export type ScreenShareCodec = 'h264' | 'vp8' | 'vp9' | 'av1';

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
  screenSharePreset: ScreenSharePreset;
  screenShareCodec: ScreenShareCodec;
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
  OpenInternalUrl: 'debug:open-internal-url',
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
