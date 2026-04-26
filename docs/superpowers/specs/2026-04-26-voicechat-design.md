# VoiceChat — голосовой/текстовый чат с демонстрацией экрана

**Дата:** 2026-04-26
**Статус:** Design (брейншторм завершён, готово к написанию плана реализации)

## 1. Цель

Десктопное приложение под Windows для голосового и текстового общения в небольших комнатах (до 8 участников) с возможностью демонстрации экрана. Гостевой режим, фиксированный набор комнат на стороне сервера, минимальная серверная инфраструктура.

## 2. Сводка решений

| Аспект | Решение |
|---|---|
| Формат связи | Комнаты до 8 участников, SFU-архитектура |
| Платформа | Electron, Windows-only сборка |
| Медиасервер | LiveKit (self-hosted, Docker) |
| Аутентификация | Гостевая, ник без регистрации |
| Список комнат | Фиксированный, читается из `rooms.yaml` (hot-reload) |
| Текстовый чат | LiveKit data channels, без истории, без файлов |
| Демонстрация экрана | Один шарер за раз, без системного звука |
| Аудио/видео | Mute mic/cam, выбор устройств, push-to-talk, индикатор уровня микрофона, регулировка громкости участников, чекбоксы echo/noise/AGC |
| UI | React 18 + TypeScript strict + Vite + Tailwind + shadcn/ui, тёмная тема, единый экран без роутинга |
| Лобби-обновления | Поллинг `GET /api/rooms` каждые 5 секунд (только пока пользователь в lobby) |
| Дистрибуция | NSIS-инсталлятор + electron-updater + GitHub Releases, без код-подписи |
| Качество | TypeScript strict + ESLint + Prettier, ручное тестирование, без авто-тестов на этом этапе |

## 3. Архитектура верхнего уровня

Три отдельных компонента:

### 3.1. Electron-клиент (`apps/client`)
- Main process: окно, IPC, нативный picker экранов через `desktopCapturer`, `electron-updater`, persisted user prefs (`electron-store`)
- Renderer: React-приложение с LiveKit SDK
- Связь:
  - HTTP к Lobby-серверу — `GET /api/rooms`, `POST /api/join`
  - WSS к LiveKit — медиа и data channels (текстовый чат)

### 3.2. Lobby/Auth-сервер (`apps/server`)
- Node.js 20+, TypeScript strict, Fastify
- Читает `rooms.yaml`, отдаёт список комнат с состоянием
- Выдаёт LiveKit-токены (JWT) с грантами на конкретную комнату и identity
- Запрашивает у LiveKit состояние комнат через `livekit-server-sdk` (`RoomServiceClient.listParticipants`)
- Состояние — в памяти (Map). Никакой БД.

### 3.3. LiveKit-сервер
- Внешний бинарник в Docker-контейнере (`livekit/livekit-server`)
- Никакого нашего кода, только конфигурация и API-ключи
- WSS на 7880, RTC UDP на 7881–7882, TURN на 443/TCP для строгих firewall

