// Короткие UI-сигналы для событий комнаты. Vite зашивает ассеты через ?url —
// файлы получают хэш и кладутся в dist, путь резолвится одинаково в дев и проде.
//
// Громкость и master-switch берутся из prefs (см. Settings → Звуки и
// уведомления). Читаем через zustand getState() — это снаружи React-дерева,
// потому что playJoin/playLeave/playNotify вызываются из event-handler'ов
// LiveKit, а не из компонентов.
import { useStore } from '../state/store.js';
import joinUrl from '../assets/sounds/join.wav?url';
import leaveUrl from '../assets/sounds/leave.wav?url';
import notifyUrl from '../assets/sounds/notify.wav?url';
import testUrl from '../assets/sounds/test.wav?url';

// Дефолт для случаев, когда prefs ещё не загружены (между стартом приложения
// и первым успешным prefs:get). Совпадает с дефолтом в Rust prefs.rs.
const DEFAULT_VOLUME = 0.4;

// Прелоадим базовые элементы один раз — браузер кэширует декодированный буфер.
// Сам play() делаем через cloneNode, чтобы перекрывающиеся события (двое
// зашли одновременно) не глушили друг друга и не сбрасывали currentTime.
const joinTemplate = new Audio(joinUrl);
const leaveTemplate = new Audio(leaveUrl);
const notifyTemplate = new Audio(notifyUrl);
joinTemplate.preload = 'auto';
leaveTemplate.preload = 'auto';
notifyTemplate.preload = 'auto';

function play(template: HTMLAudioElement) {
  const prefs = useStore.getState().prefs;
  // Сравнение со строгим false: пока prefs не загружены (null) — играем с
  // дефолтной громкостью, чтобы не глотать самый первый join-звук на старте.
  if (prefs?.soundsEnabled === false) return;
  const volume = prefs?.soundsVolume ?? DEFAULT_VOLUME;
  if (volume <= 0) return;
  const node = template.cloneNode() as HTMLAudioElement;
  node.volume = Math.min(1, Math.max(0, volume));
  // Автоплей-политика может отклонить play() до первого user gesture.
  // Глушим — это UI-feedback, второстепенно по сравнению с основной работой.
  void node.play().catch(() => {});
}

export function playJoin() {
  play(joinTemplate);
}

export function playLeave() {
  play(leaveTemplate);
}

export function playNotify() {
  play(notifyTemplate);
}

/**
 * Проиграть тестовый сигнал на указанном выходном устройстве. Используется
 * в Settings → Устройства, чтобы юзер мог проверить какой именно динамик
 * выбран до того, как зайдёт в комнату. setSinkId — Chromium-only расширение
 * HTMLMediaElement, WebView2 его поддерживает. При deviceId=null/undefined
 * играет на дефолтном устройстве.
 *
 * Игнорирует prefs.soundsEnabled — это явный пользовательский тест, юзер
 * должен услышать сигнал даже если общие звуки выключены.
 */
export async function playTestSignal(deviceId: string | null): Promise<void> {
  const audio = new Audio(testUrl);
  audio.volume = 0.5;
  if (deviceId) {
    const withSink = audio as HTMLAudioElement & {
      setSinkId?: (id: string) => Promise<void>;
    };
    if (typeof withSink.setSinkId === 'function') {
      try {
        await withSink.setSinkId(deviceId);
      } catch (e) {
        // Permission denied / unsupported device — упадём на дефолтный output.
        console.warn('[test-signal] setSinkId failed', e);
      }
    }
  }
  // Промис резолвится ровно когда воспроизведение закончилось — позволяет
  // компоненту синхронно держать "playing" state и снимать его на ended.
  // Ошибки загрузки/декодирования тоже резолвят (не reject), чтобы UI не
  // подвисал в playing-состоянии — это в любом случае только индикатор.
  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    audio.addEventListener('ended', finish);
    audio.addEventListener('error', finish);
    audio.play().catch((e) => {
      console.warn('[test-signal] play failed', e);
      finish();
    });
  });
}
