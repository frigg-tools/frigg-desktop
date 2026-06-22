import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AndroidCertMode, AndroidDevice, AndroidSetupResult } from '@frigg/shared';
import { st, type ServerLocale } from '../i18n.ts';
import { run, type ExecResult } from '../lib/exec.ts';
import { androidCertName, type CaMaterial } from '../proxy/ca.ts';

const systemCertDir = '/system/etc/security/cacerts';
const downloadCertPath = '/sdcard/Download/frigg-ca.crt';

export async function adbStatus(): Promise<{ available: boolean; version?: string }> {
  const result = await run('adb', ['version']);
  if (!result.ok) return { available: false };
  const firstLine = result.stdout.split('\n')[0]?.trim();
  return firstLine ? { available: true, version: firstLine } : { available: true };
}

async function readAvdName(serial: string): Promise<string | undefined> {
  const result = await run('adb', ['-s', serial, 'emu', 'avd', 'name']);
  if (!result.ok) return undefined;
  const name = result.stdout.split('\n')[0]?.trim();
  return name !== undefined && name !== '' && name !== 'OK' ? name : undefined;
}

export async function listAndroidDevices(): Promise<AndroidDevice[]> {
  const result = await run('adb', ['devices', '-l']);
  if (!result.ok) return [];
  const parsed = result.stdout
    .split('\n')
    .filter((line) => line.trim() !== '' && !line.startsWith('List of devices') && !line.startsWith('*'))
    .map(parseDeviceLine)
    .filter((device): device is Omit<AndroidDevice, 'proxyConfigured'> => device !== null);
  return Promise.all(
    parsed.map(async (device) => ({
      ...device,
      proxyConfigured: await readProxyConfigured(device.serial),
      avdName: device.isEmulator ? await readAvdName(device.serial) : undefined,
    })),
  );
}

export async function setupAndroid(
  serial: string,
  opts: { proxyPort: number; apiPort: number; lanIp: string | null; ca: CaMaterial; locale: ServerLocale },
): Promise<AndroidSetupResult> {
  const { locale } = opts;
  const messages: string[] = [];
  const isEmulator = serial.startsWith('emulator-');
  const proxyHost = isEmulator ? '10.0.2.2' : opts.lanIp;
  let proxySet = false;
  if (proxyHost === null) {
    messages.push(st(locale, 'android.proxy.noLanIp', { proxyPort: opts.proxyPort }));
  } else {
    const proxyValue = `${proxyHost}:${opts.proxyPort}`;
    const result = await run('adb', ['-s', serial, 'shell', 'settings', 'put', 'global', 'http_proxy', proxyValue]);
    if (result.ok) {
      proxySet = true;
      messages.push(st(locale, 'android.proxy.set', { proxyValue }));
    } else {
      messages.push(st(locale, 'android.proxy.failed', { detail: commandFailure(result) }));
    }
  }
  const certMode = await installCa(serial, opts, proxyHost, messages, locale);
  return { proxySet, certMode, messages };
}

export async function teardownAndroid(serial: string, _locale: ServerLocale): Promise<void> {
  await run('adb', ['-s', serial, 'shell', 'settings', 'put', 'global', 'http_proxy', ':0']);
}

function parseDeviceLine(line: string): Omit<AndroidDevice, 'proxyConfigured'> | null {
  const tokens = line.trim().split(/\s+/);
  const serial = tokens[0];
  const stateToken = tokens[1];
  if (!serial || !stateToken) return null;
  const modelToken = tokens.find((token) => token.startsWith('model:'));
  return {
    serial,
    model: modelToken ? modelToken.slice('model:'.length).replace(/_/g, ' ') : 'unknown',
    state: parseDeviceState(stateToken),
    isEmulator: serial.startsWith('emulator-'),
  };
}

function parseDeviceState(token: string): AndroidDevice['state'] {
  return token === 'device' || token === 'offline' || token === 'unauthorized' ? token : 'unknown';
}

async function readProxyConfigured(serial: string): Promise<boolean> {
  const result = await run('adb', ['-s', serial, 'shell', 'settings', 'get', 'global', 'http_proxy']);
  if (!result.ok) return false;
  const value = result.stdout.trim();
  return value !== '' && value !== 'null' && value !== ':0';
}

