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
import type { BodyPayload, CapturedRequest, CapturedResponse } from '@frigg/shared';
import type { MatchInput } from '../mocks/matcher.ts';
import type { MockStore } from '../mocks/store.ts';
import type { CaMaterial } from './ca.ts';
import type { TrafficStore } from './traffic-store.ts';

export interface EngineDeps {
  proxyPort: number;
  ca: CaMaterial;
  mocks: MockStore;
  traffic: TrafficStore;
}

export class ProxyEngine {
  private readonly deps: EngineDeps;
  private server: Mockttp | null = null;
  private readonly mockedRuleIdByRequestId = new Map<string, string>();
  private readonly pendingRequestCaptures = new Map<string, Promise<void>>();

  constructor(deps: EngineDeps) {
    this.deps = deps;
  }

  async start(): Promise<void> {
    if (this.server) return;
    const server = getLocal({
      https: { key: this.deps.ca.key, cert: this.deps.ca.cert },
      recordTraffic: false,
    });
    await server.forAnyRequest().thenPassThrough({
      beforeRequest: async (req) => {
        try {
          return (await this.resolveMockResponse(req)) ?? {};
        } catch {
          return {};
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
    await server.start(this.deps.proxyPort);
    this.server = server;
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    const server = this.server;
    this.server = null;
    await server.stop();
    this.mockedRuleIdByRequestId.clear();
    this.pendingRequestCaptures.clear();
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

interface UrlParts {
  host: string;
  path: string;
  query: string;
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
