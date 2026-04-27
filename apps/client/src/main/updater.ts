import electronUpdater from 'electron-updater';
import log from 'electron-log/main.js';
import type { BrowserWindow } from 'electron';
import { IPC, type UpdateStatus } from '../shared/types.js';

const { autoUpdater } = electronUpdater;

// electron-updater is silent without a logger — wire up electron-log so we can
// see ACME-like detail in %APPDATA%/VoiceChat/logs/main.log on user machines.
log.transports.file.level = 'info';
log.transports.console.level = 'debug';
autoUpdater.logger = log;

let getWindow: () => BrowserWindow | null = () => null;
let lastStatus: UpdateStatus = { kind: 'idle' };

function emit(status: UpdateStatus): void {
  lastStatus = status;
  getWindow()?.webContents.send(IPC.UpdateStatus, status);
}

export function setupAutoUpdate(getWin: () => BrowserWindow | null): void {
  getWindow = getWin;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('checking-for-update', () => emit({ kind: 'checking' }));
  autoUpdater.on('update-available', (info) =>
    emit({ kind: 'available', version: info.version }),
  );
  autoUpdater.on('update-not-available', () => emit({ kind: 'idle' }));
  autoUpdater.on('download-progress', (p) =>
    emit({ kind: 'downloading', percent: Math.round(p.percent) }),
  );
  autoUpdater.on('update-downloaded', (info) =>
    emit({ kind: 'ready', version: info.version }),
  );
  autoUpdater.on('error', (err) =>
    emit({ kind: 'error', message: err.message }),
  );

  // Initial check + hourly
  autoUpdater.checkForUpdates().catch(() => undefined);
  setInterval(
    () => autoUpdater.checkForUpdates().catch(() => undefined),
    60 * 60 * 1000,
  );
}

export function getLastStatus(): UpdateStatus {
  return lastStatus;
}

export async function manualCheck(): Promise<void> {
  await autoUpdater.checkForUpdates();
}

export function quitAndInstall(): void {
  autoUpdater.quitAndInstall();
}
