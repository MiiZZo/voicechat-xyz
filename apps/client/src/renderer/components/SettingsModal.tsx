import { useState } from 'react';
import { Keyboard } from 'lucide-react';
import { useStore } from '../state/store.js';
import { useDeviceList } from '../hooks/useDeviceList.js';
import type { Prefs } from '../../shared/types.js';
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

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

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

        <Section title="Push-to-talk">
          <Toggle
            label="Микрофон только при удержании клавиши"
            checked={prefs.pushToTalk.enabled}
            onChange={(v) => update({ pushToTalk: { ...prefs.pushToTalk, enabled: v } })}
          />
          {prefs.pushToTalk.enabled && (
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
