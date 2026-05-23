# Screen-share audio playback + кастомный UI зрителя демки — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Починить воспроизведение звука демки у получателей и добавить компактный overlay с PiP / FPS-индикатором / контролами громкости поверх большого тайла шарера.

**Architecture:** Параллельный WebAudio-граф в `ParticipantTile` для `Track.Source.ScreenShareAudio` (по образцу существующего микрофонного), независимая громкость и mute per-participant в `Prefs`. Новый компонент `ScreenShareOverlay` рендерится поверх большого тайла шарера и использует нативный Picture-in-Picture API + новый хук `useReceiverStats` для FPS/битрейта. Все изменения — только в renderer'е, шарящемся между Electron и Tauri клиентами.

**Tech Stack:** React 18, TypeScript strict, livekit-client v2, Web Audio API, Picture-in-Picture API (Chromium/WebView2), lucide-react icons, Radix UI primitives, Tailwind.

**Spec reference:** `docs/superpowers/specs/2026-05-23-screenshare-audio-and-viewer-ui-design.md`

**Verification model:** Этот проект **не имеет авто-тестов**. Верификация на каждом шаге = `npm run lint` + `npm run build -w @voicechat/client` (это включает tsc через electron-vite) + указанная ручная проверка в запущенном клиенте.

**Project context the worker needs to know:**

- Монорепо: `apps/server` (Fastify lobby), `apps/client` (Electron), `apps/client-tauri` (Tauri 2). React-рендерер `apps/client/src/renderer/` **шарится** между двумя клиентами через `vite.config.ts` alias trickery — менять надо только в `apps/client/src/renderer/`.
- Текущая ситуация со звуком демки: на отправляющей Tauri-стороне `ScreenShareAudio` корректно публикуется (см. `RoomView.tsx` строки ~239-268), но на приёмной никто не цепляет track к `<audio>` или WebAudio — поэтому тишина. Это root cause из дебага.
- `ParticipantTile.tsx` уже содержит сложный WebAudio-граф для **микрофонного** track'а (MediaStreamAudioSourceNode → GainNode → destination). Нам нужно второй такой же граф для ScreenShareAudio, **независимый**, с отдельной громкостью.
- Тип `Prefs` живёт в `apps/client/src/shared/types.ts`, дефолты — в `apps/client/src/main/prefs.ts`. Существующая `migrate()` функция спредит дефолты поверх stored через `{ ...defaults, ...stored }`, так что новые поля автоматически появятся у старых юзеров.
- В коде нет глобального TrackSubscribed-обработчика для аудио — каждый ParticipantTile сам attach-ит свой track.

---

## File Structure

**Modify:**
- `apps/client/src/shared/types.ts` — +2 поля в `Prefs`
- `apps/client/src/main/prefs.ts` — дефолты для двух новых полей
- `apps/client/src/renderer/components/ParticipantTile.tsx` — +параллельный WebAudio граф для ScreenShareAudio, +рендер ScreenShareOverlay, +Monitor-бейдж в name pill, +второй `<audio>` элемент
- `apps/client/src/renderer/components/ParticipantContextMenu.tsx` — +блок слайдера/mute для демки, +prop `hasScreenShareAudio`

**Create:**
- `apps/client/src/renderer/components/ScreenShareOverlay.tsx` — overlay с PiP/громкостью/mute/stats
- `apps/client/src/renderer/hooks/useReceiverStats.ts` — поллинг `RTCRtpReceiver.getStats()` для fps и bitrate

**Not touched:**
- `apps/client/src/main/` (Electron main process)
- `apps/client-tauri/` (Tauri Rust side)
- `apps/server/` (lobby)
- Сетевой/LiveKit-протокол, IPC

---

## Chunk 1: Prefs schema foundation

Расширяем `Prefs` под две новые мапы (volume + muted для screen-share, аналогично существующим микрофонным). Это база для всего остального.

### Task 1.1: Add `participantScreenShareVolumes` and `participantScreenShareMuted` to `Prefs` type

**Files:**
- Modify: `apps/client/src/shared/types.ts`

- [ ] **Step 1: Add fields to Prefs type**

В `apps/client/src/shared/types.ts` найти существующие поля:

```ts
  participantVolumes: Record<string, number>;
  participantMuted: Record<string, boolean>;
```

Сразу после них добавить:

```ts
  /** Per-participant gain for screen-share audio. Independent of participantVolumes.
   *  Key = participant.name ?? identity. Range 0..2 (matches voice). Missing key = 1. */
  participantScreenShareVolumes: Record<string, number>;
  /** Per-participant mute for screen-share audio. Independent of participantMuted. */
  participantScreenShareMuted: Record<string, boolean>;
```

- [ ] **Step 2: Verify typecheck still passes**

