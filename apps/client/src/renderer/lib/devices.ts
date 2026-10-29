export type DeviceList = {
  audioInputs: MediaDeviceInfo[];
  audioOutputs: MediaDeviceInfo[];
  videoInputs: MediaDeviceInfo[];
};

/**
 * Раскладывает результат enumerateDevices() по типам, выкидывая непригодные
 * для выбора записи.
 *
 * Chromium (WebView2 / Electron) отдаёт устройства с пустым deviceId, если на
 * их kind нет разрешения — типичный случай в звонке: микрофон выдан, камера
 * нет. Такую запись всё равно нельзя выбрать, а Radix <Select.Item value="">
 * бросает исключение прямо в рендере и роняет всё React-дерево. Дубликаты по
 * deviceId тоже убираем — они ломают key'и в списке.
 */
export function groupDevices(devices: readonly MediaDeviceInfo[]): DeviceList {
  const list: DeviceList = { audioInputs: [], audioOutputs: [], videoInputs: [] };
  const seen = new Set<string>();
  for (const d of devices) {
    if (!d.deviceId) continue;
    const key = `${d.kind}:${d.deviceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (d.kind === 'audioinput') list.audioInputs.push(d);
    else if (d.kind === 'audiooutput') list.audioOutputs.push(d);
    else if (d.kind === 'videoinput') list.videoInputs.push(d);
  }
  return list;
}
