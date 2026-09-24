import {
  AUTOMATION_KEY,
  AUTOMATION_NODE_TYPE,
  type AutomationActionData,
  type AutomationKey,
  type AutomationNode,
  type AutomationPoint,
} from '@frigg/shared';
import { runBuffer, type ExecBufferResult } from '../lib/exec.ts';

export interface DeviceScreenshot {
  png: Buffer;
  width: number;
  height: number;
  rotation: 0 | 1 | 2 | 3;
}

export type AutomationBinaryRunner = (
  command: string,
  args: string[],
  options?: { timeoutMs?: number; signal?: AbortSignal },
) => Promise<ExecBufferResult>;

export class DeviceAutomationError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'DeviceAutomationError';
  }
}

const timeoutMs = 15_000;
const supportedText = /^[A-Za-z0-9.,:@/_ -]*$/;
const packageNamePattern = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+$/;
const keyEvents: Record<AutomationKey, string> = {
  [AUTOMATION_KEY.back]: '4',
  [AUTOMATION_KEY.home]: '3',
  [AUTOMATION_KEY.enter]: '66',
  [AUTOMATION_KEY.appSwitch]: '187',
};

function failureDetail(result: ExecBufferResult): string {
  return result.stderr.toString('utf8').trim() || result.stdout.toString('utf8').trim() || `exit code ${result.code}`;
}

function assertOk(result: ExecBufferResult, action: string): void {
  if (!result.ok) throw new DeviceAutomationError('adb_failed', `${action}: ${failureDetail(result)}`);
}

function parsePngSize(bytes: Buffer): { width: number; height: number } {
  if (
    bytes.length < 24 ||
    !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    bytes.toString('ascii', 12, 16) !== 'IHDR'
  ) {
    throw new DeviceAutomationError('invalid_screenshot', 'Device returned an invalid PNG screenshot.');
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width < 1 || height < 1 || width > 16_384 || height > 16_384) {
    throw new DeviceAutomationError('invalid_screenshot', 'Screenshot dimensions are outside the supported range.');
  }
  return { width, height };
}

function tryParseRotation(output: Buffer): 0 | 1 | 2 | 3 | null {
  const text = output.toString('utf8');
  const match = text.match(/SurfaceOrientation:\s*([0-3])\b/) ?? text.match(/\bmRotation=(?:ROTATION_)?([0-3])\b/);
  return match ? Number(match[1]) as 0 | 1 | 2 | 3 : null;
}

function parseRotation(output: Buffer): 0 | 1 | 2 | 3 {
  const rotation = tryParseRotation(output);
  if (rotation === null) throw new DeviceAutomationError('unsupported_rotation', 'Android did not report a supported display rotation.');
  return rotation;
}

function asData(value: AutomationActionData): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function pointFrom(data: Record<string, unknown>, key: string): AutomationPoint {
  const value = data[key];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new DeviceAutomationError('invalid_point', 'A screen point is required for this action.');
  }
  const point = value as Record<string, unknown>;
  if (
    typeof point.x !== 'number' || !Number.isFinite(point.x) || point.x < 0 || point.x > 1 ||
    typeof point.y !== 'number' || !Number.isFinite(point.y) || point.y < 0 || point.y > 1 ||
    typeof point.referenceWidth !== 'number' || !Number.isInteger(point.referenceWidth) || point.referenceWidth < 1 ||
    typeof point.referenceHeight !== 'number' || !Number.isInteger(point.referenceHeight) || point.referenceHeight < 1 ||
    typeof point.referenceRotation !== 'number' || !Number.isInteger(point.referenceRotation) || point.referenceRotation < 0 || point.referenceRotation > 3
  ) {
    throw new DeviceAutomationError('invalid_point', 'Screen point or reference geometry is invalid.');
  }
  return point as unknown as AutomationPoint;
}

function durationFrom(data: Record<string, unknown>): number {
  const durationMs = data.durationMs;
  if (typeof durationMs !== 'number' || !Number.isInteger(durationMs) || durationMs < 1 || durationMs > 10_000) {
    throw new DeviceAutomationError('invalid_gesture_duration', 'Gesture duration must be an integer between 1 and 10,000 ms.');
  }
  return durationMs;
}

function pixelCoordinate(value: number, length: number): number {
  return Math.min(length - 1, Math.round(value * (length - 1)));
}

function assertGeometry(point: AutomationPoint, screenshot: DeviceScreenshot): void {
  if (
    point.referenceWidth !== screenshot.width ||
    point.referenceHeight !== screenshot.height ||
    point.referenceRotation !== screenshot.rotation
  ) {
    throw new DeviceAutomationError('geometry_changed', 'Screen size or rotation changed. Capture a new screenshot and mark the point again.');
  }
}

function normalizedText(value: unknown): string {
  if (typeof value !== 'string' || value.length > 1_000 || !supportedText.test(value)) {
    throw new DeviceAutomationError('unsupported_text', 'Text supports ASCII letters, digits, spaces, and . , : @ / _ - only.');
  }
  return value.replaceAll(' ', '%s');
}