Run: `npm run build -w @voicechat/client`
Expected: build succeeds (other files don't reference these fields yet, so no consumer errors).

- [ ] **Step 3: Verify lint passes**

Run: `npm run lint -w @voicechat/client`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/shared/types.ts
git commit -m "feat(types): add screen-share volume/mute fields to Prefs"
```

### Task 1.2: Wire defaults in `apps/client/src/main/prefs.ts`

**Files:**
- Modify: `apps/client/src/main/prefs.ts`

- [ ] **Step 1: Add default empty maps**

В `defaults: Prefs = { ... }` найти существующие:

```ts
  participantVolumes: {},
  participantMuted: {},
```

Сразу после них добавить:

```ts
  participantScreenShareVolumes: {},
  participantScreenShareMuted: {},
```

- [ ] **Step 2: Verify migrate() handles new fields automatically**

Существующая `migrate()`:

```ts
const merged: Prefs = {
  ...defaults,
  ...stored,
  ...
};
```

Спред `...defaults` сначала кладёт `{}` для новых полей, затем `...stored` не перетирает (поскольку у старых юзеров их в stored нет). Никаких изменений в `migrate()` не требуется.

Подтвердить это вручную чтением кода — не запуская — и убедиться, что новые поля **не упоминаются** в спецслучаях типа `if (!merged.micActivationMode)`.

- [ ] **Step 3: Verify typecheck + lint**

Run: `npm run build -w @voicechat/client && npm run lint -w @voicechat/client`
Expected: clean. Если tsc ругается на отсутствие новых полей в `defaults` — значит Step 1 был сделан неверно (новые поля required в типе, и `defaults: Prefs` обязан их иметь).

- [ ] **Step 4: Manual sanity check на запущенном клиенте**

Запустить Electron-клиент (`npm run dev:client`), открыть DevTools, в консоли выполнить:

```js
await window.api.getPrefs()
```

Expected: возвращаемый объект содержит `participantScreenShareVolumes: {}` и `participantScreenShareMuted: {}`. Если на машине уже был сохранён `voicechat-prefs.json` от старой версии — он подмёрджится с дефолтами и эти поля тоже появятся.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/main/prefs.ts
git commit -m "feat(prefs): default empty maps for screen-share volume/mute"
```

---

## Chunk 2: ScreenShareAudio playback in ParticipantTile

Это **главный бизнес-фикс** — без него звук демки молчит. Параллельный WebAudio-граф для `Track.Source.ScreenShareAudio` рядом с микрофонным.

### Task 2.1: Add refs, pub-watching, and second `<audio>` element

**Files:**
- Modify: `apps/client/src/renderer/components/ParticipantTile.tsx`

- [ ] **Step 1: Add refs for the second WebAudio graph**

В начале компонента (после микрофонных refs на строках ~32-36) добавить параллельный набор:

```ts
  // Параллельный WebAudio-граф для Track.Source.ScreenShareAudio.
  // Полностью независим от микрофонного: свой AudioContext, GainNode, source.
  // Зачем отдельный AudioContext: ставить sinkId на ctx можно один раз, и
  // переключение output device не должно дёргать гейн микрофонного графа.
  const screenAudioCtxRef = useRef<AudioContext | null>(null);
  const screenGainNodeRef = useRef<GainNode | null>(null);
  const screenSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const screenSourceStreamIdRef = useRef<string | null>(null);
  const screenAudioRef = useRef<HTMLAudioElement | null>(null);
  const [screenAudioGraphTick, setScreenAudioGraphTick] = useState(0);
```

- [ ] **Step 2: Add publication tracking for ScreenShareAudio**

Рядом с существующими `audioPub`/`audioTrackSid`/`audioMuted`/`audioTrackReady` (строки ~78-81) добавить:

```ts
  const screenAudioPub = p.getTrackPublication(Track.Source.ScreenShareAudio);
  const screenAudioTrackSid = screenAudioPub?.trackSid;
  const screenAudioMuted = screenAudioPub?.isMuted;
  const screenAudioTrackReady = !!screenAudioPub?.track;
  const hasScreenShareAudio = !!screenAudioPub;
```

- [ ] **Step 3: Compute persisted screen-share volume/muted**

Рядом с существующими `muted` и `persistedVolume` (строки ~53-55):

```ts
  const screenMuted = !p.isLocal && !!prefs?.participantScreenShareMuted[participantKey];
  const persistedScreenVolume = prefs?.participantScreenShareVolumes[participantKey];
```

- [ ] **Step 4: Add second hidden `<audio>` element to JSX**

В JSX найти существующий `{!p.isLocal && <audio ref={audioRef} autoPlay />}` (строка ~293) и добавить рядом:

```tsx
      {!p.isLocal && <audio ref={audioRef} autoPlay />}
      {!p.isLocal && <audio ref={screenAudioRef} autoPlay />}
```

- [ ] **Step 5: Verify typecheck + lint**

Run: `npm run build -w @voicechat/client && npm run lint -w @voicechat/client`
Expected: clean. Сам граф ещё не подключён, но всё компилируется.

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/renderer/components/ParticipantTile.tsx
git commit -m "refactor(tile): track ScreenShareAudio publication + add hidden audio el"
```

### Task 2.2: Add WebAudio attach effect for ScreenShareAudio

**Files:**
- Modify: `apps/client/src/renderer/components/ParticipantTile.tsx`

- [ ] **Step 1: Add new useEffect that builds the graph**

Сразу **после** существующего микрофонного attach-useEffect (заканчивается на строке ~188 — у блока с deps `[p, audioTrackSid, audioMuted, audioTrackReady, prefs?.audioOutputDeviceId]`) добавить параллельный:

```ts
  // Параллельный к микрофонному пути attach-эффект для ScreenShareAudio.
  // Структурно делает то же самое: attach к скрытому <audio> чтобы LiveKit
  // прокачал поток, force-mute элемента, реальный звук через WebAudio с
  // независимым GainNode (для громкости 0..200% и индивидуального mute).
  useEffect(() => {
    if (p.isLocal) return;
    const pub = p.getTrackPublication(Track.Source.ScreenShareAudio);
    const track = pub?.track;
    const el = screenAudioRef.current;
    if (!track || !el) return;

    track.attach(el);
    el.muted = true;
    el.volume = 0;

    let ctx = screenAudioCtxRef.current;
    if (!ctx) {
      try {
        ctx = new AudioContext();
        screenAudioCtxRef.current = ctx;
      } catch {
        // Web Audio недоступен — fallback на нативный <audio>.
        el.muted = false;
        el.volume = 1;
        return () => {
          track.detach(el);
        };
      }
    }

    let gain = screenGainNodeRef.current;
    if (!gain) {
      gain = ctx.createGain();
      gain.connect(ctx.destination);
      screenGainNodeRef.current = gain;
    }

    // Пересобираем MediaStreamAudioSourceNode при смене underlying MediaStreamTrack
    // (resubscribe, republish и т.п. меняют идентичность track'а).
    const mst = track.mediaStreamTrack;
    if (mst) {
      const streamId = mst.id;
      if (screenSourceStreamIdRef.current !== streamId) {
        try {
          screenSourceNodeRef.current?.disconnect();
        } catch {
          // already disconnected
        }
        try {
          const stream = new MediaStream([mst]);
          const source = ctx.createMediaStreamSource(stream);
          source.connect(gain);
          screenSourceNodeRef.current = source;
          screenSourceStreamIdRef.current = streamId;
          // Bump tick — заставляет gain-effect перенакатить громкость.
          setScreenAudioGraphTick((n) => n + 1);
        } catch {
          // Если не получилось — fallback на нативное воспроизведение.
          el.muted = false;
          el.volume = 1;
        }
      }
    }

    ctx.resume().catch(() => undefined);

    const deviceId = prefs?.audioOutputDeviceId;
    if (deviceId) {
      const ctxWithSink = ctx as AudioContext & {
        setSinkId?: (id: string) => Promise<void>;
      };
      if (typeof ctxWithSink.setSinkId === 'function') {
        ctxWithSink.setSinkId(deviceId).catch(() => undefined);
      } else if ('setSinkId' in HTMLMediaElement.prototype) {
        (el as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> })
          .setSinkId(deviceId)
          .catch(() => undefined);
      }
    }

    return () => {
      track.detach(el);
    };
  }, [p, screenAudioTrackSid, screenAudioMuted, screenAudioTrackReady, prefs?.audioOutputDeviceId]);
