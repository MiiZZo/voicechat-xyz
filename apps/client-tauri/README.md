# @voicechat/client-tauri

Второй desktop-клиент VoiceChat — на Tauri 2 (Rust + WebView2 на Windows /
WKWebView на macOS / WebKitGTK на Linux). Соседствует с Electron-клиентом,
переиспользует **тот же** React UI без копирования.

## Как переиспользуется UI

`vite.config.ts` указывает `root` на `apps/client-tauri/`, но через alias `@`
и относительные импорты тянет компоненты прямо из соседнего пакета:

```
apps/client/src/renderer/   ← один источник истины
apps/client/src/shared/     ← общий контракт типов
```

`apps/client-tauri/index.html` грузит `../client/src/renderer/main.tsx` и
предварительно ставит `window.api` через `src/preload-shim.ts`, который
маппит контракт Electron-preload'а на Tauri commands/events. Никаких правок в
Electron-клиенте при этом не требуется — рендерер видит идентичный
`window.api` объект и не знает, в каком хосте он запущен.

## Запуск

Корневой `npm install` подтягивает обе версии. Лобби-сервер поднимается
отдельным workspace-скриптом:

```bash
npm install
npm run dev:server          # терминал 1 — Fastify lobby
npm run dev:client-tauri    # терминал 2 — Tauri dev
```

Tauri dev сначала запускает `vite --mode local-server` на `127.0.0.1:5174`,
затем поднимает Rust-процесс с devUrl=этому порту. Использует те же
`apps/client/.env.local-server` / `.env.remote-server`, что и Electron-клиент,
для `VITE_LOBBY_URL`.

## Что зеркально перенесено из Electron-клиента

| Подсистема | Tauri-эквивалент |
|---|---|
| `electron-store` prefs + миграция | `tauri-plugin-store` + `prefs.rs` (та же миграция, тот же ключ `voicechat-prefs`) |
| Кастомный titlebar (`frame: false`) | `decorations: false` в `tauri.conf.json` + те же команды min/max/close |
| Tray (Открыть / Выйти, hide-to-tray) | Встроенный `tray-icon` API Tauri 2 + `WindowEvent::CloseRequested` handler |
| `electron-updater` (GitHub Releases) | `tauri-plugin-updater` (см. ниже про feed strategy) |
| `dialog.showSaveDialog` + net.request | `tauri-plugin-dialog` + `reqwest` stream |
| `desktopCapturer` + кастомный picker | **Системный picker WebView2** (см. ниже) |

## Известные ограничения

### Screen sharing — самая больная точка

Electron-клиент перехватывает `getDisplayMedia()` через
`session.setDisplayMediaRequestHandler` и подменяет picker на собственный
React-диалог `ScreenSourcePicker.tsx`. **В Tauri 2 / WebView2 такого хука
нет.**

Текущая реализация — **best-effort fallback**:
- `getDisplayMedia()` в `RoomView.tsx` вызывается напрямую и поднимает
  встроенный системный picker WebView2.
- Кастомный picker (`ScreenSourcePicker`) **не активируется** — Rust никогда
  не эмитит `screen-share:request`, а `getScreenSources()` возвращает пустой
  массив. UI рендерера это переживает: триггер для picker'а просто не
  срабатывает.
- Дальше поток идёт стандартно через LiveKit.

**Что теряется**:
- Свой UI выбора источника.
- Тонкие Chromium-флаги `WebRtcAllowH264MediaFoundationEncoder`,
  `enable-webrtc-allow-wgc-screen-capturer` и аналоги — WebView2 не принимает
  командной строки Chromium и не позволяет включать experimental features из
  Rust API. 1440p60 через WGC capturer **не доказан**: достижимое разрешение
  и FPS зависят целиком от того, что предлагает встроенный picker WebView2.

**TODO (не сделано)**:
- Реализовать кастомный picker через крейт `windows-capture` / WGC + custom
  protocol handler в Rust, отдающий кадры в WebView (через MediaSource или
  WebRTC pipeline). Это серьёзная отдельная задача — большое количество
  unsafe-кода, ручное управление Direct3D-текстурами, конвертация в I420 для
  кодировщика. Не в этом релизе.

### Auto-update — отдельный feed

Electron-клиент использует `electron-updater` с GitHub provider, который
читает `latest.yml` рядом с релизными артефактами. Tauri имеет свой формат
манифеста (`latest.json` со схемой `tauri-plugin-updater`), несовместимый с
`latest.yml`.

Решение: используем **отдельный endpoint** `latest-tauri.json` рядом с
`latest.yml` в тех же GitHub Releases (см. `tauri.conf.json` →
`plugins.updater.endpoints`). Это значит:
- Один и тот же тег релиза несёт оба манифеста и оба набора артефактов
  (NSIS-installer для Electron, MSI/NSIS для Tauri).
- Каналы обновлений не пересекаются — пользователь Tauri-клиента не получит
  предложение установить Electron-сборку и наоборот.
- В CI workflow добавятся 2 новых шага: `tauri build` и публикация
  `latest-tauri.json` (формат описан в документации
  tauri-plugin-updater).

`pubkey` в `tauri.conf.json` сейчас — placeholder. Перед первым релизом
выполнить `npx @tauri-apps/cli signer generate -w ~/.tauri/voicechat.key`,
прописать публичный ключ и хранить приватный в CI-секретах.

### Прочие

- `debug:open-internal-url` (упомянутый в задаче) **не реализован**, так как
  его нет ни в `IPC` enum, ни в `window.api` Electron-версии. Если появится
  — добавить как no-op команду с `log::info!`.
- На macOS tray не создаётся (см. `tray.rs`) — стандартное dock-поведение.
- Linux — best-effort: WebKitGTK поддерживает `getDisplayMedia` начиная с
  свежих версий, но требует pipewire portal.

## Структура

```
apps/client-tauri/
├── index.html              # подкладывает preload-shim, грузит ../client renderer
├── package.json
├── postcss.config.js       # локальный PostCSS — указывает на свой tailwind.config.ts
├── tailwind.config.ts      # наследует от ../client/tailwind.config.ts
├── tsconfig.json
├── vite.config.ts          # root=., alias '@' → ../client/src/renderer
├── scripts/
│   └── generate-icons.mjs  # та же геометрия что у Electron-клиента
└── src-tauri/
    ├── Cargo.toml
    ├── build.rs
    ├── tauri.conf.json
    ├── capabilities/default.json
    ├── icons/              # сгенерированные PNG/ICO (gitignored)
    └── src/
        ├── main.rs         # точка входа, отключает консоль на Win release
        ├── lib.rs          # сборка Builder, plugins, window-events
        ├── prefs.rs        # зеркало apps/client/src/main/prefs.ts
        ├── commands.rs     # все Tauri-команды (prefs/screen/update/file)
        ├── tray.rs         # system tray (Открыть / Выйти, hide-to-tray)
        ├── updater.rs      # auto-update + статусы для UpdateBanner
        └── screen_share.rs # пустые заглушки (см. выше)

src/preload-shim.ts         # маппинг window.api на Tauri commands/events
```
