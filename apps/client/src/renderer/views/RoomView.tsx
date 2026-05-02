import { useEffect, useRef, useState } from 'react';
import { RoomEvent, Track, type Participant } from 'livekit-client';
import { useStore } from '../state/store.js';
import { useToasts } from '../state/toast-store.js';
import { useLiveKitRoom } from '../hooks/useLiveKitRoom.js';
import { usePushToTalk } from '../hooks/usePushToTalk.js';
import { useVoiceActivation } from '../hooks/useVoiceActivation.js';
import { useMicActivationModeSync } from '../hooks/useMicActivationModeSync.js';
import { useConnectionQuality, qualityLabel } from '../hooks/useConnectionQuality.js';
import { ParticipantTile } from '../components/ParticipantTile.js';
import { ControlBar } from '../components/ControlBar.js';
import { ScreenSourcePicker } from '../components/ScreenSourcePicker.js';
import { ChatPanel } from '../components/ChatPanel.js';
import { ToastTray } from '../components/Toast.js';
import { SettingsModal } from '../components/SettingsModal.js';
import { QualityIndicator } from '../components/QualityIndicator.js';
import { TitleBar, titleBarNoDrag } from '../components/TitleBar.js';
import { ChevronLeft, Settings } from 'lucide-react';
import { Button } from '../components/ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip.js';
import type { ScreenSource, ScreenSharePreset } from '../../shared/types.js';

type ScreenShareProfile = {
  width: number;
  height: number;
  fps: number;
  bitrate: number;
};

const SCREEN_SHARE_PROFILES: Record<ScreenSharePreset, ScreenShareProfile> = {
  smooth: { width: 1920, height: 1080, fps: 60, bitrate: 8_000_000 },
  sharp: { width: 2560, height: 1440, fps: 30, bitrate: 10_000_000 },
  max: { width: 2560, height: 1440, fps: 60, bitrate: 12_000_000 },
};

