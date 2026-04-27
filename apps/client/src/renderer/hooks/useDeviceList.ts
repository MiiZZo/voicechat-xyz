import { useEffect, useState } from 'react';

export type DeviceList = {
  audioInputs: MediaDeviceInfo[];
  audioOutputs: MediaDeviceInfo[];
  videoInputs: MediaDeviceInfo[];
};

export function useDeviceList(): DeviceList {
  const [list, setList] = useState<DeviceList>({ audioInputs: [], audioOutputs: [], videoInputs: [] });

  useEffect(() => {
    let cancelled = false;

    const enumerate = async () => {
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (cancelled) return;
      setList({
        audioInputs: devices.filter((d) => d.kind === 'audioinput'),
        audioOutputs: devices.filter((d) => d.kind === 'audiooutput'),
        videoInputs: devices.filter((d) => d.kind === 'videoinput'),
      });
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

    init();
    const onChange = () => enumerate().catch(() => undefined);
    navigator.mediaDevices.addEventListener('devicechange', onChange);
    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener('devicechange', onChange);
    };
  }, []);

  return list;
}
