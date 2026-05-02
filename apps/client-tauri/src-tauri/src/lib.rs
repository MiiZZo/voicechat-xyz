//! Точка входа Tauri-приложения. Регистрирует плагины, команды и слушатели
//! window-событий, отвечающие за hide-to-tray и эмит maximized-changed.

mod commands;
mod prefs;
mod screen_share;
mod tray;
mod updater;

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, Manager, WindowEvent};

/// Глобальное состояние процесса. Tauri требует Send + Sync.
pub struct AppState {
    /// Поднимается, когда пользователь явно запросил выход (tray quit или Cmd+Q).
    /// При close-requested окно прячется в трей только если этот флаг false.
    pub quitting: AtomicBool,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .try_init()
        .ok();

    tauri::Builder::default()
        .manage(AppState {
            quitting: AtomicBool::new(false),
        })
        .manage(updater::UpdaterState::default())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::prefs_get,
            commands::prefs_set,
            commands::screen_get_sources,
            commands::screen_share_respond,
            commands::update_check,
            commands::update_install,
            commands::file_download,
        ])
        .setup(|app| {
            tray::setup(app.handle())?;
            // В dev-сборке updater не нужен и только спамит ошибки в лог
            // (latest-tauri.json пока не опубликован). Запускаем только в release.
            #[cfg(not(debug_assertions))]
            updater::schedule(app.handle().clone());
            // В dev-сборке сразу открываем DevTools — нужно для разбора WebRTC-stats.
            #[cfg(debug_assertions)]
            if let Some(win) = app.get_webview_window("main") {
                win.open_devtools();
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                let state = app.state::<AppState>();
                let quitting = state.quitting.load(Ordering::SeqCst);
                if quitting {
                    return; // нормальный выход — не вмешиваемся
                }

                // Читаем prefs.closeToTray. Если ошибка — fallback на нормальное закрытие.
                let close_to_tray = prefs::get_prefs(app)
                    .ok()
                    .and_then(|v| v.get("closeToTray").and_then(|b| b.as_bool()))
                    .unwrap_or(true);

                if close_to_tray {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("ошибка при запуске Tauri-приложения");
}

/// Утилита: эмитим resize-эвент, чтобы preload-shim мог собрать maximized-changed.
/// (Сам shim слушает Window::onResized — это уже встроено, но оставляем хук
/// на случай, если потом понадобится явный канал.)
#[allow(dead_code)]
fn emit_maximized_changed(app: &tauri::AppHandle, value: bool) {
    let _ = app.emit("window:maximized-changed", value);
}
