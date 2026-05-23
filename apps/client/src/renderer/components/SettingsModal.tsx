import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
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
        // flex-col (overrides Dialog's default `grid`) — so body's flex-1 actually
        // stretches to fill the modal height. With grid + auto rows the body would
        // size to content and the header would float in the remaining gap.
        // Sliding-in-from-bottom matches mockup .modal-card entrance animation.
        className={cn(
          // Override Dialog's default grid → flex-col so body's flex-1 fills.
          // Animation comes from the parent DialogContent's vo-modal-anim class.
          'flex flex-col overflow-hidden',
        )}
        style={{
          width: 880,
          height: 640,
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

        {/* Velvet Onyx modal header — title + version subtitle, mirrors mockup .modal-header */}
        <header className="flex shrink-0 items-center gap-3 border-b border-white/[0.05] px-[22px] py-[18px]">
          <h2 className="text-[17px] font-semibold leading-none tracking-[-0.005em] text-fg">
            Настройки
          </h2>
          <HeaderVersionBadge />
        </header>

        <div className="flex h-full min-h-0 flex-1">
          {/* Sidebar — section nav only (title moved to modal header above). */}
          <aside className="flex w-[200px] shrink-0 flex-col border-r border-white/[0.05] bg-black/20 pt-3.5">
            <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2.5 pb-3">
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
            <div
              key={activeTab}
              className="animate-in fade-in-0 slide-in-from-bottom-1.5 duration-[250ms] px-8 pb-8 pt-7"
            >
              <ContentHeader tab={current} />
              <div className="mt-2 flex flex-col">
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
                    <Block
                      title="Когда передавать голос"
                      desc="Выбери, что должно открывать твой микрофон в эфир."
                    >
                      <ModePicker mode={prefs.micActivationMode} onChange={setMode} />
                    </Block>
                    {prefs.micActivationMode === 'ptt' && (
                      <div className="flex items-center justify-between gap-6 border-b border-white/[0.05] py-4 last:border-b-0">
                        <span className="text-[13px] font-medium text-fg">Клавиша push-to-talk</span>
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
                      desc="Убирает эхо, когда звук идёт через колонки."
                      checked={prefs.audioConstraints.echoCancellation}
                      onChange={(v) =>
                        update({
                          audioConstraints: { ...prefs.audioConstraints, echoCancellation: v },
                        })
                      }
                    />
                    <Toggle
                      label="Шумоподавление"
                      desc="Гасит фоновые шумы: клавиатуру, кулеры, эхо комнаты."
                      checked={prefs.audioConstraints.noiseSuppression}
                      onChange={(v) =>
                        update({
                          audioConstraints: { ...prefs.audioConstraints, noiseSuppression: v },
                        })
                      }
                    />
                    <Toggle
                      label="Авто-громкость"
                      desc="Подстраивает уровень микрофона автоматически."
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
                    {/* Sounds toggle + volume sub-control share one row container —
                        the volume slider is conceptually a sub-setting of the toggle,
                        so no internal hairline separates them. */}
                    <div className="border-b border-white/[0.05] py-4 last:border-b-0">
                      <label className="flex cursor-pointer select-none items-center justify-between gap-6">
                        <div className="flex min-w-0 flex-col gap-1">
                          <span className="text-[13px] font-medium text-fg">Системные звуки</span>
                          <span className="text-[12px] leading-[1.5] text-fg-subtle">
                            Подключение/отключение участников, входящие сообщения.
                          </span>
                        </div>
                        <Switch
                          checked={prefs.soundsEnabled}
                          onCheckedChange={(v) => update({ soundsEnabled: v })}
                        />
                      </label>
                      <div
                        className={cn(
                          'mt-3 flex items-center gap-4 pl-3 transition-opacity',
                          !prefs.soundsEnabled && 'opacity-40',
                        )}
                      >
                        <span className="shrink-0 text-[12px] text-fg-muted">Громкость</span>
                        <div className="min-w-0 flex-1">
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
                        <span className="w-10 shrink-0 text-right font-mono text-[10px] tabular-nums text-fg-subtle">
                          {Math.round(prefs.soundsVolume * 100)}%
                        </span>
                      </div>
                    </div>

                    {/* Notifications toggle + position picker share one row container —
                        picker is conceptually a sub-setting of the toggle. */}
                    <div className="border-b border-white/[0.05] py-4 last:border-b-0">
                      <label className="flex cursor-pointer select-none items-center justify-between gap-6">
                        <div className="flex min-w-0 flex-col gap-1">
                          <span className="text-[13px] font-medium text-fg">
                            Уведомления о сообщениях в фоне
                          </span>
                          <span className="text-[12px] leading-[1.5] text-fg-subtle">
                            Показывать всплывающий тост, когда окно вне фокуса.
                          </span>
                        </div>
                        <Switch
                          checked={prefs.notificationsEnabled}
                          onCheckedChange={(v) => update({ notificationsEnabled: v })}
                        />
                      </label>
                      <div
                        className={cn(
                          'mt-3 flex flex-col gap-2 pl-3 transition-opacity',
                          !prefs.notificationsEnabled && 'opacity-40',
                        )}
                      >
                        <span className="text-[12px] text-fg-muted">Позиция на экране</span>
                        <NotificationCornerPicker
                          value={prefs.notificationPosition}
                          onChange={(v) => update({ notificationPosition: v })}
                          disabled={!prefs.notificationsEnabled}
                        />
                      </div>
                    </div>

                    <Toggle
                      label="Сворачивать в трей при закрытии"
                      desc="Кнопка закрытия не выключает приложение, а отправляет его в трей."
                      checked={prefs.closeToTray}
                      onChange={(v) => update({ closeToTray: v })}
                    />
                  </>
                )}

                {activeTab === 'screen' && (
                  <>
                    <Block
                      title="Профиль качества"
                      desc="Выбери баланс между плавностью и чёткостью."
                    >
                      <ScreenSharePresetPicker
                        value={prefs.screenSharePreset}
                        onChange={(v) => update({ screenSharePreset: v })}
                      />
                    </Block>
                    {/* Codec — inline mset-row (label left, select right). */}
                    <div className="flex items-center justify-between gap-6 border-b border-white/[0.05] py-4 last:border-b-0">
                      <div className="flex min-w-0 flex-col gap-1">
                        <span className="text-[13px] font-medium text-fg">Видеокодек</span>
                        <span className="text-[12px] leading-[1.5] text-fg-subtle">
                          VP8 быстрее на CPU, H264 даёт лучшее качество.
                        </span>
                      </div>
                      <ScreenShareCodecPicker
                        value={prefs.screenShareCodec}
                        onChange={(v) => update({ screenShareCodec: v })}
                      />
                    </div>
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
        // Match mockup .nav-item — no left accent bar, just bg + border + inset
        // highlight on active.
        'flex items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-[13px] font-medium leading-none transition-all',
        active
          ? 'border border-white/[0.08] bg-white/[0.06] text-fg shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_4px_14px_-8px_rgba(0,0,0,0.4)]'
          : 'border border-transparent text-fg-muted hover:bg-white/[0.04] hover:text-fg',
      )}
    >
      <Icon className="h-[15px] w-[15px] shrink-0 opacity-85" strokeWidth={1.75} />
      <span className="truncate">{tab.label}</span>
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
  // Velvet Onyx: pane-head pattern — title + caption above hairline separator
  return (
    <div className="mb-2 flex flex-col gap-1 border-b border-white/[0.05] pb-[18px]">
      <h2 className="text-[20px] font-semibold leading-none tracking-[-0.01em] text-fg">
        {tab.label}
      </h2>
      {tab.caption && (
        <p className="text-xs leading-none tracking-[0.02em] text-fg-subtle">
          {tab.caption}
        </p>
      )}
    </div>
  );
}

/** Small mono badge for the modal header — fetches the running app version
 *  on mount and renders it next to "Настройки". Mirrors mockup .modal-header .sub. */
function HeaderVersionBadge() {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    const api = window.api as { getAppVersion?: () => Promise<string> };
    void api.getAppVersion?.().then(setVersion).catch(() => undefined);
  }, []);
  if (!version) return null;
  return (
    <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-fg-subtle">
      Voicechat · v{version}
    </span>
  );
}

