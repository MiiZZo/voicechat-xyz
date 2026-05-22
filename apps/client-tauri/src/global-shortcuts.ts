// Регистрация глобальных хоткеев через Tauri plugin. Хоткеи активны даже
// когда окно VoiceChat не в фокусе — позволяет мьютить микрофон или выходить
// из комнаты прямо из игры или другой программы.
//
// Источник истины — prefs.globalShortcutToggleMute / globalShortcutLeaveRoom.
// На каждом изменении префов applyGlobalShortcuts() снимает старые и
// регистрирует новые. Пустая строка в префе = хоткей отключён.
//
// Лежит в apps/client-tauri/src/, а не в общем renderer'е: импортит
// @tauri-apps/plugin-global-shortcut, который установлен только в Tauri-
// пакете. Renderer (Electron+Tauri-shared) дёргает фичу через
// window.api.setGlobalShortcuts() — preload-shim проксирует сюда.

import { register, unregister } from '@tauri-apps/plugin-global-shortcut';
import { fireToggleMute, fireLeaveRoom } from '@/lib/app-actions';

type RegistrationKey = 'toggleMute' | 'leaveRoom';
const HANDLERS: Record<RegistrationKey, () => void> = {
  toggleMute: fireToggleMute,
  leaveRoom: fireLeaveRoom,
};

// Запомнили, какой accelerator под каким ключом сейчас зарегистрирован, чтобы
// при следующем applyGlobalShortcuts() корректно его снять. Параллельные
// окна (notification) у нас этим не пользуются — модуль вызывается только в main.
const activeAccelerators: Partial<Record<RegistrationKey, string>> = {};

async function registerOne(key: RegistrationKey, accel: string): Promise<void> {
  if (!accel) return;
  try {
    await register(accel, (event) => {
      // Tauri 2 шлёт колбэк на Pressed И Released — фильтруем, иначе ping ping.
      // У некоторых версий event может быть undefined (старый API), тогда
      // считаем срабатыванием по умолчанию.
      const state = (event as unknown as { state?: string } | undefined)?.state;
      if (state && state !== 'Pressed') return;
      HANDLERS[key]();
    });
    activeAccelerators[key] = accel;
  } catch (err) {
    // Чаще всего: хоткей уже занят системной комбинацией или другим
    // приложением. Сообщаем в консоль, юзер увидит при следующем тесте.
    console.warn(`[global-shortcut] register ${key}=${accel} failed`, err);
  }
}

async function unregisterOne(key: RegistrationKey): Promise<void> {
  const accel = activeAccelerators[key];
  if (!accel) return;
  try {
    await unregister(accel);
  } catch (err) {
    console.warn(`[global-shortcut] unregister ${key}=${accel} failed`, err);
  }
  delete activeAccelerators[key];
}

export async function applyGlobalShortcuts(prefs: {
  globalShortcutToggleMute: string;
  globalShortcutLeaveRoom: string;
}): Promise<void> {
  const desired: Record<RegistrationKey, string> = {
    toggleMute: prefs.globalShortcutToggleMute,
    leaveRoom: prefs.globalShortcutLeaveRoom,
  };
  for (const key of Object.keys(desired) as RegistrationKey[]) {
    const want = desired[key];
    const have = activeAccelerators[key];
    if (have === want) continue;
    if (have) await unregisterOne(key);
    if (want) await registerOne(key, want);
  }
}