```

- [ ] **Step 2: Verify typecheck + lint**

Run: `npm run build -w @voicechat/client && npm run lint -w @voicechat/client`
Expected: clean. Сеттер `setScreenAudioGraphTick` уже используется внутри effect-а (в ветке rebuild source), а **прочитываться** значение `screenAudioGraphTick` будет в Task 2.4. Если линтер всё-таки ругается на unused state-value (не setter) — добавить `// eslint-disable-next-line @typescript-eslint/no-unused-vars` над строкой деструктуризации `useState`. Это уберётся в 2.4.

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/renderer/components/ParticipantTile.tsx
git commit -m "feat(tile): build WebAudio graph for incoming ScreenShareAudio"
```

### Task 2.3: Add teardown effect for screen-share graph on unmount

**Files:**
- Modify: `apps/client/src/renderer/components/ParticipantTile.tsx`

- [ ] **Step 1: Add unmount cleanup**

Сразу **после** существующего микрофонного teardown-эффекта (заканчивается на ~строке 209 — блок с deps `[]`, делающий close() для audioCtxRef и disconnect для sourceNodeRef/gainNodeRef) добавить симметричный:

```ts
  // Teardown для screen-share WebAudio графа при размонтировании тайла.
  useEffect(() => {
    return () => {
      try {
        screenSourceNodeRef.current?.disconnect();
      } catch {
        // ignore
      }
      try {
        screenGainNodeRef.current?.disconnect();
      } catch {
        // ignore
      }
      screenAudioCtxRef.current?.close().catch(() => undefined);
      screenSourceNodeRef.current = null;
      screenSourceStreamIdRef.current = null;
      screenGainNodeRef.current = null;
      screenAudioCtxRef.current = null;
    };
  }, []);
```

- [ ] **Step 2: Verify typecheck + lint**

Run: `npm run build -w @voicechat/client && npm run lint -w @voicechat/client`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/renderer/components/ParticipantTile.tsx
git commit -m "feat(tile): tear down screen-share audio graph on unmount"
```

### Task 2.4: Apply screen-share volume + mute to GainNode

**Files:**
- Modify: `apps/client/src/renderer/components/ParticipantTile.tsx`

- [ ] **Step 1: Add gain-application useEffect**

Сразу **после** существующего микрофонного gain-effect (заканчивается на ~строке 237, deps `[p, muted, persistedVolume, audioGraphTick]`) добавить параллельный:

```ts
  // Применяет screen-share громкость/mute к GainNode. Запускается на каждое
  // изменение prefs.participantScreenShareVolumes/Muted и при пересборке графа.
  useEffect(() => {
    if (p.isLocal) return;
    const gain = screenGainNodeRef.current;
    const ctx = screenAudioCtxRef.current;
    const el = screenAudioRef.current;
    const vol = typeof persistedScreenVolume === 'number' ? persistedScreenVolume : 1;
    if (gain && ctx) {
      const target = screenMuted ? 0 : vol;
      try {
        gain.gain.setTargetAtTime(target, ctx.currentTime, 0.01);
      } catch {
        gain.gain.value = target;
      }
      if (el) {
        el.muted = true;
        el.volume = 0;
      }
      if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);
    } else if (el) {
      // Web Audio недоступен — нативные controls с потолком 100%.
      el.muted = screenMuted;
      el.volume = Math.min(1, vol);
    }
  }, [p, screenMuted, persistedScreenVolume, screenAudioGraphTick]);
```

- [ ] **Step 2: Verify typecheck + lint**

Run: `npm run build -w @voicechat/client && npm run lint -w @voicechat/client`
Expected: clean.

- [ ] **Step 3: First end-to-end manual verification**

