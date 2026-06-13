import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DeviceApp, LogPlatform } from '@frigg/shared';
import { run } from '../lib/exec.ts';

export async function listApps(platform: LogPlatform, id: string): Promise<DeviceApp[]> {
  if (platform === 'android') return listAndroidApps(id);
  return listIosApps(id);
}

async function listAndroidApps(serial: string): Promise<DeviceApp[]> {
  const [thirdParty, system] = await Promise.all([
    listAndroidPackages(serial, '-3'),
    listAndroidPackages(serial, '-s'),
  ]);
  const byId = new Map<string, DeviceApp>();
  for (const name of thirdParty) {
    byId.set(name, { id: name, label: name, system: false });
  }
  for (const name of system) {
    if (byId.has(name)) continue;
    byId.set(name, { id: name, label: name, system: true });
  }
  return sortApps([...byId.values()]);
}

async function listAndroidPackages(serial: string, filter: string): Promise<string[]> {
  const result = await run('adb', ['-s', serial, 'shell', 'pm', 'list', 'packages', filter]);
  if (!result.ok) return [];
  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('package:'))
    .map((line) => line.slice('package:'.length).trim())
    .filter((name) => name !== '');
}

async function listIosApps(udid: string): Promise<DeviceApp[]> {
  const listed = await run('xcrun', ['simctl', 'listapps', udid]);
  if (!listed.ok || listed.stdout.trim() === '') return [];
  let tempDir: string | null = null;
  try {
    tempDir = await mkdtemp(join(tmpdir(), 'frigg-apps-'));
    const plistPath = join(tempDir, 'apps.plist');
    await writeFile(plistPath, listed.stdout, 'utf8');
    const converted = await run('plutil', ['-convert', 'json', '-o', '-', plistPath]);
    if (!converted.ok) return [];
    return parseIosApps(converted.stdout);
  } catch {
    return [];
  } finally {
    if (tempDir !== null) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

function parseIosApps(json: string): DeviceApp[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return [];
  const apps: DeviceApp[] = [];
  for (const entry of Object.values(parsed as Record<string, unknown>)) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const id = stringField(record.CFBundleIdentifier);
    if (id === null) continue;
    const label =
      stringField(record.CFBundleDisplayName) ?? stringField(record.CFBundleName) ?? id;
    const system = record.ApplicationType === 'System';
    apps.push({ id, label, system });
  }
  return sortApps(apps);
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function sortApps(apps: DeviceApp[]): DeviceApp[] {
  return apps.sort((a, b) => {
    if (a.system !== b.system) return a.system ? 1 : -1;
    return a.id.localeCompare(b.id);
  });
}
