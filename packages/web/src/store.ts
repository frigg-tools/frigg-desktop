import { create } from 'zustand';
import {
  TRAFFIC_BUFFER_LIMIT,
  FRIDA_MESSAGE_BUFFER_LIMIT,
  type ApiClientCert,
  type ApiEnvironment,
  type ApiFolder,
  type ApiRequest,
  type ApiRunResult,
  type ApiWorkspace,
  type Avd,
  type AvdCreateResult,
  type BreakpointResume,
  type BreakpointRuleInput,
  type BreakpointsSnapshot,
  type DbFile,
  type DbQueryResult,
  type DeviceApp,
  type DevicesSnapshot,
  type FridaMessage,
  type FridaScript,
  type FridaServerStatus,
  type FridaSessionStatus,
  type LogEntry,
  type LogLevel,
  type LogSessionStatus,
  type LogTarget,
  type MockFolder,
  type MockRule,
  type ProxyClientCert,
  type ProxyStatus,
  type ServerEvent,
  type TrafficExchange,
} from '@frigg/shared';
import * as api from './api/client';

export type Screen = 'traffic' | 'mocks' | 'devices' | 'logcat' | 'database' | 'client' | 'mcp' | 'frida';
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
  openTabIds: string[];
  apiRunResult: ApiRunResult | null;
  apiRunResultByRequest: Record<string, ApiRunResult>;
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
  closeTab: (id: string) => void;
  createEnvironment: (name: string) => Promise<string | null>;
  updateEnvironment: (id: string, patch: Partial<ApiEnvironment>) => Promise<void>;
  deleteEnvironment: (id: string) => Promise<void>;
  setActiveEnvironment: (envId: string | null) => Promise<void>;
  updateClientCerts: (certs: ApiClientCert[]) => Promise<void>;
  runApiRequest: (request: ApiRequest) => Promise<void>;
  proxyCerts: ProxyClientCert[];
  loadProxyCerts: () => Promise<void>;
  saveProxyCerts: (certs: ProxyClientCert[]) => Promise<void>;
  breakpoints: BreakpointsSnapshot;
  loadBreakpoints: () => Promise<void>;
  toggleBreakpoints: (enabled: boolean) => Promise<void>;
  createBreakpointRule: (input: BreakpointRuleInput) => Promise<void>;
  updateBreakpointRule: (id: string, patch: Partial<BreakpointRuleInput>) => Promise<void>;
  deleteBreakpointRule: (id: string) => Promise<void>;
  resumeBreakpoint: (id: string, resume: BreakpointResume) => Promise<void>;
  fridaDeviceId: string | null;
  fridaServerStatus: FridaServerStatus;
  fridaSessionStatus: FridaSessionStatus;
  fridaMessages: FridaMessage[];
  fridaScripts: FridaScript[];
  fridaTarget: string;
  fridaSource: string;
  fridaScriptId: string;
  fridaSpawnMode: boolean;
  hostFridaVersion: string | null;
  fridaBusy: boolean;
  fridaRecentTargets: string[];
  setFridaDeviceId: (id: string | null) => void;
  setFridaTarget: (value: string) => void;
  setFridaSource: (value: string) => void;
  selectFridaExample: (id: string) => void;
  setFridaSpawnMode: (value: boolean) => void;
  loadFrida: () => Promise<void>;
  refreshFridaStatus: () => Promise<void>;
  installFrida: () => Promise<void>;
  startFridaServer: () => Promise<void>;
  stopFridaServer: () => Promise<void>;
  runFridaScript: () => Promise<void>;
  stopFridaScript: () => Promise<void>;
  clearFridaMessages: () => void;
  avds: Avd[];
  avdBusy: boolean;
  loadAvds: () => Promise<void>;
  bootAvd: (name: string) => Promise<void>;
  createAvd: (name: string, apiLevel: number) => Promise<AvdCreateResult>;
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

const TABS_STORAGE_KEY = 'frigg-client-tabs';

type TabState = { openTabIds: string[]; selectedId: string | null };

