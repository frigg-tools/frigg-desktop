import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Avd, AvdCreateResult } from '@frigg/shared';
import { run } from '../lib/exec.ts';

const isWindows = process.platform === 'win32';

export function defaultAndroidSdkRoot(platform: NodeJS.Platform, home: string): string {
  if (platform === 'win32') return join(home, 'AppData', 'Local', 'Android', 'Sdk');
  if (platform === 'darwin') return join(home, 'Library', 'Android', 'sdk');
  return join(home, 'Android', 'Sdk');
}

function androidSdkRoot(): string {
  if (process.env.ANDROID_HOME) return process.env.ANDROID_HOME;
  if (process.env.ANDROID_SDK_ROOT) return process.env.ANDROID_SDK_ROOT;
  return defaultAndroidSdkRoot(process.platform, homedir());
}

function sdkTool(relativePath: string, bareName: string, windowsExtension: string): string {
  const fileName = isWindows ? `${relativePath}${windowsExtension}` : relativePath;
  const absolute = join(androidSdkRoot(), fileName);
  if (existsSync(absolute)) return absolute;
  return isWindows ? `${bareName}${windowsExtension}` : bareName;
}

const emulatorBin = (): string => sdkTool('emulator/emulator', 'emulator', '.exe');
const avdmanagerBin = (): string =>
  sdkTool('cmdline-tools/latest/bin/avdmanager', 'avdmanager', '.bat');

function hostAbi(): string {
  return process.arch === 'arm64' ? 'arm64-v8a' : 'x86_64';
}

export function parseAvdList(stdout: string): string[] {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[A-Za-z0-9._-]+$/.test(line));
}

export async function listAvds(): Promise<Avd[]> {
  const result = await run(emulatorBin(), ['-list-avds']);
  if (!result.ok) return [];
  const names = parseAvdList(result.stdout);
  const running = await runningEmulators();
  return names.map((name) => ({
    name,
    booted: running.has(name),
    serial: running.get(name) ?? null,
  }));
}

export function bootAvd(name: string): { ok: boolean; message: string } {
  try {
    const child = spawn(emulatorBin(), ['-avd', name], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
    return { ok: true, message: `Booting ${name}.` };
  } catch (error) {
    return { ok: false, message: `Could not start the emulator: ${describeError(error)}` };
  }
}

export async function createRootedAvd(name: string, apiLevel: number): Promise<AvdCreateResult> {
  const image = `system-images;android-${apiLevel};google_apis;${hostAbi()}`;
  const result = await avdmanagerCreate([
    'create',
    'avd',
    '--name',
    name,
    '--package',
    image,
    '--device',
    'pixel_6',
    '--force',
  ]);
  if (result.ok) {
    return { ok: true, message: `Created ${name} (${image}).` };
  }
  if (/not a valid|not available|Package path is not valid/i.test(result.output)) {
    return {
      ok: false,
      message: `System image "${image}" is not installed. Install it in Android Studio's SDK Manager (or run: sdkmanager "${image}"), then try again.`,
    };
  }
  return { ok: false, message: result.output.trim() || `Could not create ${name}.` };
}

async function runningEmulators(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const result = await run('adb', ['devices']);
  if (!result.ok) return map;
  const serials = result.stdout
    .split('\n')
    .map((line) => line.split(/\s+/)[0])
    .filter((serial): serial is string => serial !== undefined && serial.startsWith('emulator-'));
  for (const serial of serials) {
    const nameResult = await run('adb', ['-s', serial, 'emu', 'avd', 'name']);
    if (!nameResult.ok) continue;
    const name = nameResult.stdout.split('\n')[0]?.trim();
    if (name) map.set(name, serial);
  }
  return map;
}

function quoteForCmd(value: string): string {
  if (value === '') return '""';
  return /[\s"&|<>()^;,]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function avdmanagerCreate(args: string[]): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    let child: ChildProcessWithoutNullStreams;
    let output = '';
    try {
      child = isWindows
        ? spawn([avdmanagerBin(), ...args].map(quoteForCmd).join(' '), {
            windowsHide: true,
            shell: true,
          })
        : spawn(avdmanagerBin(), args, { windowsHide: true });
    } catch (error) {
      resolve({ ok: false, output: describeError(error) });
      return;
    }
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      output += chunk;
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      output += chunk;
    });
    child.on('error', (error) => resolve({ ok: false, output: describeError(error) }));
    child.on('close', (code) => resolve({ ok: code === 0, output }));
    child.stdin.write('no\n');
    child.stdin.end();
  });
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