function ScreenShareCodecPicker({
  value,
  onChange,
}: {
  value: ScreenShareCodec;
  onChange: (v: ScreenShareCodec) => void;
}) {
  // Mockup renders the codec as a regular dropdown — radio-button-group was a
  // stylistic experiment, but the dropdown matches the rest of the settings
  // pane visually (DeviceField selects, sample-rate selects, etc.).
  const options: { value: ScreenShareCodec; label: string }[] = [
    { value: 'vp8',  label: 'VP8 · libvpx (рекомендуется)' },
    { value: 'h264', label: 'H264 · OpenH264' },
    { value: 'vp9',  label: 'VP9' },
    { value: 'av1',  label: 'AV1' },
  ];
  return (
    <Select value={value} onValueChange={(v) => onChange(v as ScreenShareCodec)}>
      <SelectTrigger className="w-[260px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
              'group relative h-12 rounded-md border transition-all',
              active
                ? 'border-white/25 bg-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_4px_14px_-8px_hsla(240,12%,80%,0.30)]'
                : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]',
              disabled && 'cursor-not-allowed',
            )}
          >
            {/* Мини-«тост» в нужном углу мини-«экрана». */}
            <span
              aria-hidden
              className={cn(
                'absolute h-1.5 w-9 rounded-sm transition-all',
                active
                  ? 'bg-[linear-gradient(90deg,hsl(240_6%_94%),hsl(240_6%_74%))] shadow-[0_0_8px_hsla(240,12%,80%,0.4)]'
                  : 'bg-fg-subtle group-hover:bg-fg/60',
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
      className="grid grid-cols-3 gap-2.5"
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
              'relative flex flex-col items-start gap-1 rounded-md border p-3.5 text-left transition-all',
              active
                ? 'border-[hsla(240,10%,92%,0.30)] bg-[hsla(240,8%,70%,0.06)] shadow-[0_4px_20px_-8px_hsla(240,12%,80%,0.25),inset_0_1px_0_rgba(255,255,255,0.06)]'
                : 'border-[hsla(240,8%,90%,0.08)] bg-[hsla(240,8%,70%,0.04)] hover:border-[hsla(240,8%,90%,0.16)]',
            )}
          >
            {active && (
              <span
                aria-hidden
                className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-[hsl(240_8%_92%)] shadow-[0_0_8px_hsla(240,12%,80%,0.5)]"
              />
            )}
            <span className="text-[13px] font-medium text-fg">{opt.label}</span>
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

  // Split prettyAccel'd combo (e.g. "Ctrl+Shift+M") into per-key chips.
  const parts = value ? prettyAccel(value).split('+').map((s) => s.trim()) : [];

  return (
    <div className="flex items-center justify-between gap-6 border-b border-white/[0.05] py-4 last:border-b-0">
      <span className="text-[13px] font-medium text-fg">{label}</span>
      <div className="flex shrink-0 items-center gap-1.5">
        {/* Trigger: kbd-chip row when value is set, otherwise the capture button.
           Click anywhere on the chips/button enters capture mode. */}
        <button
          ref={btnRef}
          type="button"
          onClick={() => setCapturing((c) => !c)}
          className={cn(
            'inline-flex items-center gap-1 rounded-md transition-colors',
            // Suppress UA outline on mouse-click; soft pearl glow on keyboard focus.
            'focus:outline-none focus-visible:outline-none',
            'focus-visible:shadow-[0_0_0_3px_hsla(240,10%,80%,0.10)]',
            capturing
              ? 'border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[12px] text-fg'
              : value
                ? 'px-1 py-0.5 hover:bg-white/[0.04]'
                : 'border border-white/10 bg-[linear-gradient(180deg,hsl(240_4%_14%),hsl(240_4%_10%))] px-3 py-1.5 text-[12px] text-fg-muted hover:border-white/[0.14] hover:text-fg',
          )}
        >
          {capturing ? (
            <>
              <Keyboard className="h-3.5 w-3.5" />
              <span>Нажмите комбинацию…</span>
            </>
          ) : value ? (
            parts.map((p, i) => (
              <Fragment key={`${p}-${i}`}>
                {i > 0 && (
                  <span className="text-[11px] text-fg-subtle">+</span>
                )}
                <span className="inline-flex items-center rounded-sm border border-white/10 border-b-[1.5px] border-b-white/20 bg-[linear-gradient(180deg,hsl(240_6%_16%),hsl(240_6%_10%))] px-[9px] py-1 font-mono text-[11px] leading-none tracking-[0.04em] text-fg">
                  {p}
                </span>
              </Fragment>
            ))
          ) : (
            <>
              <Keyboard className="h-3.5 w-3.5" />
              <span>Не задан</span>
            </>
          )}
        </button>
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
  // Card-style picker — matches mockup .mode-cards (title + description per
  // card, pearl dot indicator on active). Replaces the old segmented pill.
  const options: { value: MicActivationMode; title: string; desc: string }[] = [
    { value: 'always', title: 'Всегда', desc: 'Микрофон открыт, пока ты сам не выключишь.' },
    { value: 'ptt', title: 'По кнопке', desc: 'Транслирует только пока удерживаешь клавишу.' },
    { value: 'vad', title: 'По голосу', desc: 'Открывается автоматически, когда заговорил.' },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Режим активации микрофона"
      className="grid grid-cols-3 gap-2.5"
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
              'relative flex flex-col gap-1 rounded-md border p-3.5 text-left transition-all',
              active
                ? 'border-[hsla(240,10%,92%,0.30)] bg-[hsla(240,8%,70%,0.06)] shadow-[0_4px_20px_-8px_hsla(240,12%,80%,0.25),inset_0_1px_0_rgba(255,255,255,0.06)]'
                : 'border-[hsla(240,8%,90%,0.08)] bg-[hsla(240,8%,70%,0.04)] hover:border-[hsla(240,8%,90%,0.16)]',
            )}
          >
            {active && (
              <span
                aria-hidden
                className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-[hsl(240_8%_92%)] shadow-[0_0_8px_hsla(240,12%,80%,0.5)]"
              />
            )}
            <span className="text-[13px] font-medium text-fg">{opt.title}</span>
            <span className="text-[11px] leading-relaxed text-fg-subtle">{opt.desc}</span>
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