function readTabStore(): Record<string, TabState> {
  try {
    return JSON.parse(localStorage.getItem(TABS_STORAGE_KEY) ?? '{}') as Record<string, TabState>;
  } catch {
    return {};
  }
}

function persistTabs(workspaceId: string | null, openTabIds: string[], selectedId: string | null) {
  if (!workspaceId) return;
  try {
    const all = readTabStore();
    all[workspaceId] = { openTabIds, selectedId };
    localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(all));
  } catch {
    void 0;
  }
}

function restoreTabs(workspaceId: string | null, requests: ApiRequest[]): TabState {
  if (!workspaceId) return { openTabIds: [], selectedId: null };
  const live = new Set(requests.map((r) => r.id));
  const saved = readTabStore()[workspaceId];
  if (!saved) return { openTabIds: [], selectedId: null };
  const openTabIds = saved.openTabIds.filter((id) => live.has(id));
  const selectedId = saved.selectedId && openTabIds.includes(saved.selectedId) ? saved.selectedId : openTabIds[0] ?? null;
  return { openTabIds, selectedId };
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

function appendFridaMessages(list: FridaMessage[], incoming: FridaMessage[]): FridaMessage[] {
  const next = list.concat(incoming);
  return next.length > FRIDA_MESSAGE_BUFFER_LIMIT
    ? next.slice(next.length - FRIDA_MESSAGE_BUFFER_LIMIT)
    : next;
}

let pendingFridaMessages: FridaMessage[] = [];
let fridaFlushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleFridaFlush(flush: () => void): void {
  if (fridaFlushTimer) return;
  fridaFlushTimer = setTimeout(() => {
    fridaFlushTimer = null;
    flush();
  }, LOG_FLUSH_INTERVAL_MS);
}

function resetPendingFrida(): void {
  pendingFridaMessages = [];
  if (fridaFlushTimer) {
    clearTimeout(fridaFlushTimer);
    fridaFlushTimer = null;
  }
}

function reconcileFridaDevice(
  deviceId: string | null,
  devices: DevicesSnapshot | null,
  running: boolean,
): string | null {
  if (!deviceId || running) return deviceId;
  return devices?.android.some((device) => device.serial === deviceId) ? deviceId : null;
}

const FRIDA_TARGETS_KEY = 'frigg-frida-targets';

function readFridaTargets(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(FRIDA_TARGETS_KEY) ?? '[]') as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function rememberFridaTarget(target: string, current: string[]): string[] {
  const trimmed = target.trim();
  if (trimmed === '') return current;
  const next = [trimmed, ...current.filter((item) => item !== trimmed)].slice(0, 10);
  try {
    localStorage.setItem(FRIDA_TARGETS_KEY, JSON.stringify(next));
  } catch {
    void 0;
  }
  return next;
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
  fridaDeviceId: null,
  fridaServerStatus: { installed: false, running: false, version: null, deviceId: null, error: null },
  fridaSessionStatus: { running: false, deviceId: null, target: null, scriptId: null, error: null },
  fridaMessages: [],
  fridaScripts: [],
  fridaTarget: '',
  fridaSource: '',
  fridaScriptId: 'custom',
  fridaSpawnMode: false,
  hostFridaVersion: null,
  fridaBusy: false,
  fridaRecentTargets: readFridaTargets(),
  setFridaDeviceId: (id) => {
    set({ fridaDeviceId: id });
    if (id) void get().refreshFridaStatus();
  },
  setFridaTarget: (value) => set({ fridaTarget: value }),
  setFridaSource: (value) => set({ fridaSource: value, fridaScriptId: 'custom' }),
  selectFridaExample: (exampleId) => {
    const script = get().fridaScripts.find((item) => item.id === exampleId);
    if (script) set({ fridaSource: script.source, fridaScriptId: script.id });
  },
  setFridaSpawnMode: (value) => set({ fridaSpawnMode: value }),
  loadFrida: async () => {
    const snapshot = await api.getFridaSnapshot();
    set({
      fridaScripts: snapshot.scripts,
      hostFridaVersion: snapshot.hostFridaVersion,
      fridaServerStatus: snapshot.serverStatus,
      fridaSessionStatus: snapshot.sessionStatus,
    });
    if (get().fridaSource.trim() === '' && snapshot.scripts.length > 0) {
      set({ fridaSource: snapshot.scripts[0].source, fridaScriptId: snapshot.scripts[0].id });
    }
  },
  refreshFridaStatus: async () => {
    const id = get().fridaDeviceId;
    if (!id) return;
    try {
      const status = await api.getFridaStatus(id);
      if (get().fridaDeviceId === id) set({ fridaServerStatus: status });
    } catch {
      void 0;
    }
  },
  installFrida: async () => {
    const id = get().fridaDeviceId;
    if (!id) return;
    set({ fridaBusy: true });
    try {
      set({ fridaServerStatus: await api.installFrida(id) });
    } finally {
      set({ fridaBusy: false });
    }
  },
  startFridaServer: async () => {
    const id = get().fridaDeviceId;
    if (!id) return;
    set({ fridaBusy: true });
    try {
      set({ fridaServerStatus: await api.startFridaServer(id) });
    } finally {
      set({ fridaBusy: false });
    }
  },
  stopFridaServer: async () => {
    set({ fridaServerStatus: await api.stopFridaServer(get().fridaDeviceId ?? undefined) });
  },
  runFridaScript: async () => {
    const { fridaDeviceId, fridaTarget, fridaSource, fridaScriptId, fridaSpawnMode } = get();
    if (!fridaDeviceId) return;
    set({ fridaRecentTargets: rememberFridaTarget(fridaTarget, get().fridaRecentTargets) });
    resetPendingFrida();
    set({ fridaMessages: [] });
    const status = await api.runFridaScript({
      deviceId: fridaDeviceId,
      target: fridaTarget,
      source: fridaSource,
      scriptId: fridaScriptId,
      spawnMode: fridaSpawnMode,
    });
    set({ fridaSessionStatus: status });
  },
  stopFridaScript: async () => {
    set({ fridaSessionStatus: await api.stopFridaScript() });
  },
  clearFridaMessages: () => {
    resetPendingFrida();
    set({ fridaMessages: [] });
  },
  avds: [],
  avdBusy: false,
  loadAvds: async () => {
    try {
      set({ avds: await api.getAvds() });
    } catch {
      set({ avds: [] });
    }
  },
  bootAvd: async (name) => {
    await api.bootAvd(name);
    void get().loadAvds();
  },
  createAvd: async (name, apiLevel) => {
    set({ avdBusy: true });
    try {
      const result = await api.createAvd(name, apiLevel);
      await get().loadAvds();
      return result;
    } finally {
      set({ avdBusy: false });
    }
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
  openTabIds: [],
  apiRunResult: null,
  apiRunResultByRequest: {},
  apiRunning: false,
  loadApiClient: async () => {
    const snapshot = await api.getApiClient();
    set(applyApiSnapshot(snapshot));
    const workspaceId = get().activeWorkspaceId ?? snapshot.workspaces[0]?.id ?? null;
    const { openTabIds, selectedId } = restoreTabs(workspaceId, snapshot.requests);
    set({
      activeWorkspaceId: workspaceId,
      openTabIds,
      selectedApiRequestId: selectedId,
      apiRunResult: null,
      apiRunResultByRequest: {},
    });
  },
  setActiveWorkspace: (id) => {
    const { openTabIds, selectedId } = restoreTabs(id, get().apiRequests);
    set({
      activeWorkspaceId: id,
      openTabIds,
      selectedApiRequestId: selectedId,
      apiRunResult: null,
      apiRunResultByRequest: {},
    });
  },
  createWorkspace: async (name) => {
    const { snapshot, id } = await api.createWorkspace(name);
    set({ ...applyApiSnapshot(snapshot), activeWorkspaceId: id, selectedApiRequestId: null, openTabIds: [], apiRunResultByRequest: {} });
  },
  renameWorkspace: async (id, name) => {
    set(applyApiSnapshot(await api.updateWorkspace(id, { name })));
  },
  deleteWorkspace: async (id) => {
    const snapshot = await api.deleteWorkspace(id);
    const patch = applyApiSnapshot(snapshot);
    if (get().activeWorkspaceId === id) {
      const nextWorkspaceId = snapshot.workspaces[0]?.id ?? null;
      const { openTabIds, selectedId } = restoreTabs(nextWorkspaceId, snapshot.requests);
      set({
        ...patch,
        activeWorkspaceId: nextWorkspaceId,
        openTabIds,
        selectedApiRequestId: selectedId,
        apiRunResult: null,
        apiRunResultByRequest: {},
      });
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
    const openTabIds = [...get().openTabIds, id];
    set({ ...applyApiSnapshot(snapshot), openTabIds, selectedApiRequestId: id, apiRunResult: null });
    persistTabs(workspaceId, openTabIds, id);
  },
  updateApiRequest: async (id, patch) => {
    set(applyApiSnapshot(await api.updateApiRequest(id, patch)));
  },
  deleteApiRequest: async (id) => {
    const snapshot = await api.deleteApiRequest(id);
    const patch = applyApiSnapshot(snapshot);
    const { openTabIds, selectedApiRequestId, apiRunResultByRequest, activeWorkspaceId } = get();
    const idx = openTabIds.indexOf(id);
    const nextTabs = openTabIds.filter((t) => t !== id);
    const nextResults = { ...apiRunResultByRequest };
    delete nextResults[id];
    if (selectedApiRequestId === id) {
      const neighbor = idx === -1 ? null : nextTabs[idx] ?? nextTabs[idx - 1] ?? null;
      set({
        ...patch,
        openTabIds: nextTabs,
        selectedApiRequestId: neighbor,
        apiRunResult: neighbor ? nextResults[neighbor] ?? null : null,
        apiRunResultByRequest: nextResults,
      });
      persistTabs(activeWorkspaceId, nextTabs, neighbor);
    } else {
      set({ ...patch, openTabIds: nextTabs, apiRunResultByRequest: nextResults });
      persistTabs(activeWorkspaceId, nextTabs, selectedApiRequestId);
    }
  },
  selectApiRequest: (id) => {
    if (id === null) {
      set({ selectedApiRequestId: null, apiRunResult: null });
      persistTabs(get().activeWorkspaceId, get().openTabIds, null);
      return;
    }
    const open = get().openTabIds;
    const openTabIds = open.includes(id) ? open : [...open, id];
    set({
      openTabIds,
      selectedApiRequestId: id,
      apiRunResult: get().apiRunResultByRequest[id] ?? null,
    });
    persistTabs(get().activeWorkspaceId, openTabIds, id);
  },
  closeTab: (id) => {
    const { openTabIds, selectedApiRequestId, apiRunResultByRequest, activeWorkspaceId } = get();
    const idx = openTabIds.indexOf(id);
    if (idx === -1) return;
    const nextTabs = openTabIds.filter((t) => t !== id);
    const nextResults = { ...apiRunResultByRequest };
    delete nextResults[id];
    if (selectedApiRequestId === id) {
      const neighbor = nextTabs[idx] ?? nextTabs[idx - 1] ?? null;
      set({
        openTabIds: nextTabs,
        selectedApiRequestId: neighbor,
        apiRunResult: neighbor ? nextResults[neighbor] ?? null : null,
        apiRunResultByRequest: nextResults,
      });
      persistTabs(activeWorkspaceId, nextTabs, neighbor);
    } else {
      set({ openTabIds: nextTabs, apiRunResultByRequest: nextResults });
      persistTabs(activeWorkspaceId, nextTabs, selectedApiRequestId);
    }
  },
  createEnvironment: async (name) => {
    const workspaceId = get().activeWorkspaceId;
    if (!workspaceId) return null;
    const { snapshot, id } = await api.createEnvironment(workspaceId, name);
    set(applyApiSnapshot(snapshot));
    return id;
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
  updateClientCerts: async (certs) => {
    const workspaceId = get().activeWorkspaceId;
    if (!workspaceId) return;
    set(applyApiSnapshot(await api.updateWorkspace(workspaceId, { clientCerts: certs })));
  },
  runApiRequest: async (request) => {
    set({ apiRunning: true });
    try {
      const result = await api.runApiRequest(request);
      set({
        apiRunResult: result,
        apiRunResultByRequest: { ...get().apiRunResultByRequest, [request.id]: result },
        ...applyApiSnapshot(await api.getApiClient()),
      });
    } catch (error) {
      const result: ApiRunResult = {
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
      };
      set({
        apiRunResult: result,
        apiRunResultByRequest: { ...get().apiRunResultByRequest, [request.id]: result },
      });
    } finally {
      set({ apiRunning: false });
    }
  },
  proxyCerts: [],
  loadProxyCerts: async () => {
    const snapshot = await api.getProxyCerts();
    set({ proxyCerts: snapshot.certs });
  },
  saveProxyCerts: async (certs) => {
    const snapshot = await api.setProxyCerts(certs);
    set({ proxyCerts: snapshot.certs });
  },
  breakpoints: { enabled: false, rules: [], paused: [] },
  loadBreakpoints: async () => {
    const snapshot = await api.getBreakpoints();
    set({ breakpoints: snapshot });
  },
  toggleBreakpoints: async (enabled) => {
    const snapshot = await api.setBreakpointsEnabled(enabled);
    set({ breakpoints: snapshot });
  },
  createBreakpointRule: async (input) => {
    const { snapshot } = await api.createBreakpointRule(input);
    set({ breakpoints: snapshot });
  },
  updateBreakpointRule: async (id, patch) => {
    const snapshot = await api.updateBreakpointRule(id, patch);
    set({ breakpoints: snapshot });
  },
  deleteBreakpointRule: async (id) => {
    const snapshot = await api.deleteBreakpointRule(id);
    set({ breakpoints: snapshot });
  },
  resumeBreakpoint: async (id, resume) => {
    await api.resumeBreakpoint(id, resume);
    const bp = get().breakpoints;
    set({ breakpoints: { ...bp, paused: bp.paused.filter((p) => p.id !== id) } });
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
      fridaDeviceId: reconcileFridaDevice(get().fridaDeviceId, devices, get().fridaSessionStatus.running),
    });
  },
  refreshMocks: async () => {
    const mocks = await api.getMocks();
    set({ folders: mocks.folders, rules: mocks.rules });
  },
  refreshDevices: async () => {
    const devices = await api.getDevices();
    set({
      devices,
      logTarget: reconcileLogTarget(get().logTarget, devices, get().logStatus.streaming),
      fridaDeviceId: reconcileFridaDevice(get().fridaDeviceId, devices, get().fridaSessionStatus.running),
    });
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
        void get()
          .loadAvds()
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
      case 'breakpoint-paused': {
        const bp = get().breakpoints;
        set({
          breakpoints: {
            ...bp,
            paused: [...bp.paused.filter((p) => p.id !== ev.paused.id), ev.paused],
          },
        });
        break;
      }
      case 'breakpoint-resumed': {
        const bp = get().breakpoints;
        set({ breakpoints: { ...bp, paused: bp.paused.filter((p) => p.id !== ev.id) } });
        break;
      }
      case 'breakpoints-updated':
        set({ breakpoints: ev.snapshot });
        break;
      case 'frida-server-status':
        set({ fridaServerStatus: ev.status });
        break;
      case 'frida-session-status':
        set({ fridaSessionStatus: ev.status });
        break;
      case 'frida-message':
        pendingFridaMessages.push(ev.message);
        scheduleFridaFlush(() => {
          const batch = pendingFridaMessages;
          pendingFridaMessages = [];
          if (batch.length > 0) set({ fridaMessages: appendFridaMessages(get().fridaMessages, batch) });
        });
        break;
    }
  },
}));
