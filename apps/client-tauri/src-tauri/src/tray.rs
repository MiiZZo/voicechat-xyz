//! System tray. Зеркало apps/client/src/main/tray.ts:
//! пункты «Открыть VoiceChat» / «Выйти», клик/двойной клик показывают окно.
//!
//! На macOS трей не создаём — для парности с Electron-версией, где tray всегда
//! создавался, но в задаче явно сказано «на macOS вместо tray — стандартное
//! поведение dock». Ничего не делаем, dock работает сам.

use tauri::{
    image::Image,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, PhysicalPosition,
};

// Embedded tray icons — обе варианты PNG включены в бинарник на этапе
// компиляции. Это избавляет от рантайм-чтения файлов и от рассинхрона между
// src-tauri/icons/ и bundled resources (Tauri bundle их не копирует автоматом).
// Image::from_bytes декодирует PNG — нужно tauri feature 'image-png'.
const TRAY_ICON_DEFAULT: &[u8] = include_bytes!("../icons/tray.png");
const TRAY_ICON_MUTED: &[u8] = include_bytes!("../icons/tray-muted.png");
// Multi-resolution ICO (16/20/24/32/48) — Windows сам выбирает нужный размер
// под текущий DPI. Без этого был бы один 16×16 PNG, который Windows на HiDPI
// апскейлит = «пестрит» пикселями. С ICO crisp на любом масштабе, как у
// системных иконок (powershell, проводник).
#[cfg(windows)]
const TASKBAR_OVERLAY_MUTED: &[u8] = include_bytes!("../icons/taskbar-overlay-muted.ico");

/// Подменить иконку трея на "mic muted" или вернуть default. Вызывается из
/// commands::set_tray_mic_muted в ответ на изменение `micMutedByUser` +
/// нахождение в комнате (см. App.tsx).
pub fn set_mic_muted(app: &AppHandle, muted: bool) -> Result<(), String> {
    let Some(tray) = app.tray_by_id("main") else {
        return Err("tray id 'main' not registered".into());
    };
    let bytes = if muted { TRAY_ICON_MUTED } else { TRAY_ICON_DEFAULT };
    let icon = Image::from_bytes(bytes).map_err(|e| e.to_string())?;
    tray.set_icon(Some(icon)).map_err(|e| e.to_string())?;
    Ok(())
}

/// Windows-only: подменить overlay icon на иконке main-окна в панели задач.
/// Это маленький бэйдж (16×16) поверх обычной app-иконки — как у Slack для
/// непрочитанных сообщений. macOS/Linux игнорируем (нет аналогичного API).
pub fn set_taskbar_overlay_muted(app: &AppHandle, muted: bool) -> Result<(), String> {
    #[cfg(windows)]
    {
        // В Tauri 2.10 на AppHandle есть только get_webview_window; WebviewWindow
        // дереферится в Window, поэтому set_overlay_icon (#[cfg(windows)] метод
        // Window) вызывается прямо на нём.
        let Some(win) = app.get_webview_window("main") else {
            return Err("main window not found".into());
        };
        let icon = if muted {
            Some(Image::from_bytes(TASKBAR_OVERLAY_MUTED).map_err(|e| e.to_string())?)
        } else {
            None
        };
        win.set_overlay_icon(icon).map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = (app, muted);
        Ok(())
    }
}

pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    #[cfg(target_os = "macos")]
    {
        let _ = app;
        return Ok(());
    }

    #[cfg(not(target_os = "macos"))]
    {
        // Используем embedded tray.png (32×32) вместо default_window_icon
        // (это app icon, обычно 128×128) — Windows на 32-px slot'е масштабирует
        // 128-pх вариант грязно. Также важно: иконка swap'ается на tray-muted
        // через set_mic_muted, и обе вариации должны быть одного размера/стиля.
        let icon = Image::from_bytes(TRAY_ICON_DEFAULT)?;

        // Нативное меню не привязываем: правый клик обрабатываем сами и
        // показываем кастомное окно 'tray-menu' с React UI. Левый клик —
        // быстрый show_main_window, как у Telegram/Discord.
        let _tray = TrayIconBuilder::with_id("main")
            .tooltip("VoiceChat")
            .icon(icon)
            .on_tray_icon_event(|tray, event| match event {
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } => show_main_window(tray.app_handle()),
                TrayIconEvent::Click {
                    button: MouseButton::Right,
                    button_state: MouseButtonState::Up,
                    position,
                    ..
                } => {
                    show_tray_menu(tray.app_handle(), position);
                }
                _ => {}
            })
            .build(app)?;

        Ok(())
    }
}

pub(crate) fn show_main_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        // Парный SetIsVisible(true) к hide-time'овскому SetIsVisible(false)
        // из lib.rs CloseRequested. Делаем ДО win.show(), чтобы Chromium успел
        // "проснуться" к моменту, когда окно появится на экране — иначе будет
        // видна пустая/устаревшая отрисовка первые несколько кадров.
        #[cfg(target_os = "windows")]
        {
            let _ = win.with_webview(|webview| unsafe {
                let _ = webview.controller().SetIsVisible(true.into());
            });
        }
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
        // Парный сигнал к window:visibility=false из lib.rs CloseRequested:
        // снимает класс vo-hidden, эффекты возвращаются (vo-bg снимется
        // отдельно через DOM window.focus после set_focus()).
        let _ = app.emit("window:visibility", true);
    }
}

/// Эмитим click position в tray-menu окно — оно само измерит фактический
/// размер своего React-контента, спозиционируется (по умолчанию вниз-вправо
/// от курсора, с флипом если уходит за границу монитора) и покажется.
/// Делать позиционирование тут, на Rust, нельзя: реальная высота меню
/// зависит от состояния (in-room / lobby), и заранее мы её не знаем.
fn show_tray_menu(app: &AppHandle, click_pos: PhysicalPosition<f64>) {
    let payload = serde_json::json!({ "x": click_pos.x, "y": click_pos.y });
    if let Err(e) = app.emit_to("tray-menu", "tray-menu:show", payload) {
        log::warn!("[tray] emit show event failed: {e}");
    }
}
