import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import QRCode from 'qrcode';
import type {
  BodyMatchMode,
  DevicesSnapshot,
  LogPlatform,
  LogTarget,
  MockMatcher,
  MockResponseSpec,
  MockRuleInput,
  ProxyStatus,
} from '@frigg/shared';
import { listApps } from '../devices/apps.ts';
import { adbStatus, listAndroidDevices, setupAndroid, teardownAndroid } from '../devices/android.ts';
import { installSimCert, listBootedSimulators, xcrunStatus } from '../devices/ios.ts';
import { getMacProxyState, setMacProxy } from '../devices/macos-proxy.ts';
import type { DbInspector } from '../db/index.ts';
import { serverLocale, type ServerLocale } from '../i18n.ts';
import { getLanIp } from '../lib/net.ts';
import type { LogcatManager } from '../logcat/index.ts';
import type { MockStore } from '../mocks/store.ts';
import { certToDer, type CaMaterial } from '../proxy/ca.ts';
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

  router.get(
    '/api/devices',
    asyncHandler(async (_req, res) => {
      const [adb, android, xcrun, iosSimulators, macosProxy] = await Promise.all([
        adbStatus(),
        listAndroidDevices(),
        xcrunStatus(),
        listBootedSimulators(),
        getMacProxyState(),
      ]);
      const snapshot: DevicesSnapshot = {
        android,
        iosSimulators,
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

  router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = statusForError(error);
    if (status === 500) console.error(error);
    res.status(status).json({ error: messageForError(error) });
  });

  return router;
}
