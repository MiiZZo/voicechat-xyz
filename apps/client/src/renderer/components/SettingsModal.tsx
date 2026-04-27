import { useState } from 'react';
import { HelpCircle, Keyboard } from 'lucide-react';
import { useStore } from '../state/store.js';
import { useDeviceList } from '../hooks/useDeviceList.js';
import { useMicLevelMeter } from '../hooks/useMicLevelMeter.js';
import type { MicActivationMode, Prefs } from '../../shared/types.js';
import { cn } from '../lib/cn.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog.js';
import { Label } from './ui/label.js';
import { Switch } from './ui/switch.js';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select.js';
import { Button } from './ui/button.js';
import { Separator } from './ui/separator.js';
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

export function SettingsModal({ open, onOpenChange }: Props) {
  const { prefs, setPrefs } = useStore();
  const devices = useDeviceList();
  const [capturing, setCapturing] = useState(false);

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Настройки</DialogTitle>
          <DialogDescription>Устройства, обработка звука, поведение приложения</DialogDescription>
        </DialogHeader>

        <Section title="Устройства">
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
          />
        </Section>

        <Separator />

        <Section title="Обработка звука">
          <Toggle
            label="Эхоподавление"
            checked={prefs.audioConstraints.echoCancellation}
            onChange={(v) =>
              update({ audioConstraints: { ...prefs.audioConstraints, echoCancellation: v } })
            }
          />
          <Toggle
            label="Шумоподавление"
            checked={prefs.audioConstraints.noiseSuppression}
            onChange={(v) =>
              update({ audioConstraints: { ...prefs.audioConstraints, noiseSuppression: v } })
            }
          />
          <Toggle
            label="Авто-громкость"
            checked={prefs.audioConstraints.autoGainControl}
            onChange={(v) =>
              update({ audioConstraints: { ...prefs.audioConstraints, autoGainControl: v } })
            }
          />
        </Section>

        <Separator />

        <Section title="Активация микрофона">
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
        </Section>

        <Separator />

        <Section title="Окно">
          <Toggle
            label="Сворачивать в трей при закрытии"
            checked={prefs.closeToTray}
            onChange={(v) => update({ closeToTray: v })}
          />
        </Section>
      </DialogContent>
    </Dialog>
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <Label>{title}</Label>
      <div className="flex flex-col gap-3">{children}</div>
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
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-fg">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function DeviceField({
  label,
  devices,
  value,
  onChange,
}: {
  label: string;
  devices: MediaDeviceInfo[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const SENTINEL = '__default__';
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-fg-muted">{label}</span>
      <Select
        value={value ?? SENTINEL}
        onValueChange={(v) => onChange(v === SENTINEL ? null : v)}
      >
        <SelectTrigger>
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
    </div>
  );
}