Это первый момент в плане, когда звук демки **должен реально пойти у получателя**. Сценарий:

1. Запустить два клиента: один Tauri (sharer), один Electron (viewer). Команды:
   - Terminal 1: `npm run dev:server`
   - Terminal 2: `npm run dev:client-tauri`
   - Terminal 3: `npm run dev:client` (Electron — viewer)
2. Зайти обоими в одну комнату (разные display names).
3. На Tauri начать шерить экран, в picker'е WebView2 поставить галочку "Поделиться системным звуком". В качестве источника — окно с любым воспроизводящимся звуком (YouTube, музыка, игра).
4. В Electron-клиенте, в DevTools, проверить:
   ```js
   document.querySelectorAll('audio').length
   ```
   Должно быть **>=2** (один для микрофона, один для screen-share).
5. **Главное:** на Electron-стороне должен быть **слышен** звук того, что играет на Tauri-стороне.

Если звука нет:
- Проверить в Tauri-DevTools (Edge → `chrome://inspect` или F12 в окне), что `room.localParticipant.getTrackPublications()` содержит элемент с `source === 'screen_share_audio'`.
- Проверить в Electron-DevTools: `room.remoteParticipants.get('<tauri-identity>').getTrackPublication('screen_share_audio')`. Если есть → проблема в attach. Если нет → проблема на стороне отправителя, см. фрагменты RoomView.tsx.

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/renderer/components/ParticipantTile.tsx
git commit -m "feat(tile): apply per-user volume/mute to screen-share audio gain"
```

### Task 2.5: Chunk review

- [ ] **Dispatch plan-document-reviewer** для Chunk 2 (см. шаблон в writing-plans skill).
- [ ] Fix issues, re-dispatch if needed, repeat ≤5 times until Approved.

---

## Chunk 3: ParticipantContextMenu screen-share controls

Второй слайдер и mute-кнопка в контекстном меню участника — рядом с существующими голосовыми контролами.

### Task 3.1: Extend ParticipantContextMenu prop signature

**Files:**
- Modify: `apps/client/src/renderer/components/ParticipantContextMenu.tsx`

- [ ] **Step 1: Update Props type**

В `apps/client/src/renderer/components/ParticipantContextMenu.tsx` найти существующий `type Props` (строки ~13-16):

```ts
type Props = {
  participantName: string;
  children: React.ReactNode;
};
```

Заменить на:

```ts
type Props = {
  participantName: string;
  /** Показывать ли блок громкости/mute для screen-share audio.
   *  true — у этого участника есть publication Track.Source.ScreenShareAudio. */
  hasScreenShareAudio: boolean;
  children: React.ReactNode;
};
```

- [ ] **Step 2: Update function signature**

В сигнатуре `export function ParticipantContextMenu({...}: Props)` добавить `hasScreenShareAudio`:

```ts
export function ParticipantContextMenu({ participantName, hasScreenShareAudio, children }: Props) {
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run build -w @voicechat/client`
Expected: **fail** в `ParticipantTile.tsx` строка ~343 — там вызов `<ParticipantContextMenu participantName={...}>...</ParticipantContextMenu>` без обязательного `hasScreenShareAudio`. Это ожидаемо и будет исправлено в Task 3.3. Пока что — отмечаем, что other callers нужно тоже починить.

```bash
# Грепнуть, чтобы убедиться что точно один call-site:
grep -rn "ParticipantContextMenu" apps/client/src/renderer/
```

Если найдено >1 не-import упоминание — задокументировать всех вызывающих, чтобы поправить в 3.3.

- [ ] **Step 4: Commit (intentionally broken build)**

```bash
git add apps/client/src/renderer/components/ParticipantContextMenu.tsx
git commit -m "refactor(menu): require hasScreenShareAudio prop (build broken until 3.3)"
```

### Task 3.2: Add screen-share volume + mute UI to menu

**Files:**
- Modify: `apps/client/src/renderer/components/ParticipantContextMenu.tsx`

- [ ] **Step 1: Read screen-share state from prefs**

После строки с `const volume = prefs.participantVolumes[participantName] ?? 1;` (~строка 24) добавить:

```ts
  const screenMuted = !!prefs.participantScreenShareMuted[participantName];
  const screenVolume = prefs.participantScreenShareVolumes[participantName] ?? 1;
```

- [ ] **Step 2: Add setScreenVolume / toggleScreenMute handlers**

После существующих `setVolume` и `toggleMute` (~строки 26-38) добавить:

```ts
  const setScreenVolume = async (v: number) => {
    const next = await window.api.setPrefs({
      participantScreenShareVolumes: { ...prefs.participantScreenShareVolumes, [participantName]: v },
    });
    setPrefs(next);
  };

  const toggleScreenMute = async () => {
    const next = await window.api.setPrefs({
      participantScreenShareMuted: { ...prefs.participantScreenShareMuted, [participantName]: !screenMuted },
    });
    setPrefs(next);
  };
```

- [ ] **Step 3: Add second block to ContextMenuContent**

Внутри `<ContextMenuContent>`, **после** существующего `<div>` с волюм-слайдером голоса (~строка 73, закрывающий `</div>`) добавить:

```tsx
        {hasScreenShareAudio && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              onSelect={(e) => {
                e.preventDefault();
                toggleScreenMute();
              }}
              className="[&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0"
            >
              {screenMuted ? <Volume2 /> : <VolumeX />}
              <span>{screenMuted ? 'Включить звук демки' : 'Отключить звук демки'}</span>
            </ContextMenuItem>
            <div className="flex items-center gap-3 px-2 py-2">
              <span className="text-xs text-fg-muted">Громкость демки</span>
              <Slider
                className="flex-1"
                value={[screenVolume]}
                min={0}
                max={2}
                step={0.05}
                disabled={screenMuted}
                onValueChange={(v) => setScreenVolume(v[0] ?? 1)}
              />
              <span className="w-12 text-right font-mono text-[11px] tabular-nums text-fg">
                {Math.round(screenVolume * 100)}%
              </span>
            </div>
          </>
        )}
