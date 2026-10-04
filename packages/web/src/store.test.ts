import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DevicesSnapshot } from '@frigg/shared';

const { getDevicesMock } = vi.hoisted(() => ({ getDevicesMock: vi.fn() }));

vi.mock('./api/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('./api/client')>();
  return { ...original, getDevices: getDevicesMock };
});

import { useAppStore } from './store';

function snapshot(android: Array<{ serial: string; state: string }> = []): DevicesSnapshot {
  return {
    android: android.map((device) => ({
      ...device,
      model: device.serial,
      state: device.state as 'device' | 'offline',
      isEmulator: true,
      proxyConfigured: false,
    })),
    iosSimulators: [],
    iosDevices: [],
    tooling: {
      adb: { available: true },
      xcrun: { available: true },
      macosProxy: { enabled: false, service: null },
    },
  };
}

beforeEach(() => {
  getDevicesMock.mockReset();
  useAppStore.setState({
    activeDevice: null,
    devices: null,
    logTarget: null,
    logTargetManuallyCleared: false,
  });
});

describe('Logcat target discovery', () => {
  it('starts for an available device and resumes after disconnect and reconnect', async () => {
    getDevicesMock
      .mockResolvedValueOnce(snapshot([{ serial: 'emulator-5554', state: 'device' }]))
      .mockResolvedValueOnce(snapshot())
      .mockResolvedValueOnce(snapshot([{ serial: 'emulator-5554', state: 'device' }]));

    await useAppStore.getState().refreshDevices();
    expect(useAppStore.getState().logTarget?.id).toBe('emulator-5554');

    await useAppStore.getState().refreshDevices();
    expect(useAppStore.getState().logTarget).toBeNull();

    await useAppStore.getState().refreshDevices();
    expect(useAppStore.getState().logTarget?.id).toBe('emulator-5554');
  });

  it('keeps Logcat stopped after the user clears the target', async () => {
    useAppStore.getState().setLogTarget(null);
    getDevicesMock.mockResolvedValue(snapshot([{ serial: 'emulator-5554', state: 'device' }]));

    await useAppStore.getState().refreshDevices();

    expect(useAppStore.getState().logTarget).toBeNull();
  });
});
