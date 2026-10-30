# @voicechat/client-tauri

Desktop-клиент VoiceChat — на Tauri 2 (Rust + WebView2 на Windows /
WKWebView на macOS / WebKitGTK на Linux). Переиспользует **тот же** React UI,
что и веб-клиент (`apps/client`), без копирования.

## Как переиспользуется UI

`vite.config.ts` указывает `root` на `apps/client-tauri/`, но через alias `@`
и относительные импорты тянет компоненты прямо из соседнего пакета:

```
apps/client/src/renderer/   ← один источник истины
apps/client/src/shared/     ← общие типы и контракт window.api (api.ts)
```

`src/entry.ts` сначала ставит `window.api` через `src/preload-shim.ts`
(реализация контракта `shared/api.ts` поверх Tauri commands/events), затем
грузит renderer. Веб-клиент делает то же своей реализацией в
`apps/client/src/web/api.ts`; desktop-only методы в контракте необязательны.

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
`apps/client/.env.local-server` / `.env.remote-server`, что и веб-клиент,
для `VITE_LOBBY_URL`.

## Подсистемы

| Подсистема | Реализация |
|---|---|
| Prefs + миграция | `tauri-plugin-store` + `prefs.rs` (ключ `voicechat-prefs`, дефолты — зеркало `apps/client/src/shared/prefs.ts`) |
| Кастомный titlebar | `decorations: false` в `tauri.conf.json` + команды min/max/close |
| Tray (Открыть / Выйти, hide-to-tray) | Встроенный `tray-icon` API Tauri 2 + `WindowEvent::CloseRequested` handler |
| Auto-update (GitHub Releases) | `tauri-plugin-updater` |
| Скачивание файлов | `tauri-plugin-dialog` + `reqwest` stream |
| Демонстрация экрана | **Системный picker WebView2** (см. ниже) |

## Известные ограничения

### Screen sharing — самая больная точка

`getDisplayMedia()` в `RoomView.tsx` вызывается напрямую и поднимает
встроенный системный picker WebView2 — хука, чтобы подменить его своим
диалогом, в WebView2 нет. Rust-команды `screen_get_sources` /
`screen_share_respond` остались пустыми заглушками на случай нативного picker'а.

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

### Auto-update

Манифест — `latest.json` в формате `tauri-plugin-updater` рядом с
артефактами GitHub Release (см. `tauri.conf.json` →
`plugins.updater.endpoints`). Релиз собирает и публикует
`.github/workflows/release-tauri.yml` по push тега `tauri-v*`.

`pubkey` в `tauri.conf.json` сейчас — placeholder. Перед первым релизом
выполнить `npx @tauri-apps/cli signer generate -w ~/.tauri/voicechat.key`,
прописать публичный ключ и хранить приватный в CI-секретах.

### Прочие

- На macOS tray не создаётся (см. `tray.rs`) — стандартное dock-поведение.
- Linux — best-effort: WebKitGTK поддерживает `getDisplayMedia` начиная с
  свежих версий, но требует pipewire portal.

## Структура

```
apps/client-tauri/
├── index.html              # грузит src/entry.ts
├── package.json
├── postcss.config.js       # локальный PostCSS — указывает на свой tailwind.config.ts
├── tailwind.config.ts      # наследует от ../client/tailwind.config.ts
├── tsconfig.json
├── vite.config.ts          # root=., alias '@' → ../client/src/renderer
├── scripts/
│   └── generate-icons.mjs  # генерация иконок приложения
└── src-tauri/
    ├── Cargo.toml
    ├── build.rs
    ├── tauri.conf.json
    ├── capabilities/default.json
    ├── icons/              # сгенерированные PNG/ICO (gitignored)
    └── src/
        ├── main.rs         # точка входа, отключает консоль на Win release
        ├── lib.rs          # сборка Builder, plugins, window-events
        ├── prefs.rs        # зеркало apps/client/src/shared/prefs.ts
        ├── commands.rs     # все Tauri-команды (prefs/screen/update/file)
        ├── tray.rs         # system tray (Открыть / Выйти, hide-to-tray)
        ├── updater.rs      # auto-update + статусы для UpdateBanner
        └── screen_share.rs # пустые заглушки (см. выше)

src/preload-shim.ts         # маппинг window.api на Tauri commands/events
```
