//! Auto-update. Аналог apps/client/src/main/updater.ts.
//!
//! Стратегия фида: tauri-plugin-updater использует **отдельный** endpoint
//! `latest-tauri.json` рядом с `latest.yml` от electron-updater. Так мы не
//! ломаем существующий релиз-канал Electron-клиента: оба workflow'а пушат
//! артефакты в одни и те же GitHub Releases, но читают разные файлы манифеста.
//!
//! Двухступенчатая логика "доступно → скачано → установить по кнопке":
//! tauri-plugin-updater устроен так, что `Update::download` потребляет `self`,
//! и держать готовый `Update` между скачкой и инсталляцией нельзя без unsafe.
//! Поэтому Electron-flow эмулируется так:
//!   1) check_and_download() делает check + download (но не install) — после
//!      этого эмитим Ready, как в Electron-версии.
//!   2) install_pending() заново вызывает check + download_and_install в один
//!      присест и перезапускает приложение. Лишнее скачивание байт — да, но
//!      tauri-plugin-updater умеет переиспользовать кэш на диске, так что
//!      второй проход обычно мгновенный.
//!
//! Статусы: idle/checking/available/downloading/ready/error — те же варианты,
//! что в shared/types.ts UpdateStatus. Эмитим event "update:status" в окно.

use serde::Serialize;
use std::sync::{atomic::AtomicU64, Arc};
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::UpdaterExt;

const STATUS_EVENT: &str = "update:status";

#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
enum UpdateStatus {
    Idle,
    Checking,
    Available { version: String },
    Downloading { percent: u32 },
    Ready { version: String },
    Error { message: String },
}

/// Заглушка состояния — оставлена на случай будущего хранения "ready" между
/// chunk'ами скачивания. Сейчас не используется, но включена в Builder.manage,
/// чтобы команды могли резервировать её без правки сигнатур.
#[derive(Default)]
pub struct UpdaterState {
    /// Версия последнего успешно скачанного апдейта (для UI Ready -> Install).
    pub last_ready_version: tokio::sync::Mutex<Option<String>>,
}

fn emit(app: &AppHandle, status: UpdateStatus) {
    if let Err(err) = app.emit(STATUS_EVENT, &status) {
        log::warn!("[updater] не удалось эмитить статус: {err}");
    }
}

/// Один полный цикл check + download. Вызывается на старте, по таймеру и
/// руками через команду update_check.
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
            emit(&app, UpdateStatus::Error { message: e.to_string() });
            return Err(e.to_string());
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
            // Бинарь скачан и сохранён tauri-plugin-updater в его кэше; install_pending
            // переиспользует его при следующем check().
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

/// Зеркало setupAutoUpdate из updater.ts: первый чек сразу, потом раз в час.
pub fn schedule(app: AppHandle) {
    let app_first = app.clone();
    tauri::async_runtime::spawn(async move {
        let _ = check_and_download(app_first).await;
    });

    let app_loop = app;
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(60 * 60));
        // первый tick срабатывает сразу — пропускаем, выше уже сделали проверку.
        interval.tick().await;
        loop {
            interval.tick().await;
            let _ = check_and_download(app_loop.clone()).await;
        }
    });
}