export class AndroidAutomationDevice {
  constructor(private readonly execute: AutomationBinaryRunner = runBuffer) {}

  async assertReady(serial: string, signal: AbortSignal): Promise<void> {
    this.assertSerial(serial);
    const result = await this.execute('adb', ['-s', serial, 'get-state'], { timeoutMs, signal });
    if (!result.ok || result.stdout.toString('utf8').trim() !== 'device') {
      throw new DeviceAutomationError('device_not_ready', `Android device ${serial} is offline or has not authorized ADB debugging.`);
    }
  }

  async screenshot(serial: string, signal: AbortSignal): Promise<DeviceScreenshot> {
    await this.assertReady(serial, signal);
    const rotationResult = await this.execute('adb', ['-s', serial, 'shell', 'dumpsys', 'input'], { timeoutMs, signal });
    assertOk(rotationResult, 'Could not read Android display rotation');
    let rotation = tryParseRotation(rotationResult.stdout);
    if (rotation === null) {
      const displayResult = await this.execute('adb', ['-s', serial, 'shell', 'dumpsys', 'window', 'displays'], { timeoutMs, signal });
      assertOk(displayResult, 'Could not read Android window display rotation');
      rotation = parseRotation(displayResult.stdout);
    }
    const capture = await this.execute('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { timeoutMs, signal });
    assertOk(capture, 'Could not capture Android screen');
    const { width, height } = parsePngSize(capture.stdout);
    return { png: capture.stdout, width, height, rotation };
  }

  async perform(serial: string, node: AutomationNode, signal: AbortSignal): Promise<void> {
    await this.assertReady(serial, signal);
    const data = asData(node.data);
    switch (node.type) {
      case AUTOMATION_NODE_TYPE.launchApp: {
        const packageName = data.packageName;
        if (typeof packageName !== 'string' || !packageNamePattern.test(packageName)) {
          throw new DeviceAutomationError('invalid_package_name', 'Enter a valid Android package name.');
        }
        await this.command(serial, ['shell', 'monkey', '-p', packageName, '-c', 'android.intent.category.LAUNCHER', '1'], signal);
        return;
      }
      case AUTOMATION_NODE_TYPE.tap: {
        const point = pointFrom(data, 'point');
        const screen = await this.screenshot(serial, signal);
        assertGeometry(point, screen);
        await this.command(serial, ['shell', 'input', 'tap', String(pixelCoordinate(point.x, screen.width)), String(pixelCoordinate(point.y, screen.height))], signal);
        return;
      }
      case AUTOMATION_NODE_TYPE.longPress: {
        const point = pointFrom(data, 'point');
        const durationMs = durationFrom(data);
        const screen = await this.screenshot(serial, signal);
        assertGeometry(point, screen);
        const x = String(pixelCoordinate(point.x, screen.width));
        const y = String(pixelCoordinate(point.y, screen.height));
        await this.command(serial, ['shell', 'input', 'swipe', x, y, x, y, String(durationMs)], signal);
        return;
      }
      case AUTOMATION_NODE_TYPE.swipe: {
        const start = pointFrom(data, 'start');
        const end = pointFrom(data, 'end');
        const durationMs = durationFrom(data);
        const screen = await this.screenshot(serial, signal);
        assertGeometry(start, screen);
        assertGeometry(end, screen);
        await this.command(serial, [
          'shell', 'input', 'swipe',
          String(pixelCoordinate(start.x, screen.width)), String(pixelCoordinate(start.y, screen.height)),
          String(pixelCoordinate(end.x, screen.width)), String(pixelCoordinate(end.y, screen.height)),
          String(durationMs),
        ], signal);
        return;
      }
      case AUTOMATION_NODE_TYPE.text:
        await this.command(serial, ['shell', 'input', 'text', normalizedText(data.text)], signal);
        return;
      case AUTOMATION_NODE_TYPE.key: {
        const key = data.key;
        if (typeof key !== 'string' || !(key in keyEvents)) {
          throw new DeviceAutomationError('unsupported_key', 'Select a supported Android key.');
        }
        await this.command(serial, ['shell', 'input', 'keyevent', keyEvents[key as AutomationKey]], signal);
        return;
      }
      case AUTOMATION_NODE_TYPE.start:
      case AUTOMATION_NODE_TYPE.end:
        return;
      case AUTOMATION_NODE_TYPE.wait:
      case AUTOMATION_NODE_TYPE.screenshot:
        throw new DeviceAutomationError('unsupported_action', `Action ${node.type} is handled by the automation runner.`);
    }
  }

  private async command(serial: string, args: string[], signal: AbortSignal): Promise<void> {
    const result = await this.execute('adb', ['-s', serial, ...args], { timeoutMs, signal });
    assertOk(result, 'Android action failed');
  }

  private assertSerial(serial: string): void {
    if (serial.trim() === '' || serial.length > 128 || /[\s\0]/.test(serial)) {
      throw new DeviceAutomationError('invalid_device_serial', 'Select a connected Android device.');
    }
  }
}
