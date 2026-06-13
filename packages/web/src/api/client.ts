import type {
  AndroidSetupResult,
  DbFile,
  DbQueryResult,
  DeviceApp,
  DevicesSnapshot,
  LogPlatform,
  LogSessionStatus,
  MockFolder,
  MockRule,
  MockRuleInput,
  MocksSnapshot,
  ProxyStatus,
  TrafficExchange,
} from '@frigg/shared';

async function readError(res: Response): Promise<string> {
  const fallback = `${res.status} ${res.statusText}`.trim();
  try {
    const data = (await res.json()) as { error?: unknown };
    if (typeof data.error === 'string' && data.error.length > 0) {
      return data.error;
    }
  } catch {
    return fallback;
  }
  return fallback;
}

function currentLocale(): string {
  try {
    const stored = localStorage.getItem('frigg-locale');
    if (stored === 'en' || stored === 'pt') return stored;
  } catch {
    return 'en';
  }
  return 'en';
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('X-Frigg-Locale', currentLocale());
  const res = await fetch(path, { ...init, headers });
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return (await res.json()) as T;
}

function jsonInit(method: 'POST' | 'PUT', payload: unknown): RequestInit {
  return {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  };
}

export function getStatus(): Promise<ProxyStatus> {
  return request('/api/status');
}

export function getTraffic(): Promise<TrafficExchange[]> {
  return request('/api/traffic');
}

export function clearTraffic(): Promise<{ ok: boolean }> {
  return request('/api/traffic', { method: 'DELETE' });
}

export function getMocks(): Promise<MocksSnapshot> {
  return request('/api/mocks');
}

export function createRule(input: MockRuleInput): Promise<MockRule> {
  return request('/api/mocks/rules', jsonInit('POST', input));
}

export function updateRule(id: string, patch: Partial<MockRuleInput>): Promise<MockRule> {
  return request(`/api/mocks/rules/${encodeURIComponent(id)}`, jsonInit('PUT', patch));
}

export function deleteRule(id: string): Promise<{ ok: boolean }> {
  return request(`/api/mocks/rules/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function createFolder(name: string, parentId: string | null): Promise<MockFolder> {
  return request('/api/mocks/folders', jsonInit('POST', { name, parentId }));
}

export function updateFolder(
  id: string,
  patch: { name?: string; parentId?: string | null },
): Promise<MockFolder> {
  return request(`/api/mocks/folders/${encodeURIComponent(id)}`, jsonInit('PUT', patch));
}

export function deleteFolder(id: string): Promise<{ ok: boolean }> {
  return request(`/api/mocks/folders/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function getDevices(): Promise<DevicesSnapshot> {
  return request('/api/devices');
}

export function setupAndroid(serial: string): Promise<AndroidSetupResult> {
  return request(`/api/devices/android/${encodeURIComponent(serial)}/setup`, { method: 'POST' });
}

export function teardownAndroid(serial: string): Promise<{ ok: boolean }> {
  return request(`/api/devices/android/${encodeURIComponent(serial)}/teardown`, {
    method: 'POST',
  });
}

export function installIosCert(udid: string): Promise<{ ok: boolean; message: string }> {
  return request(`/api/devices/ios/${encodeURIComponent(udid)}/install-cert`, { method: 'POST' });
}

export function setMacosProxy(enabled: boolean): Promise<{ ok: boolean; message: string }> {
  return request('/api/devices/macos-proxy', jsonInit('POST', { enabled }));
}

export interface StartLogsInput {
  platform: LogPlatform;
  id: string;
  label: string;
  packageFilter?: string;
}

export function startLogs(input: StartLogsInput): Promise<LogSessionStatus> {
  return request('/api/logs/start', jsonInit('POST', input));
}

export function stopLogs(): Promise<LogSessionStatus> {
  return request('/api/logs/stop', { method: 'POST' });
}

export function clearLogs(): Promise<{ ok: boolean }> {
  return request('/api/logs', { method: 'DELETE' });
}

export function getDeviceApps(platform: LogPlatform, id: string): Promise<DeviceApp[]> {
  return request(`/api/apps?platform=${platform}&id=${encodeURIComponent(id)}`);
}

export function getDbFiles(platform: LogPlatform, id: string, app: string): Promise<DbFile[]> {
  return request(
    `/api/db/files?platform=${platform}&id=${encodeURIComponent(id)}&app=${encodeURIComponent(app)}`,
  );
}

export function openDb(
  platform: LogPlatform,
  id: string,
  app: string,
  ref: string,
): Promise<{ tables: string[] }> {
  return request('/api/db/open', jsonInit('POST', { platform, id, app, ref }));
}

export function queryDb(
  platform: LogPlatform,
  id: string,
  app: string,
  ref: string,
  sql: string,
): Promise<DbQueryResult> {
  return request('/api/db/query', jsonInit('POST', { platform, id, app, ref, sql }));
}
