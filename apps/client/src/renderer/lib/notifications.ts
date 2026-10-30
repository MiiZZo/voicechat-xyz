// Системные уведомления о входящих сообщениях. Стреляют только когда окно
// не в фокусе (свёрнуто, в трее, на другом мониторе вне активного экрана) —
// внутри окна уже виден чат, дублировать его раздражает.
//
// Реализация: window.api.notify. В Tauri — emitTo('notification', ...) →
// отдельное WebviewWindow с label 'notification' рендерит свой UI (Web
// Notification API в WebView2 не работает: permission='denied'). В браузере —
// обычный Web Notification API.
//
// Анти-спам: cooldown на звук (общий + per-sender). Визуал тоста всегда
// обновляется на последнее сообщение, чтобы не пропускать содержимое.

import { useStore } from '../state/store.js';
import { playNotify } from './sounds.js';

// Не звенеть чаще раза в N мс — спасает от 5 пингов подряд, когда быстро
// приходит несколько сообщений от разных людей.
const SOUND_COOLDOWN_MS = 1500;
// Тот же отправитель чаще раза в N мс — без звука (например, печатает
// очередью или режет длинное сообщение на несколько коротких).
const SENDER_COOLDOWN_MS = 3000;

let lastSoundTs = 0;
const senderLastTs = new Map<string, number>();

function pruneStaleSenders(now: number): void {
  // Чистим лениво при каждом вызове — Map'а с 8 максимум именами хватает,
  // но если identity меняется при reconnect'ах, не хочется бесконтрольного роста.
  for (const [name, ts] of senderLastTs) {
    if (now - ts > SENDER_COOLDOWN_MS) senderLastTs.delete(name);
  }
}

function isWindowVisible(): boolean {
  // hidden — окно скрыто в трей / другой workspace. hasFocus — окно
  // существует, но пользователь работает в другом приложении. Любого из этих
  // условий достаточно, чтобы считать сессию "пользователь не смотрит сюда".
  return !document.hidden && document.hasFocus();
}

export async function notifyChatMessage(opts: {
  fromName: string;
  body: string;
}): Promise<void> {
  if (isWindowVisible()) return;
  // Master-switch из настроек. Сравнение строгое: undefined (prefs не
  // загружены) трактуем как "включено" — лучше показать тост, чем потерять.
  if (useStore.getState().prefs?.notificationsEnabled === false) return;
  const now = Date.now();
  pruneStaleSenders(now);
  const sameSenderRecent =
    now - (senderLastTs.get(opts.fromName) ?? 0) < SENDER_COOLDOWN_MS;
  const globalRecent = now - lastSoundTs < SOUND_COOLDOWN_MS;
  const shouldPlaySound = !sameSenderRecent && !globalRecent;

  if (shouldPlaySound) {
    playNotify();
    lastSoundTs = now;
  }
  senderLastTs.set(opts.fromName, now);

  // Тело урезаем: длинные сообщения раздувают тост и обрезаются по-разному
  // на разных экранах. 140 символов покрывают типичный чат без сюрпризов.
  const body = opts.body.length > 140 ? opts.body.slice(0, 140) + '…' : opts.body;
  const corner = useStore.getState().prefs?.notificationPosition;
  await window.api.notify({ title: opts.fromName, body, corner });
}