```

- [ ] **Step 4: Verify typecheck still fails only at call-site**

Run: `npm run build -w @voicechat/client`
Expected: ошибки **только** в `ParticipantTile.tsx`, не в `ParticipantContextMenu.tsx` (внутренние всё консистентно). Если есть внутренние ошибки — поправить, не двигаться дальше.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/renderer/components/ParticipantContextMenu.tsx
git commit -m "feat(menu): add screen-share volume slider and mute toggle"
```

### Task 3.3: Wire `hasScreenShareAudio` through from ParticipantTile

**Files:**
- Modify: `apps/client/src/renderer/components/ParticipantTile.tsx`

- [ ] **Step 1: Pass hasScreenShareAudio prop**

Найти в `ParticipantTile.tsx` рендер `<ParticipantContextMenu>` (последний `return`, ~строка 343):

```tsx
return <ParticipantContextMenu participantName={participantKey}>{tile}</ParticipantContextMenu>;
```

Заменить на:

```tsx
return (
  <ParticipantContextMenu participantName={participantKey} hasScreenShareAudio={hasScreenShareAudio}>
    {tile}
  </ParticipantContextMenu>
);
```

`hasScreenShareAudio` уже определён выше (см. Task 2.1 Step 2).

- [ ] **Step 2: Verify typecheck + lint clean**

Run: `npm run build -w @voicechat/client && npm run lint -w @voicechat/client`
Expected: build green, lint green. Это первый момент в плане после Task 3.1, когда сборка снова **полностью валидна**.

- [ ] **Step 3: End-to-end manual test для меню**

С тем же setup из Task 2.4 (Tauri sharer + Electron viewer, шерится звук):

1. В Electron-клиенте правый клик по тайлу шарящего участника → должно появиться **два** блока громкости: "Громкость" и "Громкость демки", и две mute-опции.
2. Подвигать слайдер "Громкость демки" — звук демки должен меняться **независимо** от голоса (если sharer параллельно говорит). Голосовая громкость не должна затрагиваться.
3. Кликнуть "Отключить звук демки" — звук демки замолкает, голос продолжается.
4. Кликнуть "Включить звук демки" — звук возвращается на ранее выставленный уровень.
5. Закрыть приложение и снова открыть → значения сохраняются.

Тот же тест в обратную сторону (Electron sharer без аудио — Tauri viewer): меню должно **не показывать** screen-share блок (т.к. `hasScreenShareAudio === false`).

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/renderer/components/ParticipantTile.tsx
git commit -m "feat(tile): pass hasScreenShareAudio to context menu"
```

### Task 3.4: Chunk review

- [ ] **Dispatch plan-document-reviewer** для Chunk 3.
- [ ] Fix and re-dispatch as needed.

---

## Chunk 4: useReceiverStats hook

Хук для опроса входящих FPS/битрейта через `RTCRtpReceiver.getStats()`. Используется в overlay для индикатора `48 fps · 6.2 Mbps`.

### Task 4.1: Create the hook file

**Files:**
- Create: `apps/client/src/renderer/hooks/useReceiverStats.ts`

- [ ] **Step 1: Write the hook**

Создать файл `apps/client/src/renderer/hooks/useReceiverStats.ts`:

```ts
import { useEffect, useState } from 'react';
import {
  ParticipantEvent,
  Track,
  type Participant,
  type RemoteAudioTrack,
  type RemoteVideoTrack,
} from 'livekit-client';

export type ReceiverStats = {
  /** Текущий FPS входящего видеопотока (округлено). */
  fps: number;
  /** Средний битрейт за последний интервал в Mbps (1 знак после запятой). */
  bitrateMbps: number;
};

/**
 * Опрашивает RTCRtpReceiver.getStats() раз в 1 сек для указанного source у
 * remote-участника. Возвращает null пока трек не подписан или статистика не
 * доступна. Перезапускается на смену publication (TrackSubscribed/Unsubscribed).
 *
 * Замечание про simulcast: getStats() может вернуть несколько inbound-rtp video
 * записей при receiver-side simulcast. В нашем кейсе LiveKit subscriber всегда
 * получает один поток, так что берём последнюю встретившуюся запись (поведение
 * деградирует gracefully на simulcast — просто показывает один из layer'ов).
 */
