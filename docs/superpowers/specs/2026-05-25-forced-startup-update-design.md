# Forced startup auto-update (Tauri) — design

**Date:** 2026-05-25
**Scope:** Tauri client only (`apps/client-tauri/`).
**Motivation:** Today the Tauri updater downloads in background and surfaces an `UpdateBanner` that the user can ignore indefinitely. We want a Discord-style boot flow: when the app launches and an update is available, block the UI behind a splash window, install the update, and restart automatically. The user has no opt-out.

## 1. Behaviour summary

| Scenario at launch                                 | UX                                                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| No update available                                | Splash shows "Проверка обновлений…" briefly, then "Обновлений нет" 300ms, then main appears. |
| Update available, download succeeds                | Splash shows progress 0–100%, then "Установка…", then app restarts on new version.          |
| Update available, download fails                   | Splash shows "Ошибка загрузки, продолжаем" for 1.5s, then main appears (old version).        |
| Updater server unreachable / check times out (20s) | Splash shows "Не удалось проверить, продолжаем" 1.5s, then main appears.                     |
| Splash JS never reports ready (5s handshake fails) | Rust skips updater, closes splash, shows main. (Safety valve for broken splash bundle.)      |
| Dev build (`debug_assertions`)                     | Splash never opens. Main shows immediately as today.                                         |
| `VOICECHAT_SKIP_UPDATE=1` env var                  | Splash never opens. Main shows immediately. Background hourly check still runs.              |

During runtime, the existing hourly background check + `UpdateBanner` flow is **unchanged** — only the startup check becomes blocking.

UI strings are Russian-only, matching the rest of the renderer (no i18n layer exists in this project, and the existing `UpdateBanner` is Russian-only).

## 2. Window architecture

### 2.1 tauri.conf.json diff

Two changes:

1. **`main` window** flips from `"visible": true` to `"visible": false`. Without this, on Windows the OS briefly shows main before `setup()` runs and hides it (visible flash of 100–300ms). All call sites that should display main now explicitly call `window.show()`: the dev-build setup branch, the env-var skip branch, and the splash-flow terminal step.

2. **New `splash` window** appended to the `windows` array:

   ```json
   {
     "label": "splash",
     "title": "VoiceChat",
     "width": 380,
     "height": 200,
     "decorations": false,
     "transparent": true,
     "alwaysOnTop": true,
     "skipTaskbar": true,
     "resizable": false,
     "focus": true,
     "visible": false,
     "center": true,
     "shadow": true
   }
   ```

   `transparent: true` works without additional Cargo features here: the existing `notification` and `tray-menu` windows already use `transparent: true` and ship in the current build. No `tauri/windows-transparent` feature flag is needed.

The window is declared `visible: false` so the splash never appears in the dev or skip-env path. Rust calls `window.show()` only when it's about to run the startup flow.

### 2.2 Capabilities diff

`apps/client-tauri/src-tauri/capabilities/default.json` `windows` array gains `"splash"`:

```json
"windows": ["main", "notification", "tray-menu", "splash"]
```

No new permissions needed — `core:event:default`, `core:window:allow-close`, `core:window:allow-show`, `core:window:allow-set-focus` are already in the list and cover the splash's needs.

## 3. Renderer integration

### 3.1 entry.ts branch

`apps/client-tauri/src/entry.ts` gains a fourth label branch:

```ts
} else if (label === 'splash') {
  document.body.classList.remove('bg-bg', 'text-fg');
  document.body.style.background = 'transparent';
  // Same body::before suppression trick as notification/tray-menu — the
  // background noise texture would bleed through transparent corners.
  const s = document.createElement('style');
  s.textContent = 'body::before { display: none !important; }';
  document.head.appendChild(s);
  void import('./splash');
}
```

### 3.2 splash.tsx

New file `apps/client-tauri/src/splash.tsx`, **self-contained**:

- Mounts its own `ReactDOM.createRoot` into `#root`.
- Renders a rounded card (`bg-zinc-950`, ring `ring-zinc-800/60`, soft shadow) per Velvet Onyx.
- Card content: VoiceChat wordmark/logo, status text, thin progress bar (`bg-zinc-800` track, `bg-zinc-200` fill, 2px tall) — bar visible only when `kind === 'downloading'`.
- **Bundle discipline:** must not import from `apps/client/src/renderer/**`. No livekit, no zustand, no shared components. Only `react`, `react-dom`, `@tauri-apps/api/event`, `@tauri-apps/api/core`. This keeps the splash bundle small and load-time near-instant. (A lint rule or `eslint` import restriction can be added later; for now this is a code-review-time invariant.)

