import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import QRCode from 'qrcode';
import type {
  ApiBody,
  ApiClientCert,
  ApiKeyValue,
  ApiRequest,
  BodyMatchMode,
  BreakpointDirection,
  BreakpointMatcher,
  BreakpointRequestEdit,
  BreakpointResponseEdit,
  BreakpointResume,
  BreakpointRuleInput,
  DevicesSnapshot,
  LogPlatform,
  LogTarget,
  MockMatcher,
  MockResponseSpec,
  MockRuleInput,
  ProxyClientCert,
  ProxyStatus,
} from '@frigg/shared';
import { ApiClientStore } from '../api-client/store.ts';
import { runRequest } from '../api-client/runner.ts';
import { listApps } from '../devices/apps.ts';
import { adbStatus, listAndroidDevices, setupAndroid, teardownAndroid } from '../devices/android.ts';
import {
  installSimCert,
  listBootedSimulators,
  listPhysicalIosDevices,
  xcrunStatus,
} from '../devices/ios.ts';
import { getMacProxyState, setMacProxy } from '../devices/macos-proxy.ts';
import { run } from '../lib/exec.ts';
import { mcpServerInfo } from './mcp-info.ts';
import type { DbInspector } from '../db/index.ts';
import { serverLocale, type ServerLocale } from '../i18n.ts';
import { getLanIp } from '../lib/net.ts';
import type { LogcatManager } from '../logcat/index.ts';
import type { MockStore } from '../mocks/store.ts';
import type { BreakpointManager } from '../proxy/breakpoint-manager.ts';
import { certToDer, type CaMaterial } from '../proxy/ca.ts';
import type { ProxyCertStore } from '../proxy/proxy-cert-store.ts';
import type { TrafficStore } from '../proxy/traffic-store.ts';
import { setupPageHtml } from './setup-page.ts';

export interface ApiDeps {
  traffic: TrafficStore;
  mocks: MockStore;
  ca: CaMaterial;
  proxyPort: number;
  apiPort: number;
  logcat: LogcatManager;
  db: DbInspector;
  apiClient: ApiClientStore;
  breakpoints: BreakpointManager;
  proxyCerts: ProxyCertStore;
  reloadProxy: () => Promise<void>;
}

const MAX_PATTERN_LENGTH = 2048;

class ValidationError extends Error {}

function badRequest(message: string): never {
  throw new ValidationError(message);
}

function asyncHandler(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    badRequest(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function parseBodyMatch(raw: unknown): { mode: BodyMatchMode; value?: string } | undefined {
  if (raw === undefined || raw === null) return undefined;
  const record = asRecord(raw, 'matcher.bodyMatch');
  const mode = record.mode;
  if (mode !== 'none' && mode !== 'contains' && mode !== 'exact') {
    badRequest('matcher.bodyMatch.mode must be one of none, contains, exact');
  }
  if (record.value === undefined) return { mode };
  if (typeof record.value !== 'string') {
    badRequest('matcher.bodyMatch.value must be a string');
  }
  return { mode, value: record.value };
}

function parseMatcher(raw: unknown): MockMatcher {
  const record = asRecord(raw, 'matcher');
  const pathPattern = record.pathPattern;
  if (typeof pathPattern !== 'string' || pathPattern.trim() === '') {
    badRequest('matcher.pathPattern must be a non-empty string');
  }
  if (pathPattern.length > MAX_PATTERN_LENGTH) {
    badRequest(`matcher.pathPattern must be at most ${MAX_PATTERN_LENGTH} characters`);
  }
  const matcher: MockMatcher = { pathPattern };
  if (typeof record.method === 'string' && record.method !== '') matcher.method = record.method;
  if (typeof record.hostPattern === 'string' && record.hostPattern !== '') {
    if (record.hostPattern.length > MAX_PATTERN_LENGTH) {
      badRequest(`matcher.hostPattern must be at most ${MAX_PATTERN_LENGTH} characters`);
    }
    matcher.hostPattern = record.hostPattern;
  }
  if (typeof record.queryContains === 'string' && record.queryContains !== '') {
    matcher.queryContains = record.queryContains;
  }
  const bodyMatch = parseBodyMatch(record.bodyMatch);
  if (bodyMatch) matcher.bodyMatch = bodyMatch;
  return matcher;
}

function parseHeaderMap(raw: unknown): Record<string, string> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(raw)) {
    if (typeof value === 'string') headers[name] = value;
  }
  return headers;
}