export function useReceiverStats(p: Participant, source: Track.Source): ReceiverStats | null {
  const [stats, setStats] = useState<ReceiverStats | null>(null);
  // Принудительная перезапись основного effect-а при появлении/исчезновении
  // подписки: publication может существовать до того, как трек подписан, и
  // без re-trigger мы один раз получили null и больше не пытались бы.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    p.on(ParticipantEvent.TrackSubscribed, bump);
    p.on(ParticipantEvent.TrackUnsubscribed, bump);
    return () => {
      p.off(ParticipantEvent.TrackSubscribed, bump);
      p.off(ParticipantEvent.TrackUnsubscribed, bump);
    };
  }, [p]);

  useEffect(() => {
    const pub = p.getTrackPublication(source);
    const track = pub?.track;
    // RemoteVideoTrack / RemoteAudioTrack экспозят .receiver. Базовый Track
    // его не имеет — нужен type-narrow.
    const receiver =
      track && 'receiver' in track
        ? (track as RemoteVideoTrack | RemoteAudioTrack).receiver
        : null;
    if (!receiver) {
      setStats(null);
      return;
    }
    let prevBytes = 0;
    let prevTs = 0;
    const id = setInterval(async () => {
      let report;
      try {
        report = await receiver.getStats();
      } catch {
        return;
      }
      let fps = 0;
      let bytes = 0;
      let ts = 0;
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
        setStats({
          fps: Math.round(fps),
          bitrateMbps: Number((bps / 1_000_000).toFixed(1)),
        });
      }
      prevBytes = bytes;
      prevTs = ts;
    }, 1000);
    return () => clearInterval(id);
  }, [p, source, tick]);

  return stats;
}
```

- [ ] **Step 2: Verify typecheck + lint**

Run: `npm run build -w @voicechat/client && npm run lint -w @voicechat/client`
Expected: clean. Файл сам по себе ничего не ломает — никто его пока не импортит.

- [ ] **Step 3: (Optional) Manual smoke-test via DevTools**

Если в проекте уже выставлена глобальная ссылка на room (грепнуть `__lkRoom` или подобное в `apps/client/src/renderer/lib/debug-bridge.ts`) — можно вручную убедиться, что receiver.getStats() возвращает осмысленные данные:

```js
const sharer = [...window.__lkRoom.remoteParticipants.values()].find(
  (rp) => rp.getTrackPublication('screen_share'),
);
const report = await sharer.getTrackPublication('screen_share').track.receiver.getStats();
[...report.values()].filter(s => s.type === 'inbound-rtp' && s.kind === 'video');
```

Expected: массив с одной inbound-rtp записью, поля `framesPerSecond` и `bytesReceived` непустые.

Если глобальной ссылки на room нет — **пропустить шаг**, не добавлять временный debug-код в продакт-файлы. Хук будет полноценно проверен в ручном тесте Chunk 6.

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/renderer/hooks/useReceiverStats.ts
git commit -m "feat(hooks): add useReceiverStats for fps/bitrate polling"
```

### Task 4.2: Chunk review

- [ ] **Dispatch plan-document-reviewer** для Chunk 4.

---

## Chunk 5: ScreenShareOverlay component

Полупрозрачный overlay поверх большого тайла шарера с PiP, статистикой и компактными контролами громкости.

### Task 5.1: Create skeleton with PiP button

**Files:**
- Create: `apps/client/src/renderer/components/ScreenShareOverlay.tsx`

- [ ] **Step 1: Initial skeleton**

Создать файл `apps/client/src/renderer/components/ScreenShareOverlay.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { PictureInPicture2, Volume2, VolumeX } from 'lucide-react';
import { type Participant, Track } from 'livekit-client';
import { Slider } from './ui/slider.js';
import { useStore } from '../state/store.js';
import { useReceiverStats } from '../hooks/useReceiverStats.js';

type Props = {
  participant: Participant;
  participantKey: string;
  videoElement: HTMLVideoElement | null;
  hasScreenShareAudio: boolean;
};

/**
 * Полупрозрачная панель в правом верхнем углу большого тайла шарера.
 * Скрыта по умолчанию, показывается при group-hover родителя или focus-within.
 *
 * Содержит:
 *  - mini-slider громкости screen-share audio + mute (только если hasScreenShareAudio)
 *  - кнопку Picture-in-Picture
 *  - индикатор fps / bitrate
 */
export function ScreenShareOverlay({
  participant,
  participantKey,
  videoElement,
  hasScreenShareAudio,
}: Props) {
  const { prefs, setPrefs } = useStore();
  const stats = useReceiverStats(participant, Track.Source.ScreenShare);

  // Source of truth для "сейчас в PiP" — document.pictureInPictureElement.
  // Локального state не держим, но форсим re-render по событиям через tick.
  const [, setPipTick] = useState(0);
  useEffect(() => {
    if (!videoElement) return;
    const bump = () => setPipTick((n) => n + 1);
    videoElement.addEventListener('enterpictureinpicture', bump);
    videoElement.addEventListener('leavepictureinpicture', bump);
    return () => {
      videoElement.removeEventListener('enterpictureinpicture', bump);
      videoElement.removeEventListener('leavepictureinpicture', bump);
    };
  }, [videoElement]);
  const isInPip = !!videoElement && document.pictureInPictureElement === videoElement;

  const togglePip = async () => {
    if (!videoElement) return;
    try {
      if (isInPip) {
        await document.exitPictureInPicture();
      } else {
        await videoElement.requestPictureInPicture();
      }
    } catch (e) {
      console.warn('[pip] toggle failed', e);
    }
  };

  const screenVolume = prefs?.participantScreenShareVolumes[participantKey] ?? 1;
  const screenMuted = !!prefs?.participantScreenShareMuted[participantKey];

  const setScreenVolume = async (v: number) => {
    if (!prefs) return;
    const next = await window.api.setPrefs({
      participantScreenShareVolumes: {
        ...prefs.participantScreenShareVolumes,
        [participantKey]: v,
      },
    });
    setPrefs(next);
  };

  const toggleScreenMute = async () => {
    if (!prefs) return;
    const next = await window.api.setPrefs({
      participantScreenShareMuted: {
        ...prefs.participantScreenShareMuted,
        [participantKey]: !screenMuted,
      },
    });
    setPrefs(next);
  };

  return (
    <div
      className={
        'absolute right-12 top-2 flex items-center gap-2 rounded-md bg-black/60 px-2 py-1.5 backdrop-blur ' +
        'opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100'
      }
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {hasScreenShareAudio && (
        <>
          <button
            type="button"
            onClick={toggleScreenMute}
            className="flex h-6 w-6 items-center justify-center rounded text-fg hover:bg-white/10"
            title={screenMuted ? 'Включить звук демки' : 'Отключить звук демки'}
            aria-label={screenMuted ? 'Включить звук демки' : 'Отключить звук демки'}
          >
            {screenMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
          <Slider
            className="w-20"
            value={[screenVolume]}
            min={0}
            max={2}
            step={0.05}
            disabled={screenMuted}
            onValueChange={(v) => setScreenVolume(v[0] ?? 1)}
            aria-label="Громкость демки"
          />
          <span className="w-9 text-right font-mono text-[10px] tabular-nums text-fg-subtle">
            {Math.round(screenVolume * 100)}%
          </span>
        </>
      )}
      <button
        type="button"
        onClick={togglePip}
        disabled={!videoElement}
        className="flex h-6 w-6 items-center justify-center rounded text-fg hover:bg-white/10 disabled:opacity-40"
        title={isInPip ? 'Закрыть Picture-in-Picture' : 'Picture-in-Picture'}
        aria-label="Picture-in-Picture"
      >
        <PictureInPicture2 size={14} />
      </button>
      {stats && (
        <span className="font-mono text-[10px] tabular-nums text-fg-subtle">
          {stats.fps} fps · {stats.bitrateMbps} Mbps
        </span>
      )}
    </div>
  );
}
```

