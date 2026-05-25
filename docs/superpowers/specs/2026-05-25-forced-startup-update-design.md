# Forced startup auto-update (Tauri) — design

**Date:** 2026-05-25
**Scope:** Tauri client only (`apps/client-tauri/`).
**Motivation:** Today the Tauri updater downloads in background and surfaces an `UpdateBanner` that the user can ignore indefinitely. We want a Discord-style boot flow: when the app launches and an update is available, block the UI behind a splash window, install the update, and restart automatically. The user has no opt-out.

## 1. Behaviour summary

| Scenario at launch                          | UX                                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------------------- |
| No update available                         | Splash flashes "Проверка обновлений…" briefly, then fades out; main window appears.         |
| Update available, download succeeds         | Splash shows progress 0–100%, then "Установка…", then app restarts on new version.          |
| Update available, download fails            | Splash shows "Ошибка загрузки, продолжаем" for 1.5s, then closes; main window appears.      |
| Updater server unreachable / check times out (20s) | Splash shows "Не удалось проверить, продолжаем"; main window appears with old version.      |
| Dev build (`debug_assertions`)              | Splash flow is skipped entirely; main window opens immediately as today.                    |
| `VOICECHAT_SKIP_UPDATE=1` env var           | Splash flow is skipped; useful for release-build manual testing.                            |

During runtime, the existing hourly background check + `UpdateBanner` flow is **unchanged** — only the startup check becomes blocking.

## 2. Window architecture

A fourth Tauri window `splash` is added in `tauri.conf.json`:

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

The window is declared with `visible: false`. Rust shows it via `window.show()` only when the startup flow begins; this avoids a flash if the dev build skips the flow.

The existing `main` window is briefly hidden during the startup flow (`main.hide()` immediately after `app.setup`, before the splash is shown) and re-shown when the splash closes. This guarantees the splash is the only visible top-level window during the update flow, mirroring Discord's behaviour.

## 3. Renderer integration

`apps/client-tauri/src/entry.ts` already branches on `getCurrentWindow().label`. A new branch is added:

```ts
} else if (label === 'splash') {
  document.body.classList.remove('bg-bg', 'text-fg');
  document.body.style.background = 'transparent';
  void import('./splash');
}
```

A new file `apps/client-tauri/src/splash.tsx` is created. It is **self-contained**: it does not import from the shared `apps/client/src/renderer` tree. The splash should not pull in livekit, zustand, or any non-trivial dependency — boot time of the splash must be near-instant.

The splash component:

- Mounts its own ReactDOM root into `#root`.
- Renders a rounded card (`bg-zinc-950`, ring `ring-zinc-800/60`, soft shadow) per the Velvet Onyx theme.
- Inside the card: VoiceChat logo, current state text, optional thin progress bar (`bg-zinc-800` track, `bg-zinc-200` fill, 2px tall).
- Subscribes to `update:status` via `@tauri-apps/api/event.listen`.
- Maps each `UpdateStatus` variant to the strings in the Behaviour table above.
- On terminal states (`Idle`, `Error` after delay, app restart) the splash invokes the `splash_done` Tauri command, which closes the splash and shows the main window.

Tailwind/PostCSS already resolve via the existing config — no new pipeline.

## 4. Rust orchestration

Changes to `apps/client-tauri/src-tauri/src/updater.rs`:

- The current `schedule(app)` is split into:
  - `pub async fn run_startup_blocking(app: AppHandle) -> ()` — the new entry point. Does one check + download + install + restart cycle, all status emitted to splash. Returns only on non-update path (Idle, Error, Timeout).
  - `pub fn schedule_background_checks(app: AppHandle)` — the existing hourly loop, sans the first immediate call. Spawned by `run_startup_blocking` on its non-update return path.
- The enum `UpdateStatus` gains one variant: `Installing { version: String }`. Emitted between `Ready` and the actual `app.restart()` so the splash can show "Установка…" without progress.
- Startup-blocking flow uses `tokio::select!` between the updater future and `tokio::time::sleep(Duration::from_secs(20))`. On timeout, emit `Idle` and return.
- Splash-side terminal handling (Idle / Error) is initiated from JS via a new Tauri command `splash_done` that:
  - Closes the splash window (`get_webview_window("splash").close()`).
  - Shows the main window (`get_webview_window("main").show()`).
  - Focuses main (`main.set_focus()`).