function parseResponseSpec(raw: unknown): MockResponseSpec {
  const record = asRecord(raw, 'response');
  if (
    typeof record.statusCode !== 'number' ||
    !Number.isInteger(record.statusCode) ||
    record.statusCode < 100 ||
    record.statusCode > 599
  ) {
    badRequest('response.statusCode must be an integer between 100 and 599');
  }
  const spec: MockResponseSpec = {
    statusCode: record.statusCode,
    headers: parseHeaderMap(record.headers),
    body: typeof record.body === 'string' ? record.body : '',
  };
  if (typeof record.delayMs === 'number' && record.delayMs > 0) spec.delayMs = record.delayMs;
  return spec;
}

function parseRuleInput(body: unknown): MockRuleInput {
  const record = asRecord(body, 'rule');
  const matcher = parseMatcher(record.matcher);
  const response = parseResponseSpec(record.response);
  return {
    folderId: typeof record.folderId === 'string' ? record.folderId : null,
    name:
      typeof record.name === 'string' && record.name.trim() !== ''
        ? record.name
        : `${matcher.method ?? 'ANY'} ${matcher.pathPattern}`,
    enabled: typeof record.enabled === 'boolean' ? record.enabled : true,
    priority:
      typeof record.priority === 'number' && Number.isFinite(record.priority)
        ? record.priority
        : 0,
    matcher,
    response,
  };
}

function parseRulePatch(body: unknown): Partial<MockRuleInput> {
  const record = asRecord(body, 'rule');
  const patch: Partial<MockRuleInput> = {};
  if ('folderId' in record) {
    if (record.folderId !== null && typeof record.folderId !== 'string') {
      badRequest('folderId must be a string or null');
    }
    patch.folderId = record.folderId;
  }
  if (record.name !== undefined) {
    if (typeof record.name !== 'string' || record.name.trim() === '') {
      badRequest('name must be a non-empty string');
    }
    patch.name = record.name;
  }
  if (record.enabled !== undefined) {
    if (typeof record.enabled !== 'boolean') badRequest('enabled must be a boolean');
    patch.enabled = record.enabled;
  }
  if (record.priority !== undefined) {
    if (typeof record.priority !== 'number' || !Number.isFinite(record.priority)) {
      badRequest('priority must be a number');
    }
    patch.priority = record.priority;
  }
  if (record.matcher !== undefined) patch.matcher = parseMatcher(record.matcher);
  if (record.response !== undefined) patch.response = parseResponseSpec(record.response);
  return patch;
}

function parseFolderName(raw: unknown): string {
  if (typeof raw !== 'string' || raw.trim() === '') {
    badRequest('name must be a non-empty string');
  }
  return raw;
}

function parseParentId(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') badRequest('parentId must be a string or null');
  return raw;
}

function parseLogTarget(body: unknown): { target: LogTarget; packageFilter?: string } {
  const record = asRecord(body, 'log target');
  const platform = record.platform;
  if (platform !== 'android' && platform !== 'ios') {
    badRequest("platform must be one of 'android', 'ios'");
  }
  if (typeof record.id !== 'string' || record.id.trim() === '') {
    badRequest('id must be a non-empty string');
  }
  const label = typeof record.label === 'string' && record.label.trim() !== '' ? record.label : record.id;
  const target: LogTarget = { platform: platform as LogPlatform, id: record.id, label };
  if (record.packageFilter !== undefined) {
    if (typeof record.packageFilter !== 'string') badRequest('packageFilter must be a string');
    return { target, packageFilter: record.packageFilter };
  }
  return { target };
}

function parsePlatform(raw: unknown): LogPlatform {
  if (raw === 'android' || raw === 'ios') return raw;
  badRequest("platform must be one of 'android', 'ios'");
}

function parseNonEmpty(raw: unknown, label: string): string {
  if (typeof raw !== 'string' || raw.trim() === '') {
    badRequest(`${label} must be a non-empty string`);
  }
  return raw;
}

