# Screen-share audio playback + кастомный UI зрителя демки

**Дата:** 2026-05-23
**Статус:** Design (брейншторм завершён, готово к написанию плана реализации)
**Скоуп:** Tauri-клиент, отправка не трогается. Изменения локализованы в `apps/client/src/renderer` и `apps/client/src/shared/types.ts`. Сервер не трогается.

## 1. Цель

Сейчас в Tauri-ветке `startShare()` системный звук демки **корректно захватывается и публикуется** в LiveKit как `Track.Source.ScreenShareAudio`, но на принимающей стороне его никто не attach-ит к `<audio>`-элементу — поэтому зрители его не слышат. Параллельно у зрителя нет компактных контролов поверх большого тайла шарера: только fullscreen-кнопка.

Задача — починить воспроизведение звука демки **с независимой от голоса регулировкой громкости** и добавить компактный набор контролов, всплывающих поверх большого тайла шарера при наведении.

## 2. Сводка решений

| Аспект | Решение |
|---|---|
| Захват звука демки (отправитель) | Без изменений — Tauri-ветка `getDisplayMedia({audio:true, video:true})` уже работает |
| Воспроизведение звука демки (зритель) | Параллельный WebAudio-граф в `ParticipantTile` для `Track.Source.ScreenShareAudio`, аналогичный микрофонному (MediaStreamSource → GainNode → destination) |
| Громкость демки | Независимая от голосовой, диапазон 0..2 (как у голоса), персистится в `prefs.participantScreenShareVolumes` per participant name |
| Mute демки | Отдельный от голоса флаг, `prefs.participantScreenShareMuted` per participant name |
| Output device sink | Тот же `prefs.audioOutputDeviceId`, что у голоса (через `AudioContext.setSinkId` либо fallback на `<audio>`) |
| UI контролов зрителя | Полупрозрачная панель, появляющаяся в правом верхнем углу большого тайла шарера при hover/focus |
| Pop-out демки | Через нативный Picture-in-Picture (`video.requestPictureInPicture()`) — поддерживается WebView2 и Chromium, никаких новых Tauri-окон |
| Бейдж "это демка" | Маленький значок `🖥` рядом с именем в bottom-left pill |
| FPS/битрейт зрителя | Опрос `RTCRtpReceiver.getStats()` раз в 1 сек, показ `48 fps · 6.2 Mbps` в углу панели контролов |
| Electron-клиент | На него правки не распространяются: его `startShare()` не публикует `ScreenShareAudio`, поэтому новый код просто не активируется (там этой публикации нет в комнате). Тайл, если шарит Tauri-юзер, у Electron-зрителя также не должен получать звук — это допустимая регрессия для будущей итерации. |

## 3. Архитектура изменений

### 3.1. Где живёт код

```
apps/client/src/
├── renderer/
│   ├── components/
│   │   ├── ParticipantTile.tsx          ← +новый useEffect для ScreenShareAudio
│   │   │                                   +ScreenShareOverlay (новый под-компонент)
│   │   │                                   +screen-бейдж в name pill
│   │   └── ParticipantContextMenu.tsx   ← +второй слайдер "Громкость демки" + второй mute
│   └── hooks/
│       └── useReceiverStats.ts          ← новый: getStats() для входящего ScreenShare видео
└── shared/
    └── types.ts                          ← +participantScreenShareVolumes/Muted в Prefs
```

Никаких новых файлов в `apps/client/src/main/` (Electron main process) или в `apps/client-tauri/src-tauri/` — это чисто renderer-side изменения.

### 3.2. Принцип разделения

`ParticipantTile.tsx` сейчас уже превратился в большой файл с микрофонным WebAudio-графом, видео-attach, fullscreen, статус-чипами и pill'ом. Чтобы он не разросся ещё больше, **новый overlay-компонент** (`ScreenShareOverlay`) выделяется в отдельный файл:

```
ParticipantTile.tsx          — основной тайл, видеo/аватар, чипы, pill
ScreenShareOverlay.tsx       — overlay с слайдером громкости, mute, PiP, FPS-индикатором
useReceiverStats.ts          — хук для опроса getStats(), переиспользуемый
```

`ScreenShareOverlay` рендерится внутри `ParticipantTile` условно: `{remoteScreenShareAudioOrVideo && <ScreenShareOverlay ... />}`. Получает `participant`, `videoElement` (для PiP), `participantKey`, `prefs` через пропсы. Не имеет своего state — всё либо в prefs (volume/mute), либо в локальном hook.

