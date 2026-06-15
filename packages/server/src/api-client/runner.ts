import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { Agent } from 'undici';
import type { ApiClientCert, ApiKeyValue, ApiRequest, ApiRunResult } from '@frigg/shared';
import { API_RESPONSE_LIMIT } from '@frigg/shared';
import type { ApiClientStore } from './store.ts';
import {
  runPreScript,
  runTestScript,
  type PreScriptRequest,
  type ResponseContext,
} from './scripts.ts';

const REQUEST_TIMEOUT_MS = 30000;

const INTERPOLATION_PATTERN = /\{\{\s*([\w.-]+)\s*\}\}/g;

export function interpolate(template: string, vars: Map<string, string>): string {
  return template.replace(INTERPOLATION_PATTERN, (_match, name: string) => vars.get(name) ?? '');
}

function mergeVariables(workspaceVars: ApiKeyValue[], envVars: ApiKeyValue[]): Map<string, string> {
  const merged = new Map<string, string>();
  for (const entry of workspaceVars) {
    if (entry.enabled) merged.set(entry.key, entry.value);
  }
  for (const entry of envVars) {
    if (entry.enabled) merged.set(entry.key, entry.value);
  }
  return merged;
}

function buildHeaderObject(headers: ApiKeyValue[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const header of headers) {
    if (header.enabled) result[header.key] = header.value;
  }
  return result;
}

