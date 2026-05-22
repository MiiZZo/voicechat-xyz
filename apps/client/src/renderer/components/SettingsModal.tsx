import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AudioWaveform,
  HelpCircle,
  Headphones,
  Keyboard,
  Loader2,
  Mic,
  MonitorUp,
  RefreshCw,
  SlidersHorizontal,
  Volume2,
  type LucideIcon,
} from 'lucide-react';
import type { UpdateStatus } from '../../shared/types.js';
import { useStore } from '../state/store.js';
import { useDeviceList } from '../hooks/useDeviceList.js';
import { useMicLevelMeter } from '../hooks/useMicLevelMeter.js';
import { playTestSignal } from '../lib/sounds.js';
import { accelFromKeyEvent, prettyAccel } from '../lib/accel-key.js';
import type {
  MicActivationMode,
  NotificationCorner,
  Prefs,
  ScreenShareCodec,
  ScreenSharePreset,
} from '../../shared/types.js';
import { cn } from '../lib/cn.js';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from './ui/dialog.js';
import { Switch } from './ui/switch.js';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select.js';
import { Button } from './ui/button.js';
import { Slider } from './ui/slider.js';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip.js';

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

const MIN_DB = -60;
const MAX_DB = 0;

type TabId = 'devices' | 'mic' | 'audio' | 'hotkeys' | 'screen' | 'system';

type TabDef = {
  id: TabId;
  label: string;
  /** Подпись под заголовком content-pane'а. Пропускается если у таба нет
   *  логичной "что внутри" формулировки. */
  caption?: string;
  icon: LucideIcon;
};

const TABS: TabDef[] = [
  { id: 'devices', label: 'Устройства',          caption: 'микрофон, камера, выход',         icon: Headphones },
  { id: 'mic',     label: 'Микрофон',            caption: 'режим активации',                 icon: Mic },
  { id: 'audio',   label: 'Обработка звука',     caption: 'эхо, шум, авто-громкость',        icon: AudioWaveform },
  { id: 'hotkeys', label: 'Горячие клавиши',                                                  icon: Keyboard },
  { id: 'screen',  label: 'Демонстрация экрана', caption: 'разрешение, fps, кодек',          icon: MonitorUp },
  { id: 'system',  label: 'Система',             caption: 'звуки, уведомления, поведение',   icon: SlidersHorizontal },
];

