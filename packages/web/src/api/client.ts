import type {
  AndroidSetupResult,
  ApiClientCert,
  ApiClientSnapshot,
  ApiEnvironment,
  ApiFolder,
  ApiRequest,
  ApiRunResult,
  ApiWorkspace,
  BreakpointResume,
  BreakpointRuleInput,
  BreakpointsSnapshot,
  DbFile,
  DbQueryResult,
  DeviceApp,
  DevicesSnapshot,
  LogPlatform,
  LogSessionStatus,
  McpServerInfo,
  MockFolder,
  MockRule,
  MockRuleInput,
  MocksSnapshot,
  ProxyCertsSnapshot,
  ProxyClientCert,
  ProxyStatus,
  SqlConnection,
  SqlConnectionInput,
  SqlConnectionTestResult,
  SqlQueryResult,
  SqlRowEdit,
  SqlSchema,
  TrafficExchange,
} from '@frigg/shared';

interface CreatedWithSnapshot {
  snapshot: ApiClientSnapshot;
  id: string;
}

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

export function getApiClient(): Promise<ApiClientSnapshot> {
  return request('/api/client');
}

export function createWorkspace(name: string): Promise<CreatedWithSnapshot> {
  return request('/api/client/workspaces', jsonInit('POST', { name }));
}

export function updateWorkspace(
  id: string,
  patch: Partial<Pick<ApiWorkspace, 'name' | 'activeEnvironmentId' | 'variables'>> & {
    clientCerts?: ApiClientCert[];
  },
): Promise<ApiClientSnapshot> {
  return request(`/api/client/workspaces/${encodeURIComponent(id)}`, jsonInit('PUT', patch));
}

export function deleteWorkspace(id: string): Promise<ApiClientSnapshot> {
  return request(`/api/client/workspaces/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function createApiFolder(
  workspaceId: string,
  name: string,
  parentId: string | null,
): Promise<CreatedWithSnapshot> {
  return request('/api/client/folders', jsonInit('POST', { workspaceId, name, parentId }));
}

export function updateApiFolder(
  id: string,
  patch: { name?: string; parentId?: string | null },
): Promise<ApiClientSnapshot> {
  return request(`/api/client/folders/${encodeURIComponent(id)}`, jsonInit('PUT', patch));
}

export function deleteApiFolder(id: string): Promise<ApiClientSnapshot> {
  return request(`/api/client/folders/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function createApiRequest(
  workspaceId: string,
  folderId: string | null,
): Promise<CreatedWithSnapshot> {
  return request('/api/client/requests', jsonInit('POST', { workspaceId, folderId }));
}

export function updateApiRequest(id: string, patch: Partial<ApiRequest>): Promise<ApiClientSnapshot> {
  return request(`/api/client/requests/${encodeURIComponent(id)}`, jsonInit('PUT', patch));
}

export function deleteApiRequest(id: string): Promise<ApiClientSnapshot> {
  return request(`/api/client/requests/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function createEnvironment(workspaceId: string, name: string): Promise<CreatedWithSnapshot> {
  return request('/api/client/environments', jsonInit('POST', { workspaceId, name }));
}

export function updateEnvironment(
  id: string,
  patch: Partial<Pick<ApiEnvironment, 'name' | 'variables'>>,
): Promise<ApiClientSnapshot> {
  return request(`/api/client/environments/${encodeURIComponent(id)}`, jsonInit('PUT', patch));
}

export function deleteEnvironment(id: string): Promise<ApiClientSnapshot> {
  return request(`/api/client/environments/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function runApiRequest(apiRequest: ApiRequest): Promise<ApiRunResult> {
  return request('/api/client/run', jsonInit('POST', { request: apiRequest }));
}

export function getMcpInfo(): Promise<McpServerInfo> {
  return request('/api/mcp/info');
}

export function getBreakpoints(): Promise<BreakpointsSnapshot> {
  return request('/api/breakpoints');
}

export function setBreakpointsEnabled(enabled: boolean): Promise<BreakpointsSnapshot> {
  return request('/api/breakpoints/enabled', jsonInit('POST', { enabled }));
}

export function createBreakpointRule(
  input: BreakpointRuleInput,
): Promise<{ snapshot: BreakpointsSnapshot; id: string }> {
  return request('/api/breakpoints/rules', jsonInit('POST', input));
}

export function updateBreakpointRule(
  id: string,
  patch: Partial<BreakpointRuleInput>,
): Promise<BreakpointsSnapshot> {
  return request(`/api/breakpoints/rules/${encodeURIComponent(id)}`, jsonInit('PUT', patch));
}

export function deleteBreakpointRule(id: string): Promise<BreakpointsSnapshot> {
  return request(`/api/breakpoints/rules/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function resumeBreakpoint(id: string, resume: BreakpointResume): Promise<{ ok: true }> {
  return request(`/api/breakpoints/${encodeURIComponent(id)}/resume`, jsonInit('POST', resume));
}

export function installMcpClaudeCode(): Promise<{ ok: boolean; message: string }> {
  return request('/api/mcp/install/claude-code', { method: 'POST' });
}

export function getProxyCerts(): Promise<ProxyCertsSnapshot> {
  return request('/api/proxy-certs');
}

export function setProxyCerts(certs: ProxyClientCert[]): Promise<ProxyCertsSnapshot> {
  return request('/api/proxy-certs', jsonInit('PUT', { certs }));
}

export function getSqlConnections(): Promise<SqlConnection[]> {
  return request('/api/sql/connections');
}

export function createSqlConnection(
  input: SqlConnectionInput,
): Promise<{ connections: SqlConnection[]; id: string }> {
  return request('/api/sql/connections', jsonInit('POST', input));
}

export function updateSqlConnection(
  id: string,
  patch: Partial<SqlConnectionInput>,
): Promise<{ connections: SqlConnection[] }> {
  return request(`/api/sql/connections/${encodeURIComponent(id)}`, jsonInit('PUT', patch));
}

export function deleteSqlConnection(id: string): Promise<{ connections: SqlConnection[] }> {
  return request(`/api/sql/connections/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function testSqlConnection(
  body: SqlConnectionInput | { id: string },
): Promise<SqlConnectionTestResult> {
  return request('/api/sql/test', jsonInit('POST', body));
}

export function sqlSchema(id: string): Promise<SqlSchema> {
  return request(`/api/sql/connections/${encodeURIComponent(id)}/schema`, { method: 'POST' });
}

export async function runSql(
  id: string,
  sql: string,
  confirmDestructive?: boolean,
): Promise<SqlQueryResult> {
  const headers = new Headers({ 'content-type': 'application/json' });
  headers.set('X-Frigg-Locale', currentLocale());
  const res = await fetch(`/api/sql/connections/${encodeURIComponent(id)}/query`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ sql, confirmDestructive }),
  });
  if (res.status === 400) {
    const data = (await res.json().catch(() => ({}))) as {
      confirmRequired?: boolean;
      error?: unknown;
    };
    if (data.confirmRequired === true) {
      throw new Error('destructive');
    }
    if (typeof data.error === 'string' && data.error.length > 0) {
      throw new Error(data.error);
    }
    throw new Error(`${res.status} ${res.statusText}`.trim());
  }
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return (await res.json()) as SqlQueryResult;
}

export function editSqlRow(id: string, edit: SqlRowEdit): Promise<SqlQueryResult> {
  return request(`/api/sql/connections/${encodeURIComponent(id)}/edit`, jsonInit('POST', edit));
}

export async function disconnectSql(id: string): Promise<void> {
  await request(`/api/sql/connections/${encodeURIComponent(id)}/disconnect`, { method: 'POST' });
}
