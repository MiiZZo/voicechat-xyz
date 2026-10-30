/**
 * Возможности текущего браузера, от которых зависит аудиопуть и набор кнопок.
 * Проверяем фичи, а не user-agent: WebView2 (Tauri) и десктопные браузеры
 * умеют всё, мобильные — нет.
 */

/**
 * Можно ли выбрать устройство вывода звука (setSinkId). Нет в Chrome на
 * Android и в Safari на iOS: там звук маршрутизирует ОС — подключил наушники,
 * и он идёт в них. На таких платформах проигрываем удалённый звук прямо через
 * <audio>, без WebAudio: AudioContext во время звонка ОС может увести в
 * динамик телефона мимо наушников.
 */
export const canSelectAudioOutput =
  typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

/** Демонстрация экрана (getDisplayMedia) — недоступна в мобильных браузерах. */
export const canShareScreen =
  typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getDisplayMedia === 'function';

