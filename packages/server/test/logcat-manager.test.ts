import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { execFileMock, spawnMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  spawnMock: vi.fn(),
}));

vi.mock('node:child_process', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:child_process')>();
  return { ...original, execFile: execFileMock, spawn: spawnMock };
});

import { LogcatManager } from '../src/logcat/manager.ts';

describe('LogcatManager', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('starts Android logcat without clearing the device buffer', async () => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: vi.fn(() => true),
      unref: vi.fn(),
    }) as unknown as ChildProcessWithoutNullStreams;
    spawnMock.mockReturnValue(child);
    execFileMock.mockImplementation((...args: unknown[]) => {
      const callback = args.at(-1) as (error: null, stdout: string, stderr: string) => void;
      callback(null, '', '');
      return child;
    });

    const manager = new LogcatManager();
    const status = await manager.start({
      platform: 'android',
      id: 'emulator-5554',
      label: 'Pixel 8',
    });

    expect(status.streaming).toBe(true);
    expect(execFileMock).not.toHaveBeenCalled();
    expect(spawnMock).toHaveBeenCalledWith(
      'adb',
      ['-s', 'emulator-5554', 'logcat', '-v', 'threadtime'],
      expect.any(Object),
    );

    await manager.dispose();
  });
});