interface DbRequestParams {
  platform: LogPlatform;
  id: string;
  app: string;
  ref: string;
}

function parseDbBody(body: unknown): DbRequestParams {
  const record = asRecord(body, 'request');
  return {
    platform: parsePlatform(record.platform),
    id: parseNonEmpty(record.id, 'id'),
    app: parseNonEmpty(record.app, 'app'),
    ref: parseNonEmpty(record.ref, 'ref'),
  };
}

function parseKeyValueArray(raw: unknown, label: string): ApiKeyValue[] {
  if (!Array.isArray(raw)) {
    badRequest(`${label} must be an array`);
  }
  return raw.map((entry, index) => {
    const record = asRecord(entry, `${label}[${index}]`);
    if (typeof record.key !== 'string') badRequest(`${label}[${index}].key must be a string`);
    if (typeof record.value !== 'string') badRequest(`${label}[${index}].value must be a string`);
    const enabled = typeof record.enabled === 'boolean' ? record.enabled : true;
    return { key: record.key, value: record.value, enabled };
  });
}

function parseClientCerts(raw: unknown, label: string): ApiClientCert[] {
  if (!Array.isArray(raw)) {
    badRequest(`${label} must be an array`);
  }
  return raw.map((entry, index) => {
    const record = asRecord(entry, `${label}[${index}]`);
    const host = parseNonEmpty(record.host, `${label}[${index}].host`);
    const certPath = parseNonEmpty(record.certPath, `${label}[${index}].certPath`);
    const keyPath = parseNonEmpty(record.keyPath, `${label}[${index}].keyPath`);
    const cert: ApiClientCert = {
      id: typeof record.id === 'string' ? record.id : '',
      host,
      certPath,
      keyPath,
    };
    if (record.caPath !== undefined) {
      if (typeof record.caPath !== 'string') badRequest(`${label}[${index}].caPath must be a string`);
      cert.caPath = record.caPath;
    }
    if (record.passphrase !== undefined) {
      if (typeof record.passphrase !== 'string') {
        badRequest(`${label}[${index}].passphrase must be a string`);
      }
      cert.passphrase = record.passphrase;
    }
    return cert;
  });
}

function parseProxyClientCerts(raw: unknown, label: string): ProxyClientCert[] {
  if (!Array.isArray(raw)) {
    badRequest(`${label} must be an array`);
  }
  return raw.map((entry, index) => {
    const record = asRecord(entry, `${label}[${index}]`);
    const host = parseNonEmpty(record.host, `${label}[${index}].host`);
    const pfxPath = parseNonEmpty(record.pfxPath, `${label}[${index}].pfxPath`);
    const cert: ProxyClientCert = {
      id: typeof record.id === 'string' ? record.id : '',
      host,
      pfxPath,
    };
    if (record.passphrase !== undefined) {
      if (typeof record.passphrase !== 'string') {
        badRequest(`${label}[${index}].passphrase must be a string`);
      }
      cert.passphrase = record.passphrase;
    }
    return cert;
  });
}

function parseApiBody(raw: unknown): ApiBody {
  const record = asRecord(raw, 'body');
  const mode = record.mode;
  if (mode !== 'none' && mode !== 'json' && mode !== 'raw' && mode !== 'form') {
    badRequest('body.mode must be one of none, json, raw, form');
  }
  return {
    mode,
    raw: typeof record.raw === 'string' ? record.raw : '',
    form: record.form === undefined ? [] : parseKeyValueArray(record.form, 'body.form'),
  };
}

