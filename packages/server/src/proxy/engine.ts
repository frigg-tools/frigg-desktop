import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { getLocal } from 'mockttp';
import type {
  AbortedRequest,
  CompletedBody,
  CompletedRequest,
  CompletedResponse,
  Headers,
  Mockttp,
} from 'mockttp';
import { BODY_CAPTURE_LIMIT } from '@frigg/shared';
import type {
  ApiKeyValue,
  BodyPayload,
  CapturedRequest,
  CapturedResponse,
  PausedRequestData,
  PausedResponseData,
} from '@frigg/shared';
import type { MatchInput } from '../mocks/matcher.ts';
import type { MockStore } from '../mocks/store.ts';
import type { BreakpointManager } from './breakpoint-manager.ts';
import type { CaMaterial } from './ca.ts';
import type { ProxyCertStore } from './proxy-cert-store.ts';
import type { TrafficStore } from './traffic-store.ts';

export interface EngineDeps {
  proxyPort: number;
  ca: CaMaterial;
  mocks: MockStore;
  traffic: TrafficStore;
  breakpoints: BreakpointManager;
  proxyCerts: ProxyCertStore;
}

interface ClientCertificateHostEntry {
  pfx: Buffer;
  passphrase?: string;
}

export class ProxyEngine {
  private readonly deps: EngineDeps;
  private server: Mockttp | null = null;
  private boundPort = 0;
  private reloading: Promise<void> | null = null;
  private readonly mockedRuleIdByRequestId = new Map<string, string>();
  private readonly pendingRequestCaptures = new Map<string, Promise<void>>();

  constructor(deps: EngineDeps) {
    this.deps = deps;
  }

  get port(): number {
    return this.boundPort;
  }

  async start(): Promise<void> {
    if (this.server) return;
    const preferred = this.boundPort !== 0 ? this.boundPort : this.deps.proxyPort;
    let server: Mockttp;
    try {
      server = await this.buildAndStart(preferred);
    } catch (error) {
      if (this.boundPort !== 0 || !isAddrInUse(error)) throw error;
      server = await this.buildAndStart(0);
    }
    this.boundPort = server.port;
    this.server = server;
  }

  private async buildAndStart(port: number): Promise<Mockttp> {
    const server = getLocal({
      https: { key: this.deps.ca.key, cert: this.deps.ca.cert },
      recordTraffic: false,
    });
    await server.forAnyRequest().thenPassThrough({
      clientCertificateHostMap: this.buildClientCertificateHostMap(),
      beforeRequest: async (req) => {
        try {
          const breakpointResult = await this.resolveBreakpointRequest(req);
          if (breakpointResult) return breakpointResult;
          return (await this.resolveMockResponse(req)) ?? {};
        } catch {
          return {};
        }
      },
      beforeResponse: async (res, req) => {
        try {
          return await this.resolveBreakpointResponse(res, req);
        } catch {
          return undefined;
        }
      },
    });
    await server.on('request', (req) => {
      this.trackRequest(req);
    });
    await server.on('response', (res) => {
      void this.captureResponse(res).catch(() => {});
    });
    await server.on('abort', (req) => {
      void this.captureAbort(req).catch(() => {});
    });
    try {
      await server.start(port);
    } catch (error) {
      await server.stop().catch(() => undefined);
      throw error;
    }
    return server;
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    const server = this.server;
    this.server = null;
    this.deps.breakpoints.releaseAll();
    await server.stop();
    this.mockedRuleIdByRequestId.clear();
    this.pendingRequestCaptures.clear();
  }

  async reload(): Promise<void> {
    if (this.reloading) return this.reloading;
    this.reloading = this.runReload();
    try {
      await this.reloading;
    } finally {
      this.reloading = null;
    }
  }

  private async runReload(): Promise<void> {
    await this.stop();
    await this.start();
  }

  private buildClientCertificateHostMap(): Record<string, ClientCertificateHostEntry> {
    const map: Record<string, ClientCertificateHostEntry> = {};
    for (const cert of this.deps.proxyCerts.snapshot().certs) {
      let pfx: Buffer;
      try {
        pfx = readFileSync(cert.pfxPath);
      } catch {
        continue;
      }
      const hostKey = cert.host.includes(':') ? cert.host : `${cert.host}:443`;
      map[hostKey] = { pfx, passphrase: cert.passphrase };
    }
    return map;
  }