WebAudio-граф для `ScreenShareAudio` живёт в **самом ParticipantTile**, не в overlay — потому что граф нельзя пересоздавать при unmount overlay'я (например когда курсор уходит). Overlay только читает текущее значение из prefs и пишет через `setPrefs`; применение к GainNode делает основной useEffect в ParticipantTile.

## 4. Часть 1: Воспроизведение звука демки

### 4.1. Изменения в `Prefs` (`shared/types.ts`)

```ts
export type Prefs = {
  // ... существующие поля
  participantVolumes: Record<string, number>;
  participantMuted: Record<string, boolean>;
  // НОВОЕ:
  participantScreenShareVolumes: Record<string, number>;
  participantScreenShareMuted: Record<string, boolean>;
  // ...
};
```

Дефолт в `apps/client/src/main/prefs.ts` — два пустых объекта `{}`. Миграция не нужна — `electron-store` отдаст `undefined` для старых юзеров, в коде везде `prefs.participantScreenShareVolumes[name] ?? 1` и `prefs.participantScreenShareMuted[name] ?? false`.

### 4.2. Новый useEffect в `ParticipantTile.tsx`

Симметрично существующему микрофонному, но независимый граф. Новые refs:

```ts
const screenAudioCtxRef = useRef<AudioContext | null>(null);
const screenSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
const screenSourceStreamIdRef = useRef<string | null>(null);
const screenGainNodeRef = useRef<GainNode | null>(null);
const screenAudioRef = useRef<HTMLAudioElement | null>(null);
const [screenAudioGraphTick, setScreenAudioGraphTick] = useState(0);
```

Useeffect attach-а:
```ts
useEffect(() => {
  if (p.isLocal) return;
  const pub = p.getTrackPublication(Track.Source.ScreenShareAudio);
  const track = pub?.track;
  const el = screenAudioRef.current;
  if (!track || !el) return;

  // Идентично микрофонному пути: attach к <audio> для прокачки потока,
  // muted=true чтобы элемент не звучал, реальный звук через GainNode.
  track.attach(el);
  el.muted = true;
  el.volume = 0;

  // ... (создаём AudioContext, GainNode, source, fallback на element — копия логики строк 115-188 микрофонного useEffect, с screen* ref'ами)
}, [p, screenAudioTrackSid, screenAudioMuted, screenAudioTrackReady, prefs?.audioOutputDeviceId]);
```

И второй useEffect для применения громкости:
```ts
useEffect(() => {
  if (p.isLocal) return;
  const gain = screenGainNodeRef.current;
  const ctx = screenAudioCtxRef.current;
  const el = screenAudioRef.current;
  const vol = prefs?.participantScreenShareVolumes[participantKey] ?? 1;
  const muted = prefs?.participantScreenShareMuted[participantKey] ?? false;
  // ... применяем gain.gain.setTargetAtTime либо el.volume — копия логики строк 211-237
}, [p, prefs?.participantScreenShareVolumes, prefs?.participantScreenShareMuted, screenAudioGraphTick]);
```

И useEffect teardown на unmount — симметрично существующему.

В JSX добавляется второй скрытый `<audio>`:
```tsx
{!p.isLocal && <audio ref={audioRef} autoPlay />}
{!p.isLocal && <audio ref={screenAudioRef} autoPlay />}
```

### 4.3. Изменения в `ParticipantContextMenu.tsx`

Добавляется второй блок с слайдером — копия существующего, но для screen-share:

```tsx
{p.hasScreenShareAudio && (
  <>
    <ContextMenuSeparator />
    <ContextMenuItem onSelect={(e) => { e.preventDefault(); toggleScreenMute(); }}>
      {screenMuted ? <Volume2 /> : <VolumeX />}
      <span>{screenMuted ? 'Включить звук демки' : 'Отключить звук демки'}</span>
    </ContextMenuItem>
    <div className="flex items-center gap-3 px-2 py-2">
      <span className="text-xs text-fg-muted">Громкость демки</span>
      <Slider value={[screenVolume]} min={0} max={2} step={0.05} disabled={screenMuted}
              onValueChange={(v) => setScreenVolume(v[0] ?? 1)} className="flex-1" />
      <span className="w-12 text-right font-mono text-[11px] tabular-nums text-fg">
        {Math.round(screenVolume * 100)}%
      </span>
    </div>
  </>
)}
```

`hasScreenShareAudio` приходит пропсом — родительский `ParticipantTile` уже знает про публикацию.

## 5. Часть 2: Overlay-контролы зрителя

### 5.1. Компонент `ScreenShareOverlay.tsx`