export function SettingsModal({ open, onOpenChange }: Props) {
  const { prefs, setPrefs } = useStore();
  const devices = useDeviceList();
  const [capturing, setCapturing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('devices');

  if (!prefs) return null;

  const update = async (patch: Partial<Prefs>) => {
    const next = await window.api.setPrefs(patch);
    setPrefs(next);
  };

  const captureKey = () => {
    setCapturing(true);
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      void update({ pushToTalk: { ...prefs.pushToTalk, key: e.code } });
      setCapturing(false);
      window.removeEventListener('keydown', handler, true);
    };
    window.addEventListener('keydown', handler, true);
  };

  const setMode = (mode: MicActivationMode) => {
    // Keep the legacy `pushToTalk.enabled` flag in sync so older code paths
    // (and any remote tooling) still observe a consistent state. The
    // migration in main/prefs.ts uses this flag as a fallback inference.
    void update({
      micActivationMode: mode,
      pushToTalk: { ...prefs.pushToTalk, enabled: mode === 'ptt' },
    });
  };

  const current = TABS.find((t) => t.id === activeTab) ?? TABS[0]!;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Фиксированные габариты: ширина — для двух-панельного layout'а с
          комфортным дыханием, высота — capped через max-h, чтобы модалка
          никогда не вылазила за viewport на мелких экранах. Внутренний
          контент скроллится сам. Padding/gap/maxWidth — inline-style: cn()
          в проекте без twMerge, утилитарные классы могут не перебить
          дефолты Dialog (p-6, max-w-md, gap-5). */}
      <DialogContent
        className="overflow-hidden"
        style={{
          width: 820,
          height: 560,
          maxWidth: 'calc(100vw - 2rem)',
          maxHeight: 'calc(100vh - 2rem)',
          padding: 0,
          gap: 0,
        }}
      >
        <DialogTitle className="sr-only">Настройки</DialogTitle>
        <DialogDescription className="sr-only">
          Устройства, обработка звука, поведение приложения
        </DialogDescription>

        <div className="flex h-full">
          {/* Sidebar — список секций. Тон чуть темнее content'а, чтобы
              создать визуальную глубину без отдельного border'а. */}
          <aside className="flex w-[244px] shrink-0 flex-col border-r border-border bg-bg/40">
            <div className="px-5 pb-5 pt-7">
              <div className="text-xl font-semibold leading-none tracking-tight text-fg">
                Настройки
              </div>
            </div>
            <nav className="flex flex-1 flex-col gap-1 px-3 pb-4">
              {TABS.map((tab) => (
                <TabButton
                  key={tab.id}
                  tab={tab}
                  active={tab.id === activeTab}
                  onClick={() => setActiveTab(tab.id)}
                />
              ))}
            </nav>
            <AppFooter />
          </aside>

          {/* Content — скроллится внутри. key даёт лёгкую fade-in анимацию
              при переключении табов. */}
          <main className="flex-1 overflow-y-auto">
            <div key={activeTab} className="animate-in fade-in-0 duration-150 px-8 pb-8 pt-7">
              <ContentHeader tab={current} />
              <div className="mt-5 flex flex-col gap-5">
                {activeTab === 'devices' && (
                  <>
                    <DeviceField
                      label="Микрофон"
                      devices={devices.audioInputs}
                      value={prefs.audioInputDeviceId}
                      onChange={(v) => update({ audioInputDeviceId: v })}
                    />
                    <DeviceField
                      label="Камера"
                      devices={devices.videoInputs}
                      value={prefs.videoInputDeviceId}
                      onChange={(v) => update({ videoInputDeviceId: v })}
                    />
                    <DeviceField
                      label="Динамики"
                      devices={devices.audioOutputs}
                      value={prefs.audioOutputDeviceId}
                      onChange={(v) => update({ audioOutputDeviceId: v })}
                      action={<SpeakerTestButton deviceId={prefs.audioOutputDeviceId} />}
                    />
                  </>
                )}

                {activeTab === 'mic' && (
                  <>
                    <ModePicker mode={prefs.micActivationMode} onChange={setMode} />
                    {prefs.micActivationMode === 'ptt' && (
                      <div className="flex items-center justify-between gap-4 pl-1 pt-1">
                        <span className="text-xs text-fg-muted">Клавиша</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={captureKey}
                          className="font-mono text-xs"
                        >
                          <Keyboard />
                          {capturing ? 'Нажмите клавишу…' : prefs.pushToTalk.key}
                        </Button>
                      </div>
                    )}
                    {prefs.micActivationMode === 'vad' && (
                      <VadSection prefs={prefs} update={update} />
                    )}
                  </>
                )}

                {activeTab === 'hotkeys' && (
                  <>
                    <HotkeyField
                      label="Выключить / включить микрофон"
                      value={prefs.globalShortcutToggleMute}
                      onChange={(v) => update({ globalShortcutToggleMute: v })}
                    />
                    <HotkeyField
                      label="Покинуть комнату"
                      value={prefs.globalShortcutLeaveRoom}
                      onChange={(v) => update({ globalShortcutLeaveRoom: v })}
                    />
                    <p className="text-[11px] leading-relaxed text-fg-subtle">
                      Минимум один
                      модификатор (Ctrl / Alt / Shift) обязателен. Escape во
                      время захвата — очистить.
                    </p>
                  </>
                )}

                {activeTab === 'audio' && (
                  <>
                    <Toggle
                      label="Эхоподавление"
                      checked={prefs.audioConstraints.echoCancellation}
                      onChange={(v) =>
                        update({
                          audioConstraints: { ...prefs.audioConstraints, echoCancellation: v },
                        })
                      }
                    />
                    <Toggle
                      label="Шумоподавление"
                      checked={prefs.audioConstraints.noiseSuppression}
                      onChange={(v) =>
                        update({
                          audioConstraints: { ...prefs.audioConstraints, noiseSuppression: v },
                        })
                      }
                    />
                    <Toggle
                      label="Авто-громкость"
                      checked={prefs.audioConstraints.autoGainControl}
                      onChange={(v) =>
                        update({
                          audioConstraints: { ...prefs.audioConstraints, autoGainControl: v },
                        })
                      }
                    />
                  </>
                )}

                {activeTab === 'system' && (
                  <>
                    <Group title="Звуки">
                      {/* Toggle + slider — одна логическая единица, поэтому
                          вложены в общий контейнер с gap-2 (8px). Родительский
                          Group gap-3 (12px) применяется только между этим
                          блоком и SubLabel'ом сверху. Slider — sub-контрол
                          к toggle: pl-3 для визуальной иерархии + opacity-40
                          когда звуки выключены. */}
                      <div className="flex flex-col gap-2">
                        <Toggle
                          label="Системные звуки"
                          checked={prefs.soundsEnabled}
                          onChange={(v) => update({ soundsEnabled: v })}
                        />
                        <div
                          className={cn(
                            'flex flex-col gap-1.5 pl-3 transition-opacity',
                            !prefs.soundsEnabled && 'opacity-40',
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-fg-muted">Громкость</span>
                            <span className="font-mono text-[10px] tabular-nums text-fg-subtle">
                              {Math.round(prefs.soundsVolume * 100)}%
                            </span>
                          </div>
                          <Slider
                            min={0}
                            max={100}
                            step={5}
                            value={[Math.round(prefs.soundsVolume * 100)]}
                            onValueChange={(v) =>
                              void update({ soundsVolume: (v[0] ?? 40) / 100 })
                            }
                            disabled={!prefs.soundsEnabled}
                          />
                        </div>
                      </div>
                    </Group>

                    <Group title="Уведомления">
                      <Toggle
                        label="Уведомления о сообщениях в фоне"
                        checked={prefs.notificationsEnabled}
                        onChange={(v) => update({ notificationsEnabled: v })}
                      />
                      <div
                        className={cn(
                          'flex flex-col gap-1.5 pl-3 transition-opacity',
                          !prefs.notificationsEnabled && 'opacity-40',
                        )}
                      >
                        <span className="text-xs text-fg-muted">Позиция на экране</span>
                        <NotificationCornerPicker
                          value={prefs.notificationPosition}
                          onChange={(v) => update({ notificationPosition: v })}
                          disabled={!prefs.notificationsEnabled}
                        />
                      </div>
                    </Group>

                    <Group title="Окно">
                      <Toggle
                        label="Сворачивать в трей при закрытии"
                        checked={prefs.closeToTray}
                        onChange={(v) => update({ closeToTray: v })}
                      />
                    </Group>
                  </>
                )}

                {activeTab === 'screen' && (
                  <>
                    <ScreenSharePresetPicker
                      value={prefs.screenSharePreset}
                      onChange={(v) => update({ screenSharePreset: v })}
                    />
                    <ScreenShareCodecPicker
                      value={prefs.screenShareCodec}
                      onChange={(v) => update({ screenShareCodec: v })}
                    />
                  </>
                )}
              </div>
            </div>
          </main>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TabButton({
  tab,
  active,
  onClick,
}: {
  tab: TabDef;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = tab.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors',
        active
          ? 'bg-bg-muted/70 text-fg'
          : 'text-fg-muted hover:bg-bg-muted/30 hover:text-fg',
      )}
    >
      {/* Аксент-планка слева — только в активном состоянии. */}
      <span
        aria-hidden
        className={cn(
          'absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-r-full bg-fg transition-opacity',
          active ? 'opacity-100' : 'opacity-0',
        )}
      />
      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
      <span className="truncate text-sm font-medium leading-none">{tab.label}</span>
    </button>
  );
}

