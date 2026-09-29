import { ANDROID_DEVICE_STATE, APK_STORE_INSTALL_TIMEOUT_MS } from '@frigg/shared';
import { listAndroidDevices } from '../devices/android.ts';
import { run } from '../lib/exec.ts';
import { ApkStore, ApkStoreError } from './store.ts';

export interface ApkInstallResult {
  serial: string;
  durationMs: number;
  message: string;
}

export function createApkInstaller(store: ApkStore) {
  const activeSerials = new Set<string>();

  return async function installApk(id: string, serial: string): Promise<ApkInstallResult> {
    if (!serial.trim()) throw new ApkStoreError('Choose one Android device serial.');
    const devices = await listAndroidDevices();
    const device = devices.find((candidate) => candidate.serial === serial);
    if (!device) throw new ApkStoreError('Android device not found. Refresh the device list and try again.', 404);
    if (device.state !== ANDROID_DEVICE_STATE.connected) {
      throw new ApkStoreError('This Android device is offline or has not authorized USB debugging.', 409);
    }
    if (activeSerials.has(serial)) {
      throw new ApkStoreError('An APK Store installation is already running on this device.', 409);
    }

    activeSerials.add(serial);
    let prepared: Awaited<ReturnType<ApkStore['materialize']>> | undefined;
    const startedAt = Date.now();
    try {
      prepared = await store.materialize(id);
      const result = await run('adb', ['-s', serial, 'install', '-r', '-t', prepared.path], {
        timeoutMs: APK_STORE_INSTALL_TIMEOUT_MS,
      });
      if (!result.ok) {
        const detail = (result.stderr || result.stdout).trim();
        if (result.code === null) {
          throw new ApkStoreError('ADB installation timed out or could not finish within five minutes.', 504);
        }
        throw new ApkStoreError(detail ? `ADB installation failed: ${detail}` : 'ADB installation failed.', 502);
      }
      return {
        serial,
        durationMs: Date.now() - startedAt,
        message: result.stdout.trim() || 'APK installed successfully.',
      };
    } finally {
      if (prepared) await prepared.cleanup().catch(() => undefined);
      activeSerials.delete(serial);
    }
  };
}
