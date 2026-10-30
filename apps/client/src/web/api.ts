/**
 * Браузерная реализация контракта window.api (см. shared/api.ts).
 *
 * Desktop-only возможности (окно, трей, глобальные хоткеи, автообновление)
 * сознательно не реализованы — renderer видит их отсутствие и прячет UI.
 */
import type { Api } from '../shared/api.js';
import type { Prefs } from '../shared/types.js';
import { migratePrefs } from '../shared/prefs.js';

declare const __APP_VERSION__: string;

const PREFS_KEY = 'voicechat-prefs';

function readPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return migratePrefs(raw ? (JSON.parse(raw) as Partial<Prefs>) : {});
  } catch {
    // Битый JSON или localStorage недоступен (приватный режим) — дефолты.
    return migratePrefs({});
  }
}

function writePrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* квота / приватный режим — префы проживут до перезагрузки */
  }
}

// Разрешение на уведомления браузеры дают только по жесту пользователя
// (Firefox/Safari), а показывать системный запрос в момент, когда пришло
// сообщение и юзер смотрит в другое окно, бессмысленно. Поэтому спрашиваем
// один раз на первом клике по странице.
if ('Notification' in window && Notification.permission === 'default') {
  window.addEventListener(
    'pointerdown',
    () => void Notification.requestPermission().catch(() => undefined),
    { once: true },
  );
}

const api: Api = {
  getPrefs: async () => readPrefs(),
  setPrefs: async (patch) => {
    const next = migratePrefs({ ...readPrefs(), ...patch });
    writePrefs(next);
    return next;
  },
  getAppVersion: async () => __APP_VERSION__,
  downloadFile: async ({ url, suggestedName }) => {
    try {
      // <a download> игнорирует атрибут для cross-origin URL и просто открывает
      // файл во вкладке — поэтому сначала тянем blob.
      const res = await fetch(url);
      if (!res.ok) return { kind: 'error', message: `HTTP ${res.status}` };
      const blobUrl = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = suggestedName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
      return { kind: 'saved', path: suggestedName };
    } catch (e) {
      return { kind: 'error', message: (e as Error).message };
    }
  },
  notify: async ({ title, body }) => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const n = new Notification(title, { body, tag: 'voicechat-message' });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  },
};

window.api = api;
