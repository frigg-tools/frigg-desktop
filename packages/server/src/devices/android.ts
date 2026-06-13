import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AndroidCertMode, AndroidDevice, AndroidSetupResult } from '@frigg/shared';
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
    })),
  );
}

export async function setupAndroid(
  serial: string,
  opts: { proxyPort: number; apiPort: number; lanIp: string | null; ca: CaMaterial },
): Promise<AndroidSetupResult> {
  const messages: string[] = [];
  const isEmulator = serial.startsWith('emulator-');
  const proxyHost = isEmulator ? '10.0.2.2' : opts.lanIp;
  let proxySet = false;
  if (proxyHost === null) {
    messages.push(
      `Could not detect this machine's LAN IP, so the device proxy was not configured. Connect both to the same network and set the device Wi-Fi proxy manually to <this-machine-ip>:${opts.proxyPort}.`,
    );
  } else {
    const proxyValue = `${proxyHost}:${opts.proxyPort}`;
    const result = await run('adb', ['-s', serial, 'shell', 'settings', 'put', 'global', 'http_proxy', proxyValue]);
    if (result.ok) {
      proxySet = true;
      messages.push(`Global HTTP proxy set to ${proxyValue}.`);
    } else {
      messages.push(`Failed to set the global HTTP proxy: ${commandFailure(result)}.`);
    }
  }
  const certMode = await installCa(serial, opts, proxyHost, messages);
  return { proxySet, certMode, messages };
}

export async function teardownAndroid(serial: string): Promise<void> {
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
): Promise<AndroidCertMode> {
  let tempDir: string | null = null;
  try {
    tempDir = await mkdtemp(join(tmpdir(), 'frigg-ca-'));
    const localCertPath = join(tempDir, 'frigg-ca.crt');
    await writeFile(localCertPath, opts.ca.cert, 'utf8');
    const systemInstalled = await tryInstallSystemCert(serial, opts.ca.cert, localCertPath, messages);
    if (systemInstalled) return 'system';
    return await fallbackToUserCert(serial, localCertPath, proxyHost, opts.apiPort, messages);
  } catch (error) {
    messages.push(`CA certificate install failed: ${describeError(error)}.`);
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
): Promise<boolean> {
  const rootResult = await run('adb', ['-s', serial, 'root']);
  if (!rootResult.ok || /cannot run as root/i.test(rootResult.stdout + rootResult.stderr)) {
    messages.push('adb root is not available on this device; falling back to manual user certificate install.');
    return false;
  }
  const waitResult = await run('adb', ['-s', serial, 'wait-for-device']);
  if (!waitResult.ok) {
    messages.push('Device did not come back after adb root; falling back to manual user certificate install.');
    return false;
  }
  const remountResult = await run('adb', ['-s', serial, 'remount']);
  if (!remountResult.ok || /remount failed/i.test(remountResult.stdout + remountResult.stderr)) {
    messages.push('Could not remount the system partition as writable; falling back to manual user certificate install.');
    return false;
  }
  let certName: string;
  try {
    certName = await androidCertName(certPem);
  } catch (error) {
    messages.push(
      `Could not compute the Android certificate name (${describeError(error)}); falling back to manual user certificate install.`,
    );
    return false;
  }
  const remoteCertPath = `${systemCertDir}/${certName}`;
  const pushResult = await run('adb', ['-s', serial, 'push', localCertPath, remoteCertPath]);
  if (!pushResult.ok) {
    messages.push(
      `Could not push the CA certificate to ${remoteCertPath}: ${commandFailure(pushResult)}; falling back to manual user certificate install.`,
    );
    return false;
  }
  const chmodResult = await run('adb', ['-s', serial, 'shell', 'chmod', '644', remoteCertPath]);
  if (!chmodResult.ok) {
    messages.push(
      `Could not set permissions on ${remoteCertPath}: ${commandFailure(chmodResult)}; falling back to manual user certificate install.`,
    );
    return false;
  }
  messages.push(`Frigg CA installed as a system certificate at ${remoteCertPath}.`);
  return true;
}

async function fallbackToUserCert(
  serial: string,
  localCertPath: string,
  proxyHost: string | null,
  apiPort: number,
  messages: string[],
): Promise<AndroidCertMode> {
  const pushResult = await run('adb', ['-s', serial, 'push', localCertPath, downloadCertPath]);
  if (!pushResult.ok) {
    messages.push(`Could not copy the CA certificate to ${downloadCertPath}: ${commandFailure(pushResult)}.`);
    if (proxyHost !== null) {
      messages.push(`Download it on the device instead from http://${proxyHost}:${apiPort}/cert.crt.`);
    }
    return 'none';
  }
  messages.push(`Frigg CA copied to ${downloadCertPath}.`);
  const settingsResult = await run('adb', ['-s', serial, 'shell', 'am', 'start', '-a', 'android.settings.SECURITY_SETTINGS']);
  if (!settingsResult.ok) {
    messages.push('Could not open the security settings screen automatically; open Settings on the device.');
  }
  messages.push(
    'On the device: Settings → Security → Encryption & credentials → Install a certificate → CA certificate → pick frigg-ca.crt from Downloads.',
  );
  messages.push(
    'Apps targeting API 24+ only trust user-installed CAs when their networkSecurityConfig allows it; debug builds should include that override.',
  );
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
