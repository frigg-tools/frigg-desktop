import { create } from 'zustand';
import {
  TRAFFIC_BUFFER_LIMIT,
  type ApiEnvironment,
  type ApiFolder,
  type ApiRequest,
  type ApiRunResult,
  type ApiWorkspace,
  type DbFile,
  type DbQueryResult,
  type DeviceApp,
  type DevicesSnapshot,
  type LogEntry,
  type LogLevel,
  type LogSessionStatus,
  type LogTarget,
  type MockFolder,
  type MockRule,
  type ProxyStatus,
  type ServerEvent,
  type TrafficExchange,
} from '@frigg/shared';
import * as api from './api/client';

export type Screen = 'traffic' | 'mocks' | 'devices' | 'logcat' | 'database' | 'client' | 'mcp';
export type LogLevelFilter = LogLevel | 'ALL';

const LOG_BUFFER_LIMIT = 5000;

export interface LogFilters {
  minLevel: LogLevelFilter;
  text: string;
}
export type Locale = 'en' | 'pt';

const LOCALE_STORAGE_KEY = 'frigg-locale';

function initialLocale(): Locale {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored === 'en' || stored === 'pt') return stored;
    if (navigator.language.toLowerCase().startsWith('pt')) return 'pt';
  } catch {
    return 'en';
  }
  return 'en';
}

export interface AppState {
  screen: Screen;
  setScreen: (s: Screen) => void;
  locale: Locale;
  setLocale: (locale: Locale) => void;
  status: ProxyStatus | null;
  wsConnected: boolean;
  exchanges: TrafficExchange[];
  selectedExchangeId: string | null;
  selectExchange: (id: string | null) => void;
  folders: MockFolder[];
  rules: MockRule[];
  selectedFolderId: string | null;
  selectFolder: (id: string | null) => void;
  editingRule: MockRule | 'new' | null;
  draftFromExchange: TrafficExchange | null;
  openRuleEditor: (rule: MockRule | 'new') => void;
  closeRuleEditor: () => void;
  createMockFromExchange: (ex: TrafficExchange) => void;
  devices: DevicesSnapshot | null;
  logEntries: LogEntry[];
  logStatus: LogSessionStatus;
  logTarget: LogTarget | null;
  logPackage: string;
  logApps: DeviceApp[];
  logFilters: LogFilters;
  setLogTarget: (target: LogTarget | null) => void;
  setLogPackage: (value: string) => void;
  setLogFilters: (patch: Partial<LogFilters>) => void;
  loadLogApps: () => Promise<void>;
  startLogs: () => Promise<void>;
  stopLogs: () => Promise<void>;
  clearLogs: () => Promise<void>;
  dbTarget: LogTarget | null;
  dbApps: DeviceApp[];
  dbApp: string | null;
  dbFiles: DbFile[];
  dbFileRef: string | null;
  dbTables: string[];
  dbTable: string | null;
  dbSql: string;
  dbResult: DbQueryResult | null;
  dbBusy: boolean;
  dbError: string | null;
  setDbTarget: (target: LogTarget | null) => void;
  loadDbApps: () => Promise<void>;
  setDbApp: (app: string | null) => void;
  loadDbFiles: () => Promise<void>;
  openDbFile: (ref: string) => Promise<void>;
  selectDbTable: (table: string) => Promise<void>;
  setDbSql: (sql: string) => void;
  runDbQuery: (sql: string) => Promise<void>;
  apiWorkspaces: ApiWorkspace[];
  apiFolders: ApiFolder[];
  apiRequests: ApiRequest[];
  apiEnvironments: ApiEnvironment[];
  activeWorkspaceId: string | null;
  selectedApiRequestId: string | null;
  apiRunResult: ApiRunResult | null;
  apiRunning: boolean;
  loadApiClient: () => Promise<void>;
  setActiveWorkspace: (id: string) => void;
  createWorkspace: (name: string) => Promise<void>;
  renameWorkspace: (id: string, name: string) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;
  createApiFolder: (name: string, parentId: string | null) => Promise<void>;
  renameApiFolder: (id: string, name: string) => Promise<void>;
  deleteApiFolder: (id: string) => Promise<void>;
  createApiRequest: (folderId: string | null) => Promise<void>;
  updateApiRequest: (id: string, patch: Partial<ApiRequest>) => Promise<void>;
  deleteApiRequest: (id: string) => Promise<void>;
  selectApiRequest: (id: string | null) => void;
  createEnvironment: (name: string) => Promise<void>;
  updateEnvironment: (id: string, patch: Partial<ApiEnvironment>) => Promise<void>;
  deleteEnvironment: (id: string) => Promise<void>;
  setActiveEnvironment: (envId: string | null) => Promise<void>;
  runApiRequest: (request: ApiRequest) => Promise<void>;
  loadAll: () => Promise<void>;
  refreshMocks: () => Promise<void>;
  refreshDevices: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  clearTraffic: () => Promise<void>;
  applyEvent: (ev: ServerEvent) => void;
}

