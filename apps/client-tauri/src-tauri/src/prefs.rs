//! Persistent preferences. Зеркальный аналог apps/client/src/main/prefs.ts.
//!
//! Используем tauri-plugin-store, который держит значения в JSON-файле в
//! app data dir. Имя стора `voicechat-prefs` совпадает с electron-store, чтобы
//! пользователи на одной машине узнавали свои настройки между двумя клиентами
//! (но **физически файлы разные**: Electron хранит в %APPDATA%\VoiceChat\,
//! Tauri — в %APPDATA%\com.voicechat.tauri\). Совместимость значений — да,
//! шаринг файла — нет: иначе пришлось бы писать в чужой каталог.

use serde_json::{json, Map, Value};
use std::path::PathBuf;
use tauri::{AppHandle, Manager, Wry};
use tauri_plugin_store::{Store, StoreExt};

const STORE_FILE: &str = "voicechat-prefs.json";

/// Дефолты. Должны совпадать со структурой Prefs из shared/types.ts:
/// любое расхождение приведёт к тому, что миграция замаскирует баг и UI получит
/// "не своё" значение.
fn defaults() -> Value {
    let user = whoami_username();
    json!({
        "displayName": user,
        "audioInputDeviceId": Value::Null,
        "audioOutputDeviceId": Value::Null,
        "videoInputDeviceId": Value::Null,
        "audioConstraints": {
            "echoCancellation": true,
            "noiseSuppression": true,
            "autoGainControl": false,
        },
        "micActivationMode": "always",
        "pushToTalk": { "enabled": false, "key": "AltRight" },
        "voiceActivation": {
            "thresholdDb": -45,
            "releaseMs": 400,
            "hysteresisDb": 6,
        },
        "participantVolumes": {},
        "participantMuted": {},
        "initialDeviceState": { "mic": true, "camera": false },
        "closeToTray": true,
        "screenSharePreset": "smooth",
        "screenShareCodec": "vp8",
    })
}

/// Зеркало migrate() из prefs.ts. Поверхностный merge с заглублением для тех
/// объектов, у которых есть собственные дефолты, плюс инференция
/// `micActivationMode` из legacy-флага `pushToTalk.enabled`.
fn migrate(stored: &Value) -> Value {
    let defaults = defaults();
    let mut merged = match stored {
        Value::Object(_) => stored.clone(),
        _ => Map::new().into(),
    };

    // Top-level merge: ключи из defaults попадают в merged, если их там не было.
    if let (Value::Object(merged_map), Value::Object(defaults_map)) =
        (&mut merged, &defaults)
    {
        for (k, v) in defaults_map {
            merged_map.entry(k.clone()).or_insert_with(|| v.clone());
        }
    }

    // Глубокий merge для вложенных объектов.
    deep_fill(&mut merged, &defaults, "audioConstraints");
    deep_fill(&mut merged, &defaults, "pushToTalk");
    deep_fill(&mut merged, &defaults, "voiceActivation");
    deep_fill(&mut merged, &defaults, "initialDeviceState");

    // Инференция micActivationMode: если в storage его не было — выводим из ptt.enabled.
    if let Value::Object(merged_map) = &mut merged {
        let needs_inference = !merged_map
            .get("micActivationMode")
            .map(|v| v.is_string())
            .unwrap_or(false);
        if needs_inference {
            let ptt_enabled = merged_map
                .get("pushToTalk")
                .and_then(|v| v.get("enabled"))
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            merged_map.insert(
                "micActivationMode".into(),
                Value::String(if ptt_enabled { "ptt" } else { "always" }.into()),
            );
        }
    }

    merged
}

fn deep_fill(merged: &mut Value, defaults: &Value, key: &str) {
    let Some(default_obj) = defaults.get(key).and_then(|v| v.as_object()) else {
        return;
    };
    let merged_map = match merged {
        Value::Object(m) => m,
        _ => return,
    };
    let entry = merged_map
        .entry(key.to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    let Value::Object(entry_map) = entry else {
        // Битое значение в storage — заменяем на дефолт целиком.
        *entry = Value::Object(default_obj.clone());
        return;
    };
    for (k, v) in default_obj {
        entry_map.entry(k.clone()).or_insert_with(|| v.clone());
    }
}

fn open_store(app: &AppHandle) -> Result<std::sync::Arc<Store<Wry>>, String> {
    app.store(STORE_FILE).map_err(|e| e.to_string())
}

/// Загрузить и нормализовать prefs. Если файла нет — вернёт чистые дефолты.
pub fn get_prefs(app: &AppHandle) -> Result<Value, String> {
    let store = open_store(app)?;
    // Все поля держим под одним ключом "prefs" — единственный JSON-объект,
    // который мы реально читаем/пишем. Это упрощает миграцию.
    let raw = store.get("prefs").unwrap_or_else(|| Value::Object(Map::new()));
    Ok(migrate(&raw))
}

/// Применить partial-патч и записать результат, как делает setPrefs из prefs.ts.
pub fn set_prefs(app: &AppHandle, patch: Value) -> Result<Value, String> {
    let store = open_store(app)?;
    let current = store.get("prefs").unwrap_or_else(|| Value::Object(Map::new()));
    let merged = shallow_merge(current, patch);
    let migrated = migrate(&merged);
    store.set("prefs", migrated.clone());
    store.save().map_err(|e| e.to_string())?;
    Ok(migrated)
}

/// Top-level shallow merge (как `{ ...prefs, ...patch }` в TS).
fn shallow_merge(mut base: Value, patch: Value) -> Value {
    let (Value::Object(base_map), Value::Object(patch_map)) = (&mut base, patch) else {
        return base;
    };
    for (k, v) in patch_map {
        base_map.insert(k, v);
    }
    base
}

/// Узнаём имя пользователя без сторонних крейтов.
fn whoami_username() -> String {
    #[cfg(windows)]
    {
        std::env::var("USERNAME").unwrap_or_default()
    }
    #[cfg(not(windows))]
    {
        std::env::var("USER").unwrap_or_default()
    }
}

/// Удобство для тестов/отладки — фактический путь к файлу стора.
#[allow(dead_code)]
pub fn store_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join(STORE_FILE))
}
