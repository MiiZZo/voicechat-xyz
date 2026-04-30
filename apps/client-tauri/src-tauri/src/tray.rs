//! System tray. Зеркало apps/client/src/main/tray.ts:
//! пункты «Открыть VoiceChat» / «Выйти», клик/двойной клик показывают окно.
//!
//! На macOS трей не создаём — для парности с Electron-версией, где tray всегда
//! создавался, но в задаче явно сказано «на macOS вместо tray — стандартное
//! поведение dock». Ничего не делаем, dock работает сам.

use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    #[cfg(target_os = "macos")]
    {
        let _ = app;
        return Ok(());
    }

    #[cfg(not(target_os = "macos"))]
    {
        let open = MenuItemBuilder::with_id("open", "Открыть VoiceChat").build(app)?;
        let quit = MenuItemBuilder::with_id("quit", "Выйти").build(app)?;
        let menu = MenuBuilder::new(app).items(&[&open, &quit]).build()?;

        // default_window_icon берётся из tauri.conf.json bundle.icon —
        // он гарантированно есть (без него tauri::generate_context! падает),
        // но возвращается Option<&Image>, поэтому страхуемся на случай отсутствия.
        let Some(icon) = app.default_window_icon().cloned() else {
            log::warn!("[tray] default_window_icon отсутствует, трей не создан");
            return Ok(());
        };

        let _tray = TrayIconBuilder::with_id("main")
            .tooltip("VoiceChat")
            .icon(icon)
            .menu(&menu)
            .on_menu_event(|app, event| match event.id().as_ref() {
                "open" => show_main_window(app),
                "quit" => {
                    // before_close-handler не должен прятать в трей, когда мы
                    // явно выходим: ставим флаг "разрешён реальный выход".
                    app.state::<crate::AppState>()
                        .quitting
                        .store(true, std::sync::atomic::Ordering::SeqCst);
                    app.exit(0);
                }
                _ => {}
            })
            .on_tray_icon_event(|tray, event| {
                if let TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } = event
                {
                    show_main_window(tray.app_handle());
                }
            })
            .build(app)?;

        Ok(())
    }
}

fn show_main_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
    }
}