```tsx
type Props = {
  participant: Participant;
  participantKey: string;
  videoElement: HTMLVideoElement | null;  // для PiP
  hasScreenShareAudio: boolean;
};

export function ScreenShareOverlay({ participant, participantKey, videoElement, hasScreenShareAudio }: Props) {
  const { prefs, setPrefs } = useStore();
  const stats = useReceiverStats(participant, Track.Source.ScreenShare);
  // ...
  return (
    <div className="absolute top-2 right-2 flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1.5 backdrop-blur
                    opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
      {hasScreenShareAudio && <ScreenVolumeMini ... />}
      {hasScreenShareAudio && <button onClick={toggleMute}>{screenMuted ? <VolumeX/> : <Volume2/>}</button>}
      <button onClick={requestPiP} title="Picture-in-Picture"><PictureInPicture2 /></button>
      {stats && <span className="text-[10px] font-mono text-fg-subtle">{stats.fps} fps · {stats.bitrateMbps} Mbps</span>}
    </div>
  );
}
```

Поведение:
- **Volume mini** — компактный 60-пиксельный слайдер прямо в overlay. Тот же `prefs.participantScreenShareVolumes[participantKey]`.
- **Mute** — кнопка-иконка, переключает `prefs.participantScreenShareMuted[participantKey]`.
- **PiP** — вызывает `videoElement.requestPictureInPicture()`. Если уже в PiP — `document.exitPictureInPicture()`. Состояние "сейчас в PiP" локальное через `useState` + слушатель события `enterpictureinpicture`/`leavepictureinpicture` на video-элементе.
- **FPS · Mbps** — из `useReceiverStats`, обновляется раз в 1 сек.

Overlay скрыт по умолчанию (`opacity-0`), показывается при `group-hover` родителя (родитель — сам тайл с классом `group`, который уже есть) либо при focus-within (для клавиатурной навигации).

### 5.2. Хук `useReceiverStats`

```ts
type ReceiverStats = { fps: number; bitrateMbps: number };

export function useReceiverStats(p: Participant, source: Track.Source): ReceiverStats | null {
  const [stats, setStats] = useState<ReceiverStats | null>(null);
  useEffect(() => {
    const pub = p.getTrackPublication(source);
    const receiver = pub?.track?.receiver;
    if (!receiver) { setStats(null); return; }
    let prevBytes = 0;
    let prevTs = 0;
    const id = setInterval(async () => {
      const report = await receiver.getStats();
      let fps = 0; let bytes = 0; let ts = 0;
      report.forEach((s) => {
        if (s.type === 'inbound-rtp' && s.kind === 'video') {
          fps = s.framesPerSecond ?? 0;
          bytes = s.bytesReceived ?? 0;
          ts = s.timestamp;
        }
      });
      if (prevTs > 0 && ts > prevTs) {
        const dtSec = (ts - prevTs) / 1000;
        const dBytes = bytes - prevBytes;
        const bps = (dBytes * 8) / dtSec;
        setStats({ fps: Math.round(fps), bitrateMbps: +(bps / 1_000_000).toFixed(1) });
      }
      prevBytes = bytes; prevTs = ts;
    }, 1000);
    return () => clearInterval(id);
  }, [p, source]);
  return stats;
}
```

Поллинг внутри hook'а нужен потому, что `getStats()` асинхронен и WebRTC не даёт push-уведомлений. 1 сек — достаточно частый интервал для UI без перегрева.

### 5.3. Picture-in-Picture

Стандартный Web API:
```ts
async function togglePiP() {
  if (!videoElement) return;
  try {
    if (document.pictureInPictureElement === videoElement) {
      await document.exitPictureInPicture();
    } else {
      await videoElement.requestPictureInPicture();
    }
  } catch (e) {
    console.warn('[pip] failed', e);
  }
}
```

Никаких новых Tauri-окон. WebView2 (Tauri) и Chromium (Electron) оба поддерживают video PiP. Окно PiP всплывает поверх всех приложений, переживает свернутое основное окно — то, что нужно для просмотра демки на втором мониторе.

PiP-окно даёт нативные системные контролы (play/pause), но громкость в нём системная — наш WebAudio-граф продолжает работать как раньше, потому что PiP только переносит **видео**, а звук всегда шёл через свой `<audio>`-канал (точнее WebAudio).

### 5.4. Бейдж "это демка" в name pill

В существующем `<div className="absolute bottom-2 left-2 ...">` добавляется иконка `Monitor` (lucide-react) рядом с `Mic`-иконкой когда `videoSource === Track.Source.ScreenShare`:

