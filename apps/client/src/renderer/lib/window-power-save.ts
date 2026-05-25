// Гасит тяжёлые always-on эффекты (halo-blur, backdrop-filter, speaking-pulse)
// когда окно не в фокусе, и плюсом стопает все CSS-анимации, когда окно
// реально скрыто в трей.
//
// Зачем: diag-замеры (perf-diag.ts) показали, что Tauri 2 + WebView2 на Windows
// после window.hide() НЕ тротлят rendering — document.visibilityState остаётся
// 'visible', requestAnimationFrame идёт на 120Hz, CSS-анимации тикают на 120Hz.
// Поэтому свёрнутое в трей приложение продолжает жечь GPU/CPU как активное.
// Workaround — самим тротлить через class на <body>:
//   - .vo-bg     ставится на window.blur (alt-tab в другое окно или игру)
//   - .vo-hidden ставится дополнительно при window:visibility false из Rust
//     (только когда окно реально hide()'нуто в трей)
// CSS-правила см. в index.css (блок «Velvet Onyx power-save»).

const BG = 'vo-bg';
const HIDDEN = 'vo-hidden';

const init = (): void => {
  // === DOM-уровень: blur/focus = окно потеряло/получило системный фокус. ===
  // Этого достаточно для alt-tab сценария (окно физически видимо, но не активно).
  window.addEventListener('blur', () => {
    document.body.classList.add(BG);
  });
  window.addEventListener('focus', () => {
    // focus снимает оба класса: если юзер кликнул из трея — окно сначала
    // покажется (Rust эмитнет visibility:true → снимется vo-hidden), затем
    // приедет focus → снимется vo-bg. Если оба класса вдруг "застряли" по
    // какой-то причине, focus вычистит всё.
    document.body.classList.remove(BG);
    document.body.classList.remove(HIDDEN);
  });

  // Fallback: на случай если когда-нибудь WebView2 всё-таки начнёт корректно
  // тротлить hidden-окна, мы поймаем это и тоже выключим эффекты.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      document.body.classList.add(BG);
      document.body.classList.add(HIDDEN);
    } else {
      document.body.classList.remove(HIDDEN);
      // BG снимется через focus-event (он прилетит чуть позже).
    }
  });

  // Начальное состояние — если приложение стартовало без фокуса (запуск из
  // трея?), сразу применим vo-bg, чтобы первые секунды не молотить GPU.
  if (!document.hasFocus()) {
    document.body.classList.add(BG);
  }

  // === Tauri-уровень: явный visibility-сигнал из Rust ===
  // Чистый источник истины для «окно реально hide()'нуто в трей». Эмитится из
  // lib.rs (CloseRequested → перед hide) и tray.rs (show_main_window → после show).
  const isTauri = '__TAURI_INTERNALS__' in window;
  if (!isTauri) return;

  void (async (): Promise<void> => {
    try {
      const { listen } = await import('@tauri-apps/api/event');
      await listen<boolean>('window:visibility', (e) => {
        if (e.payload) {
          // Окно показано (клик в трее). vo-bg снимется через focus-event,
          // который прилетит после set_focus().
          document.body.classList.remove(HIDDEN);
        } else {
          // Окно сейчас будет скрыто. Ставим оба класса синхронно, чтобы
          // следующий же кадр composition'а уже не имел тяжёлых слоёв.
          document.body.classList.add(BG);
          document.body.classList.add(HIDDEN);
        }
      });
    } catch {
      // Если Tauri API не загрузился — DOM-events продолжают работать,
      // просто не будет дополнительного vo-hidden при hide-to-tray.
    }
  })();
};

// body может быть ещё не доступен в момент выполнения этого модуля при
// некоторых конфигурациях (test-env, очень ранний инлайн-скрипт) — защитимся.
if (document.body) init();
else document.addEventListener('DOMContentLoaded', init, { once: true });