### 3.3 Splash lifecycle (renderer side)

```
mount
  ├─ ReactDOM render with initial state = 'connecting'
  ├─ await listen<UpdateStatus>('update:status', setStatus)    // subscribe FIRST
  └─ await invoke('splash_ready')                              // tell Rust to begin
```

The order matters: the listener must be live before `splash_ready` resolves on the Rust side, otherwise the first `Checking` emit can race the subscription. `@tauri-apps/api/event.listen` returns once the listener is registered with the backend, so awaiting it before `invoke('splash_ready')` is sufficient.

Splash never makes lifecycle decisions itself (no self-close, no `splash_done` command). It is a pure status renderer. Rust owns when the splash closes and when main is shown.

## 4. Rust orchestration

### 4.1 Function split in `updater.rs`

- `schedule()` is renamed `schedule_background_checks()` and loses its first immediate `check_and_download` call — only the hourly loop remains. (The startup check is now the splash flow's job.)
- New `pub async fn run_startup_blocking(app: AppHandle)`. Returns `()`. Called from `setup`. Owns the splash window's entire lifetime and the main window's visibility.
- Existing `check_and_download` and `install_pending` are left untouched — they back the runtime `UpdateBanner` flow and the `update_check` / `update_install` IPC commands.

### 4.2 `run_startup_blocking` flow

```
1. Show splash:  app.get_webview_window("splash")?.show()
2. Wait for handshake from splash JS, with 5s timeout:
     tokio::select! {
       _ = wait_for_splash_ready() => { ok, proceed }
       _ = sleep(5s)                => { close splash, show main, return }
     }
3. emit Checking
4. tokio::select! {
     update_result = updater.check()          => handle below
     _            = sleep(20s)                => emit Idle, close splash 300ms later, show main, return
   }
5. If check Err or None:
     emit Idle, sleep 300ms (splash fade), close splash, show main, return
6. If check Ok(Some(update)):
     emit Available { version }
     emit Downloading { percent: 0 }
     download_and_install(progress_cb -> emit Downloading { percent })
     emit Installing { version }
     app.restart()    // never returns
7. If download_and_install Err:
     emit Error { message }, sleep 1.5s, close splash, show main, return
8. On any return path (non-restart): schedule_background_checks(app.clone())
```

### 4.3 Handshake mechanism (`splash_ready` command)

New Tauri command in `commands.rs`:

```rust
#[tauri::command]
pub async fn splash_ready(state: tauri::State<'_, UpdaterState>) -> Result<(), String> {
    state.notify_splash_ready().await;
    Ok(())
}
```

`UpdaterState` gains a `tokio::sync::Notify` field. `notify_splash_ready()` calls `notify.notify_one()`. `run_startup_blocking` `await`s `state.splash_ready.notified()` inside the `tokio::select!`.

Multiple calls are safe: extra `notify_one()` calls just wake additional waiters that don't exist. The handshake is one-shot from Rust's perspective; Rust does not re-await it.

### 4.4 Close/show window helper

```rust
fn close_splash_and_show_main(app: &AppHandle) {
    if let Some(s) = app.get_webview_window("splash") {
        let _ = s.close();
    }
    if let Some(m) = app.get_webview_window("main") {
        let _ = m.show();
        let _ = m.set_focus();
    }
}
```

Idempotent: if splash is already closed, `close()` is a no-op-ish (returns Err which we discard). If main is already shown, `show()` is a no-op. Safe to call from any terminal branch.

### 4.5 `lib.rs` setup diff

The current setup block:

```rust
#[cfg(not(debug_assertions))]
updater::schedule(app.handle().clone());
```

becomes:

```rust
#[cfg(not(debug_assertions))]
{
    if std::env::var("VOICECHAT_SKIP_UPDATE").is_ok() {
        if let Some(m) = app.handle().get_webview_window("main") {
            let _ = m.show();
        }
        updater::schedule_background_checks(app.handle().clone());
    } else {
        let app_handle = app.handle().clone();
        tauri::async_runtime::spawn(updater::run_startup_blocking(app_handle));
    }
}

#[cfg(debug_assertions)]
{
    if let Some(m) = app.handle().get_webview_window("main") {
        let _ = m.show();
    }
    // existing devtools open call follows
}
```

Both `cfg` branches now explicitly call `main.show()` because `tauri.conf.json` declares `visible: false` for main.

## 5. Event contract

Existing event `update:status` is reused, with one new variant. All emitted shapes:

```json
{ "kind": "checking" }
{ "kind": "available",   "version": "0.3.1" }
{ "kind": "downloading", "percent": 42 }
{ "kind": "installing",  "version": "0.3.1" }    // NEW — emitted only by run_startup_blocking, between download finish and app.restart()
{ "kind": "ready",       "version": "0.3.1" }    // emitted only by check_and_download (background flow)
{ "kind": "idle" }
{ "kind": "error",       "message": "…" }
```

`Ready` is NOT emitted in the startup flow because the startup flow uses `download_and_install` in one shot (no pause between download and install). `Installing` fills the equivalent slot for splash UX. `Ready` continues to drive the runtime `UpdateBanner` "Install now" button via the background flow.

The Tauri `UpdateStatus` enum in `updater.rs` gains the `Installing { version: String }` variant. `apps/client/src/renderer/...` (Electron-shared) `UpdateStatus` type is **not** extended — the splash imports its own type locally from `splash.tsx`.

## 6. Failure modes (explicit)

- **Splash bundle broken (JS throws on load):** `splash_ready` is never invoked. The 5s handshake timeout fires. Rust closes splash, shows main. Updater is skipped for this launch (will run next launch). Logged as warning.
- **Updater server 404 / network drop on check:** `updater.check()` returns Err. Rust treats as Idle (existing behaviour). Splash shows "Не удалось проверить" 1.5s, closes, main shown.
- **Check hangs:** 20s `tokio::select!` timeout cuts it. Same as network drop branch.
- **Download fails mid-stream:** `download_and_install` returns Err. Rust emits `Error`, sleeps 1.5s, closes splash, shows main. Old binary remains usable.
- **Install step fails (signature mismatch, write error):** Same Error path.
- **User force-kills splash via Task Manager during download:** Splash window gone. `run_startup_blocking` continues in tokio task. Successful path: `app.restart()` fires, new process starts cleanly with new splash. Failure path: `close_splash_and_show_main` runs — `splash.close()` is no-op (already gone), `main.show()` succeeds. Background loop starts.
- **App quits via `app.quit()` during download:** Tauri kills the tokio task; partial download remains in plugin's cache. Next launch resumes from cache (plugin behaviour, unchanged).
- **Multiple instances:** Out of scope. The app currently has no single-instance lock; this design does not add one. If two instances launch simultaneously both will run their own splash + update flow independently.

The 20s timeout is intentionally on the **check** only, not the whole flow. A slow large download will continue past 20s; the splash will keep showing progress. This matches Discord: a slow download is still progress, and the user prefers waiting over launching on the old version when an update is already partly down.

## 7. What is NOT changing

- Electron client (`apps/client/`) is untouched.
- Existing `UpdateBanner` and hourly background check stay exactly as today.
- `quitAndInstall` / `update_install` IPC paths stay (used by the banner).
- No new persisted preferences; the flow is not user-configurable.
- No single-instance enforcement.

## 8. Test plan (manual)

1. **Happy path, no update:** Bump `tauri.conf.json` version higher than the published one, build, run. Splash flashes briefly with "Обновлений нет", main opens.
2. **Happy path, update available:** Publish a higher version to GitHub Releases (or stub the endpoint). Run with older bundled version. Splash shows progress, then "Установка…", then app restarts on new version.
3. **Offline:** Disable network, run. Splash shows "Не удалось проверить" 1.5s, closes; main opens with old version.
4. **Server hangs:** Point `updater.endpoints` at a sinkhole URL. After 20s, splash transitions, closes; main opens.
5. **Splash bundle broken:** Temporarily throw at top of `splash.tsx`. After 5s, main opens.
6. **Dev build:** `npm run dev` — splash must not appear, main opens immediately.
7. **Skip env:** `VOICECHAT_SKIP_UPDATE=1` release build — splash must not appear; background check still runs hourly (verify via log).
8. **Force kill splash:** Mid-download, kill splash via Task Manager. Main should appear after update completes (success) or after error timeout (failure).

## 9. Files touched

- `apps/client-tauri/src-tauri/tauri.conf.json` — `main.visible` flip + new `splash` window.
- `apps/client-tauri/src-tauri/capabilities/default.json` — add `"splash"` to `windows`.
- `apps/client-tauri/src-tauri/src/updater.rs` — rename `schedule`, add `run_startup_blocking`, add `Installing` variant, add Notify field to `UpdaterState`.
- `apps/client-tauri/src-tauri/src/commands.rs` — add `splash_ready` command.
- `apps/client-tauri/src-tauri/src/lib.rs` — register `splash_ready`, replace setup updater block, add explicit `main.show()` calls.
- `apps/client-tauri/src/entry.ts` — add `label === 'splash'` branch.
- `apps/client-tauri/src/splash.tsx` — new, ~120 lines.
