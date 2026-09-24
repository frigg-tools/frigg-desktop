import { describe, expect, it, vi } from 'vitest';
import type { AutomationNode, AutomationPoint } from '@frigg/shared';
import { runBuffer, type ExecBufferResult } from '../lib/exec.ts';
import { AndroidAutomationDevice, DeviceAutomationError } from './adb.ts';

type Runner = (command: string, args: string[], options?: { timeoutMs?: number; signal?: AbortSignal }) => Promise<ExecBufferResult>;

function result(stdout: Buffer = Buffer.alloc(0), stderr: Buffer = Buffer.alloc(0), code: number | null = 0): ExecBufferResult {
  return { ok: code === 0, stdout, stderr, code };
}

function png(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes, 0);
  Buffer.from('IHDR').copy(bytes, 12);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function point(patch: Partial<AutomationPoint> = {}): AutomationPoint {
  return {
    x: 0.25,
    y: 0.5,
    referenceWidth: 400,
    referenceHeight: 800,
    referenceRotation: 0,
    ...patch,
  };
}

function tap(data: Record<string, unknown>): AutomationNode {
  return { id: 'tap-node', type: 'tap', data, position: { x: 0, y: 0 } };
}

function readyRunner(implementation?: Runner) {
  const runner = vi.fn<Runner>(implementation ?? (async (_command, args) => {
    if (args[2] === 'get-state') return result(Buffer.from('device\n'));
    if (args[2] === 'shell' && args[3] === 'dumpsys') return result(Buffer.from('SurfaceOrientation: 0\n'));
    if (args[2] === 'exec-out') return result(png(400, 800));
    return result();
  }));
  return runner;
}

