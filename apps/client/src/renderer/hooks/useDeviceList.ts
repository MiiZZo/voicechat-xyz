import { useEffect, useState } from 'react';
import { groupDevices, type DeviceList } from '../lib/devices.js';

export type { DeviceList };

export function useDeviceList(): DeviceList {
  const [list, setList] = useState<DeviceList>({ audioInputs: [], audioOutputs: [], videoInputs: [] });

  useEffect(() => {
    let cancelled = false;

    const enumerate = async () => {
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (cancelled) return;
      setList(groupDevices(devices));
    };

    // First call: prime the permission once so device labels populate.
    // Subsequent devicechange events just re-enumerate without re-prompting.
    const init = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        stream.getTracks().forEach((t) => t.stop());
      } catch {
        /* permission denied — proceed with un-labeled list */
      }
      await enumerate();
    };

    init().catch(() => undefined);
    const onChange = () => enumerate().catch(() => undefined);
    navigator.mediaDevices.addEventListener('devicechange', onChange);
    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener('devicechange', onChange);
    };
  }, []);

  return list;
}