function applyApiSnapshot(snapshot: {
  workspaces: ApiWorkspace[];
  folders: ApiFolder[];
  requests: ApiRequest[];
  environments: ApiEnvironment[];
}) {
  return {
    apiWorkspaces: snapshot.workspaces,
    apiFolders: snapshot.folders,
    apiRequests: snapshot.requests,
    apiEnvironments: snapshot.environments,
  };
}

function appendLogs(entries: LogEntry[], incoming: LogEntry[]): LogEntry[] {
  const next = entries.concat(incoming);
  return next.length > LOG_BUFFER_LIMIT ? next.slice(next.length - LOG_BUFFER_LIMIT) : next;
}

const LOG_FLUSH_INTERVAL_MS = 120;
let pendingLogEntries: LogEntry[] = [];
let logFlushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleLogFlush(flush: () => void): void {
  if (logFlushTimer) return;
  logFlushTimer = setTimeout(() => {
    logFlushTimer = null;
    flush();
  }, LOG_FLUSH_INTERVAL_MS);
}

function resetPendingLogs(): void {
  pendingLogEntries = [];
  if (logFlushTimer) {
    clearTimeout(logFlushTimer);
    logFlushTimer = null;
  }
}

function reconcileLogTarget(
  target: LogTarget | null,
  devices: DevicesSnapshot | null,
  streaming: boolean,
): LogTarget | null {
  if (!target || streaming) return target;
  if (target.platform === 'android') {
    return devices?.android.some((device) => device.serial === target.id) ? target : null;
  }
  return devices?.iosSimulators.some((sim) => sim.udid === target.id) ? target : null;
}

function upsertExchange(
  exchanges: TrafficExchange[],
  exchange: TrafficExchange,
): TrafficExchange[] {
  const index = exchanges.findIndex((e) => e.id === exchange.id);
  if (index === -1) {
    const appended = [...exchanges, exchange];
    return appended.length > TRAFFIC_BUFFER_LIMIT
      ? appended.slice(appended.length - TRAFFIC_BUFFER_LIMIT)
      : appended;
  }
  const replaced = exchanges.slice();
  replaced[index] = exchange;
  return replaced;
}