function parseRequestPatch(body: unknown): Partial<Omit<ApiRequest, 'id' | 'createdAt' | 'updatedAt'>> {
  const record = asRecord(body, 'request');
  const patch: Partial<Omit<ApiRequest, 'id' | 'createdAt' | 'updatedAt'>> = {};
  if ('folderId' in record) patch.folderId = parseParentId(record.folderId);
  if (record.name !== undefined) {
    if (typeof record.name !== 'string') badRequest('name must be a string');
    patch.name = record.name;
  }
  if (record.method !== undefined) {
    if (typeof record.method !== 'string' || record.method.trim() === '') {
      badRequest('method must be a non-empty string');
    }
    patch.method = record.method;
  }
  if (record.url !== undefined) {
    if (typeof record.url !== 'string') badRequest('url must be a string');
    patch.url = record.url;
  }
  if (record.query !== undefined) patch.query = parseKeyValueArray(record.query, 'query');
  if (record.headers !== undefined) patch.headers = parseKeyValueArray(record.headers, 'headers');
  if (record.body !== undefined) patch.body = parseApiBody(record.body);
  if (record.preScript !== undefined) {
    if (typeof record.preScript !== 'string') badRequest('preScript must be a string');
    patch.preScript = record.preScript;
  }
  if (record.testScript !== undefined) {
    if (typeof record.testScript !== 'string') badRequest('testScript must be a string');
    patch.testScript = record.testScript;
  }
  return patch;
}

function parseRunRequest(raw: unknown): ApiRequest {
  const record = asRecord(raw, 'request');
  if (typeof record.method !== 'string' || record.method.trim() === '') {
    badRequest('request.method must be a non-empty string');
  }
  if (typeof record.url !== 'string') {
    badRequest('request.url must be a string');
  }
  return {
    id: typeof record.id === 'string' ? record.id : '',
    workspaceId: typeof record.workspaceId === 'string' ? record.workspaceId : '',
    folderId: typeof record.folderId === 'string' ? record.folderId : null,
    name: typeof record.name === 'string' ? record.name : '',
    method: record.method,
    url: record.url,
    query: parseKeyValueArray(record.query ?? [], 'request.query'),
    headers: parseKeyValueArray(record.headers ?? [], 'request.headers'),
    body: parseApiBody(record.body),
    preScript: typeof record.preScript === 'string' ? record.preScript : '',
    testScript: typeof record.testScript === 'string' ? record.testScript : '',
    createdAt: typeof record.createdAt === 'number' ? record.createdAt : 0,
    updatedAt: typeof record.updatedAt === 'number' ? record.updatedAt : 0,
  };
}

function parseBreakpointDirection(raw: unknown): BreakpointDirection {
  if (raw === 'request' || raw === 'response' || raw === 'both') return raw;
  badRequest('direction must be one of request, response, both');
}

function parseBreakpointMatcher(raw: unknown): BreakpointMatcher {
  const record = asRecord(raw, 'matcher');
  if (typeof record.urlPattern !== 'string') {
    badRequest('matcher.urlPattern must be a string');
  }
  if (record.urlPattern.length > MAX_PATTERN_LENGTH) {
    badRequest(`matcher.urlPattern must be at most ${MAX_PATTERN_LENGTH} characters`);
  }
  const matcher: BreakpointMatcher = { urlPattern: record.urlPattern };
  if (record.method !== undefined) {
    if (typeof record.method !== 'string') badRequest('matcher.method must be a string');
    if (record.method !== '') matcher.method = record.method;
  }
  return matcher;
}

function parseBreakpointRuleInput(body: unknown): BreakpointRuleInput {
  const record = asRecord(body, 'rule');
  if (typeof record.enabled !== 'boolean') badRequest('enabled must be a boolean');
  return {
    enabled: record.enabled,
    direction: parseBreakpointDirection(record.direction),
    matcher: parseBreakpointMatcher(record.matcher),
  };
}

function parseBreakpointRulePatch(body: unknown): Partial<BreakpointRuleInput> {
  const record = asRecord(body, 'rule');
  const patch: Partial<BreakpointRuleInput> = {};
  if (record.enabled !== undefined) {
    if (typeof record.enabled !== 'boolean') badRequest('enabled must be a boolean');
    patch.enabled = record.enabled;
  }
  if (record.direction !== undefined) patch.direction = parseBreakpointDirection(record.direction);
  if (record.matcher !== undefined) patch.matcher = parseBreakpointMatcher(record.matcher);
  return patch;
}

