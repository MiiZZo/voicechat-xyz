//! Screen share. Самое слабое место Tauri-клиента — см. README пакета.
//!
//! В Electron-версии main-процесс перехватывает getDisplayMedia() через
//! session.setDisplayMediaRequestHandler, читает desktopCapturer.getSources(),
//! шлёт список в renderer, ждёт выбор и возвращает его как track.
//!
//! В Tauri 2 / WebView2 такого хука нет: getDisplayMedia вызывает встроенный
//! системный picker WebView2, и мы не можем подменить его UI без серьёзной
//! нативной обвязки (windows-capture / WGC + custom video pipeline в WebView).
//!
//! Минимальный жизнеспособный путь:
//!   - getScreenSources() возвращает пустой массив → renderer отрисует "Загрузка..."
//!     либо не покажет наш кастомный picker (у renderer нет триггера для него).
//!   - onScreenShareRequest никогда не эмитится — UI с собственным picker'ом не
//!     активируется.
//!   - getDisplayMedia({ video: ... }) в RoomView.tsx вызывается напрямую и
//!     поднимает встроенный системный picker WebView2 — пользователь выбирает
//!     экран/окно сам. Поток дальше идёт стандартно через LiveKit.
//!
//! Что теряем:
//!   - Свой UI выбора источника (см. ScreenSourcePicker.tsx).
//!   - Тонкие настройки (WGC capturer, H264 MediaFoundation encoder, 1440p60) —
//!     WebView2 не даёт командной строки Chromium, флаги задаются только через
//!     environment options до старта (см. lib.rs init_webview_env).
//!
//! TODO: реализовать кастомный picker через windows-capture крейт + canvas
//! captureStream в WebView. Это требует написать MediaSource или WebRTC pipeline
//! на Rust-стороне и продвигать кадры в JS — большая отдельная работа.

use serde::{Deserialize, Serialize};

#[derive(Serialize, Clone)]
pub struct ScreenSource {
    pub id: String,
    pub name: String,
    #[serde(rename = "thumbnailDataUrl")]
    pub thumbnail_data_url: String,
}

#[derive(Deserialize)]
pub struct ScreenShareResponse {
    #[allow(dead_code)]
    #[serde(rename = "requestId")]
    pub request_id: String,
    #[allow(dead_code)]
    #[serde(rename = "sourceId")]
    pub source_id: Option<String>,
}

/// Список источников для кастомного picker'а. В текущей реализации Tauri-клиент
/// не использует кастомный picker — возвращаем пусто. Renderer переживёт это:
/// ScreenSourcePicker рендерится только когда onScreenShareRequest приходит,
/// а getScreenSources() напрямую из renderer не дёргается (см. ipc.ts handler
/// IPC.GetScreenSources — он вызывается только если renderer сам решит, что
/// ему нужен список; в текущем коде renderer этого не делает).
pub fn list_sources() -> Vec<ScreenSource> {
    Vec::new()
}
