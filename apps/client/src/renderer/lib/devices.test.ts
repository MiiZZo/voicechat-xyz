import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { groupDevices } from './devices.js';

const dev = (kind: MediaDeviceKind, deviceId: string, label = ''): MediaDeviceInfo =>
  ({ kind, deviceId, label, groupId: '', toJSON: () => ({}) }) as MediaDeviceInfo;

describe('groupDevices', () => {
  it('splits devices by kind', () => {
    const list = groupDevices([
      dev('audioinput', 'mic1'),
      dev('audiooutput', 'spk1'),
      dev('videoinput', 'cam1'),
    ]);
    assert.deepEqual(list.audioInputs.map((d) => d.deviceId), ['mic1']);
    assert.deepEqual(list.audioOutputs.map((d) => d.deviceId), ['spk1']);
    assert.deepEqual(list.videoInputs.map((d) => d.deviceId), ['cam1']);
  });

  it('drops devices with empty deviceId (no permission for that kind)', () => {
    const list = groupDevices([
      dev('audioinput', 'mic1', 'Mic'),
      dev('videoinput', ''),
      dev('audiooutput', ''),
    ]);
    assert.equal(list.audioInputs.length, 1);
    assert.equal(list.videoInputs.length, 0);
    assert.equal(list.audioOutputs.length, 0);
  });

  it('dedupes by kind + deviceId but keeps same id across kinds', () => {
    const list = groupDevices([
      dev('audioinput', 'default'),
      dev('audioinput', 'default'),
      dev('audiooutput', 'default'),
    ]);
    assert.equal(list.audioInputs.length, 1);
    assert.equal(list.audioOutputs.length, 1);
  });
});
