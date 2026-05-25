//! Auto-update. Аналог apps/client/src/main/updater.ts.
//!
//! Стратегия фида: tauri-plugin-updater читает `latest.json` (формат tauri-action),
//! electron-updater — `latest.yml` / `latest-mac.yml` / `latest-linux.yml`. Имена
//! не пересекаются, поэтому оба workflow'а могут публиковать артефакты в одни и
//! те же GitHub Releases, не мешая друг другу.
//!
//! Две разные точки входа:
//!   - run_startup_blocking — Discord-style блокирующий flow на старте. Открывает
//!     splash, ждёт handshake от его JS (Notify), делает check + download_and_install
//!     одним проходом и app.restart(). На failure path (Idle / Error / Timeout) —
//!     закрывает splash, показывает main, спавнит schedule_background_checks().
//!   - schedule_background_checks — часовой цикл с двухступенчатой UX через
//!     UpdateBanner: check_and_download (без install) → ready → юзер жмёт
//!     "Установить" → install_pending.
//!
//! Двухступенчатая логика "доступно → скачано → установить по кнопке" в фоне:
//! tauri-plugin-updater устроен так, что `Update::download` потребляет `self`,
//! и держать готовый `Update` между скачкой и инсталляцией нельзя без unsafe.
//! Поэтому:
//!   1) check_and_download() делает check + download (но не install) — после
//!      этого эмитим Ready, как в Electron-версии.
//!   2) install_pending() заново вызывает check + download_and_install в один
//!      присест и перезапускает приложение. Лишнее скачивание байт — да, но
//!      tauri-plugin-updater умеет переиспользовать кэш на диске, так что
//!      второй проход обычно мгновенный.
//!
//! Статусы: idle/checking/available/downloading/installing/ready/error.
//! `installing` эмитит только run_startup_blocking (нет паузы между download
//! и install), `ready` — только check_and_download (банннер с кнопкой).
//! Эмитим event "update:status" в окно.

use serde::Serialize;
use std::sync::{atomic::AtomicU64, Arc};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::UpdaterExt;
use tokio::sync::Notify;

const STATUS_EVENT: &str = "update:status";
/// Максимум, сколько ждём, пока splash.tsx подпишется на update:status и
/// дёрнет splash_ready. Если за это время handshake не пришёл — считаем, что
/// splash-бандл сломан, закрываем его и пускаем юзера в main без апдейта.
const SPLASH_HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(5);
/// Бюджет на сам updater.check(). Сетевая дыра / висящий endpoint не должны
/// удерживать юзера на splash больше этого времени. На сам download таймаута
/// нет — большой пакет на медленном инете — это всё ещё прогресс.
const CHECK_TIMEOUT: Duration = Duration::from_secs(20);
/// Сколько держим splash после "обновлений нет", чтобы юзер успел заметить
/// фейд-аут и не казалось, что окно дёрнулось.
const NO_UPDATE_HOLD: Duration = Duration::from_millis(300);
/// Сколько держим splash после ошибки (сеть/таймаут/download/install fail) —
/// чтобы юзер прочитал сообщение, прежде чем main всплывёт.
const ERROR_HOLD: Duration = Duration::from_millis(1500);

#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
enum UpdateStatus {
    Idle,
    Checking,
    Available { version: String },
    Downloading { percent: u32 },
    Installing { version: String },
    Ready { version: String },
    Error { message: String },
}

/// Общий для двух flow state.
/// - last_ready_version: версия последнего скачанного апдейта (Ready),
///   используется banner-flow.
/// - splash_ready: оповещение от splash_ready команды. Splash подписывается
///   на update:status и только затем дёргает splash_ready — это снимает
///   race condition, когда первый Checking уходит раньше, чем JS успел
///   повесить listener. Notify::notify_one буферизует один permit, так что
///   даже если splash дёрнет команду до того, как Rust начнёт ждать,
///   следующий .notified().await резолвится мгновенно.
#[derive(Default)]
pub struct UpdaterState {
    pub last_ready_version: tokio::sync::Mutex<Option<String>>,
    pub splash_ready: Notify,
    /// Момент splash.show() — для минимального времени на экране (dev / VOICECHAT_SPLASH_HOLD_SEC).
    pub splash_shown_at: tokio::sync::Mutex<Option<Instant>>,
}