### 3.4. Развёртывание
- Одна VPS Hetzner CPX21 (€8/мес, 3 vCPU, 4 ГБ RAM, 20 ТБ исходящего трафика)
- docker-compose: Caddy (reverse proxy + Let's Encrypt) + Lobby-сервер + LiveKit
- Целевой профиль использования (одна комната до 6 человек, ежедневно по нескольку часов) укладывается в этот тариф с 5–10× запасом

## 4. Lobby/Auth-сервер

### 4.1. Стек
- Node.js 20+, TypeScript strict
- Fastify (легковесный типизированный HTTP-фреймворк)
- `livekit-server-sdk` — JWT-токены и Room Service API
- `zod` — валидация payload
- `js-yaml` — парсинг `rooms.yaml`
- `chokidar` — отслеживание изменений конфига
- `pino` — структурированные JSON-логи

### 4.2. Состояние (in-memory)

```ts
type Room = { id: string; displayName: string };
const rooms = new Map<string, Room>(); // загружено из rooms.yaml
const MAX_PARTICIPANTS = 8; // глобальная константа
```

### 4.3. Эндпоинты

#### `GET /api/rooms`
Возвращает массив комнат с текущим состоянием:
```ts
[
  {
    id: "general",
    displayName: "Общая",
    maxParticipants: 8,
    participants: [{ identity: "Anna#3f1c", name: "Anna" }, ...]
  },
  ...
]
```
Реализация: для каждой комнаты вызывает `RoomServiceClient.listParticipants(roomId)`. Кэш на уровне сервера — 1 секунда — чтобы поллинг от 8 клиентов не дудосил LiveKit (8 × N комнат запросов в секунду превращается в ≤ N запросов в секунду).

#### `POST /api/join`
Body: `{ roomId: string, displayName: string }` (валидация zod: `displayName` 1–32 символа, не пустой trim).

Возвращает:
- `200 { token: string, livekitUrl: string, identity: string }`
- `400` — невалидный displayName
- `404` — `roomId` нет в текущем `rooms.yaml`
- `409 { reason: "full" }` — в комнате уже 8 участников
- `409 { reason: "duplicate_name" }` — `displayName` уже занят в этой комнате (проверяется через `listParticipants`)

Identity формируется как `{displayName}#{random4hex}`, чтобы избежать race-condition при одновременном входе двух одинаковых ников (короткое окно между проверкой `listParticipants` и фактическим коннектом).

JWT-гранты: `roomJoin: true`, `room: roomId`, `canPublish: true`, `canSubscribe: true`. TTL — 6 часов.

#### `GET /healthz`
Возвращает `200 { status: "ok" }` для health-проверок.

### 4.4. Формат `rooms.yaml`

```yaml
rooms:
  - id: general
    name: "Общая"
  - id: games
    name: "Игры"
  - id: work
    name: "Работа"
```

Валидация zod-схемой на загрузке. ID — slug (lowercase, [a-z0-9_-]). `name` — отображаемое имя 1–48 символов.

### 4.5. Hot-reload конфига

`chokidar` следит за `rooms.yaml`. На событие изменения:
1. Парсим и валидируем
2. При успехе — атомарно подменяем `Map`
3. При ошибке — оставляем старое состояние, пишем `error`-лог. Не падаем.

Удалённые из YAML комнаты остаются в LiveKit, пока их участники не выйдут. Новых клиентов туда сервер не пускает (`POST /api/join` → 404).

### 4.6. Конфигурация

Env-переменные:
- `PORT=3000`
- `LIVEKIT_URL=wss://livekit.example.com`
- `LIVEKIT_API_KEY=...`
- `LIVEKIT_API_SECRET=...`
- `ROOMS_FILE=./rooms.yaml`
- `LOG_LEVEL=info`

### 4.7. Что НЕ включено

- БД любого вида
- Аккаунты, пароли, OAuth
- Хранение текстовых сообщений и файлов
- Свой WebSocket API (LiveKit-клиенты подключаются к LiveKit напрямую)
- Админ-UI (управление через файл + hot-reload)
- Кастомное rate-limiting (Fastify default + reverse proxy достаточно на старте)

## 5. Electron-клиент

### 5.1. Архитектура процессов

**Main process** — Node.js:
- Создание `BrowserWindow`
- IPC handlers: `get-screen-sources`, `get-prefs`, `set-prefs`, `check-update`, `install-update`
- `desktopCapturer.getSources({ types: ['screen', 'window'] })` для picker-а демонстрации
- `electron-updater` — проверка раз в час и при старте
- `electron-store` — persistent prefs (ник, deviceId, audioConstraints, PTT-key)

**Preload** — `contextBridge.exposeInMainWorld('api', { ... })` с типизированными обёртками над IPC.

**Renderer** — React-приложение:
- React 18 + TypeScript strict
- Vite + `vite-plugin-electron`
- Tailwind + shadcn/ui (тёмная тема как дефолт, без переключателя)
- `livekit-client` + `@livekit/components-react`
- `zustand` — глобальное состояние
- ESLint + Prettier

### 5.2. UI — единый экран, два view

```
view: "lobby" | "room"
```

Никакого React Router — переключение по полю в zustand-store.

#### Lobby view
- Поле «Ваш ник» (сохраняется в prefs)
- Список комнат:
  - Имя комнаты + счётчик `N/8`
  - Развёрнутый список ников участников
  - Иконка-индикатор: пустая / есть участники
- Кнопка-шестерёнка → settings-модалка

#### Room view
- Сетка плиток участников (имя, иконки mic/cam, индикатор «говорит сейчас»)
- При активной демонстрации — большая плитка screen-share, остальные мини
- Боковая панель чата (текстовые сообщения, поле ввода)
- Нижняя панель контролов:
  - Toggle микрофон
  - Toggle камера
  - Toggle демонстрация экрана (disabled, если уже шарит другой)
  - Покинуть комнату
  - Push-to-talk индикатор
  - Индикатор уровня микрофона
- Клик по плитке участника — попап с регулировкой громкости только этого участника

#### Settings-модалка
- Select микрофона (`navigator.mediaDevices.enumerateDevices()`)
- Select камеры
- Select динамиков (применяется через `audioElement.setSinkId(deviceId)`)
- Чекбоксы:
  - `echoCancellation`
  - `noiseSuppression`
  - `autoGainControl`
- Push-to-talk:
  - Toggle вкл/выкл
  - Capture хоткея (по умолчанию: `Space`, удерживать)
  - Hotkey работает **только когда окно в фокусе** (без global hotkey — это лишний нативный модуль и риск)

### 5.3. Поток входа в комнату

```
1. user clicks room card
2. validate displayName not empty
3. POST /api/join { roomId, displayName }
4. on 200 → save token + livekitUrl in zustand
5. <LiveKitRoom token={...} serverUrl={...}> connects via WSS
6. on RoomEvent.Connected:
   - publish mic track with saved deviceId + audioConstraints
   - publish camera track if last state was "camera on"
7. switch view: "lobby" → "room"
```

### 5.4. Демонстрация экрана

Electron не показывает встроенный picker для `getDisplayMedia()` — нужен кастомный.

Поток:
1. Кнопка «Демонстрация» disabled, если в `room.remoteParticipants` уже есть screen-share track
2. Клик → IPC `get-screen-sources` → main вызывает `desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 180 } })`
3. Renderer показывает кастомный picker (модалка с миниатюрами)
4. После выбора:
   ```ts
   const stream = await navigator.mediaDevices.getUserMedia({
     audio: false,
     video: {
       mandatory: {
         chromeMediaSource: 'desktop',
         chromeMediaSourceId: source.id,
       },
     },
   });
   const track = stream.getVideoTracks()[0];
   await room.localParticipant.publishTrack(track, {
     source: Track.Source.ScreenShare,
   });
   ```
5. Кнопка «Остановить демонстрацию» → unpublish + `track.stop()`
6. Правило «один за раз» enforced на клиенте; race-condition между двумя одновременными нажатиями маловероятен (lobby до 8 человек), серверный enforcement не делаем

### 5.5. Текстовый чат

- Отправка: `room.localParticipant.publishData(payload, { reliable: true })`
- Payload: `JSON.stringify({ type: "chat", text, timestamp, fromIdentity })` → `new TextEncoder().encode(...)`
- Получение: подписка на `RoomEvent.DataReceived` → decode → push в zustand-массив сообщений
- Массив сообщений живёт пока пользователь в комнате; при выходе очищается
- Reliable mode (TCP-like, гарантия доставки в порядке)

### 5.6. Persisted prefs (electron-store)

```ts
type Prefs = {
  displayName: string;
  audioInputDeviceId: string | null;
  audioOutputDeviceId: string | null;
  videoInputDeviceId: string | null;
  audioConstraints: {
    echoCancellation: boolean;
    noiseSuppression: boolean;
    autoGainControl: boolean;
  };
  pushToTalk: { enabled: boolean; key: string };
  participantVolumes: Record<string, number>; // by identity prefix (без random suffix)
};
```

Дефолты: все три audioConstraints = `true`, PTT off, ник = `os.userInfo().username` при первом запуске.

### 5.7. Auto-update

- `electron-builder.yml` с `publish: { provider: github }`
- `electron-updater` проверяет:
  - При запуске приложения
  - Раз в час, пока приложение запущено
- При наличии обновления — ненавязчивый toast «Доступна версия X.Y.Z» с кнопкой «Установить и перезапустить»
- Никаких force-update, никаких блокировок UI

### 5.8. Что НЕ включено

- Уведомления в трее, hide-to-tray
- Global hotkey для PTT (только когда окно в фокусе)
- Запись разговоров
- Виртуальные фоны / эффекты
- Эмодзи-реакции
- Звуковые уведомления о входе/выходе
- macOS / Linux сборки

## 6. Сценарии и обработка ошибок

### 6.1. Первый запуск
- Окно открывается на `lobby` view
- Поле ника = `os.userInfo().username` (или пустое, если не получилось)
- `GET /api/rooms` → loading-skeleton → данные
- Если сервер недоступен — карточка «Не удаётся подключиться [Повторить]»

### 6.2. Потеря связи с LiveKit
- LiveKit Client SDK реконнектится автоматически (до 30 секунд)
- В UI overlay «Переподключение...»
- Если за 30 секунд не подключилось — выкидываем в lobby с тостом «Связь потеряна»

### 6.3. Падение Lobby-сервера
- Пользователь в комнате — продолжает разговаривать (LiveKit-сессия независима)
- Список комнат не обновляется, баннер «Нет связи с сервером» в lobby

### 6.4. Таблица ошибок Lobby-сервера

| Код | Ситуация | UI-реакция |
|---|---|---|
| 400 | Невалидный displayName | Подсветка поля + сообщение «Введите ник» |
| 404 | roomId отсутствует в YAML | Тост «Комната недоступна» + рефреш списка |
| 409 reason=full | Комната заполнена 8/8 | Модалка «Комната заполнена» |
| 409 reason=duplicate_name | Ник занят в этой комнате | «Этот ник уже используется, выберите другой» |
| 5xx или нет ответа | Серверная ошибка | Тост «Ошибка сервера» |
| Network error | Сети нет | Баннер «Нет соединения» |

### 6.5. Таблица ошибок WebRTC

| Событие | Реакция |
|---|---|
| `RoomEvent.Disconnected` (`reason: ServerShutdown`) | Возврат в lobby, тост «Сервер перезапущен» |
| `RoomEvent.Disconnected` (`reason: DuplicateIdentity`) | Возврат в lobby, тост «Подключение из другого окна» |
| `MediaDeviceFailure` — микрофон занят | Тост «Микрофон занят», иконка перечёркнута |
| `getDisplayMedia` reject (cancel в picker) | Тихо игнорируем |
| `PublishTrackError` для screen share | Тост с конкретной ошибкой |
| Permission denied (mic/cam) | Заходим только слушателем + баннер «Микрофон недоступен — [Открыть настройки Windows]» |
| deviceId из prefs больше не существует | Fallback на default, тост «Использую другой микрофон» |

### 6.6. Принципы

- Все ошибки — non-fatal: пользователь возвращается в lobby с понятным сообщением
- Crash-падений main process быть не должно: все IPC handlers в try/catch
- Никаких modal-диалогов из main process — всё через тосты в renderer

## 7. Деплой и окружения

### 7.1. Dev

- Lobby-сервер: `npm run dev` → `localhost:3000`
- LiveKit: `docker run --rm -p 7880:7880 livekit/livekit-server --dev` → `localhost:7880`
- Electron: `npm run dev` (Vite + electron-vite в watch-режиме)
- HTTP без TLS работает на localhost (Chromium разрешает getUserMedia на `http://localhost`)

### 7.2. Prod

- 1× Hetzner CPX21 (Ubuntu 24.04)
- docker-compose с тремя сервисами:
  - **caddy** — reverse proxy, авто-Let's Encrypt, порты 80/443
  - **livekit** (`livekit/livekit-server`) — внутренний 7880, проброс наружу 7881–7882/UDP для RTC
  - **lobby-server** (наш образ) — внутренний 3000
- `Caddyfile`:
  - `chat.example.com → lobby-server:3000`
  - `livekit.example.com → livekit:7880` (с поддержкой WS upgrade)
- LiveKit-конфиг:
  - TURN на 443/TCP включён (для строгих корпоративных firewall)
  - Встроенный TURN, отдельный coturn не нужен
- Логи в stdout, ротация через docker logging driver

### 7.3. Структура репозитория

```
voicechat/
├── apps/
│   ├── client/                  # Electron + React
│   │   ├── src/main/            # main process
│   │   ├── src/preload/         # preload bridge
│   │   ├── src/renderer/        # React app
│   │   ├── electron-builder.yml
│   │   └── package.json
│   └── server/                  # Lobby-сервер
│       ├── src/
│       ├── rooms.yaml
│       └── package.json
├── deploy/
│   ├── docker-compose.yml
│   ├── Caddyfile
│   ├── livekit.yaml
│   └── README.md
├── docs/
│   └── superpowers/specs/
├── package.json                 # workspace root (npm workspaces)
├── tsconfig.base.json
├── .eslintrc.cjs
├── .prettierrc
└── README.md
```

### 7.4. CI (опционально)

GitHub Actions:
- На push в `main` — линт обоих пакетов
- На тег `vX.Y.Z` — сборка `.exe` через `electron-builder`, публикация в GitHub Release. `electron-updater` подхватывает релиз автоматически.

### 7.5. Переменные окружения клиента

- `VITE_LOBBY_URL` (например, `https://chat.example.com`) — встраивается в сборку Vite. Поменять = пересобрать. Это нормально для одно-инстансной инсталляции.

### 7.6. Деплой-чеклист (для README.md в `deploy/`)

1. Поднять VPS, открыть порты 80/443/TCP, 7881–7882/UDP
2. Указать DNS A-запись на IP
3. `git clone`, заполнить `.env`
4. `docker compose up -d`
5. Caddy получает сертификат за минуту

## 8. Открытые вопросы

Эти решения принимаются перед деплоем, не блокируют разработку:

1. **Домен/TLS.** Варианты: купленный домен (`.xyz` за ~$1/год) / DuckDNS (бесплатный поддомен). Решается перед первым deploy.
2. **Хостинг сборок для autoupdate.** По умолчанию — GitHub Releases.
3. **Имя пакета и displayName приложения.** Влияет на ID процесса в Windows и на путь к `electron-store`. Нужно решить перед первой сборкой.

## 9. Что явно НЕ входит в этот проект

Чтобы не было вопросов «а почему этого нет»:

- Регистрация и аккаунты пользователей
- Постоянная история чата
- Загрузка файлов и картинок в чат
- Несколько одновременных демонстраций экрана
- Удалённое управление (TeamViewer-стиль)
- Системный звук в screen share
- Шумоподавление уровня Krisp/RNNoise
- macOS и Linux сборки
- Код-подпись (Windows EV / Apple Developer)
- Запись звонков
- Эмодзи, реакции, звуковые уведомления
- Виртуальные фоны
- Автоматизированные тесты (юнит/E2E)
- Глобальные горячие клавиши
- Hide-to-tray, фоновый режим