  private async resolveMockResponse(req: CompletedRequest) {
    const rule = this.deps.mocks.match(await toMatchInput(req));
    if (!rule) return undefined;
    this.deps.mocks.recordHit(rule.id);
    this.mockedRuleIdByRequestId.set(req.id, rule.id);
    const delayMs = rule.response.delayMs ?? 0;
    if (delayMs > 0) await delay(delayMs);
    return {
      response: {
        statusCode: rule.response.statusCode,
        headers: rule.response.headers,
        body: rule.response.body,
      },
    };
  }

  private async resolveBreakpointRequest(req: CompletedRequest) {
    const rule = this.deps.breakpoints.matchRule(req.method, req.url, 'request');
    if (!rule) return undefined;
    const data: PausedRequestData = {
      method: req.method,
      url: req.url,
      headers: collapseHeaders(req.headers),
      body: (await safeGetText(req.body)) ?? '',
      bodyTruncated: false,
    };
    const result = await this.deps.breakpoints.pauseRequest(rule.id, data);
    switch (result.action) {
      case 'send-request':
        return {
          method: result.edit.method,
          url: result.edit.url,
          headers: kvToRecord(result.edit.headers),
          body: result.edit.body,
        };
      case 'respond':
        return {
          response: {
            statusCode: result.response.statusCode,
            headers: kvToRecord(result.response.headers),
            body: result.response.body,
          },
        };
      case 'abort':
        return { response: 'close' as const };
      default:
        return {};
    }
  }

  private async resolveBreakpointResponse(res: BreakpointResponseInput, req: CompletedRequest) {
    const rule = this.deps.breakpoints.matchRule(req.method, req.url, 'response');
    if (!rule) return undefined;
    const requestData: PausedRequestData = {
      method: req.method,
      url: req.url,
      headers: collapseHeaders(req.headers),
      body: (await safeGetText(req.body)) ?? '',
      bodyTruncated: false,
    };
    const responseData: PausedResponseData = {
      statusCode: res.statusCode,
      statusMessage: res.statusMessage,
      headers: collapseHeaders(res.headers),
      body: (await safeGetText(res.body)) ?? '',
      bodyTruncated: false,
    };
    const result = await this.deps.breakpoints.pauseResponse(rule.id, requestData, responseData);
    switch (result.action) {
      case 'send-response':
        return {
          statusCode: result.edit.statusCode,
          headers: kvToRecord(result.edit.headers),
          body: result.edit.body,
        };
      case 'abort':
        return 'close' as const;
      default:
        return undefined;
    }
  }

  private trackRequest(req: CompletedRequest): void {
    this.pendingRequestCaptures.set(
      req.id,
      this.captureRequest(req).catch(() => {}),
    );
  }

  private async captureRequest(req: CompletedRequest): Promise<void> {
    const parts = requestUrlParts(req);
    const captured: CapturedRequest = {
      id: req.id,
      timestamp: req.timingEvents.startTime,
      method: req.method,
      url: req.url,
      protocol: req.protocol === 'https' ? 'https' : 'http',
      host: parts.host,
      path: parts.path,
      query: parts.query,
      headers: toHeaderRecord(req.headers),
      body: await captureBody(req.body),
      clientAddress: req.remoteIpAddress,
    };
    this.deps.traffic.addRequest(captured);
  }

  private async captureResponse(res: CompletedResponse): Promise<void> {
    await this.pendingRequestCaptures.get(res.id);
    this.pendingRequestCaptures.delete(res.id);
    const mockRuleId = this.mockedRuleIdByRequestId.get(res.id);
    this.mockedRuleIdByRequestId.delete(res.id);
    const captured: CapturedResponse = {
      id: res.id,
      timestamp: Date.now(),
      statusCode: res.statusCode,
      statusMessage: res.statusMessage,
      headers: toHeaderRecord(res.headers),
      body: await captureBody(res.body),
      mockRuleId,
      durationMs: responseDurationMs(res),
    };
    this.deps.traffic.completeResponse(captured);
  }