function appendQuery(url: string, query: ApiKeyValue[], vars: Map<string, string>): string {
  const enabled = query.filter((entry) => entry.enabled);
  if (enabled.length === 0) return url;
  const parts = enabled.map((entry) => {
    const key = encodeURIComponent(interpolate(entry.key, vars));
    const value = encodeURIComponent(interpolate(entry.value, vars));
    return `${key}=${value}`;
  });
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${parts.join('&')}`;
}

function buildBody(
  request: ApiRequest,
  scriptBody: string,
  vars: Map<string, string>,
): { body: string | undefined; contentType: string | undefined } {
  if (scriptBody !== '') {
    return { body: interpolate(scriptBody, vars), contentType: undefined };
  }
  const mode = request.body.mode;
  if (mode === 'none') {
    return { body: undefined, contentType: undefined };
  }
  if (mode === 'form') {
    const enabled = request.body.form.filter((entry) => entry.enabled);
    const encoded = enabled
      .map((entry) => {
        const key = encodeURIComponent(interpolate(entry.key, vars));
        const value = encodeURIComponent(interpolate(entry.value, vars));
        return `${key}=${value}`;
      })
      .join('&');
    return { body: encoded, contentType: 'application/x-www-form-urlencoded' };
  }
  const raw = interpolate(request.body.raw, vars);
  if (mode === 'json') {
    return { body: raw, contentType: 'application/json' };
  }
  return { body: raw, contentType: undefined };
}

function flattenHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

function emptyResult(effectiveUrl: string): ApiRunResult {
  return {
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
    error: null,
    effectiveUrl,
  };
}

function findClientCert(clientCerts: ApiClientCert[], url: URL): ApiClientCert | undefined {
  if (url.protocol !== 'https:') return undefined;
  const host = url.host.toLowerCase();
  const hostname = url.hostname.toLowerCase();
  return clientCerts.find((cert) => {
    const candidate = cert.host.trim().toLowerCase();
    return candidate === host || candidate === hostname;
  });
}

async function buildClientCertAgent(cert: ApiClientCert): Promise<Agent> {
  const [certPem, keyPem, caPem] = await Promise.all([
    readFile(cert.certPath),
    readFile(cert.keyPath),
    cert.caPath !== undefined ? readFile(cert.caPath) : Promise.resolve(undefined),
  ]);
  const connect: {
    cert: Buffer;
    key: Buffer;
    ca?: Buffer;
    passphrase?: string;
  } = { cert: certPem, key: keyPem };
  if (caPem !== undefined) connect.ca = caPem;
  if (cert.passphrase !== undefined) connect.passphrase = cert.passphrase;
  return new Agent({ connect });
}

export async function runRequest(store: ApiClientStore, request: ApiRequest): Promise<ApiRunResult> {
  const snapshot = store.snapshot();
  const workspace = snapshot.workspaces.find((candidate) => candidate.id === request.workspaceId);
  const workspaceVars = workspace?.variables ?? [];
  const activeEnvironment =
    workspace && workspace.activeEnvironmentId !== null
      ? snapshot.environments.find(
          (environment) => environment.id === workspace.activeEnvironmentId,
        )
      : undefined;
  const vars = mergeVariables(workspaceVars, activeEnvironment?.variables ?? []);

  const preRequest: PreScriptRequest = {
    method: request.method,
    url: request.url,
    headers: buildHeaderObject(request.headers),
    body: '',
  };
  const pre = runPreScript(request.preScript, { request: preRequest, vars });
  const scriptLogs = [...pre.logs];
  const envChanges = new Map(pre.envChanges);

  const finalUrlBase = interpolate(preRequest.url, vars);
  const effectiveUrl = appendQuery(finalUrlBase, request.query, vars);

  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(preRequest.headers)) {
    headers[key] = interpolate(value, vars);
  }

  const { body, contentType } = buildBody(request, preRequest.body, vars);
  if (contentType !== undefined && !hasHeader(headers, 'content-type')) {
    headers['Content-Type'] = contentType;
  }

  const method = preRequest.method.toUpperCase();
  const hasBody = body !== undefined && method !== 'GET' && method !== 'HEAD';

  const start = Date.now();

  let clientCert: ApiClientCert | undefined;
  try {
    clientCert = findClientCert(workspace?.clientCerts ?? [], new URL(effectiveUrl));
  } catch {
    clientCert = undefined;
  }

  let agent: Agent | undefined;
  if (clientCert) {
    try {
      agent = await buildClientCertAgent(clientCert);
    } catch (error) {
      const fsMessage = error instanceof Error ? error.message : String(error);
      const result = emptyResult(effectiveUrl);
      result.durationMs = Date.now() - start;
      result.scriptLogs = scriptLogs;
      result.error = `client certificate for ${clientCert.host}: ${fsMessage}`;
      await persistEnvChanges(store, request.workspaceId, envChanges);
      return result;
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const fetchInit: RequestInit = {
    method,
    headers,
    body: hasBody ? body : undefined,
    redirect: 'follow',
    signal: controller.signal,
  };

  let response: Response;
  try {
    response = await fetch(
      effectiveUrl,
      agent
        ? ({ ...fetchInit, dispatcher: agent } as RequestInit & {
            dispatcher: import('undici').Dispatcher;
          })
        : fetchInit,
    );
  } catch (error) {
    clearTimeout(timer);
    void agent?.close();
    const result = emptyResult(effectiveUrl);
    result.durationMs = Date.now() - start;
    result.scriptLogs = scriptLogs;
    result.error = error instanceof Error ? error.message : String(error);
    await persistEnvChanges(store, request.workspaceId, envChanges);
    return result;
  }
  clearTimeout(timer);

  let rawBuffer: Buffer;
  try {
    rawBuffer = Buffer.from(await response.arrayBuffer());
  } catch (error) {
    void agent?.close();
    const result = emptyResult(response.url || effectiveUrl);
    result.status = response.status;
    result.statusText = response.statusText;
    result.headers = flattenHeaders(response.headers);
    result.durationMs = Date.now() - start;
    result.scriptLogs = scriptLogs;
    result.error = error instanceof Error ? error.message : String(error);
    await persistEnvChanges(store, request.workspaceId, envChanges);
    return result;
  }
  void agent?.close();

  const durationMs = Date.now() - start;
  const sizeBytes = rawBuffer.length;
  const bodyTruncated = sizeBytes > API_RESPONSE_LIMIT;
  const bodyText = rawBuffer.subarray(0, API_RESPONSE_LIMIT).toString('utf8');

  const responseContext: ResponseContext = {
    code: response.status,
    status: response.statusText,
    responseTime: durationMs,
    headers: flattenHeaders(response.headers),
    text: bodyText,
  };

  const test = runTestScript(request.testScript, { vars, response: responseContext });
  scriptLogs.push(...test.logs);
  for (const [key, value] of test.envChanges) {
    envChanges.set(key, value);
  }

  await persistEnvChanges(store, request.workspaceId, envChanges);

  return {
    ok: response.status >= 200 && response.status < 400,
    status: response.status,
    statusText: response.statusText,
    headers: responseContext.headers,
    bodyText,
    bodyTruncated,
    durationMs,
    sizeBytes,
    scriptLogs,
    tests: test.tests,
    error: null,
    effectiveUrl: response.url || effectiveUrl,
  };
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const lower = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === lower);
}

async function persistEnvChanges(
  store: ApiClientStore,
  workspaceId: string,
  envChanges: Map<string, string | null>,
): Promise<void> {
  store.applyEnvironmentVariables(workspaceId, envChanges);
  await store.flush();
}
