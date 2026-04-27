import { useState } from 'react';
import { useStore } from '../state/store.js';
import { useDeviceList } from '../hooks/useDeviceList.js';
import type { Prefs } from '../../shared/types.js';

type Props = { onClose: () => void };

export function SettingsModal({ onClose }: Props) {
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
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-6" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 text-lg font-semibold">Настройки</div>

        <Field label="Микрофон">
          <DeviceSelect
            devices={devices.audioInputs}
            value={prefs.audioInputDeviceId}
            onChange={(v) => update({ audioInputDeviceId: v })}
          />
        </Field>
        <Field label="Камера">
          <DeviceSelect
            devices={devices.videoInputs}
            value={prefs.videoInputDeviceId}
            onChange={(v) => update({ videoInputDeviceId: v })}
          />
        </Field>
        <Field label="Динамики">
          <DeviceSelect
            devices={devices.audioOutputs}
            value={prefs.audioOutputDeviceId}
            onChange={(v) => update({ audioOutputDeviceId: v })}
          />
        </Field>

        <div className="my-4 border-t border-zinc-800" />

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
          label="Авто-регулировка громкости"
          checked={prefs.audioConstraints.autoGainControl}
          onChange={(v) =>
            update({ audioConstraints: { ...prefs.audioConstraints, autoGainControl: v } })
          }
        />

        <div className="my-4 border-t border-zinc-800" />

        <Toggle
          label="Push-to-talk"
          checked={prefs.pushToTalk.enabled}
          onChange={(v) => update({ pushToTalk: { ...prefs.pushToTalk, enabled: v } })}
        />
        {prefs.pushToTalk.enabled && (
          <div className="mt-2 flex items-center gap-2 text-sm">
            <span className="text-zinc-400">Клавиша:</span>
            <button
              onClick={captureKey}
              className="rounded border border-zinc-700 px-2 py-1 hover:border-zinc-500"
            >
              {capturing ? 'Нажмите клавишу…' : prefs.pushToTalk.key}
            </button>
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <button onClick={onClose} className="rounded bg-zinc-100 px-3 py-1 text-sm text-zinc-900">
            Готово
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-xs text-zinc-400">{label}</span>
      {children}
    </label>
  );
}

function DeviceSelect({
  devices,
  value,
  onChange,
}: {
  devices: MediaDeviceInfo[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className="w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm"
    >
      <option value="">По умолчанию</option>
      {devices.map((d) => (
        <option key={d.deviceId} value={d.deviceId}>
          {d.label || d.deviceId.slice(0, 8)}
        </option>
      ))}
    </select>
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
    <label className="mb-2 flex items-center justify-between text-sm">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}