  private async captureAbort(req: AbortedRequest): Promise<void> {
    await this.pendingRequestCaptures.get(req.id);
    this.pendingRequestCaptures.delete(req.id);
    this.mockedRuleIdByRequestId.delete(req.id);
    const reason = req.error?.message ?? req.error?.code ?? req.error?.name;
    this.deps.traffic.abort(req.id, reason);
  }
}

function isAddrInUse(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = (error as NodeJS.ErrnoException).code;
  if (code === 'EADDRINUSE') return true;
  return /EADDRINUSE|address already in use/i.test(String((error as Error).message ?? ''));
}

interface BreakpointResponseInput {
  statusCode: number;
  statusMessage?: string;
  headers: Headers;
  body: CompletedBody;
}

interface UrlParts {
  host: string;
  path: string;
  query: string;
}

function collapseHeaders(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    record[name] = Array.isArray(value) ? value.join(', ') : value;
  }
  return record;
}

function kvToRecord(rows: ApiKeyValue[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (const row of rows) {
    if (row.enabled === false) continue;
    if (row.key.trim() === '') continue;
    record[row.key] = row.value;
  }
  return record;
}

function explicitHost(headers: Headers): string | undefined {
  const host = headers.host ?? headers[':authority'];
  return typeof host === 'string' && host.length > 0 ? host : undefined;
}

function requestUrlParts(req: CompletedRequest): UrlParts {
  const headerHost = explicitHost(req.headers);
  try {
    const url = new URL(req.url);
    return {
      host: headerHost ?? url.host,
      path: url.pathname,
      query: url.search.slice(1),
    };
  } catch {
    const queryIndex = req.path.indexOf('?');
    return {
      host: headerHost ?? req.destination.hostname,
      path: queryIndex === -1 ? req.path : req.path.slice(0, queryIndex),
      query: queryIndex === -1 ? '' : req.path.slice(queryIndex + 1),
    };
  }
}

async function toMatchInput(req: CompletedRequest): Promise<MatchInput> {
  const parts = requestUrlParts(req);
  const bodyText = (await safeGetText(req.body)) ?? '';
  return {
    method: req.method,
    host: parts.host,
    path: parts.path,
    query: parts.query,
    bodyText,
  };
}

async function safeGetText(body: CompletedBody): Promise<string | undefined> {
  try {
    return await body.getText();
  } catch {
    return undefined;
  }
}

async function captureBody(body: CompletedBody): Promise<BodyPayload> {
  if (body.buffer.length === 0) {
    return { encoding: 'utf8', data: '', size: 0, truncated: false };
  }
  const text = await safeGetText(body);
  if (text !== undefined) {
    const size = Buffer.byteLength(text, 'utf8');
    if (size <= BODY_CAPTURE_LIMIT) {
      return { encoding: 'utf8', data: text, size, truncated: false };
    }
    const cappedText = truncateUtf8(Buffer.from(text, 'utf8'), BODY_CAPTURE_LIMIT);
    return { encoding: 'utf8', data: cappedText, size, truncated: true };
  }
  const truncated = body.buffer.length > BODY_CAPTURE_LIMIT;
  const capturedBytes = truncated ? body.buffer.subarray(0, BODY_CAPTURE_LIMIT) : body.buffer;
  return {
    encoding: 'base64',
    data: capturedBytes.toString('base64'),
    size: body.buffer.length,
    truncated,
  };
}

function truncateUtf8(buffer: Buffer, maxBytes: number): string {
  let end = Math.min(maxBytes, buffer.length);
  while (end > 0 && (buffer[end] & 0xc0) === 0x80) {
    end -= 1;
  }
  return buffer.subarray(0, end).toString('utf8');
}

function toHeaderRecord(headers: Headers): Record<string, string | string[]> {
  const record: Record<string, string | string[]> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined) record[name] = value;
  }
  return record;
}

function responseDurationMs(res: CompletedResponse): number {
  const { startTime, startTimestamp, responseSentTimestamp } = res.timingEvents;
  if (responseSentTimestamp !== undefined) {
    return Math.max(0, Math.round(responseSentTimestamp - startTimestamp));
  }
  return Math.max(0, Date.now() - startTime);
}
