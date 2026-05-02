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
