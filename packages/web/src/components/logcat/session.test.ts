import { describe, expect, it, vi } from 'vitest';
import type { DevicesSnapshot, LogSessionStatus, LogTarget } from '@frigg/shared';
import type { StartLogsInput } from '../../api/client';
import { isLogTargetAvailable, LogcatSessionCoordinator } from './session';

const stoppedStatus: LogSessionStatus = {
  streaming: false,
  target: null,
  packageFilter: null,
  error: null,
};

function streamingStatus(input: StartLogsInput): LogSessionStatus {
  return {
    streaming: true,
    target: { platform: input.platform, id: input.id, label: input.label },
    packageFilter: input.packageFilter ?? null,
    error: null,
  };
}

const pixel: LogTarget = { platform: 'android', id: 'emulator-5554', label: 'Pixel 8' };
const tablet: LogTarget = { platform: 'android', id: 'R58M123ABC', label: 'Galaxy Tab' };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('LogcatSessionCoordinator', () => {
  it('starts once for a selected target and ignores repeated syncs', async () => {
    const start = vi.fn(async (input: StartLogsInput) => streamingStatus(input));
    const coordinator = new LogcatSessionCoordinator({
      start,
      stop: vi.fn(async () => stoppedStatus),
      onStatus: vi.fn(),
    });

    await coordinator.setDesiredSession(pixel, '');
    await coordinator.setDesiredSession(pixel, '');

    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith({
      platform: 'android',
      id: 'emulator-5554',
      label: 'Pixel 8',
      packageFilter: undefined,
    });
  });

  it('restarts for a changed package and normalizes surrounding whitespace', async () => {
    const start = vi.fn(async (input: StartLogsInput) => streamingStatus(input));
    const coordinator = new LogcatSessionCoordinator({
      start,
      stop: vi.fn(async () => stoppedStatus),
      onStatus: vi.fn(),
    });

    await coordinator.setDesiredSession(pixel, 'com.example.first');
    await coordinator.setDesiredSession(pixel, '  com.example.second  ');

    expect(start).toHaveBeenCalledTimes(2);
    expect(start.mock.calls[1]?.[0].packageFilter).toBe('com.example.second');
  });

  it('does not publish a stale start and starts the latest target after serialization', async () => {
    const firstStart = deferred<LogSessionStatus>();
    const start = vi.fn((input: StartLogsInput) =>
      start.mock.calls.length === 1 ? firstStart.promise : Promise.resolve(streamingStatus(input)),
    );
    const onStatus = vi.fn();
    const coordinator = new LogcatSessionCoordinator({
      start,
      stop: vi.fn(async () => stoppedStatus),
      onStatus,
    });

    const firstRequest = coordinator.setDesiredSession(pixel, '');
    const latestRequest = coordinator.setDesiredSession(tablet, '');
    firstStart.resolve(streamingStatus({ platform: 'android', id: pixel.id, label: pixel.label }));
    await latestRequest;
    await firstRequest;

    expect(start.mock.calls.map(([input]) => input.id)).toEqual([pixel.id, tablet.id]);
    expect(onStatus).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenCalledWith(streamingStatus({
      platform: 'android', id: tablet.id, label: tablet.label,
    }));
  });

  it('waits for an explicit retry after a start failure', async () => {
    const start = vi.fn(async () => {
      throw new Error('device offline');
    });
    const onStatus = vi.fn();
    const coordinator = new LogcatSessionCoordinator({
      start,
      stop: vi.fn(async () => stoppedStatus),
      onStatus,
    });

    await coordinator.setDesiredSession(pixel, '');
    await coordinator.setDesiredSession(pixel, '');

    expect(start).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenLastCalledWith({
      streaming: false,
      target: pixel,
      packageFilter: null,
      error: 'device offline',
    });

    await coordinator.retry();

    expect(start).toHaveBeenCalledTimes(2);
  });

  it('stops the stream when the desired target is cleared', async () => {
    const stop = vi.fn(async () => stoppedStatus);
    const coordinator = new LogcatSessionCoordinator({
      start: vi.fn(async (input: StartLogsInput) => streamingStatus(input)),
      stop,
      onStatus: vi.fn(),
    });

    await coordinator.setDesiredSession(pixel, '');
    await coordinator.setDesiredSession(null, '');

    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('only treats connected Android devices and booted iOS simulators as available targets', () => {
    const devices = {
      android: [
        { serial: pixel.id, state: 'device' },
        { serial: 'offline-device', state: 'offline' },
      ],
      iosSimulators: [
        { udid: 'booted-sim', state: 'Booted' },
        { udid: 'shutdown-sim', state: 'Shutdown' },
      ],
    } as DevicesSnapshot;

    expect(isLogTargetAvailable(pixel, devices)).toBe(true);
    expect(isLogTargetAvailable({ ...pixel, id: 'offline-device' }, devices)).toBe(false);
    expect(isLogTargetAvailable({ platform: 'ios', id: 'booted-sim', label: 'iPhone' }, devices)).toBe(true);
    expect(isLogTargetAvailable({ platform: 'ios', id: 'shutdown-sim', label: 'iPhone' }, devices)).toBe(false);
  });
});