async function installCa(
  serial: string,
  opts: { apiPort: number; ca: CaMaterial },
  proxyHost: string | null,
  messages: string[],
  locale: ServerLocale,
): Promise<AndroidCertMode> {
  let tempDir: string | null = null;
  try {
    tempDir = await mkdtemp(join(tmpdir(), 'frigg-ca-'));
    const localCertPath = join(tempDir, 'frigg-ca.crt');
    await writeFile(localCertPath, opts.ca.cert, 'utf8');
    const systemInstalled = await tryInstallSystemCert(serial, opts.ca.cert, localCertPath, messages, locale);
    if (systemInstalled) return 'system';
    return await fallbackToUserCert(serial, localCertPath, proxyHost, opts.apiPort, messages, locale);
  } catch (error) {
    messages.push(st(locale, 'android.cert.installFailed', { detail: describeError(error) }));
    return 'none';
  } finally {
    if (tempDir !== null) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

async function tryInstallSystemCert(
  serial: string,
  certPem: string,
  localCertPath: string,
  messages: string[],
  locale: ServerLocale,
): Promise<boolean> {
  const rootResult = await run('adb', ['-s', serial, 'root']);
  if (!rootResult.ok || /cannot run as root/i.test(rootResult.stdout + rootResult.stderr)) {
    messages.push(st(locale, 'android.cert.systemNoRoot'));
    return false;
  }
  const waitResult = await run('adb', ['-s', serial, 'wait-for-device']);
  if (!waitResult.ok) {
    messages.push(st(locale, 'android.cert.systemNoDevice'));
    return false;
  }
  const remountResult = await run('adb', ['-s', serial, 'remount']);
  if (!remountResult.ok || /remount failed/i.test(remountResult.stdout + remountResult.stderr)) {
    messages.push(st(locale, 'android.cert.systemNoRemount'));
    return false;
  }
  let certName: string;
  try {
    certName = await androidCertName(certPem);
  } catch (error) {
    messages.push(st(locale, 'android.cert.systemNoName', { detail: describeError(error) }));
    return false;
  }
  const remoteCertPath = `${systemCertDir}/${certName}`;
  const pushResult = await run('adb', ['-s', serial, 'push', localCertPath, remoteCertPath]);
  if (!pushResult.ok) {
    messages.push(st(locale, 'android.cert.systemPushFailed', { path: remoteCertPath, detail: commandFailure(pushResult) }));
    return false;
  }
  const chmodResult = await run('adb', ['-s', serial, 'shell', 'chmod', '644', remoteCertPath]);
  if (!chmodResult.ok) {
    messages.push(st(locale, 'android.cert.systemChmodFailed', { path: remoteCertPath, detail: commandFailure(chmodResult) }));
    return false;
  }
  messages.push(st(locale, 'android.cert.systemInstalled', { path: remoteCertPath }));
  return true;
}

async function fallbackToUserCert(
  serial: string,
  localCertPath: string,
  proxyHost: string | null,
  apiPort: number,
  messages: string[],
  locale: ServerLocale,
): Promise<AndroidCertMode> {
  const pushResult = await run('adb', ['-s', serial, 'push', localCertPath, downloadCertPath]);
  if (!pushResult.ok) {
    messages.push(st(locale, 'android.cert.userPushFailed', { path: downloadCertPath, detail: commandFailure(pushResult) }));
    if (proxyHost !== null) {
      messages.push(st(locale, 'android.cert.userDownloadHint', { host: proxyHost, apiPort }));
    }
    return 'none';
  }
  messages.push(st(locale, 'android.cert.userCopied', { path: downloadCertPath }));
  const settingsResult = await run('adb', ['-s', serial, 'shell', 'am', 'start', '-a', 'android.settings.SECURITY_SETTINGS']);
  if (!settingsResult.ok) {
    messages.push(st(locale, 'android.cert.userSettingsFailed'));
  }
  messages.push(st(locale, 'android.cert.userInstallSteps'));
  messages.push(st(locale, 'android.cert.userCoverage'));
  messages.push(st(locale, 'android.cert.userAppGuidance'));
  return 'user-manual';
}

function commandFailure(result: ExecResult): string {
  const detail = result.stderr.trim() || result.stdout.trim();
  if (detail !== '') return detail;
  return result.code === null ? 'command timed out or could not start' : `exit code ${result.code}`;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