Замечание про **расположение в углу:** существующая кнопка `Maximize2` сидит в `left-2 top-2`, статус-чипы — в `right-2 top-2`. Чтобы не наезжать на чипы (quality/mic-off/etc.), overlay ставится **слева от** чипов через `right-12 top-2` (12 = около 48px = ширина 2-3 чипов). Если в проекте окажется, что чипов больше — нужно увеличить отступ. Манульная проверка в Task 6.2 покажет.

- [ ] **Step 2: Verify typecheck + lint**

Run: `npm run build -w @voicechat/client && npm run lint -w @voicechat/client`
Expected: clean. Файл компилируется, никем пока не используется.

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/renderer/components/ScreenShareOverlay.tsx
git commit -m "feat(overlay): add ScreenShareOverlay with PiP, volume, stats"
```

### Task 5.2: Chunk review

- [ ] **Dispatch plan-document-reviewer** для Chunk 5.

---

## Chunk 6: Integration into ParticipantTile + Monitor badge + final test pass

Подключаем overlay в большой тайл шарера и добавляем визуальное отличие screen-тайла (иконка Monitor рядом с именем).

### Task 6.1: Add Monitor badge to name pill

**Files:**
- Modify: `apps/client/src/renderer/components/ParticipantTile.tsx`

- [ ] **Step 1: Import Monitor icon**

В импортах из `lucide-react` (строка 9):

```ts
import { Mic, MicOff, VideoOff, VolumeX, Maximize2 } from 'lucide-react';
```

Добавить `Monitor`:

```ts
import { Mic, MicOff, VideoOff, VolumeX, Maximize2, Monitor } from 'lucide-react';
```

- [ ] **Step 2: Render Monitor icon in name pill**

Найти JSX блока name pill (~строки 331-338):

```tsx
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-xs backdrop-blur">
        {!micOff && (
          <Mic size={11} className={cn(speaking ? 'text-fg' : 'text-fg-subtle')} />
        )}
        <span className="font-medium text-fg">{p.name}</span>
        {p.isLocal && <span className="text-fg-subtle">·  ты</span>}
      </div>
```

Заменить на:

```tsx
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-xs backdrop-blur">
        {videoSource === Track.Source.ScreenShare && (
          <Monitor size={11} className="text-fg-subtle" aria-label="Демонстрация экрана" />
        )}
        {!micOff && (
          <Mic size={11} className={cn(speaking ? 'text-fg' : 'text-fg-subtle')} />
        )}
        <span className="font-medium text-fg">{p.name}</span>
        {p.isLocal && <span className="text-fg-subtle">·  ты</span>}
      </div>
```

- [ ] **Step 3: Verify typecheck + lint**

Run: `npm run build -w @voicechat/client && npm run lint -w @voicechat/client`
Expected: clean.

- [ ] **Step 4: Manual visual check**

Tauri sharer + Electron viewer. У viewer-а на тайле шарера, рядом с именем, должен появиться значок монитора. На своём тайле локального юзера (не sharer) значок не появляется. На тайлах не-шарящих участников значок тоже отсутствует.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/renderer/components/ParticipantTile.tsx
git commit -m "feat(tile): show Monitor icon next to name when tile is screen share"
```

### Task 6.2: Render ScreenShareOverlay conditionally

**Files:**
- Modify: `apps/client/src/renderer/components/ParticipantTile.tsx`

- [ ] **Step 1: Import overlay**

В импортах ParticipantTile (между остальными `./` импортами, например после строки с `ParticipantContextMenu`):

```ts
import { ScreenShareOverlay } from './ScreenShareOverlay.js';
```

- [ ] **Step 2: Render overlay in the tile JSX**

В JSX `tile` найти блок `{showVideo && (<button ...Maximize2.../>)}` (~строки 295-305). **После** этого блока (т.е. внутри той же иерархии, что и status chips) добавить:

```tsx
      {!p.isLocal && videoSource === Track.Source.ScreenShare && (
        <ScreenShareOverlay
          participant={p}
          participantKey={participantKey}
          videoElement={videoRef.current}
          hasScreenShareAudio={hasScreenShareAudio}
        />
      )}
```