/// Минимум, сколько splash остаётся видимым перед закрытием.
/// VOICECHAT_SPLASH_HOLD_SEC перебивает всё; в debug по умолчанию 40 с для разглядывания UI.
fn min_splash_visible() -> Duration {
    if let Ok(raw) = std::env::var("VOICECHAT_SPLASH_HOLD_SEC") {
        if let Ok(secs) = raw.parse::<u64>() {
            return Duration::from_secs(secs);
        }
    }
    #[cfg(debug_assertions)]
    {
        return Duration::from_secs(40);
    }
    #[cfg(not(debug_assertions))]
    {
        Duration::ZERO
    }
}

async fn hold_splash_before_close(app: &AppHandle, status_hold: Duration) {
    let min_visible = min_splash_visible();
    let target = min_visible.max(status_hold);
    let state = app.state::<UpdaterState>();
    let shown_at = *state.splash_shown_at.lock().await;
    if let Some(at) = shown_at {
        let elapsed = at.elapsed();
        if elapsed < target {
            tokio::time::sleep(target - elapsed).await;
        }
    } else if target > Duration::ZERO {
        tokio::time::sleep(target).await;
    }
}

async fn finish_splash(app: &AppHandle, status_hold: Duration) {
    hold_splash_before_close(app, status_hold).await;
    close_splash_and_show_main(app);
}

fn emit(app: &AppHandle, status: UpdateStatus) {
    if let Err(err) = app.emit(STATUS_EVENT, &status) {
        log::warn!("[updater] не удалось эмитить статус: {err}");
    }
}

/// Закрывает splash и показывает main. Идемпотентно: повторные вызовы
/// безопасны (close/show на уже закрытом/показанном окне — Err, который
/// мы глотаем). Вызывается на каждом non-restart терминале startup flow,
/// а также из safety-valve путей (handshake timeout, broken splash).
fn close_splash_and_show_main(app: &AppHandle) {
    if let Some(s) = app.get_webview_window("splash") {
        let _ = s.close();
    }
    if let Some(m) = app.get_webview_window("main") {
        let _ = m.show();
        let _ = m.set_focus();
        #[cfg(debug_assertions)]
        {
            m.open_devtools();
        }
    }
}

/// Один полный цикл check + download для banner-flow. Вызывается из
/// schedule_background_checks по таймеру и руками через команду update_check.
/// Сетевую ошибку маппит в Idle (consistent with Electron-клиентом, чтобы
/// баннер не мерцал "ошибкой" на каждом обрыве WiFi).
pub async fn check_and_download(app: AppHandle) -> Result<(), String> {
    emit(&app, UpdateStatus::Checking);

    let updater = match app.updater() {
        Ok(u) => u,
        Err(e) => {
            log::info!("[updater] недоступен: {e}");
            emit(&app, UpdateStatus::Idle);
            return Ok(());
        }
    };

    let maybe_update = match updater.check().await {
        Ok(u) => u,
        Err(e) => {
            log::info!("[updater] check вернул ошибку, считаем как Idle: {e}");
            emit(&app, UpdateStatus::Idle);
            return Ok(());
        }
    };

    let Some(update) = maybe_update else {
        emit(&app, UpdateStatus::Idle);
        return Ok(());
    };

    let version = update.version.clone();
    emit(&app, UpdateStatus::Available { version: version.clone() });

    let downloaded = Arc::new(AtomicU64::new(0));
    let total = Arc::new(AtomicU64::new(0));
    let app_for_progress = app.clone();
    let downloaded_cloned = downloaded.clone();
    let total_cloned = total.clone();

    // download() съедает self; отдельный download_and_install нам не подходит,
    // так как он сразу же ставит и просит restart. Здесь мы только тащим байты,
    // оставляя пользователю шанс нажать "Установить" в UpdateBanner.
    let result = update
        .download(
            move |chunk_len, content_length| {
                if let Some(len) = content_length {
                    total_cloned.compare_exchange(
                        0,
                        len,
                        std::sync::atomic::Ordering::SeqCst,
                        std::sync::atomic::Ordering::SeqCst,
                    ).ok();
                }
                let acc = downloaded_cloned
                    .fetch_add(chunk_len as u64, std::sync::atomic::Ordering::SeqCst)
                    + chunk_len as u64;
                let total_known = total_cloned.load(std::sync::atomic::Ordering::SeqCst);
                let percent = if total_known > 0 {
                    ((acc as f64 / total_known as f64) * 100.0).round() as u32
                } else {
                    0
                };
                emit(&app_for_progress, UpdateStatus::Downloading { percent });
            },
            || {},
        )
        .await;

    match result {
        Ok(_bytes) => {
            let state: tauri::State<UpdaterState> = app.state::<UpdaterState>();
            *state.last_ready_version.lock().await = Some(version.clone());
            emit(&app, UpdateStatus::Ready { version });
            Ok(())
        }
        Err(e) => {
            emit(&app, UpdateStatus::Error { message: e.to_string() });
            Err(e.to_string())
        }
    }
}