export function RoomView() {
  const { activeRoom, leaveRoom, prefs } = useStore();
  const { room, state } = useLiveKitRoom();
  const pttHeld = usePushToTalk(room);
  const vadOpen = useVoiceActivation(room);
  useMicActivationModeSync(room);
  const { qualities, rttMs } = useConnectionQuality(room);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [screenShareParticipant, setScreenShareParticipant] = useState<Participant | null>(null);
  // Picker управляется промисом — startShare сам зовёт getScreenSources,
  // показывает диалог и ждёт выбор. setDisplayMediaRequestHandler не
  // используется: в Electron он жёстко зашивает capture pipeline на legacy
  // GDI с cap ~17 fps и обойти это нельзя ни флагами, ни constraints.
  const [pickerPromise, setPickerPromise] = useState<{
    sources: ScreenSource[];
    resolve: (chosen: ScreenSource | null) => void;
  } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Цикл мониторинга здоровья скриншер-капчи. Живёт ровно сколько идёт
  // публикация, чтобы не дёргать getStats() впустую вне сессии шеры.
  const shareMonitorRef = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      shareMonitorRef.current?.();
      shareMonitorRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (!room) return;
    const refresh = () => {
      const all = [room.localParticipant, ...Array.from(room.remoteParticipants.values())];
      setParticipants(all);
      const sharer = all.find((p) => p.getTrackPublication(Track.Source.ScreenShare));
      setScreenShareParticipant(sharer ?? null);
    };
    refresh();
    const events = [
      RoomEvent.ParticipantConnected,
      RoomEvent.ParticipantDisconnected,
      RoomEvent.TrackPublished,
      RoomEvent.TrackUnpublished,
      RoomEvent.TrackSubscribed,
      RoomEvent.TrackUnsubscribed,
      RoomEvent.LocalTrackPublished,
      RoomEvent.LocalTrackUnpublished,
      RoomEvent.ActiveSpeakersChanged,
    ] as const;
    events.forEach((e) => room.on(e, refresh));
    return () => {
      events.forEach((e) => room.off(e, refresh));
    };
  }, [room]);

  if (!activeRoom) return null;
  const remoteSharing =
    !!screenShareParticipant && screenShareParticipant !== room?.localParticipant;

  const stopShare = async () => {
    if (!room) return;
    shareMonitorRef.current?.();
    shareMonitorRef.current = null;
    const pub = room.localParticipant.getTrackPublication(Track.Source.ScreenShare);
    // Захватываем track ДО unpublishTrack — после unpublish LiveKit
    // отвязывает track от publication и pub.track становится undefined,
    // обращение к .stop() через pub.track роняется.
    const track = pub?.track;
    if (track) {
      await room.localParticipant.unpublishTrack(track);
      track.stop();
    }
  };

  const startShare = async () => {
    if (!room) return;

    const profile = SCREEN_SHARE_PROFILES[prefs?.screenSharePreset ?? 'smooth'];

    try {
      // Сначала пытаемся через Electron-специфичный путь: getScreenSources
      // возвращает desktop sources с ID вида "screen:0:0" / "window:HWND:0",
      // дальше getUserMedia с mandatory.chromeMediaSourceId создаёт capture
      // session напрямую — не через setDisplayMediaRequestHandler — и
      // Chromium здесь корректно выбирает WGC capturer с заявленным
      // frameRate. На Tauri/WebView2 getScreenSources вернёт пустой массив,
      // тогда падаем в стандартный getDisplayMedia с системным picker.
      let track: MediaStreamTrack | undefined;
      const sources = await window.api.getScreenSources();
      if (sources.length > 0) {
        const chosen = await new Promise<ScreenSource | null>((resolve) => {
          setPickerPromise({ sources, resolve });
        });
        if (!chosen) return;
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          // Старый Electron API (chromeMediaSource). Type-cast: WebRTC-types
          // не описывают `mandatory`, но в Chromium-Electron он работает.
          // Без minFrameRate capturer вообще не запускается ("Timeout starting
          // video source") — Chromium считает constraint недостижимым.
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: chosen.id,
              minFrameRate: profile.fps,
              maxFrameRate: profile.fps,
            },
          } as unknown as MediaTrackConstraints,
        });
        track = stream.getVideoTracks()[0];
        // Один раз логируем что реально согласовалось — нужно для диагностики
        // потолка captureFps. capabilities.frameRate.max = верхняя граница
        // самого capturer'а, settings.frameRate = что согласовано в этой сессии.
        // Если capabilities.max < 60 — capturer структурно не умеет 60 fps
        // на этом источнике и его меняет только переход на другой backend.
        console.log('[screen-share] settings', track.getSettings());
        console.log('[screen-share] capabilities', track.getCapabilities?.());
      } else {
        // Tauri / WebView2: системный picker. ВАЖНО — `video: true` без
        // frameRate в исходных constraints; иначе WebView2 выбирает
        // менее производительный capture backend (у юзера это уронило
        // screen-share с ~45 до ~30 fps). frameRate выставляем поздним
        // applyConstraints — для этого пути это работает.
        const stream = await navigator.mediaDevices.getDisplayMedia({
          audio: false,
          video: true,
        });
        track = stream.getVideoTracks()[0];
        if (track) {
          try {
            await track.applyConstraints({
              frameRate: { ideal: profile.fps, max: profile.fps },
            });
          } catch (e) {
            console.warn('[screen-share] frameRate applyConstraints failed', e);
          }
        }
      }
      if (!track) throw new Error('no video track');
      track.contentHint = 'motion';

      // For monitors larger than the preset's target, ask the encoder
      // pipeline to downscale. Encoder-side scale doesn't engage capture
      // pipeline scaling, so WGC stays in the fast path.
      const settings = track.getSettings();
      const captureHeight = settings.height ?? profile.height;
      const scaleResolutionDownBy = Math.max(1, captureHeight / profile.height);

      // Кодек: H264 в Electron-Chromium для WebRTC обычно идёт через софтовый
      // OpenH264 — он не вытягивает 1080p60. VP8 (libvpx) в софте быстрее
      // OpenH264 на 30-50% при той же картинке. Берём выбор пользователя из prefs.
      const publication = await room.localParticipant.publishTrack(track, {
        source: Track.Source.ScreenShare,
        simulcast: false,
        videoCodec: prefs?.screenShareCodec ?? 'vp8',
        screenShareEncoding: {
          maxBitrate: profile.bitrate,
          maxFramerate: profile.fps,
          priority: 'high',
        },
      });

      // LiveKit's VideoEncoding type doesn't expose scaleResolutionDownBy,
      // so we reach for the underlying RTCRtpSender after publish.
      const sender = publication.track?.sender;
      if (sender && scaleResolutionDownBy > 1) {
        try {
          const params = sender.getParameters();
          if (params.encodings[0]) {
            params.encodings[0].scaleResolutionDownBy = scaleResolutionDownBy;
            await sender.setParameters(params);
          }
        } catch (e) {
          console.warn('[screen-share] setParameters failed', e);
        }
      }

      track.addEventListener('ended', () => {
        stopShare();
      });

      // Health-check: если capture pipeline (WGC под Chromium/WebView2) не
      // успевает за target fps — почти всегда дело в перегруженном источнике
      // (игра без V-Sync забивает GPU, present-очередь не пускает capturer).
      // Сами мы повлиять на это из renderer'а не можем, поэтому показываем
      // подсказку пользователю. Один тост за сессию шеры.
      shareMonitorRef.current?.();
      const targetFps = profile.fps;
      const startedAt = Date.now();
      let badSamples = 0;
      let notified = false;
      // window.__lkScreenStats навешивается в debug-bridge.ts, но там сейчас
      // сломан `declare global` (см. tsc TS2669) — кастуем локально.
      const lkScreenStats = (
        window as unknown as {
          __lkScreenStats?: () => Promise<{ captureFps: number } | null>;
        }
      ).__lkScreenStats;
      const intervalId = setInterval(async () => {
        const stats = await lkScreenStats?.();
        if (!stats) return;
        // Warmup: первые ~3 секунды энкодер/capture pipeline стабилизируются,
        // captureFps в это время может быть искусственно низким.
        if (Date.now() - startedAt < 3000) return;
        const captureFps = stats.captureFps;
        if (captureFps > 0 && captureFps < targetFps * 0.7) {
          badSamples++;
          if (badSamples >= 2 && !notified) {
            notified = true;
            useToasts
              .getState()
              .push(
                'info',
                `Захват идёт на ${captureFps} fps (цель ${targetFps}). Источник перегружен — включите V-Sync или ограничьте FPS в игре.`,
              );
          }
        } else {
          badSamples = 0;
        }
      }, 2000);
      shareMonitorRef.current = () => clearInterval(intervalId);
    } catch (err) {
      console.error(err);
    }
  };

  const onToggleScreenShare = () => {
    const localSharing = !!room?.localParticipant.getTrackPublication(Track.Source.ScreenShare);
    if (localSharing) stopShare();
    else startShare();
  };

  const onPickerPick = (source: ScreenSource) => {
    pickerPromise?.resolve(source);
    setPickerPromise(null);
  };
  const onPickerCancel = () => {
    pickerPromise?.resolve(null);
    setPickerPromise(null);
  };

  return (
    <div className="flex h-screen flex-col bg-bg text-fg">
      <TitleBar>
        <Button
          variant="ghost"
          size="sm"
          onClick={leaveRoom}
          className="h-7 gap-2 px-2"
          style={titleBarNoDrag}
        >
          <ChevronLeft />
          <span className="text-sm font-medium">{activeRoom.roomName}</span>
          <span className="font-mono text-xs tabular-nums text-fg-subtle">
            {participants.length}/8
          </span>
        </Button>
        <div className="ml-auto flex items-center gap-2">
          {room && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="flex cursor-default items-center gap-1.5 rounded-md px-2 py-1 text-fg-muted hover:bg-bg-muted/40"
                  style={titleBarNoDrag}
                >
                  <QualityIndicator quality={qualities.get(room.localParticipant.identity)} />
                  <span className="font-mono text-[10px] tabular-nums">
                    {rttMs !== null ? `${Math.round(rttMs)} ms` : '— ms'}
                  </span>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Соединение: {qualityLabel(qualities.get(room.localParticipant.identity))}
                {rttMs !== null && ` · ${Math.round(rttMs)} мс до сервера`}
              </TooltipContent>
            </Tooltip>
          )}
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-subtle">
            {state}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSettingsOpen(true)}
            aria-label="Настройки"
            className="h-7 w-7"
            style={titleBarNoDrag}
          >
            <Settings />
          </Button>
        </div>
      </TitleBar>

      <main className="flex flex-1 overflow-hidden">
        <section className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {participants.map((p) => (
              <ParticipantTile
                key={p.identity}
                p={p}
                big={p === screenShareParticipant}
                videoSource={p === screenShareParticipant ? Track.Source.ScreenShare : Track.Source.Camera}
                quality={qualities.get(p.identity)}
              />
            ))}
          </div>
        </section>
        {room && <ChatPanel room={room} />}
      </main>

      {room && (
        <ControlBar
          room={room}
          onLeave={leaveRoom}
          remoteSharing={remoteSharing}
          onToggleScreenShare={onToggleScreenShare}
          micActivationMode={prefs?.micActivationMode ?? 'always'}
          pttHeld={pttHeld}
          vadOpen={vadOpen}
        />
      )}

      {pickerPromise && (
        <ScreenSourcePicker
          sources={pickerPromise.sources}
          onPick={onPickerPick}
          onCancel={onPickerCancel}
        />
      )}

      <ToastTray />

      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