/** Mockup `.mset-row.block` — full-width control with name + optional desc
 *  stacked above. Used for radio-card pickers (Mode/Preset) and the
 *  notification-corner picker that doesn't fit the inline left/right pattern.
 *  Same py-4 + hairline as the inline mset-row so vertical rhythm stays
 *  consistent through the pane. */
function Block({
  title,
  desc,
  disabled,
  children,
}: {
  title: string;
  desc?: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex flex-col border-b border-white/[0.05] py-4 transition-opacity last:border-b-0',
        disabled && 'opacity-40',
      )}
    >
      <span className="text-[13px] font-medium text-fg">{title}</span>
      {desc && (
        <span className="mt-1 text-[12px] leading-[1.5] text-fg-subtle">{desc}</span>
      )}
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Toggle({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  /** Опциональная подпись под заголовком — описание что делает тоггл. */
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  // Velvet Onyx: mset-row pattern — label + optional desc on left, switch on right,
  // hairline border-bottom between consecutive rows (group:last suppresses last).
  return (
    <label className="vo-mset-row group/row flex cursor-pointer select-none items-center justify-between gap-6 border-b border-white/[0.05] py-4 last:border-b-0">{/* mset-row pattern: 16px vertical padding + hairline divider */}
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[13px] font-medium text-fg">{label}</span>
        {desc && (
          <span className="text-[12px] leading-[1.5] text-fg-subtle">{desc}</span>
        )}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function DeviceField({
  label,
  desc,
  devices,
  value,
  onChange,
  action,
}: {
  label: string;
  /** Опциональная подпись под заголовком. */
  desc?: string;
  devices: MediaDeviceInfo[];
  value: string | null;
  onChange: (v: string | null) => void;
  /** Опциональный trailing-слот рядом с Select — например, кнопка тест-сигнала. */
  action?: ReactNode;
}) {
  const SENTINEL = '__default__';
  // Velvet Onyx: mset-row pattern — name+desc left, control right, hairline border-bottom.
  return (
    <div className="flex items-center justify-between gap-6 border-b border-white/[0.05] py-4 last:border-b-0">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[13px] font-medium text-fg">{label}</span>
        {desc && (
          <span className="text-[12px] leading-[1.5] text-fg-subtle">{desc}</span>
        )}
      </div>
      <div className="flex shrink-0 items-stretch gap-2">
        <Select
          value={value ?? SENTINEL}
          onValueChange={(v) => onChange(v === SENTINEL ? null : v)}
        >
          <SelectTrigger className="w-[220px]">
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