Замечание про `videoRef.current`: в момент первого рендера может быть `null`. Overlay внутри обрабатывает это (PiP-кнопка `disabled={!videoElement}`). После того как видео-track attach-ится, ref обновится, но React не перерендерит overlay пока что-то в state не изменится — приедет следующий event из ParticipantEvent (например IsSpeakingChanged), который через существующий `rerender()` дёрнет. Это **не идеальный** дизайн, но практически работает; альтернатива (callback ref + forceUpdate) усложнит код больше, чем стоит.

Если в ходе ручного теста окажется, что overlay не появляется или PiP не активируется на первой шере без какого-либо взаимодействия — добавить в Task 6.4 диагностику и при необходимости перевести `videoRef` на callback-ref. Пока что — оставляем как есть.

- [ ] **Step 3: Verify typecheck + lint**

Run: `npm run build -w @voicechat/client && npm run lint -w @voicechat/client`
Expected: clean.

- [ ] **Step 4: First-pass manual check overlay**

Tauri sharer (с галочкой системного звука) + Electron viewer:

1. На большом тайле шарера навести курсор — должна появиться полупрозрачная панель **слева от** статус-чипов (quality + mic-off).
2. Если панель **наезжает** на чипы — задокументировать и попробовать `right-14` или `right-16` вместо `right-12` в `ScreenShareOverlay.tsx`. Зафиксировать что выбрали.
3. Если панель **не появляется** — проверить:
   - Тайл этого ParticipantTile получает `videoSource={Track.Source.ScreenShare}` (см. RoomView.tsx строка ~390).
   - Видео-track реально attach-нут (видео идёт).

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/renderer/components/ParticipantTile.tsx
git commit -m "feat(tile): render ScreenShareOverlay on the sharer's enlarged tile"
```

### Task 6.3: Full manual test pass (Section 7 of the spec)

- [ ] **Step 1: Run all 9 scenarios from spec section 7**

Используя `docs/superpowers/specs/2026-05-23-screenshare-audio-and-viewer-ui-design.md` секцию 7 как чек-лист, пройти **каждый** сценарий и отметить pass/fail:

1. **Two Tauri clients, sender ticks system audio.** Receiver слышит звук + независимый слайдер + независимый mute. Изменение громкости голоса не влияет на громкость демки.
2. **Receiver меняет output device** в SettingsModal. Звук демки перенаправляется в новый device.
3. **PiP.** Открывается окно поверх всего. Звук продолжает идти через основное окно (не дублируется). Закрытие PiP возвращает видео в тайл. Кнопка в overlay переключает состояние.
4. **Sharer останавливает шеру.** Overlay исчезает. Проверить, что не остаётся "висящих" ресурсов: в DevTools-консоли убедиться, что `screenSourceNodeRef.current` (через React DevTools или через `(window as any).__lkRoom` если есть) равен null после остановки, и что в Console нет ошибок WebAudio. Скрытый `<audio ref={screenAudioRef}>`-элемент остаётся в DOM (он рендерится безусловно для не-локальных участников) — это нормально, через `track.detach(el)` он просто перестаёт получать поток.
5. **Sharer запускает шеру повторно** после Stop. Громкость демки восстанавливается из prefs.
6. **Sharer на Electron, зритель на Tauri** (или наоборот). Звука нет — Electron не публикует ScreenShareAudio. Overlay показывает PiP/FPS, но не volume/mute. Не падает. Если overlay временно пустой с одной PiP-кнопкой пока stats не пришли — допустимо.
7. **Sharer на Tauri, зритель на Electron.** Звук **есть** (тот же React-рендерер).
8. **Bad network / packet loss** на принимающей стороне. FPS-индикатор показывает деградацию. Звук может рваться — UI это отражает.
9. **Sharer mute через ОС-микшер.** Звук становится тишиной у получателя, никаких ошибок.

- [ ] **Step 2: Document any deviations**

Если какой-то сценарий не прошёл — описать в issue / TODO и решить: блокирует мерж или нет.

- [ ] **Step 3: Final lint + build**

Run: `npm run build -w @voicechat/client && npm run lint -w @voicechat/client`
Expected: green.

- [ ] **Step 4: Final commit (если есть незакоммиченное)**

```bash
git status
# Если что-то лежит без коммита — добавить и закоммитить с описательным сообщением.
```

### Task 6.4: Final chunk review

- [ ] **Dispatch plan-document-reviewer** для Chunk 6.
- [ ] Fix and re-dispatch as needed.

---

## Wrap-up

После прохождения всех чанков:

- [ ] Spec section 8 ("Что НЕ входит") — убедиться, что в реализации не оказалось ничего из этого списка (особенно: захват аудио на Electron-стороне, реакции, чат поверх). Если что-то просочилось — откатить.
- [ ] Запустить `superpowers:verification-before-completion` skill перед финальным merge / PR.
- [ ] Бамп `apps/client/package.json` версии (0.1.5 → 0.1.6 или 0.2.1 в зависимости от соглашений) если ребилд для пользователей планируется.
- [ ] Применить `superpowers:finishing-a-development-branch` skill для решения по интеграции.

## Quick reference

| Чанк | Что делает | Build green после? |
|---|---|---|
| 1 | Prefs schema + defaults | Да |
| 2 | Звук демки слышен, регулируется через слайдер из prefs (но UI слайдера ещё нет) | Да |
| 3 | Слайдер в контекстном меню работает; конец фикса аудио-бага | Да |
| 4 | useReceiverStats hook (изолированно) | Да |
| 5 | ScreenShareOverlay компонент (изолированно) | Да |
| 6 | Overlay рендерится на тайле, Monitor бейдж, финальный тест | Да |