- Successful install path: `download_and_install` returns, Rust calls `app.restart()` (control flow ends; OS relaunches).

Changes to `apps/client-tauri/src-tauri/src/lib.rs`:

- In `setup`, the `#[cfg(not(debug_assertions))]` block changes from `updater::schedule(app.handle().clone())` to:
  ```rust
  if std::env::var("VOICECHAT_SKIP_UPDATE").is_err() {
      let app_for_main = app.handle().clone();
      if let Some(main) = app_for_main.get_webview_window("main") {
          let _ = main.hide();
      }
      tauri::async_runtime::spawn(updater::run_startup_blocking(app.handle().clone()));
  } else {
      updater::schedule_background_checks(app.handle().clone());
  }
  ```
- The new `splash_done` command is added to `commands.rs` and registered in `invoke_handler!`.

## 5. Event contract

Existing event `update:status` is reused. New JSON shapes:

```json
{ "kind": "checking" }
{ "kind": "available", "version": "0.3.1" }
{ "kind": "downloading", "percent": 42 }
{ "kind": "ready", "version": "0.3.1" }
{ "kind": "installing", "version": "0.3.1" }   // new
{ "kind": "idle" }
{ "kind": "error", "message": "…" }
```

`shared/types.ts` `UpdateStatus` type is **not** extended for Electron — the Tauri splash imports its types locally from `apps/client-tauri/src/splash.tsx`. (Tauri and Electron `UpdateStatus` types already differ in practice; we don't want to leak a Tauri-only variant into Electron.)

## 6. Capabilities

`apps/client-tauri/src-tauri/capabilities/default.json` likely needs the splash window listed in the `windows` array of relevant permissions (event, core:window, etc). The exact diff is to be confirmed during implementation by booting and reading any capability errors logged by Tauri.

## 7. Failure modes (explicit)

- **Updater server 404 / network drop on check:** `updater.check()` returns Err. Rust treats this as Idle (already today's behaviour). Splash shows "Не удалось проверить" briefly, then closes.
- **Check hangs:** 20s `tokio::select!` timeout cuts it. Splash closes.
- **Download fails mid-stream:** `download_and_install` returns Err. Rust emits `Error`. Splash shows "Ошибка загрузки", waits 1.5s, calls `splash_done`.
- **Install step fails (signature mismatch, write error):** Same Error path. The old binary is still on disk, app remains usable.
- **App quits during download:** Tauri kills the tokio task; partial download remains in the plugin's cache. Next launch resumes from cache (plugin behaviour, unchanged).
- **Multiple instances:** Out of scope. The app does not currently have a single-instance lock; this design does not introduce one.

## 8. What is NOT changing

- Electron client (`apps/client/`) is untouched.
- Existing `UpdateBanner` and hourly background check stay exactly as today.
- `quitAndInstall` / `update_install` IPC paths stay (used by the banner).
- No new persisted preferences; the flow is not user-configurable.

## 9. Test plan (manual)

1. **Happy path, no update:** Bump `tauri.conf.json` version higher than the published one, build, run. Splash should flash briefly, main window opens within ~1s of splash close.
2. **Happy path, update available:** Publish a higher version to GitHub Releases (or stub the endpoint locally). Run with older bundled version. Splash should show progress, then "Установка…", then app restarts on new version.
3. **Offline:** Disable network, run. Splash should show "Не удалось проверить" and close; main opens with old version.
4. **Server hangs:** Point `updater.endpoints` at a sinkhole URL. After 20s, splash closes; main opens.
5. **Dev build:** `npm run dev` — splash must not appear.
6. **Skip env:** `VOICECHAT_SKIP_UPDATE=1` release build — splash must not appear; background check still runs hourly.

## 10. Open questions

None blocking. Capabilities diff (§6) is to be confirmed during implementation rather than guessed upfront.