/// Установить скачанный апдейт. Под капотом: повторно check + download_and_install.
/// download_and_install переиспользует кэш, поэтому сетевая нагрузка минимальна.
pub async fn install_pending(app: AppHandle) -> Result<(), String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    let update = updater
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "нет доступного обновления".to_string())?;

    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|e| e.to_string())?;

    // Перезапуск процесса для применения update. AppHandle::restart()
    // имеет тип `!` (никогда не возвращает) — control flow обрывается здесь.
    app.restart();
}

/// Discord-style блокирующий startup flow. Вызывается из lib.rs setup
/// (если не задан VOICECHAT_SKIP_UPDATE). Главный инвариант:
/// либо app.restart() (новая версия запускается), либо main.show() (старая
/// версия используется). Никакого состояния "splash открыт, main скрыт"
/// после возврата быть не может.
pub async fn run_startup_blocking(app: AppHandle) {
    // 1) Показываем splash. Конфиг declarative делает его visible: false,
    // поэтому в dev/skip пути окно не появится — show() зовётся только тут.
    let Some(splash) = app.get_webview_window("splash") else {
        log::warn!("[updater] splash window не найден — fallback на main");
        close_splash_and_show_main(&app);
        schedule_background_checks(app.clone());
        return;
    };
    if let Err(e) = splash.show() {
        log::warn!("[updater] splash.show() failed: {e} — fallback на main");
        close_splash_and_show_main(&app);
        schedule_background_checks(app.clone());
        return;
    }
    {
        let state = app.state::<UpdaterState>();
        *state.splash_shown_at.lock().await = Some(Instant::now());
    }

    // 2) Handshake. Splash подписался на update:status и затем дёргает
    // splash_ready. Если за SPLASH_HANDSHAKE_TIMEOUT не дёрнул — JS, скорее
    // всего, упал на загрузке, и нет смысла ждать. Закрываем, пускаем юзера.
    let state = app.state::<UpdaterState>();
    let handshake = tokio::time::timeout(
        SPLASH_HANDSHAKE_TIMEOUT,
        state.splash_ready.notified(),
    )
    .await;
    if handshake.is_err() {
        log::warn!(
            "[updater] splash handshake timeout ({}s) — splash bundle сломан?",
            SPLASH_HANDSHAKE_TIMEOUT.as_secs()
        );
        finish_splash(&app, Duration::ZERO).await;
        schedule_background_checks(app.clone());
        return;
    }

    // 3) Checking. С этой точки splash гарантированно получает события.
    emit(&app, UpdateStatus::Checking);

    let updater = match app.updater() {
        Ok(u) => u,
        Err(e) => {
            log::info!("[updater] недоступен на старте: {e}");
            emit(&app, UpdateStatus::Error { message: e.to_string() });
            finish_splash(&app, ERROR_HOLD).await;
            schedule_background_checks(app.clone());
            return;
        }
    };

    // 4) check с таймаутом. На startup отличаем "обновлений нет" (Idle) от
    // "не удалось проверить" (Error) — splash показывает разные тексты.
    // В отличие от check_and_download (banner-flow), где ошибка маппится
    // в Idle, чтобы баннер не мерцал.
    let check_result = tokio::time::timeout(CHECK_TIMEOUT, updater.check()).await;

    let maybe_update = match check_result {
        Err(_) => {
            log::info!("[updater] check timeout {}s — fallback", CHECK_TIMEOUT.as_secs());
            emit(&app, UpdateStatus::Error {
                message: format!("timeout {}s", CHECK_TIMEOUT.as_secs()),
            });
            finish_splash(&app, ERROR_HOLD).await;
            schedule_background_checks(app.clone());
            return;
        }
        Ok(Err(e)) => {
            log::info!("[updater] check failed на старте: {e}");
            emit(&app, UpdateStatus::Error { message: e.to_string() });
            finish_splash(&app, ERROR_HOLD).await;
            schedule_background_checks(app.clone());
            return;
        }
        Ok(Ok(u)) => u,
    };

    let Some(update) = maybe_update else {
        emit(&app, UpdateStatus::Idle);
        finish_splash(&app, NO_UPDATE_HOLD).await;
        schedule_background_checks(app.clone());
        return;
    };

    // 5) Update найден — качаем + ставим одним проходом, потом restart.
    let version = update.version.clone();
    emit(&app, UpdateStatus::Available { version: version.clone() });

    let downloaded = Arc::new(AtomicU64::new(0));
    let total = Arc::new(AtomicU64::new(0));
    let app_for_download = app.clone();
    let app_for_finish = app.clone();
    let downloaded_cloned = downloaded.clone();
    let total_cloned = total.clone();
    let version_for_finish = version.clone();

    let install_result = update
        .download_and_install(
            move |chunk_len, content_length| {
                if let Some(len) = content_length {
                    total_cloned.compare_exchange(
                        0,
                        len,
                        std::sync::atomic::Ordering::SeqCst,
                        std::sync::atomic::Ordering::SeqCst,
                    ).ok();
                }
                let acc = downloaded_cloned
                    .fetch_add(chunk_len as u64, std::sync::atomic::Ordering::SeqCst)
                    + chunk_len as u64;
                let total_known = total_cloned.load(std::sync::atomic::Ordering::SeqCst);
                let percent = if total_known > 0 {
                    ((acc as f64 / total_known as f64) * 100.0).round() as u32
                } else {
                    0
                };
                emit(&app_for_download, UpdateStatus::Downloading { percent });
            },
            move || {
                // download закончен — переключаем splash на "Установка…".
                // Сам install (распаковка / запись бинаря) у tauri-plugin-updater
                // не имеет прогресса, отсюда статус без percent.
                emit(
                    &app_for_finish,
                    UpdateStatus::Installing { version: version_for_finish.clone() },
                );
            },
        )
        .await;

    match install_result {
        Ok(()) => {
            // restart возвращает `!` — control flow обрывается, новый процесс
            // стартует с нуля и снова пройдёт через run_startup_blocking
            // (где check вернёт None, splash моргнёт и закроется).
            app.restart();
        }
        Err(e) => {
            log::warn!("[updater] download_and_install failed: {e}");
            emit(&app, UpdateStatus::Error { message: e.to_string() });
            finish_splash(&app, ERROR_HOLD).await;
            schedule_background_checks(app);
        }
    }
}

/// Часовой background-loop. Раньше назывался schedule() и делал первый чек
/// немедленно — теперь immediate-чек делает run_startup_blocking, а тут только
/// циклический heartbeat. Banner-flow в UpdateBanner.tsx не меняется.
pub fn schedule_background_checks(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(60 * 60));
        // Первый tick срабатывает сразу — пропускаем, иначе банннер мигнёт
        // вторым чеком сразу после startup. Реальный фоновый чек случится
        // через час после старта.
        interval.tick().await;
        loop {
            interval.tick().await;
            let _ = check_and_download(app.clone()).await;
        }
    });
}
