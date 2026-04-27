import { useEffect, useState } from 'react';
import {
  ConnectionState,
  DisconnectReason,
  Room,
  RoomEvent,
} from 'livekit-client';
import { useStore } from '../state/store.js';
import { useToasts } from '../state/toast-store.js';

/** Map DisconnectReason enum → user-facing message. `null` = silent. */
function describeDisconnect(reason: DisconnectReason | undefined): string | null {
  switch (reason) {
    case DisconnectReason.CLIENT_INITIATED:
      return null; // we initiated room.disconnect() on leave
    case DisconnectReason.DUPLICATE_IDENTITY:
      return 'Подключение из другого окна';
    case DisconnectReason.SERVER_SHUTDOWN:
      return 'Сервер перезапущен';
    case DisconnectReason.PARTICIPANT_REMOVED:
    case DisconnectReason.ROOM_DELETED:
      return 'Вы были отключены от комнаты';
    case undefined:
      return null;
    default:
      return 'Связь потеряна';
  }
}

export type MicPermissionState = 'unknown' | 'granted' | 'denied';

export function useLiveKitRoom() {
  const { activeRoom, prefs, leaveRoom } = useStore();
  const { push } = useToasts();
  const [room, setRoom] = useState<Room | null>(null);
  const [state, setState] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [micPermission, setMicPermission] = useState<MicPermissionState>('unknown');

  useEffect(() => {
    if (!activeRoom || !prefs) return;
    const r = new Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: {
        echoCancellation: prefs.audioConstraints.echoCancellation,
        noiseSuppression: prefs.audioConstraints.noiseSuppression,
        autoGainControl: prefs.audioConstraints.autoGainControl,
        deviceId: prefs.audioInputDeviceId ?? undefined,
      },
      videoCaptureDefaults: {
        deviceId: prefs.videoInputDeviceId ?? undefined,
      },
    });

    r.on(RoomEvent.ConnectionStateChanged, setState);
    r.on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
      const msg = describeDisconnect(reason);
      if (msg) push('error', msg);
      leaveRoom();
    });

    /** Try to enable a device; if it fails, recover gracefully. */
    const tryEnable = async (
      kind: 'mic' | 'camera',
      enable: () => Promise<unknown>,
    ): Promise<boolean> => {
      try {
        await enable();
        return true;
      } catch (err) {
        const e = err as Error;
        const denied = /permission|notallowed/i.test(e.name) || /permission/i.test(e.message);
        const notFound = /notfound|devicenotfound/i.test(e.name);
        if (kind === 'mic') {
          if (denied) {
            setMicPermission('denied');
            push('error', 'Микрофон недоступен — проверьте настройки Windows');
          } else if (notFound) {
            push('info', 'Использую микрофон по умолчанию');
            try {
              await r.localParticipant.setMicrophoneEnabled(true, { deviceId: undefined });
              return true;
            } catch {
              /* give up */
            }
          } else {
            push('error', `Микрофон: ${e.message}`);
          }
        } else {
          if (denied) push('error', 'Камера недоступна');
          else if (notFound) push('info', 'Камера не найдена');
          else push('error', `Камера: ${e.message}`);
        }
        return false;
      }
    };

    (async () => {
      try {
        await r.connect(activeRoom.join.livekitUrl, activeRoom.join.token);
        setRoom(r);
        if (prefs.initialDeviceState.mic) {
          const ok = await tryEnable('mic', () =>
            r.localParticipant.setMicrophoneEnabled(true, {
              deviceId: prefs.audioInputDeviceId ?? undefined,
            }),
          );
          if (ok) setMicPermission('granted');
        }
        if (prefs.initialDeviceState.camera) {
          await tryEnable('camera', () =>
            r.localParticipant.setCameraEnabled(true, {
              deviceId: prefs.videoInputDeviceId ?? undefined,
            }),
          );
        }
      } catch (err) {
        push('error', `Не удалось подключиться: ${(err as Error).message}`);
        leaveRoom();
      }
    })();

    return () => {
      r.disconnect();
    };
  }, [activeRoom?.roomId]);

  return { room, state, micPermission };
}
