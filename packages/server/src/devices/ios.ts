import { randomUUID } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IosPhysicalDevice, IosSimulator } from '@frigg/shared';
import { st, type ServerLocale } from '../i18n.ts';
import { run } from '../lib/exec.ts';
import { caCertPath } from '../lib/paths.ts';

export async function xcrunStatus(): Promise<{ available: boolean }> {
  const result = await run('xcrun', ['--version']);
  return { available: result.ok };
}

export async function listPhysicalIosDevices(): Promise<IosPhysicalDevice[]> {
  const outputPath = join(tmpdir(), `frigg-devicectl-${randomUUID()}.json`);
  const result = await run('xcrun', ['devicectl', 'list', 'devices', '--json-output', outputPath]);
  if (!result.ok) {
    await rm(outputPath, { force: true });
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(outputPath, 'utf8'));
  } catch {
    return [];
  } finally {
    await rm(outputPath, { force: true });
  }
  const devices = (parsed as { result?: { devices?: unknown } })?.result?.devices;
  if (!Array.isArray(devices)) return [];
  const physical: IosPhysicalDevice[] = [];
  for (const entry of devices) {
    if (typeof entry !== 'object' || entry === null) continue;
    const hardware = (entry as { hardwareProperties?: Record<string, unknown> }).hardwareProperties ?? {};
    const props = (entry as { deviceProperties?: Record<string, unknown> }).deviceProperties ?? {};
    const connection = (entry as { connectionProperties?: Record<string, unknown> }).connectionProperties ?? {};
    const platform = hardware.platform;
    if (platform !== 'iOS' && platform !== 'iPadOS') continue;
    const udid = hardware.udid;
    if (typeof udid !== 'string') continue;
    physical.push({
      udid,
      name: typeof props.name === 'string' ? props.name : udid,
      model: typeof hardware.marketingName === 'string' ? hardware.marketingName : 'iOS device',
      osVersion: typeof props.osVersionNumber === 'string' ? props.osVersionNumber : '',
      paired: connection.pairingState === 'paired',
    });
  }
  return physical;
}

export async function listBootedSimulators(): Promise<IosSimulator[]> {
  const result = await run('xcrun', ['simctl', 'list', 'devices', 'booted', '-j']);
  if (!result.ok) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    return [];
  }
  if (typeof parsed !== 'object' || parsed === null) return [];
  const devices = (parsed as { devices?: unknown }).devices;
  if (typeof devices !== 'object' || devices === null) return [];
  const simulators: IosSimulator[] = [];
  for (const [runtimeKey, entries] of Object.entries(devices as Record<string, unknown>)) {
    if (!Array.isArray(entries)) continue;
    const runtime = prettifyRuntime(runtimeKey);
    for (const entry of entries) {
      if (typeof entry !== 'object' || entry === null) continue;
      const { udid, name, state } = entry as { udid?: unknown; name?: unknown; state?: unknown };
      if (typeof udid !== 'string' || typeof name !== 'string' || typeof state !== 'string') continue;
      simulators.push({ udid, name, runtime, state });
    }
  }
  return simulators;
}

export async function installSimCert(
  udid: string,
  locale: ServerLocale,
): Promise<{ ok: boolean; message: string }> {
  const result = await run('xcrun', ['simctl', 'keychain', udid, 'add-root-cert', caCertPath]);
  if (result.ok) {
    return { ok: true, message: st(locale, 'ios.cert.installed') };
  }
  const detail = result.stderr.trim() || result.stdout.trim();
  return {
    ok: false,
    message: detail ? st(locale, 'ios.cert.failed', { detail }) : st(locale, 'ios.cert.failedNoDetail'),
  };
}

function prettifyRuntime(runtimeKey: string): string {
  const identifier = runtimeKey.slice(runtimeKey.lastIndexOf('.') + 1);
  const [platform, ...versionParts] = identifier.split('-');
  if (!platform) return runtimeKey;
  return versionParts.length > 0 ? `${platform} ${versionParts.join('.')}` : platform;
}