export const useAppStore = create<AppState>((set, get) => ({
  screen: 'traffic',
  setScreen: (s) => set({ screen: s }),
  locale: initialLocale(),
  setLocale: (locale) => {
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      void 0;
    }
    set({ locale });
  },
  status: null,
  wsConnected: false,
  exchanges: [],
  selectedExchangeId: null,
  selectExchange: (id) => set({ selectedExchangeId: id }),
  folders: [],
  rules: [],
  selectedFolderId: null,
  selectFolder: (id) => set({ selectedFolderId: id }),
  editingRule: null,
  draftFromExchange: null,
  openRuleEditor: (rule) => set({ editingRule: rule, draftFromExchange: null }),
  closeRuleEditor: () => set({ editingRule: null, draftFromExchange: null }),
  createMockFromExchange: (ex) =>
    set({ screen: 'mocks', editingRule: 'new', draftFromExchange: ex }),
  devices: null,
  logEntries: [],
  logStatus: { streaming: false, target: null, packageFilter: null, error: null },
  logTarget: null,
  logPackage: '',
  logApps: [],
  logFilters: { minLevel: 'ALL', text: '' },
  setLogTarget: (target) => {
    set({ logTarget: target, logPackage: '', logApps: [] });
    if (target) void get().loadLogApps();
  },
  setLogPackage: (value) => set({ logPackage: value }),
  setLogFilters: (patch) => set({ logFilters: { ...get().logFilters, ...patch } }),
  loadLogApps: async () => {
    const target = get().logTarget;
    if (!target) return;
    try {
      const apps = await api.getDeviceApps(target.platform, target.id);
      if (get().logTarget?.id === target.id) set({ logApps: apps });
    } catch {
      set({ logApps: [] });
    }
  },
  startLogs: async () => {
    const { logTarget, logPackage } = get();
    if (!logTarget) return;
    resetPendingLogs();
    set({ logEntries: [] });
    const status = await api.startLogs({
      platform: logTarget.platform,
      id: logTarget.id,
      label: logTarget.label,
      packageFilter: logPackage.trim() || undefined,
    });
    set({ logStatus: status });
  },
  stopLogs: async () => {
    resetPendingLogs();
    const status = await api.stopLogs();
    set({ logStatus: status });
  },
  clearLogs: async () => {
    resetPendingLogs();
    await api.clearLogs();
    set({ logEntries: [] });
  },
  dbTarget: null,
  dbApps: [],
  dbApp: null,
  dbFiles: [],
  dbFileRef: null,
  dbTables: [],
  dbTable: null,
  dbSql: '',
  dbResult: null,
  dbBusy: false,
  dbError: null,
  setDbTarget: (target) => {
    set({
      dbTarget: target,
      dbApps: [],
      dbApp: null,
      dbFiles: [],
      dbFileRef: null,
      dbTables: [],
      dbTable: null,
      dbResult: null,
      dbError: null,
    });
    if (target) void get().loadDbApps();
  },
  loadDbApps: async () => {
    const target = get().dbTarget;
    if (!target) return;
    set({ dbBusy: true, dbError: null });
    try {
      const apps = await api.getDeviceApps(target.platform, target.id);
      if (get().dbTarget?.id === target.id) set({ dbApps: apps });
    } catch (error) {
      set({ dbError: error instanceof Error ? error.message : 'Failed to load apps' });
    } finally {
      set({ dbBusy: false });
    }
  },
  setDbApp: (app) => {
    set({
      dbApp: app,
      dbFiles: [],
      dbFileRef: null,
      dbTables: [],
      dbTable: null,
      dbResult: null,
      dbError: null,
    });
    if (app) void get().loadDbFiles();
  },
  loadDbFiles: async () => {
    const { dbTarget, dbApp } = get();
    if (!dbTarget || !dbApp) return;
    set({ dbBusy: true, dbError: null });
    try {
      const files = await api.getDbFiles(dbTarget.platform, dbTarget.id, dbApp);
      set({ dbFiles: files });
      if (files.length === 1) await get().openDbFile(files[0].ref);
    } catch (error) {
      set({ dbError: error instanceof Error ? error.message : 'Failed to list databases' });
    } finally {
      set({ dbBusy: false });
    }
  },
  openDbFile: async (ref) => {
    const { dbTarget, dbApp } = get();
    if (!dbTarget || !dbApp) return;
    set({ dbBusy: true, dbError: null, dbFileRef: ref, dbTables: [], dbTable: null, dbResult: null });
    try {
      const { tables } = await api.openDb(dbTarget.platform, dbTarget.id, dbApp, ref);
      set({ dbTables: tables });
      if (tables.length > 0) await get().selectDbTable(tables[0]);
    } catch (error) {
      set({ dbError: error instanceof Error ? error.message : 'Failed to open database' });
    } finally {
      set({ dbBusy: false });
    }
  },
  selectDbTable: async (table) => {
    const sql = `SELECT * FROM "${table}" LIMIT 200`;
    set({ dbTable: table, dbSql: sql });
    await get().runDbQuery(sql);
  },
  setDbSql: (sql) => set({ dbSql: sql }),
  runDbQuery: async (sql) => {
    const { dbTarget, dbApp, dbFileRef } = get();
    if (!dbTarget || !dbApp || !dbFileRef) return;
    set({ dbBusy: true, dbError: null });
    try {
      const result = await api.queryDb(dbTarget.platform, dbTarget.id, dbApp, dbFileRef, sql);
      set({ dbResult: result });
    } catch (error) {
      set({ dbError: error instanceof Error ? error.message : 'Query failed', dbResult: null });
    } finally {
      set({ dbBusy: false });
    }
  },
  apiWorkspaces: [],
  apiFolders: [],
  apiRequests: [],
  apiEnvironments: [],
  activeWorkspaceId: null,
  selectedApiRequestId: null,
  apiRunResult: null,
  apiRunning: false,
  loadApiClient: async () => {
    const snapshot = await api.getApiClient();
    set(applyApiSnapshot(snapshot));
    if (!get().activeWorkspaceId && snapshot.workspaces.length > 0) {
      set({ activeWorkspaceId: snapshot.workspaces[0].id });
    }
  },
  setActiveWorkspace: (id) =>
    set({ activeWorkspaceId: id, selectedApiRequestId: null, apiRunResult: null }),
  createWorkspace: async (name) => {
    const { snapshot, id } = await api.createWorkspace(name);
    set({ ...applyApiSnapshot(snapshot), activeWorkspaceId: id, selectedApiRequestId: null });
  },
  renameWorkspace: async (id, name) => {
    set(applyApiSnapshot(await api.updateWorkspace(id, { name })));
  },
  deleteWorkspace: async (id) => {
    const snapshot = await api.deleteWorkspace(id);
    const patch = applyApiSnapshot(snapshot);
    if (get().activeWorkspaceId === id) {
      set({ ...patch, activeWorkspaceId: snapshot.workspaces[0]?.id ?? null, selectedApiRequestId: null });
    } else {
      set(patch);
    }
  },
  createApiFolder: async (name, parentId) => {
    const workspaceId = get().activeWorkspaceId;
    if (!workspaceId) return;
    const { snapshot } = await api.createApiFolder(workspaceId, name, parentId);
    set(applyApiSnapshot(snapshot));
  },
  renameApiFolder: async (id, name) => {
    set(applyApiSnapshot(await api.updateApiFolder(id, { name })));
  },
  deleteApiFolder: async (id) => {
    set(applyApiSnapshot(await api.deleteApiFolder(id)));
  },
  createApiRequest: async (folderId) => {
    const workspaceId = get().activeWorkspaceId;
    if (!workspaceId) return;
    const { snapshot, id } = await api.createApiRequest(workspaceId, folderId);
    set({ ...applyApiSnapshot(snapshot), selectedApiRequestId: id, apiRunResult: null });
  },
  updateApiRequest: async (id, patch) => {
    set(applyApiSnapshot(await api.updateApiRequest(id, patch)));
  },
  deleteApiRequest: async (id) => {
    const snapshot = await api.deleteApiRequest(id);
    const patch = applyApiSnapshot(snapshot);
    if (get().selectedApiRequestId === id) {
      set({ ...patch, selectedApiRequestId: null, apiRunResult: null });
    } else {
      set(patch);
    }
  },
  selectApiRequest: (id) => set({ selectedApiRequestId: id, apiRunResult: null }),
  createEnvironment: async (name) => {
    const workspaceId = get().activeWorkspaceId;
    if (!workspaceId) return;
    const { snapshot } = await api.createEnvironment(workspaceId, name);
    set(applyApiSnapshot(snapshot));
  },
  updateEnvironment: async (id, patch) => {
    set(applyApiSnapshot(await api.updateEnvironment(id, patch)));
  },
  deleteEnvironment: async (id) => {
    set(applyApiSnapshot(await api.deleteEnvironment(id)));
  },
  setActiveEnvironment: async (envId) => {
    const workspaceId = get().activeWorkspaceId;
    if (!workspaceId) return;
    set(applyApiSnapshot(await api.updateWorkspace(workspaceId, { activeEnvironmentId: envId })));
  },
  runApiRequest: async (request) => {
    set({ apiRunning: true });
    try {
      const result = await api.runApiRequest(request);
      set({ apiRunResult: result, ...applyApiSnapshot(await api.getApiClient()) });
    } catch (error) {
      set({
        apiRunResult: {
          ok: false,
          status: 0,
          statusText: '',
          headers: {},
          bodyText: '',
          bodyTruncated: false,
          durationMs: 0,
          sizeBytes: 0,
          scriptLogs: [],
          tests: [],
          error: error instanceof Error ? error.message : 'Run failed',
          effectiveUrl: request.url,
        },
      });
    } finally {
      set({ apiRunning: false });
    }
  },
  loadAll: async () => {
    const [status, exchanges, mocks, devices] = await Promise.all([
      api.getStatus(),
      api.getTraffic(),
      api.getMocks(),
      api.getDevices(),
    ]);
    set({
      status,
      exchanges,
      folders: mocks.folders,
      rules: mocks.rules,
      devices,
      logTarget: reconcileLogTarget(get().logTarget, devices, get().logStatus.streaming),
    });
  },
  refreshMocks: async () => {
    const mocks = await api.getMocks();
    set({ folders: mocks.folders, rules: mocks.rules });
  },
  refreshDevices: async () => {
    const devices = await api.getDevices();
    set({ devices, logTarget: reconcileLogTarget(get().logTarget, devices, get().logStatus.streaming) });
  },
  refreshStatus: async () => {
    const status = await api.getStatus();
    set({ status });
  },
  clearTraffic: async () => {
    await api.clearTraffic();
    set({ exchanges: [], selectedExchangeId: null });
  },
  applyEvent: (ev) => {
    switch (ev.type) {
      case 'request':
      case 'response':
      case 'abort': {
        const next = upsertExchange(get().exchanges, ev.exchange);
        const selectedId = get().selectedExchangeId;
        const stillPresent = selectedId === null || next.some((e) => e.id === selectedId);
        set(stillPresent ? { exchanges: next } : { exchanges: next, selectedExchangeId: null });
        break;
      }
      case 'traffic-cleared':
        set({ exchanges: [], selectedExchangeId: null });
        break;
      case 'mocks-updated':
        void get()
          .refreshMocks()
          .catch(() => undefined);
        break;
      case 'devices-updated':
        void get()
          .refreshDevices()
          .catch(() => undefined);
        break;
      case 'log-entry':
        pendingLogEntries.push(ev.entry);
        scheduleLogFlush(() => {
          const batch = pendingLogEntries;
          pendingLogEntries = [];
          if (batch.length > 0) set({ logEntries: appendLogs(get().logEntries, batch) });
        });
        break;
      case 'log-cleared':
        resetPendingLogs();
        set({ logEntries: [] });
        break;
      case 'log-status':
        set({ logStatus: ev.status });
        break;
    }
  },
}));
