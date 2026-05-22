// Глобальная шина команд для меню трея, глобальных хоткеев и любых внешних
// триггеров, которые должны управлять микрофоном / выходом из комнаты, но
// сами не имеют доступа к React-дереву (Rust tray emit, JS callback от
// global-shortcut'а в preload-shim).
//
// Реализация: обычные CustomEvent'ы на window. Слушают ControlBar (mute) и
// RoomView (leave) пока соответствующее состояние активно — если юзер в
// лобби, событие просто никто не обрабатывает (no-op, не падает).

export const APP_TOGGLE_MUTE = 'app:toggle-mute';
export const APP_LEAVE_ROOM = 'app:leave-room';

export function fireToggleMute(): void {
  window.dispatchEvent(new CustomEvent(APP_TOGGLE_MUTE));
}

export function fireLeaveRoom(): void {
  window.dispatchEvent(new CustomEvent(APP_LEAVE_ROOM));
}

export function onToggleMute(cb: () => void): () => void {
  window.addEventListener(APP_TOGGLE_MUTE, cb);
  return () => window.removeEventListener(APP_TOGGLE_MUTE, cb);
}

export function onLeaveRoom(cb: () => void): () => void {
  window.addEventListener(APP_LEAVE_ROOM, cb);
  return () => window.removeEventListener(APP_LEAVE_ROOM, cb);
}
