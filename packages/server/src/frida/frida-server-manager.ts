import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetch } from 'undici';
import type { FridaServerStatus, ServerEvent } from '@frigg/shared';
import { run } from '../lib/exec.ts';

const fridaRemotePath = '/data/local/tmp/frida-server';

export class FridaServerManager extends EventEmitter {
  private serverStatus: FridaServerStatus = {
    installed: false,
    running: false,
    version: null,
    deviceId: null,
    error: null,
  };

  get status(): FridaServerStatus {
    return { ...this.serverStatus };
  }

  async hostFridaVersion(): Promise<string | null> {
    const result = await run('frida', ['--version']);
    if (!result.ok) return null;
    const version = result.stdout.trim();
    return version === '' ? null : version;
  }

  async refresh(deviceId: string): Promise<FridaServerStatus> {
    const installed = await this.isInstalled(deviceId);
    const running = installed ? await this.isRunning(deviceId) : false;
    return this.setStatus({ deviceId, installed, running, error: null });
  }

  async install(deviceId: string): Promise<FridaServerStatus> {
    const version = await this.hostFridaVersion();
    if (version === null) {
      return this.setStatus({
        deviceId,
        error: 'Frida is not installed on this machine. Install it with: pipx install frida-tools',
      });
    }
    const abiResult = await run('adb', ['-s', deviceId, 'shell', 'getprop', 'ro.product.cpu.abi']);
    if (!abiResult.ok) {
      return this.setStatus({ deviceId, error: `Could not read the device ABI: ${detail(abiResult)}` });
    }
    const fridaAbi = mapAbi(abiResult.stdout.trim());
    if (fridaAbi === null) {
      return this.setStatus({ deviceId, error: `Unsupported device ABI: ${abiResult.stdout.trim()}` });
    }

    let tempDir: string | null = null;
    try {
      tempDir = await mkdtemp(join(tmpdir(), 'frigg-frida-'));
      const xzPath = join(tempDir, 'frida-server.xz');
      const binPath = join(tempDir, 'frida-server');
      const url = `https://github.com/frida/frida/releases/download/${version}/frida-server-${version}-android-${fridaAbi}.xz`;

      const downloadError = await downloadFile(url, xzPath);
      if (downloadError !== null) {
        return this.setStatus({ deviceId, error: `Could not download frida-server ${version}: ${downloadError}` });
      }

      const unxz = await run('xz', ['-d', '-f', xzPath], { timeoutMs: 60000 });
      if (!unxz.ok) {
        return this.setStatus({
          deviceId,
          error: `Could not decompress frida-server (xz is required — ${xzInstallHint()}). ${detail(unxz)}`,
        });
      }

      const pushResult = await run('adb', ['-s', deviceId, 'push', binPath, fridaRemotePath], {
        timeoutMs: 120000,
      });
      if (!pushResult.ok) {
        return this.setStatus({ deviceId, error: `Could not push frida-server to the device: ${detail(pushResult)}` });
      }

      const chmodResult = await run('adb', ['-s', deviceId, 'shell', 'chmod', '755', fridaRemotePath]);
      if (!chmodResult.ok) {
        return this.setStatus({ deviceId, error: `Could not make frida-server executable: ${detail(chmodResult)}` });
      }

      return this.setStatus({ deviceId, installed: true, version, error: null });
    } catch (error) {
      return this.setStatus({ deviceId, error: `frida-server install failed: ${describeError(error)}` });
    } finally {
      if (tempDir !== null) {
        await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
      }
    }
  }