/** Подвал sidebar'а — версия + кнопка ручной проверки обновлений. Статус
 *  чекинга/загрузки приходит через тот же onUpdateStatus, что слушает
 *  глобальный UpdateBanner. Transient "Обновлений нет" 4 сек после клика,
 *  если статус остался 'idle' (Tauri-updater при отсутствии апдейта не шлёт
 *  специального события — просто остаётся idle). */
function AppFooter() {
  const [version, setVersion] = useState<string | null>(null);
  const [status, setStatus] = useState<UpdateStatus>({ kind: 'idle' });
  const [recentCheckAt, setRecentCheckAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const api = window.api as { getAppVersion?: () => Promise<string> };
    void api.getAppVersion?.().then(setVersion).catch(() => {});
    return window.api.onUpdateStatus(setStatus);
  }, []);

  // Тикаем каждую секунду пока активна "транзитная" подпись — иначе текст
  // "Обновлений нет" зависнет навсегда. После 4 сек — стейт пересчитается
  // и подпись пропадёт.
  useEffect(() => {
    if (recentCheckAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [recentCheckAt]);

  const isBusy = status.kind === 'checking' || status.kind === 'downloading';
  const showNoUpdates =
    recentCheckAt !== null && status.kind === 'idle' && now - recentCheckAt < 4000;

  const onCheck = () => {
    setRecentCheckAt(Date.now());
    setNow(Date.now());
    void window.api.checkUpdate();
  };

  let statusText: string | null = null;
  if (status.kind === 'checking') statusText = 'Проверяю…';
  else if (status.kind === 'available') statusText = `Доступна v${status.version}`;
  else if (status.kind === 'downloading')
    statusText = `Загрузка ${Math.round(status.percent)}%`;
  else if (status.kind === 'ready') statusText = 'Готово к установке';
  else if (status.kind === 'error') statusText = 'Ошибка проверки';
  else if (showNoUpdates) statusText = 'Обновлений нет';

  return (
    <div className="flex flex-col gap-2 border-t border-border px-3 py-3">
      <div className="flex items-center justify-between px-1">
        <span className="font-mono text-[11px] tabular-nums text-fg-subtle">
          {version ? `v${version}` : '—'}
        </span>
        {statusText && (
          <span className="truncate text-[10px] text-fg-subtle">{statusText}</span>
        )}
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onCheck}
        disabled={isBusy}
        className="h-7 w-full gap-1.5 text-xs"
      >
        {isBusy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        <span>Проверить обновления</span>
      </Button>
    </div>
  );
}

function ContentHeader({ tab }: { tab: TabDef }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h2 className="text-xl font-semibold leading-none tracking-tight text-fg">
        {tab.label}
      </h2>
      {tab.caption && (
        <p className="text-xs leading-none text-fg-subtle">{tab.caption}</p>
      )}
    </div>
  );
}