```tsx
{videoSource === Track.Source.ScreenShare && (
  <Monitor size={11} className="text-fg-subtle" />
)}
{!micOff && <Mic size={11} className={cn(speaking ? 'text-fg' : 'text-fg-subtle')} />}
<span className="font-medium text-fg">{p.name}</span>
```

Не использует слов "screen" или "demo" — иконки достаточно. Соответствует существующей минималистичной эстетике.

## 6. Обработка ошибок

| Ошибка | Поведение |
|---|---|
| Шарер на Electron-клиенте, не публикует `ScreenShareAudio` | `getTrackPublication(ScreenShareAudio)` возвращает undefined → useEffect ранний return, overlay не показывает mute/volume контролы, остальное работает |
| WebAudio недоступен (редко в Electron/Tauri) | Fallback на нативный `<audio>.volume` (cap 1.0) — копия существующей логики |
| `requestPictureInPicture()` отклонён (пользователь, политика) | catch → `console.warn`, кнопка PiP остаётся активна — повторный клик пробует снова |
| `setSinkId` не поддерживается | Try/catch с .catch(()=>undefined), как уже сделано для голоса |
| `getStats()` падает или возвращает пусто | `stats === null` → строка fps/Mbps не рендерится |
| Участник перепереподписался (track sid сменился) | `screenAudioTrackSid` в deps → useEffect перезапускается, новый `MediaStreamAudioSourceNode` строится |
| Участник остановил демку | publication пропадает → effect cleanup отключает source, overlay перестаёт рендериться родителем |

## 7. Тестирование

Полностью ручное (соответствует ADR проекта — авто-тестов на этом этапе нет).

Чек-лист сценариев:

1. **Two Tauri clients, sender ticks system audio:**
   - Receiver слышит звук демки + независимый слайдер + независимый mute.
   - Изменение громкости голоса не влияет на громкость демки и наоборот.
2. **Receiver меняет output device** в SettingsModal:
   - Звук демки перенаправляется в новый device (через AudioContext.setSinkId либо fallback).
3. **PiP**:
   - Открывается окно поверх всего. Звук продолжает идти через основное окно (не дублируется).
   - Закрытие PiP возвращает видео в тайл.
4. **Sharer останавливает шеру**:
   - Overlay исчезает у зрителей. WebAudio-граф screen-share очищается. Никаких "висящих" `<audio>`-элементов.
5. **Sharer запускает шеру повторно после Stop**:
   - Громкость демки восстанавливается из prefs (persisted).
6. **Sharer на Electron**, зритель на Tauri:
   - Звука нет (ожидаемо, Electron не публикует ScreenShareAudio). Overlay показывает PiP/FPS, но не volume/mute. Не падает.
7. **Bad network / packet loss** на принимающей стороне:
   - FPS-индикатор показывает деградацию. Звук может рваться — это нормально, UI это отражает.
8. **Sharer mute/unmute системного звука посреди шеры** (через ОС-микшер) — не наш случай; звук на стороне источника просто становится тишиной, никаких ошибок.

## 8. Что НЕ входит в эту итерацию

- Захват системного звука в Electron-ветке (`audio: false` в `getUserMedia` хардкод — отдельная задача, требует исследования рабочего loopback-подхода для Electron 28+).
- Реакции эмодзи поверх демки — отдельная фича, требует data channels.
- Чат поверх демки — есть `ChatPanel`, перегруз UI.
- Запоминание состояния PiP между шерами (если PiP был открыт, открыть автоматически при следующей шере) — добавляет состояние, скоупит мало пользы.
- Авто-нормализация громкости демки.

## 9. Затронутые файлы

| Файл | Изменение |
|---|---|
| `apps/client/src/shared/types.ts` | +2 поля в `Prefs` |
| `apps/client/src/main/prefs.ts` | дефолты для двух новых полей |
| `apps/client/src/renderer/components/ParticipantTile.tsx` | +2 useEffect для screen audio graph + 1 useEffect для teardown + второй `<audio>` элемент + render `<ScreenShareOverlay>` + бейдж `Monitor` |
| `apps/client/src/renderer/components/ScreenShareOverlay.tsx` | новый файл |
| `apps/client/src/renderer/hooks/useReceiverStats.ts` | новый файл |
| `apps/client/src/renderer/components/ParticipantContextMenu.tsx` | +блок слайдера/mute для демки |

Сервер, lobby-протокол, LiveKit-конфиг, IPC — не затрагиваются.
