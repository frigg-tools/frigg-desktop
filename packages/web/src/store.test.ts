import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DevicesSnapshot } from '@frigg/shared';

const { getDeviceAppsMock, getDevicesMock } = vi.hoisted(() => ({
  getDeviceAppsMock: vi.fn(),
  getDevicesMock: vi.fn(),
}));

vi.mock('./api/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('./api/client')>();
  return { ...original, getDeviceApps: getDeviceAppsMock, getDevices: getDevicesMock };
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
  getDeviceAppsMock.mockReset();
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

  it('loads packages for the automatically selected device', async () => {
    getDevicesMock.mockResolvedValue(snapshot([{ serial: 'emulator-5554', state: 'device' }]));
    getDeviceAppsMock.mockResolvedValue([
      { id: 'com.example.app', label: 'Example App', system: false },
    ]);

    await useAppStore.getState().refreshDevices();
    await vi.waitFor(() => {
      expect(useAppStore.getState().logApps).toEqual([
        { id: 'com.example.app', label: 'Example App', system: false },
      ]);
    });

    expect(getDeviceAppsMock).toHaveBeenCalledWith('android', 'emulator-5554');
  });

  it('toggles the Logcat tool window without changing the primary screen', () => {
    useAppStore.setState({ screen: 'database', logcatPanelOpen: false });

    useAppStore.getState().toggleLogcatPanel();

    expect(useAppStore.getState().screen).toBe('database');
    expect(useAppStore.getState().logcatPanelOpen).toBe(true);
  });
});