function ScreenShareCodecPicker({
  value,
  onChange,
}: {
  value: ScreenShareCodec;
  onChange: (v: ScreenShareCodec) => void;
}) {
  const options: { value: ScreenShareCodec; label: string }[] = [
    { value: 'vp8', label: 'VP8' },
    { value: 'h264', label: 'H264' },
    { value: 'vp9', label: 'VP9' },
    { value: 'av1', label: 'AV1' },
  ];
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-fg-muted">Кодек</span>
      <div
        role="radiogroup"
        aria-label="Кодек демонстрации экрана"
        className="grid grid-cols-4 gap-1 rounded-md bg-bg-muted/50 p-1"
      >
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(opt.value)}
              className={cn(
                'rounded-sm px-2 py-1.5 text-xs font-medium transition-colors',
                active
                  ? 'bg-bg-elevated text-fg shadow-sm'
                  : 'text-fg-muted hover:text-fg',
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NotificationCornerPicker({
  value,
  onChange,
  disabled,
}: {
  value: NotificationCorner;
  onChange: (v: NotificationCorner) => void;
  disabled?: boolean;
}) {
  const corners: { value: NotificationCorner; label: string }[] = [
    { value: 'top-left', label: 'Сверху слева' },
    { value: 'top-right', label: 'Сверху справа' },
    { value: 'bottom-left', label: 'Снизу слева' },
    { value: 'bottom-right', label: 'Снизу справа' },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Позиция уведомлений"
      className="grid grid-cols-2 gap-1.5"
    >
      {corners.map((c) => {
        const active = c.value === value;
        // Положение мини-«тоста» внутри миниатюры экрана — зависит от угла.
        const isRight = c.value.endsWith('right');
        const isBottom = c.value.startsWith('bottom');
        return (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={c.label}
            title={c.label}
            disabled={disabled}
            onClick={() => onChange(c.value)}
            className={cn(
              'group relative h-12 rounded-md border transition-colors',
              active
                ? 'border-fg/40 bg-bg-elevated'
                : 'border-border bg-bg-muted/40 hover:border-fg/20 hover:bg-bg-muted/70',
              disabled && 'cursor-not-allowed',
            )}
          >
            {/* Мини-«тост» в нужном углу мини-«экрана». 60% ширины миниатюры,
                чтобы пропорции читались как у реального тоста (360px) на FHD. */}
            <span
              aria-hidden
              className={cn(
                'absolute h-1.5 w-9 rounded-sm transition-colors',
                active ? 'bg-fg' : 'bg-fg-subtle group-hover:bg-fg/60',
                isRight ? 'right-1.5' : 'left-1.5',
                isBottom ? 'bottom-1.5' : 'top-1.5',
              )}
            />
          </button>
        );
      })}
    </div>
  );
}

function ScreenSharePresetPicker({
  value,
  onChange,
}: {
  value: ScreenSharePreset;
  onChange: (v: ScreenSharePreset) => void;
}) {
  const options: {
    value: ScreenSharePreset;
    label: string;
    sub: string;
  }[] = [
    { value: 'smooth', label: 'Плавно', sub: '1080p · 60 fps' },
    { value: 'sharp', label: 'Чётко', sub: '1440p · 30 fps' },
    { value: 'max', label: 'Макс', sub: '1440p · 60 fps' },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Качество демонстрации экрана"
      className="grid grid-cols-3 gap-1 rounded-md bg-bg-muted/50 p-1"
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'flex flex-col items-center gap-0.5 rounded-sm px-2 py-1 transition-colors',
              active
                ? 'bg-bg-elevated text-fg shadow-sm'
                : 'text-fg-muted hover:text-fg',
            )}
          >
            <span className="text-xs font-medium">{opt.label}</span>
            <span className="whitespace-nowrap font-mono text-[10px] tabular-nums text-fg-subtle">
              {opt.sub}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Кнопка "Проверить" рядом с выбором динамика. Управляет состоянием
 *  воспроизведения — пока звук играет, иконка пульсирует и кнопка disabled.
 *  Размеры (h-9, text-xs) выставлены так, чтобы матчиться с SelectTrigger. */
function SpeakerTestButton({ deviceId }: { deviceId: string | null }) {
  const [playing, setPlaying] = useState(false);
  const onClick = async () => {
    if (playing) return;
    setPlaying(true);
    try {
      await playTestSignal(deviceId);
    } finally {
      setPlaying(false);
    }
  };
  return (
    <Button
      variant="outline"
      onClick={onClick}
      disabled={playing}
      title="Проиграть тестовый сигнал"
      // h-9 — высота SelectTrigger. text-xs + px-3 — компактнее дефолтных
      // размеров Button, чтобы кнопка не доминировала над полем select'а.
      // disabled:opacity-100 + disabled:cursor-default — Button по умолчанию
      // приглушает disabled, но здесь это активное состояние ("играю"), не
      // ошибочное, и оно должно читаться нормально.
      className="h-9 shrink-0 px-3 text-xs disabled:cursor-default disabled:opacity-100"
    >
      <Volume2 className={playing ? 'animate-pulse text-fg' : 'text-fg-muted'} />
      {playing ? 'Играет…' : 'Проверить'}
    </Button>
  );
}

/** Поле для захвата accelerator-комбинации. Reuse'м кнопка-trigger как у
 *  PTT-клавиши, но с поддержкой пустой строки (=хоткей отключён) и mod-only
 *  валидации внутри accelFromKeyEvent.
 *
 *  Cancel-условия: Escape (очищает) / клик мимо кнопки (просто отмена без
 *  изменения значения) / blur окна (юзер ушёл в другой app — таб больше не
 *  должен висеть в режиме захвата). */
function HotkeyField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [capturing, setCapturing] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!capturing) return;

    const stop = () => setCapturing(false);

    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.key === 'Escape') {
        onChange('');
        stop();
        return;
      }
      // Одиночный модификатор без main key — продолжаем слушать.
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
      const accel = accelFromKeyEvent(e);
      if (!accel) return; // обычная клавиша без модификатора — игнорим
      onChange(accel);
      stop();
    };

    const onMouseDown = (e: MouseEvent) => {
      // Клик по самой кнопке-триггеру не считается "уходом" — иначе start()
      // мгновенно отменялся бы. Любая другая мишень — отмена без изменений.
      if (btnRef.current && btnRef.current.contains(e.target as Node)) return;
      stop();
    };

    // Юзер свернул окно / переключился в другое приложение — отменяем,
    // иначе при возврате кнопка останется в "Нажмите комбинацию…".
    const onBlur = () => stop();

    window.addEventListener('keydown', onKey, true);
    window.addEventListener('mousedown', onMouseDown, true);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mousedown', onMouseDown, true);
      window.removeEventListener('blur', onBlur);
    };
  }, [capturing, onChange]);

  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-fg">{label}</span>
      <div className="flex items-center gap-1.5">
        <Button
          ref={btnRef}
          variant="outline"
          size="sm"
          onClick={() => setCapturing((c) => !c)}
          className="font-mono text-xs"
        >
          <Keyboard />
          {capturing
            ? 'Нажмите комбинацию…'
            : value
              ? prettyAccel(value)
              : 'Не задан'}
        </Button>
        {value && !capturing && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange('')}
            className="h-7 px-2 text-xs text-fg-subtle hover:text-fg"
            title="Очистить"
          >
            ×
          </Button>
        )}
      </div>
    </div>
  );
}