describe('AndroidAutomationDevice', () => {
  it('keeps binary stdout and stderr intact when running a real child process', async () => {
    const bytes = [0, 255, 137, 80, 78, 71, 13, 10, 26, 10];
    const outcome = await runBuffer(process.execPath, ['-e', `process.stdout.write(Buffer.from(${JSON.stringify(bytes)}))`]);
    expect(outcome.ok).toBe(true);
    expect(outcome.stdout).toEqual(Buffer.from(bytes));
    expect(outcome.stderr).toEqual(Buffer.alloc(0));
  });

  it('aborts a real child process when its signal is cancelled', async () => {
    const controller = new AbortController();
    const pending = runBuffer(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], { signal: controller.signal });
    controller.abort();
    const outcome = await pending;
    expect(outcome.ok).toBe(false);
    expect(outcome.code).toBeNull();
  });

  it('encodes supported text and scopes input to the selected serial', async () => {
    const runner = readyRunner();
    const device = new AndroidAutomationDevice(runner);
    await device.perform('emulator-5554', {
      id: 'text', type: 'text', data: { text: 'Hi 42' }, position: { x: 0, y: 0 },
    }, new AbortController().signal);
    expect(runner).toHaveBeenCalledWith('adb', ['-s', 'emulator-5554', 'shell', 'input', 'text', 'Hi%s42'], expect.any(Object));
  });

  it.each([
    { type: 'forceStopApp', command: ['shell', 'am', 'force-stop', 'com.example.app'] },
    { type: 'clearAppData', command: ['shell', 'pm', 'clear', 'com.example.app'] },
    { type: 'adbCommand', command: ['shell', 'dumpsys', 'activity'] },
  ] as const)('dispatches $type to the selected Android device', async ({ type, command }) => {
    const runner = readyRunner();
    const data = type === 'adbCommand' ? { command: 'dumpsys activity' } : { packageName: 'com.example.app' };
    await new AndroidAutomationDevice(runner).perform('emulator-5554', {
      id: 'command', type, data, position: { x: 0, y: 0 },
    }, new AbortController().signal);
    expect(runner).toHaveBeenCalledWith('adb', ['-s', 'emulator-5554', ...command], expect.any(Object));
  });

  it('rejects an unsafe custom ADB command before sending it to the device', async () => {
    const runner = readyRunner();
    await expect(new AndroidAutomationDevice(runner).perform('emulator-5554', {
      id: 'command', type: 'adbCommand', data: { command: 'input tap 1 2; reboot' }, position: { x: 0, y: 0 },
    }, new AbortController().signal)).rejects.toMatchObject({ code: 'unsupported_adb_command' });
    expect(runner.mock.calls.map((call) => call[1])).toEqual([['-s', 'emulator-5554', 'get-state']]);
  });

  it('rejects shell-significant text before issuing an input command', async () => {
    const runner = readyRunner();
    const device = new AndroidAutomationDevice(runner);
    await expect(device.perform('emulator-5554', {
      id: 'text', type: 'text', data: { text: 'Hi; reboot' }, position: { x: 0, y: 0 },
    }, new AbortController().signal)).rejects.toMatchObject({ code: 'unsupported_text' });
    expect(runner.mock.calls.map((call) => call[1])).not.toContainEqual(['-s', 'emulator-5554', 'shell', 'input', 'text', 'Hi;%sreboot']);
  });

  it('returns screenshot bytes, dimensions, and the parsed display rotation', async () => {
    const runner = readyRunner(async (_command, args) => {
        if (args[2] === 'get-state') return result(Buffer.from('device\n'));
        if (args[2] === 'shell') return result(Buffer.from('SurfaceOrientation: 3\n'));
        return result(png(720, 1280));
      });
    const screenshot = await new AndroidAutomationDevice(runner).screenshot('SERIAL-1', new AbortController().signal);
    expect(screenshot).toMatchObject({ width: 720, height: 1280, rotation: 3 });
    expect(screenshot.png.subarray(0, 8)).toEqual(png(720, 1280).subarray(0, 8));
    expect(runner.mock.calls.map((call) => call[1])).toEqual([
      ['-s', 'SERIAL-1', 'get-state'],
      ['-s', 'SERIAL-1', 'shell', 'dumpsys', 'input'],
      ['-s', 'SERIAL-1', 'exec-out', 'screencap', '-p'],
    ]);
  });

  it('falls back to the current window display rotation on modern Android versions', async () => {
    const runner = readyRunner(async (_command, args) => {
      if (args[2] === 'get-state') return result(Buffer.from('device\n'));
      if (args[2] === 'shell' && args[4] === 'input') return result(Buffer.from('Input Manager State: no SurfaceOrientation field\n'));
      if (args[2] === 'shell' && args[5] === 'displays') return result(Buffer.from('DisplayRotation\n  mRotation=1 mDeferredRotationPauseCount=0\n'));
      return result(png(1080, 2340));
    });
    const screenshot = await new AndroidAutomationDevice(runner).screenshot('emulator-5554', new AbortController().signal);
    expect(screenshot).toMatchObject({ width: 1080, height: 2340, rotation: 1 });
    expect(runner.mock.calls.map((call) => call[1])).toContainEqual(['-s', 'emulator-5554', 'shell', 'dumpsys', 'window', 'displays']);
  });

  it('rejects malformed screenshots and unknown rotations', async () => {
    const badPngRunner = readyRunner(async (_command, args) => {
        if (args[2] === 'get-state') return result(Buffer.from('device\n'));
        if (args[2] === 'shell') return result(Buffer.from('SurfaceOrientation: 0\n'));
        return result(Buffer.from('not a png'));
      });
    await expect(new AndroidAutomationDevice(badPngRunner).screenshot('SERIAL-1', new AbortController().signal))
      .rejects.toMatchObject({ code: 'invalid_screenshot' });

    const badRotationRunner = readyRunner(async (_command, args) => {
        if (args[2] === 'get-state') return result(Buffer.from('device\n'));
        if (args[2] === 'shell') return result(Buffer.from('No display rotation here\n'));
        return result(png(400, 800));
      });
    await expect(new AndroidAutomationDevice(badRotationRunner).screenshot('SERIAL-1', new AbortController().signal))
      .rejects.toMatchObject({ code: 'unsupported_rotation' });
  });

  it('rejects devices which are unauthorized or offline', async () => {
    const runner = readyRunner(async () => result(Buffer.from('unauthorized\n')));
    await expect(new AndroidAutomationDevice(runner).assertReady('SERIAL-1', new AbortController().signal))
      .rejects.toMatchObject({ code: 'device_not_ready' });
    expect(runner).toHaveBeenCalledWith('adb', ['-s', 'SERIAL-1', 'get-state'], expect.any(Object));
  });

  it('blocks a tap when screenshot geometry no longer matches its reference', async () => {
    const runner = readyRunner(async (_command, args) => {
        if (args[2] === 'get-state') return result(Buffer.from('device\n'));
        if (args[2] === 'shell') return result(Buffer.from('SurfaceOrientation: 1\n'));
        return result(png(800, 400));
      });
    const device = new AndroidAutomationDevice(runner);
    await expect(device.perform('SERIAL-1', tap({ point: point() }), new AbortController().signal))
      .rejects.toMatchObject({ code: 'geometry_changed' });
    expect(runner.mock.calls.some((call) => call[1].includes('tap'))).toBe(false);
  });

  it('rejects an out-of-range point even when called outside graph validation', async () => {
    const runner = readyRunner();
    const device = new AndroidAutomationDevice(runner);
    await expect(device.perform('SERIAL-1', tap({ point: point({ x: -0.1 }) }), new AbortController().signal))
      .rejects.toBeInstanceOf(DeviceAutomationError);
    expect(runner.mock.calls.some((call) => call[1].includes('tap'))).toBe(false);
  });
});
