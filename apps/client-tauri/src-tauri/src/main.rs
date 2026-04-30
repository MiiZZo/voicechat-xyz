// Префикс отключает консольное окно на Windows в release-сборке (зеркало того,
// что делает electron-builder с GUI subsystem).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    voicechat_tauri_lib::run();
}