  async start(deviceId: string): Promise<FridaServerStatus> {
    if (!(await this.isInstalled(deviceId))) {
      return this.setStatus({
        deviceId,
        installed: false,
        running: false,
        error: 'frida-server is not installed on the device. Install it first.',
      });
    }
    if (await this.isRunning(deviceId)) {
      return this.setStatus({ deviceId, installed: true, running: true, error: null });
    }
    const rootResult = await run('adb', ['-s', deviceId, 'root']);
    if (!rootResult.ok || /cannot run as root/i.test(rootResult.stdout + rootResult.stderr)) {
      return this.setStatus({
        deviceId,
        installed: true,
        running: false,
        error:
          'adb root is not available on this device. frida-server needs root — use a google_apis emulator image (not Google Play).',
      });
    }
    await run('adb', ['-s', deviceId, 'wait-for-device']);
    await run('adb', ['-s', deviceId, 'shell', 'setenforce', '0']);
    await run('adb', [
      '-s',
      deviceId,
      'shell',
      `setsid ${fridaRemotePath} >/dev/null 2>&1 </dev/null &`,
    ]);

    if (!(await this.waitForRunning(deviceId))) {
      return this.setStatus({
        deviceId,
        installed: true,
        running: false,
        error: 'frida-server did not start. Check that the device is rooted and SELinux is permissive.',
      });
    }
    return this.setStatus({ deviceId, installed: true, running: true, error: null });
  }

  async stop(deviceId?: string): Promise<FridaServerStatus> {
    const id = deviceId ?? this.serverStatus.deviceId;
    if (id === null) return this.status;
    await run('adb', ['-s', id, 'shell', 'pkill', '-f', 'frida-server']);
    return this.setStatus({ deviceId: id, running: false, error: null });
  }

  async dispose(): Promise<void> {
    const id = this.serverStatus.deviceId;
    if (id !== null) {
      await run('adb', ['-s', id, 'shell', 'pkill', '-f', 'frida-server']).catch(() => undefined);
    }
  }

  private setStatus(patch: Partial<FridaServerStatus>): FridaServerStatus {
    this.serverStatus = { ...this.serverStatus, ...patch };
    this.emit('event', { type: 'frida-server-status', status: this.status } satisfies ServerEvent);
    return this.status;
  }

  private async isInstalled(deviceId: string): Promise<boolean> {
    const result = await run('adb', ['-s', deviceId, 'shell', 'ls', fridaRemotePath]);
    return result.ok && !/no such file/i.test(result.stdout + result.stderr);
  }

  private async isRunning(deviceId: string): Promise<boolean> {
    const result = await run('adb', ['-s', deviceId, 'shell', 'pidof', 'frida-server']);
    return result.ok && result.stdout.trim() !== '';
  }

  private async waitForRunning(deviceId: string): Promise<boolean> {
    for (let attempt = 0; attempt < 10; attempt++) {
      if (await this.isRunning(deviceId)) return true;
      await delay(300);
    }
    return false;
  }
}

export function mapAbi(abi: string): string | null {
  if (abi.startsWith('arm64')) return 'arm64';
  if (abi.startsWith('armeabi')) return 'arm';
  if (abi === 'x86_64') return 'x86_64';
  if (abi.startsWith('x86')) return 'x86';
  return null;
}

async function downloadFile(url: string, dest: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(120000) });
    if (!res.ok) return `HTTP ${res.status}`;
    if ((res.headers.get('content-type') ?? '').includes('text/html')) {
      return 'unexpected HTML response (the download was redirected or blocked)';
    }
    await writeFile(dest, Buffer.from(await res.arrayBuffer()));
    return null;
  } catch (error) {
    return describeError(error);
  }
}

function detail(result: { stdout: string; stderr: string; code: number | null }): string {
  const text = result.stderr.trim() || result.stdout.trim();
  if (text !== '') return text;
  return result.code === null ? 'command timed out or could not start' : `exit code ${result.code}`;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function xzInstallHint(): string {
  if (process.platform === 'win32') {
    return 'install xz, e.g. "winget install xz", "scoop install xz" or "choco install xz"';
  }
  if (process.platform === 'darwin') return 'install it with: brew install xz';
  return 'install it with your package manager, e.g. "apt install xz-utils"';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
