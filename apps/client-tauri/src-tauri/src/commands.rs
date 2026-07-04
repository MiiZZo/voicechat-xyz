//! Tauri commands — точки входа для preload-shim'а из renderer'а.
//! Имена команд (snake_case) сопоставлены с строками в src/preload-shim.ts.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

use crate::{prefs, screen_share, updater};

// === prefs ===================================================================

#[tauri::command]
pub async fn prefs_get(app: AppHandle) -> Result<Value, String> {
    prefs::get_prefs(&app)
}

#[tauri::command]
pub async fn prefs_set(app: AppHandle, patch: Value) -> Result<Value, String> {
    prefs::set_prefs(&app, patch)
}

// === screen sources ==========================================================

#[tauri::command]
pub async fn screen_get_sources() -> Vec<screen_share::ScreenSource> {
    // См. screen_share.rs — в текущем релизе возвращаем пусто.
    screen_share::list_sources()
}

#[tauri::command]
pub fn screen_share_respond(payload: screen_share::ScreenShareResponse) {
    // No-op: кастомный picker отключён, см. screen_share.rs. Если когда-то
    // включим — здесь будет канал в нативный capturer.
    let _ = payload;
}

// === update ==================================================================

#[tauri::command]
pub async fn update_check(app: AppHandle) -> Result<(), String> {
    updater::check_and_download(app).await
}

#[tauri::command]
pub async fn update_install(app: AppHandle) -> Result<(), String> {
    updater::install_pending(app).await
}

/// Handshake от splash.tsx: подписка на update:status уже сделана, можно
/// эмитить статусы. Снимает race condition между Rust'овым Checking и
/// JS-listener'ом. См. updater::UpdaterState::splash_ready.
#[tauri::command]
pub async fn splash_ready(state: tauri::State<'_, updater::UpdaterState>) -> Result<(), String> {
    state.splash_ready.notify_one();
    Ok(())
}

// === file download ===========================================================

#[derive(Deserialize)]
pub struct FileDownloadRequest {
    pub url: String,
    #[serde(rename = "suggestedName")]
    pub suggested_name: String,
}

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum FileDownloadResult {
    Saved { path: String },
    Canceled,
    Error { message: String },
}

#[tauri::command]
pub async fn file_download(
    app: AppHandle,
    req: FileDownloadRequest,
) -> FileDownloadResult {
    // Вычисляем расширение для фильтра save dialog'а.
    let ext = std::path::Path::new(&req.suggested_name)
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_lowercase());

    let downloads = app
        .path()
        .download_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    let default_path = downloads.join(&req.suggested_name);

    // Tauri 2 dialog API асинхронный с callback'ом. Оборачиваем в oneshot.
    let (tx, rx) = tokio::sync::oneshot::channel::<Option<PathBuf>>();
    let mut builder = app.dialog().file().set_file_name(&req.suggested_name);
    if let Some(parent) = default_path.parent() {
        builder = builder.set_directory(parent);
    }
    if let Some(ref e) = ext {
        builder = builder.add_filter(e.to_uppercase(), &[e.as_str()]);
    }

    builder.save_file(move |maybe_path| {
        // FilePath -> PathBuf. В Tauri 2 это обёртка над URI или путём.
        let path_opt = maybe_path.and_then(|p| p.into_path().ok());
        let _ = tx.send(path_opt);
    });

    let dest = match rx.await {
        Ok(Some(p)) => p,
        Ok(None) => return FileDownloadResult::Canceled,
        Err(_) => {
            return FileDownloadResult::Error {
                message: "dialog channel закрыт".into(),
            }
        }
    };

    match stream_to_file(&req.url, &dest).await {
        Ok(()) => FileDownloadResult::Saved {
            path: dest.to_string_lossy().to_string(),
        },
        Err(e) => FileDownloadResult::Error { message: e },
    }
}

// === tray ====================================================================

#[tauri::command]
pub fn set_tray_mic_muted(app: AppHandle, muted: bool) -> Result<(), String> {
    crate::tray::set_mic_muted(&app, muted)
}

/// Windows-only: overlay-бэйдж на иконке приложения в панели задач.
/// На остальных платформах команда — no-op, чтобы фронт не разбирался какая ОС.
#[tauri::command]
pub fn set_taskbar_overlay_muted(app: AppHandle, muted: bool) -> Result<(), String> {
    crate::tray::set_taskbar_overlay_muted(&app, muted)
}

/// Показать/восстановить main-окно. Единый путь для клика по уведомлению и
/// пункта "Открыть" в tray-menu. Критично идти через Rust, а не через JS
/// `window.show()`: только здесь дёргается парный `SetIsVisible(true)` к
/// hide-time'овскому `SetIsVisible(false)` (см. lib.rs CloseRequested).
/// Без него WebView2-контроллер остаётся невидимым и окно восстанавливается
/// с пустым (не перерисованным) фоном. Плюс эмитит window:visibility=true,
/// снимая vo-hidden/power-save класс.
#[tauri::command]
pub fn window_show_main(app: AppHandle) {
    crate::tray::show_main_window(&app);
}

/// Полный выход из приложения. Вызывается из кастомного tray-menu (пункт
/// "Выйти"). Перед app.exit ставит quitting=true, иначе close-requested
/// handler примет это за обычное закрытие main-окна и спрячет его в трей.
#[tauri::command]
pub fn app_quit(app: AppHandle) {
    use std::sync::atomic::Ordering;
    app.state::<crate::AppState>()
        .quitting
        .store(true, Ordering::SeqCst);
    app.exit(0);
}

// === open external URL =======================================================

#[tauri::command]
pub fn open_external(url: String) -> Result<(), String> {
    // Whitelist схем — открывать произвольные URI (file://, javascript:, и т.д.)
    // из renderer'а небезопасно. Принимаем только http/https.
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err(format!("scheme not allowed: {}", url));
    }
    open::that(&url).map_err(|e| e.to_string())
}

async fn stream_to_file(url: &str, dest: &std::path::Path) -> Result<(), String> {
    use futures_util::StreamExt;
    use tokio::io::AsyncWriteExt;

    let resp = reqwest::get(url).await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status().as_u16()));
    }

    let mut file = tokio::fs::File::create(dest)
        .await
        .map_err(|e| e.to_string())?;
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        file.write_all(&chunk).await.map_err(|e| e.to_string())?;
    }
    file.flush().await.map_err(|e| e.to_string())?;
    Ok(())
}
