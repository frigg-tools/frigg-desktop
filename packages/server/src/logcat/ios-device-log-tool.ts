import { execFile } from 'node:child_process';
import type { DeviceApp } from '@frigg/shared';

export type IosDeviceLogErrorCode =
  | 'unlock-required'
  | 'pairing-required'
  | 'disconnected'
  | 'helper-missing'
  | 'stream-failed';

export interface IosDeviceLogCommand {
  command: string;
  args: string[];
}

const PAIRING_LOCKDOWN_CODES = new Set(['-4', '-18', '-19', '-20', '-21', '-29', '-30', '-31', '-36']);

export function isIosSimulatorUdid(id: string): boolean {
  return /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/.test(id);
}

export function iosDeviceLogError(code: IosDeviceLogErrorCode, detail?: string): string {
  const safeDetail = detail?.replace(/[\r\n]+/g, ' ').trim();
  return `ios-device:${code}${safeDetail ? `|${safeDetail}` : ''}`;
}

export function classifyIosDeviceLogError(detail: string): IosDeviceLogErrorCode | null {
  const normalized = detail.toLowerCase();
  if (/passcode protected|password protected|enter passcode|unlock (?:the )?device|device is locked/.test(normalized)) {
    return 'unlock-required';
  }
  if (/not paired|pair record|pairing|trust this computer|not trusted/.test(normalized)) {
    return 'pairing-required';
  }
  const lockdownCode = /could not connect to lockdownd:\s*(-?\d+)/.exec(normalized)?.[1];
  if (lockdownCode !== undefined && PAIRING_LOCKDOWN_CODES.has(lockdownCode)) {
    return 'pairing-required';
  }
  if (
    /waiting for device|device .* not found|no device found|device disconnected|could not connect to lockdownd/.test(
      normalized,
    )
  ) {
    return 'disconnected';
  }
  return null;
}

export class IosDeviceLogTool {
  constructor(readonly executablePath = 'idevicesyslog') {}

  streamCommand(udid: string, processName: string | null): IosDeviceLogCommand {
    const args = ['--udid', udid, '--no-colors', '--exit'];
    if (processName !== null) args.push('--process', processName);
    return { command: this.executablePath, args };
  }

  async listProcesses(udid: string): Promise<DeviceApp[]> {
    const output = await new Promise<string>((resolve, reject) => {
      execFile(
        this.executablePath,
        ['--udid', udid, 'pidlist'],
        { encoding: 'utf8', timeout: 10_000, windowsHide: true },
        (error, stdout, stderr) => {
          if (error !== null) {
            const detail = stderr.trim() || error.message;
            reject(new Error(detail));
            return;
          }
          resolve(stdout);
        },
      );
    });

    const byName = new Map<string, DeviceApp>();
    for (const line of output.split(/\r?\n/)) {
      const match = /^\s*\d+\s+(.+?)\s*$/.exec(line);
      const name = match?.[1]?.trim();
      if (!name || byName.has(name)) continue;
      byName.set(name, { id: name, label: name, system: false });
    }
    return [...byName.values()].sort((a, b) => a.id.localeCompare(b.id));
  }
}
