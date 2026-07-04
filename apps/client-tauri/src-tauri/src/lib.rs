//! Точка входа Tauri-приложения. Регистрирует плагины, команды и слушатели
//! window-событий, отвечающие за hide-to-tray и эмит maximized-changed.

mod commands;
mod prefs;
mod screen_share;
mod tray;
mod updater;

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{image::Image, Emitter, Manager, WindowEvent};

// 256×256 PNG для runtime window-icon. Tauri 2 имеет баг (#14596): при
// загрузке из ICO он использует только entries[0] и игнорирует остальные
// размеры. Если первым лежит 16×16, Windows вынужден апскейлить на все DPI
// — отсюда мыло в таскбаре. Поэтому подаём ему single-size PNG в 256×256:
// Windows downscale'ит HighQualityBicubic'ом до нужного размера на любом DPI.
// (icon.ico остаётся для bundle-time embedding в .exe — там shell Windows
// читает все entries корректно для Explorer / Start menu.)
const WINDOW_ICON: &[u8] = include_bytes!("../icons/128x128@2x.png");

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
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::prefs_get,
            commands::prefs_set,
            commands::screen_get_sources,
            commands::screen_share_respond,
            commands::update_check,
            commands::update_install,
            commands::splash_ready,
            commands::file_download,
            commands::open_external,
            commands::set_tray_mic_muted,
            commands::set_taskbar_overlay_muted,
            commands::window_show_main,
            commands::app_quit,
        ])
        .setup(|app| {
            tray::setup(app.handle())?;
            // Явно подменяем window icon с одиночным PNG 256×256 — обходит
            // Tauri-баг #14596 (HICON строится из первого entry ICO,
            // 16×16 апскейлится на все DPI = мыло). См. WINDOW_ICON const.
            if let Some(win) = app.get_webview_window("main") {
                if let Ok(icon) = Image::from_bytes(WINDOW_ICON) {
                    if let Err(e) = win.set_icon(icon) {
                        log::warn!("[icon] set_icon failed: {e}");
                    }
                }
            }
            // tauri.conf.json теперь declarative прячет main (visible: false) —
            // без этого Windows успевает показать пустое окно за 100-300 мс
            // до того, как run_startup_blocking спрячет его императивно. Поэтому
            // каждая ветка, в которой apдейтер пропускается, обязана явно
            // показать main.
            if std::env::var("VOICECHAT_SKIP_UPDATE").is_ok() {
                // Kill-switch: пропускаем splash + startup-check полностью,
                // оставляем только часовой banner-flow. Работает и в dev, и в release.
                log::info!("[updater] VOICECHAT_SKIP_UPDATE set — пропускаем startup flow");
                if let Some(m) = app.handle().get_webview_window("main") {
                    let _ = m.show();
                    #[cfg(debug_assertions)]
                    {
                        let _ = m.open_devtools();
                    }
                }
                updater::schedule_background_checks(app.handle().clone());
            } else {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(updater::run_startup_blocking(handle));
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            match event {
                WindowEvent::CloseRequested { api, .. } => {
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
                        // Источник истины для window-power-save.ts: WebView2 на
                        // Windows не пробрасывает visibility-change при hide(),
                        // поэтому говорим фронту явно. Эмитим ДО hide() — frontend
                        // успеет применить vo-hidden класс.
                        let _ = app.emit("window:visibility", false);
                        // Ключевой фикс: дергаем нативный WebView2 API, чтобы
                        // Chromium внутри затротлил rAF/setInterval/CSS-анимации
                        // как обычный hidden tab. window.hide() этого НЕ делает
                        // (не пробрасывает visibility-change в WebView2 controller),
                        // отсюда наш баг с 120Hz composition в скрытом окне.
                        // Audio/WebRTC продолжают работать — Chromium это media
                        // не паузит.
                        // on_window_event даёт &Window, а with_webview есть только
                        // на WebviewWindow — поднимаемся через app по label'у.
                        #[cfg(target_os = "windows")]
                        {
                            if let Some(wv) = app.get_webview_window(window.label()) {
                                let _ = wv.with_webview(|webview| unsafe {
                                    let _ = webview.controller().SetIsVisible(false.into());
                                });
                            }
                        }
                        api.prevent_close();
                        let _ = window.hide();
                    }
                }
                _ => {}
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