function ModePicker({
  mode,
  onChange,
}: {
  mode: MicActivationMode;
  onChange: (mode: MicActivationMode) => void;
}) {
  const options: { value: MicActivationMode; label: string }[] = [
    { value: 'always', label: 'Всегда' },
    { value: 'ptt', label: 'По кнопке' },
    { value: 'vad', label: 'По голосу' },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Режим активации микрофона"
      className="grid grid-cols-3 gap-1 rounded-md bg-bg-muted/50 p-1"
    >
      {options.map((opt) => {
        const active = mode === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'rounded-sm px-2 py-1.5 text-xs font-medium transition-colors',
              active
                ? 'bg-bg-elevated text-fg shadow-sm'
                : 'text-fg-muted hover:text-fg',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function VadSection({
  prefs,
  update,
}: {
  prefs: Prefs;
  update: (patch: Partial<Prefs>) => Promise<void>;
}) {
  // Run the analyser whenever this section is visible (i.e. mode === 'vad'
  // and the modal is open — the section unmounts otherwise so the meter
  // tears down automatically). The dedicated stream is independent of the
  // VAD detector running in the room, so settings calibration works even
  // while connected.
  const { levelDb, peakDb, vadOpen, error } = useMicLevelMeter({
    deviceId: prefs.audioInputDeviceId,
    constraints: prefs.audioConstraints,
    enabled: true,
  });

  const threshold = prefs.voiceActivation.thresholdDb;
  const release = prefs.voiceActivation.releaseMs;
  const hysteresis = prefs.voiceActivation.hysteresisDb;

  const setThreshold = (v: number) => {
    void update({ voiceActivation: { ...prefs.voiceActivation, thresholdDb: v } });
  };
  const setRelease = (v: number) => {
    void update({ voiceActivation: { ...prefs.voiceActivation, releaseMs: v } });
  };
  const setHysteresis = (v: number) => {
    void update({ voiceActivation: { ...prefs.voiceActivation, hysteresisDb: v } });
  };

  return (
    <TooltipProvider delayDuration={150}>
    <div className="flex flex-col gap-3 pt-1">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-fg-muted">Порог</span>
          <span className="font-mono text-[10px] tabular-nums text-fg-subtle">
            {Math.round(threshold)} дБ
          </span>
        </div>
        <LevelMeter
          levelDb={levelDb}
          peakDb={peakDb}
          thresholdDb={threshold}
          vadOpen={vadOpen}
        />
        <Slider
          min={MIN_DB}
          max={MAX_DB}
          step={1}
          value={[threshold]}
          onValueChange={(v) => setThreshold(v[0] ?? threshold)}
        />
        {error && (
          <span className="text-[10px] text-rose-300">Микрофон недоступен: {error}</span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-fg-muted">Задержка отпускания</span>
          <span className="font-mono text-[10px] tabular-nums text-fg-subtle">
            {release} мс
          </span>
        </div>
        <Slider
          min={100}
          max={1500}
          step={50}
          value={[release]}
          onValueChange={(v) => setRelease(v[0] ?? release)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 text-xs text-fg-muted">
            Гистерезис
            <InfoHint
              label="Что такое гистерезис"
              text={
                'Насколько громкость должна упасть ниже порога, чтобы микрофон выключился. Без этого зазора микрофон щёлкает на каждой паузе в речи и обрывает слова.\n\n0 дБ — выключается ровно на пороге (речь может прерываться).\n6 дБ — рекомендуется.\n10–15 дБ — микрофон долго не выключается даже после того, как вы замолчали.'
              }
            />
          </span>
          <span className="font-mono text-[10px] tabular-nums text-fg-subtle">
            {hysteresis} дБ
          </span>
        </div>
        <Slider
          min={0}
          max={20}
          step={1}
          value={[hysteresis]}
          onValueChange={(v) => setHysteresis(v[0] ?? hysteresis)}
        />
      </div>
    </div>
    </TooltipProvider>
  );
}

function InfoHint({ label, text }: { label: string; text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-fg-subtle transition-colors hover:text-fg focus:text-fg focus:outline-none"
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" align="start" className="max-w-[260px] whitespace-pre-line leading-snug">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Horizontal level bar with a tick line at the threshold.
 *
 * - Maps dBFS to a fraction in the [MIN_DB, MAX_DB] window — anything below
 *   MIN_DB renders as empty, anything above MAX_DB clips at the right edge.
 * - The fill colour goes green when the *VAD gate* is open (which includes
 *   the release-hangover window) so the user understands why the mic is
 *   transmitting even after the bar has dipped below the threshold tick.
 *   When VAD isn't running yet (e.g. before joining a room), we fall back
 *   to comparing the instantaneous level against the threshold.
 * - A thin peak-hold marker shows the most recent transient — the spike
 *   that actually opened the gate is rarely visible on the instantaneous
 *   bar alone (a plosive can be ~20ms long, narrower than the rAF cadence),
 *   and without peak hold the user sees the tail and concludes the gate
 *   "fired below threshold."
 */
function LevelMeter({
  levelDb,
  peakDb,
  thresholdDb,
  vadOpen,
}: {
  levelDb: number;
  peakDb: number;
  thresholdDb: number;
  vadOpen: boolean;
}) {
  const dbToPct = (db: number) => {
    const clamped = Math.max(MIN_DB, Math.min(MAX_DB, db));
    return ((clamped - MIN_DB) / (MAX_DB - MIN_DB)) * 100;
  };
  const levelPct = dbToPct(levelDb);
  const peakPct = dbToPct(peakDb);
  const threshPct = dbToPct(thresholdDb);
  const isAboveThreshold = levelDb >= thresholdDb;
  const open = vadOpen || isAboveThreshold;
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-bg-muted">
      <div
        className={cn(
          'absolute inset-y-0 left-0 transition-[width] duration-75',
          open ? 'bg-emerald-400' : 'bg-fg-subtle',
        )}
        style={{ width: `${levelPct}%` }}
      />
      {peakDb > MIN_DB && (
        <div
          className={cn(
            'absolute inset-y-0 w-0.5 rounded-full',
            open ? 'bg-emerald-200' : 'bg-fg/60',
          )}
          style={{ left: `calc(${peakPct}% - 1px)` }}
          aria-hidden
        />
      )}
      <div
        className="absolute inset-y-0 w-px bg-fg/80"
        style={{ left: `${threshPct}%` }}
        aria-hidden
      />
    </div>
  );
}

/**
 * Подзаголовок внутри таба — разделяет логические группы контролов
 * (например, «Звуки» / «Уведомления» / «Окно» в табе "Система"). Спокойный
 * sans, без caps/mono/tracking-трюков — чтобы воспринимался как обычный
 * mini-header, а не editorial-плашка.
 */
function SubLabel({ children }: { children: ReactNode }) {
  return <div className="text-xs font-medium text-fg-muted">{children}</div>;
}

/** Группа контролов внутри таба с собственным sublabel и компактным
 *  внутренним gap (3 ≈ 12px) — родительский gap-5 (20px) применяется
 *  только МЕЖДУ группами, что и создаёт правильную визуальную иерархию. */
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <SubLabel>{title}</SubLabel>
      {children}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  // <label>, а не <div>: клик по тексту нативно форвардится на первый
  // focusable child (Radix Switch — button), без htmlFor/id-пляски.
  // select-none — чтобы быстрый double-click не выделял текст.
  return (
    <label className="flex cursor-pointer select-none items-center justify-between gap-4">
      <span className="text-sm text-fg">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function DeviceField({
  label,
  devices,
  value,
  onChange,
  action,
}: {
  label: string;
  devices: MediaDeviceInfo[];
  value: string | null;
  onChange: (v: string | null) => void;
  /** Опциональный trailing-слот рядом с Select — например, кнопка тест-сигнала. */
  action?: ReactNode;
}) {
  const SENTINEL = '__default__';
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-fg-muted">{label}</span>
      <div className="flex items-stretch gap-2">
        <Select
          value={value ?? SENTINEL}
          onValueChange={(v) => onChange(v === SENTINEL ? null : v)}
        >
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="По умолчанию" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SENTINEL}>По умолчанию</SelectItem>
            {devices.map((d) => (
              <SelectItem key={d.deviceId} value={d.deviceId}>
                {d.label || d.deviceId.slice(0, 8)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {action}
      </div>
    </div>
  );
}