function parseBreakpointRequestEdit(raw: unknown): BreakpointRequestEdit {
  const record = asRecord(raw, 'edit');
  if (typeof record.method !== 'string' || record.method.trim() === '') {
    badRequest('edit.method must be a non-empty string');
  }
  if (typeof record.url !== 'string') badRequest('edit.url must be a string');
  return {
    method: record.method,
    url: record.url,
    headers: parseKeyValueArray(record.headers ?? [], 'edit.headers'),
    body: typeof record.body === 'string' ? record.body : '',
  };
}

function parseBreakpointResponseEdit(raw: unknown, label: string): BreakpointResponseEdit {
  const record = asRecord(raw, label);
  if (
    typeof record.statusCode !== 'number' ||
    !Number.isInteger(record.statusCode) ||
    record.statusCode < 100 ||
    record.statusCode > 599
  ) {
    badRequest(`${label}.statusCode must be an integer between 100 and 599`);
  }
  return {
    statusCode: record.statusCode,
    headers: parseKeyValueArray(record.headers ?? [], `${label}.headers`),
    body: typeof record.body === 'string' ? record.body : '',
  };
}

function parseBreakpointResume(body: unknown): BreakpointResume {
  const record = asRecord(body, 'resume');
  switch (record.action) {
    case 'send-request':
      return { action: 'send-request', edit: parseBreakpointRequestEdit(record.edit) };
    case 'respond':
      return { action: 'respond', response: parseBreakpointResponseEdit(record.response, 'response') };
    case 'send-response':
      return { action: 'send-response', edit: parseBreakpointResponseEdit(record.edit, 'edit') };
    case 'abort':
      return { action: 'abort' };
    default:
      badRequest('action must be one of send-request, respond, send-response, abort');
  }
}

function localeFromRequest(req: Request): ServerLocale {
  const queryLang = req.query.lang;
  if (queryLang === 'pt' || queryLang === 'en') return queryLang;
  return serverLocale(req.header('X-Frigg-Locale'));
}

function statusForError(error: unknown): number {
  if (error instanceof ValidationError) return 400;
  if (error instanceof Error && error.message === 'not found') return 404;
  if (error instanceof Error && error.message === 'cycle') return 400;
  return 500;
}

function messageForError(error: unknown): string {
  if (error instanceof Error && error.message !== '') return error.message;
  return 'internal server error';
}

export function buildRouter(deps: ApiDeps): Router {
  const router = Router();

  router.get('/api/status', (_req, res) => {
    const status: ProxyStatus = {
      running: true,
      proxyPort: deps.proxyPort,
      apiPort: deps.apiPort,
      lanIp: getLanIp(),
      certFingerprint: deps.ca.fingerprint,
      totalExchanges: deps.traffic.total,
    };
    res.json(status);
  });

  router.get('/api/traffic', (_req, res) => {
    res.json(deps.traffic.list());
  });

  router.delete('/api/traffic', (_req, res) => {
    deps.traffic.clear();
    res.json({ ok: true });
  });

  router.get('/api/mocks', (_req, res) => {
    res.json(deps.mocks.snapshot());
  });

  router.post('/api/mocks/rules', (req, res) => {
    res.json(deps.mocks.createRule(parseRuleInput(req.body)));
  });

  router.put('/api/mocks/rules/:id', (req, res) => {
    res.json(deps.mocks.updateRule(req.params.id, parseRulePatch(req.body)));
  });

  router.delete('/api/mocks/rules/:id', (req, res) => {
    deps.mocks.deleteRule(req.params.id);
    res.json({ ok: true });
  });

  router.post('/api/mocks/folders', (req, res) => {
    const record = asRecord(req.body, 'folder');
    const name = parseFolderName(record.name);
    const parentId = parseParentId(record.parentId);
    res.json(deps.mocks.createFolder(name, parentId));
  });

  router.put('/api/mocks/folders/:id', (req, res) => {
    const record = asRecord(req.body, 'folder');
    const patch: { name?: string; parentId?: string | null } = {};
    if (record.name !== undefined) patch.name = parseFolderName(record.name);
    if ('parentId' in record) patch.parentId = parseParentId(record.parentId);
    res.json(deps.mocks.updateFolder(req.params.id, patch));
  });

  router.delete('/api/mocks/folders/:id', (req, res) => {
    deps.mocks.deleteFolder(req.params.id);
    res.json({ ok: true });
  });

  router.get('/api/breakpoints', (_req, res) => {
    res.json(deps.breakpoints.snapshot());
  });

  router.post('/api/breakpoints/enabled', (req, res) => {
    const record = asRecord(req.body, 'breakpoints');
    if (typeof record.enabled !== 'boolean') badRequest('enabled must be a boolean');
    res.json(deps.breakpoints.setEnabled(record.enabled));
  });

  router.post('/api/breakpoints/rules', (req, res) => {
    const rule = deps.breakpoints.createRule(parseBreakpointRuleInput(req.body));
    res.json({ snapshot: deps.breakpoints.snapshot(), id: rule.id });
  });

  router.put('/api/breakpoints/rules/:id', (req, res) => {
    res.json(deps.breakpoints.updateRule(req.params.id, parseBreakpointRulePatch(req.body)));
  });

  router.delete('/api/breakpoints/rules/:id', (req, res) => {
    res.json(deps.breakpoints.deleteRule(req.params.id));
  });

  router.post('/api/breakpoints/:id/resume', (req, res) => {
    deps.breakpoints.resume(req.params.id, parseBreakpointResume(req.body));
    res.json({ ok: true });
  });

  router.get('/api/proxy-certs', (_req, res) => {
    res.json(deps.proxyCerts.snapshot());
  });

  router.put(
    '/api/proxy-certs',
    asyncHandler(async (req, res) => {
      const record = asRecord(req.body, 'proxy-certs');
      const certs = parseProxyClientCerts(record.certs, 'certs');
      deps.proxyCerts.replace(certs);
      await deps.proxyCerts.flush();
      await deps.reloadProxy();
      res.json(deps.proxyCerts.snapshot());
    }),
  );

  router.get(
    '/api/devices',
    asyncHandler(async (_req, res) => {
      const [adb, android, xcrun, iosSimulators, iosDevices, macosProxy] = await Promise.all([
        adbStatus(),
        listAndroidDevices(),
        xcrunStatus(),
        listBootedSimulators(),
        listPhysicalIosDevices(),
        getMacProxyState(),
      ]);
      const snapshot: DevicesSnapshot = {
        android,
        iosSimulators,
        iosDevices,
        tooling: { adb, xcrun, macosProxy },
      };
      res.json(snapshot);
    }),
  );

  router.post(
    '/api/devices/android/:serial/setup',
    asyncHandler(async (req, res) => {
      const result = await setupAndroid(req.params.serial, {
        proxyPort: deps.proxyPort,
        apiPort: deps.apiPort,
        lanIp: getLanIp(),
        ca: deps.ca,
        locale: localeFromRequest(req),
      });
      res.json(result);
    }),
  );

  router.post(
    '/api/devices/android/:serial/teardown',
    asyncHandler(async (req, res) => {
      await teardownAndroid(req.params.serial, localeFromRequest(req));
      res.json({ ok: true });
    }),
  );

  router.post(
    '/api/devices/ios/:udid/install-cert',
    asyncHandler(async (req, res) => {
      res.json(await installSimCert(req.params.udid, localeFromRequest(req)));
    }),
  );

  router.post(
    '/api/devices/macos-proxy',
    asyncHandler(async (req, res) => {
      const record = asRecord(req.body, 'macos-proxy');
      if (typeof record.enabled !== 'boolean') badRequest('enabled must be a boolean');
      res.json(await setMacProxy(record.enabled, deps.proxyPort, localeFromRequest(req)));
    }),
  );

  router.post(
    '/api/logs/start',
    asyncHandler(async (req, res) => {
      const { target, packageFilter } = parseLogTarget(req.body);
      res.json(await deps.logcat.start(target, { packageFilter }));
    }),
  );

  router.post(
    '/api/logs/stop',
    asyncHandler(async (_req, res) => {
      res.json(await deps.logcat.stop());
    }),
  );

  router.delete('/api/logs', (_req, res) => {
    deps.logcat.clear();
    res.json({ ok: true });
  });

  router.get('/api/logs/status', (_req, res) => {
    res.json(deps.logcat.status);
  });

  router.get(
    '/api/apps',
    asyncHandler(async (req, res) => {
      const platform = parsePlatform(req.query.platform);
      const id = parseNonEmpty(req.query.id, 'id');
      res.json(await listApps(platform, id));
    }),
  );

  router.get(
    '/api/db/files',
    asyncHandler(async (req, res) => {
      const platform = parsePlatform(req.query.platform);
      const id = parseNonEmpty(req.query.id, 'id');
      const app = parseNonEmpty(req.query.app, 'app');
      res.json(await deps.db.listFiles(platform, id, app));
    }),
  );

  router.post(
    '/api/db/open',
    asyncHandler(async (req, res) => {
      const { platform, id, app, ref } = parseDbBody(req.body);
      res.json(await deps.db.open(platform, id, app, ref));
    }),
  );

  router.post(
    '/api/db/query',
    asyncHandler(async (req, res) => {
      const { platform, id, app, ref } = parseDbBody(req.body);
      const sql = parseNonEmpty(asRecord(req.body, 'request').sql, 'sql');
      try {
        res.json(await deps.db.query(platform, id, app, ref, sql));
      } catch (error) {
        badRequest(messageForError(error));
      }
    }),
  );

  router.get('/api/client', (_req, res) => {
    res.json(deps.apiClient.snapshot());
  });

  router.post('/api/client/workspaces', (req, res) => {
    const record = asRecord(req.body, 'workspace');
    const name = parseFolderName(record.name);
    const workspace = deps.apiClient.createWorkspace(name);
    res.json({ snapshot: deps.apiClient.snapshot(), id: workspace.id });
  });

  router.put('/api/client/workspaces/:id', (req, res) => {
    const record = asRecord(req.body, 'workspace');
    const patch: {
      name?: string;
      variables?: ApiKeyValue[];
      activeEnvironmentId?: string | null;
      clientCerts?: ApiClientCert[];
    } = {};
    if (record.name !== undefined) patch.name = parseFolderName(record.name);
    if (record.variables !== undefined) {
      patch.variables = parseKeyValueArray(record.variables, 'variables');
    }
    if ('activeEnvironmentId' in record) {
      patch.activeEnvironmentId = parseParentId(record.activeEnvironmentId);
    }
    if (record.clientCerts !== undefined) {
      patch.clientCerts = parseClientCerts(record.clientCerts, 'clientCerts');
    }
    deps.apiClient.updateWorkspace(req.params.id, patch);
    res.json(deps.apiClient.snapshot());
  });

  router.delete('/api/client/workspaces/:id', (req, res) => {
    deps.apiClient.deleteWorkspace(req.params.id);
    res.json(deps.apiClient.snapshot());
  });

  router.post('/api/client/folders', (req, res) => {
    const record = asRecord(req.body, 'folder');
    const workspaceId = parseNonEmpty(record.workspaceId, 'workspaceId');
    const name = parseFolderName(record.name);
    const parentId = parseParentId(record.parentId);
    const folder = deps.apiClient.createFolder(workspaceId, name, parentId);
    res.json({ snapshot: deps.apiClient.snapshot(), id: folder.id });
  });

  router.put('/api/client/folders/:id', (req, res) => {
    const record = asRecord(req.body, 'folder');
    const patch: { name?: string; parentId?: string | null } = {};
    if (record.name !== undefined) patch.name = parseFolderName(record.name);
    if ('parentId' in record) patch.parentId = parseParentId(record.parentId);
    deps.apiClient.updateFolder(req.params.id, patch);
    res.json(deps.apiClient.snapshot());
  });

  router.delete('/api/client/folders/:id', (req, res) => {
    deps.apiClient.deleteFolder(req.params.id);
    res.json(deps.apiClient.snapshot());
  });

  router.post('/api/client/requests', (req, res) => {
    const record = asRecord(req.body, 'request');
    const workspaceId = parseNonEmpty(record.workspaceId, 'workspaceId');
    const folderId = parseParentId(record.folderId);
    const request = deps.apiClient.createRequest(workspaceId, folderId);
    res.json({ snapshot: deps.apiClient.snapshot(), id: request.id });
  });

  router.put('/api/client/requests/:id', (req, res) => {
    deps.apiClient.updateRequest(req.params.id, parseRequestPatch(req.body));
    res.json(deps.apiClient.snapshot());
  });

  router.delete('/api/client/requests/:id', (req, res) => {
    deps.apiClient.deleteRequest(req.params.id);
    res.json(deps.apiClient.snapshot());
  });

  router.post('/api/client/environments', (req, res) => {
    const record = asRecord(req.body, 'environment');
    const workspaceId = parseNonEmpty(record.workspaceId, 'workspaceId');
    const name = parseFolderName(record.name);
    const environment = deps.apiClient.createEnvironment(workspaceId, name);
    res.json({ snapshot: deps.apiClient.snapshot(), id: environment.id });
  });

  router.put('/api/client/environments/:id', (req, res) => {
    const record = asRecord(req.body, 'environment');
    const patch: { name?: string; variables?: ApiKeyValue[] } = {};
    if (record.name !== undefined) patch.name = parseFolderName(record.name);
    if (record.variables !== undefined) {
      patch.variables = parseKeyValueArray(record.variables, 'variables');
    }
    deps.apiClient.updateEnvironment(req.params.id, patch);
    res.json(deps.apiClient.snapshot());
  });

  router.delete('/api/client/environments/:id', (req, res) => {
    deps.apiClient.deleteEnvironment(req.params.id);
    res.json(deps.apiClient.snapshot());
  });

  router.post(
    '/api/client/run',
    asyncHandler(async (req, res) => {
      const record = asRecord(req.body, 'run');
      const request = parseRunRequest(record.request);
      res.json(await runRequest(deps.apiClient, request));
    }),
  );

  router.get(
    '/setup',
    asyncHandler(async (req, res) => {
      const lanIp = getLanIp();
      const setupUrl = `http://${lanIp ?? 'localhost'}:${deps.apiPort}/setup`;
      const qrDataUrl = await QRCode.toDataURL(setupUrl, {
        margin: 1,
        width: 296,
        color: { dark: '#09090b', light: '#fafafa' },
      });
      res
        .type('html')
        .send(
          setupPageHtml({
            lanIp,
            proxyPort: deps.proxyPort,
            apiPort: deps.apiPort,
            fingerprint: deps.ca.fingerprint,
            qrDataUrl,
            locale: localeFromRequest(req),
          }),
        );
    }),
  );

  router.get('/cert.pem', (_req, res) => {
    res.type('text/plain').send(deps.ca.cert);
  });

  router.get('/cert.crt', (_req, res) => {
    res.setHeader('Content-Type', 'application/x-x509-ca-cert');
    res.setHeader('Content-Disposition', 'attachment; filename=frigg-ca.crt');
    res.send(Buffer.from(deps.ca.cert, 'utf8'));
  });

  router.get('/cert.der', (_req, res) => {
    res.setHeader('Content-Type', 'application/x-x509-ca-cert');
    res.setHeader('Content-Disposition', 'attachment; filename=frigg-ca.der');
    res.send(certToDer(deps.ca.cert));
  });

  router.get('/api/mcp/info', (_req, res) => {
    res.json(mcpServerInfo(deps.apiPort));
  });

  router.post(
    '/api/mcp/install/claude-code',
    asyncHandler(async (_req, res) => {
      const info = mcpServerInfo(deps.apiPort);
      if (!info.available) {
        res.json({ ok: false, message: 'The Frigg MCP server entry could not be located.' });
        return;
      }
      const envArgs = Object.entries(info.env).flatMap(([key, value]) => ['-e', `${key}=${value}`]);
      const result = await run('claude', [
        'mcp',
        'add',
        'frigg',
        ...envArgs,
        '--',
        info.command,
        ...info.args,
      ]);
      if (result.ok) {
        res.json({ ok: true, message: 'Added the Frigg MCP server to Claude Code.' });
        return;
      }
      const detail = result.stderr.trim() || result.stdout.trim();
      res.json({
        ok: false,
        message:
          result.code === null
            ? 'The Claude Code CLI (claude) was not found on PATH.'
            : detail || `claude mcp add failed (exit ${result.code}).`,
      });
    }),
  );

  router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = statusForError(error);
    if (status === 500) console.error(error);
    res.status(status).json({ error: messageForError(error) });
  });

  return router;
}
