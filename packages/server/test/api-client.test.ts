import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ApiClientStore } from '../src/api-client/store.ts';
import { interpolate } from '../src/api-client/runner.ts';
import {
  runPreScript,
  runTestScript,
  type PreScriptContext,
  type ResponseContext,
  type TestScriptContext,
} from '../src/api-client/scripts.ts';

let tempDir: string;
let storePath: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'frigg-apiclient-'));
  storePath = join(tempDir, 'nested', 'api-client.json');
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function preContext(): PreScriptContext {
  return {
    request: { method: 'GET', url: 'https://api.test/login', headers: {}, body: '' },
    vars: new Map<string, string>(),
  };
}

function responseContext(overrides: Partial<ResponseContext> = {}): ResponseContext {
  return {
    code: 200,
    status: 'OK',
    responseTime: 12,
    headers: { 'content-type': 'application/json' },
    text: '{"token":"abc","items":[1,2]}',
    ...overrides,
  };
}

function testContext(response: ResponseContext): TestScriptContext {
  return { vars: new Map<string, string>(), response };
}

describe('scripts: pre-request', () => {
  it('persists pm.environment.set into envChanges and the merged vars', () => {
    const ctx = preContext();
    const result = runPreScript("pm.environment.set('token', 'xyz');", ctx);
    expect(result.envChanges.get('token')).toBe('xyz');
    expect(ctx.vars.get('token')).toBe('xyz');
  });

  it('records unset as null in envChanges', () => {
    const ctx = preContext();
    ctx.vars.set('token', 'old');
    const result = runPreScript("pm.environment.unset('token');", ctx);
    expect(result.envChanges.get('token')).toBeNull();
    expect(ctx.vars.has('token')).toBe(false);
  });

  it('mutates the request object so the runner can read it back', () => {
    const ctx = preContext();
    const code = [
      "pm.request.method = 'POST';",
      "pm.request.headers['Authorization'] = 'Bearer t';",
      "pm.request.body = JSON.stringify({ a: 1 });",
      "pm.request.url = 'https://api.test/v2';",
    ].join('\n');
    runPreScript(code, ctx);
    expect(ctx.request.method).toBe('POST');
    expect(ctx.request.headers.Authorization).toBe('Bearer t');
    expect(ctx.request.body).toBe('{"a":1}');
    expect(ctx.request.url).toBe('https://api.test/v2');
  });

  it('captures console output and thrown errors into logs without throwing', () => {
    const ctx = preContext();
    const result = runPreScript("console.log('hello'); throw new Error('boom');", ctx);
    expect(result.logs.some((line) => line.includes('hello'))).toBe(true);
    expect(result.logs.some((line) => line.includes('boom'))).toBe(true);
  });

  it('reads merged vars via pm.variables.get', () => {
    const ctx = preContext();
    ctx.vars.set('base', 'https://api');
    const result = runPreScript("console.log(pm.variables.get('base'));", ctx);
    expect(result.logs.some((line) => line.includes('https://api'))).toBe(true);
  });
});

describe('scripts: test', () => {
  it('records passing and failing pm.test results', () => {
    const ctx = testContext(responseContext());
    const code = [
      "pm.test('status is 200', () => { pm.expect(pm.response.code).toBe(200); });",
      "pm.test('wrong status', () => { pm.expect(pm.response.code).toBe(500); });",
    ].join('\n');
    const result = runTestScript(code, ctx);
    expect(result.tests).toHaveLength(2);
    expect(result.tests[0]).toEqual({ name: 'status is 200', passed: true });
    expect(result.tests[1]?.passed).toBe(false);
    expect(result.tests[1]?.error).toContain('to be');
  });

  it('pm.expect chain throws on mismatch and passes on match', () => {
    const ctx = testContext(responseContext());
    const code = [
      "pm.test('toEqual deep', () => { pm.expect(pm.response.json().items).toEqual([1,2]); });",
      "pm.test('toBeTruthy', () => { pm.expect(pm.response.json().token).toBeTruthy(); });",
      "pm.test('toBeNull fails', () => { pm.expect(pm.response.code).toBeNull(); });",
    ].join('\n');
    const result = runTestScript(code, ctx);
    expect(result.tests[0]?.passed).toBe(true);
    expect(result.tests[1]?.passed).toBe(true);
    expect(result.tests[2]?.passed).toBe(false);
  });

  it('json() throws a friendly error when the body is not JSON', () => {
    const ctx = testContext(responseContext({ text: 'not json' }));
    const code = "pm.test('parse', () => { pm.response.json(); });";
    const result = runTestScript(code, ctx);
    expect(result.tests[0]?.passed).toBe(false);
    expect(result.tests[0]?.error).toContain('not valid JSON');
  });

  it('records a synthetic script error test when the script throws at top level', () => {
    const ctx = testContext(responseContext());
    const result = runTestScript('throw new Error("top level");', ctx);
    expect(result.tests).toHaveLength(1);
    expect(result.tests[0]).toEqual({
      name: 'script error',
      passed: false,
      error: 'top level',
    });
  });

  it('exposes pm.environment.set from the test script', () => {
    const ctx = testContext(responseContext());
    const result = runTestScript("pm.environment.set('token', pm.response.json().token);", ctx);
    expect(result.envChanges.get('token')).toBe('abc');
  });
});

describe('runner interpolation', () => {
  it('replaces {{var}} tokens from the vars map', () => {
    const vars = new Map([
      ['token', 'secret'],
      ['host', 'api.test'],
    ]);
    expect(interpolate('https://{{host}}/me?t={{ token }}', vars)).toBe(
      'https://api.test/me?t=secret',
    );
  });

  it('replaces unknown variables with an empty string', () => {
    const vars = new Map<string, string>();
    expect(interpolate('Bearer {{missing}}', vars)).toBe('Bearer ');
  });
});

describe('store seeding and cascade', () => {
  it('seeds one workspace and one active default environment when empty', async () => {
    const store = await ApiClientStore.load(storePath);
    const snapshot = store.snapshot();
    expect(snapshot.workspaces).toHaveLength(1);
    expect(snapshot.workspaces[0]?.name).toBe('My Workspace');
    expect(snapshot.environments).toHaveLength(1);
    expect(snapshot.environments[0]?.name).toBe('Default');
    expect(snapshot.environments[0]?.variables).toEqual([]);
    expect(snapshot.workspaces[0]?.activeEnvironmentId).toBe(snapshot.environments[0]?.id);
  });

  it('createRequest returns a blank request with sensible defaults', async () => {
    const store = await ApiClientStore.load(storePath);
    const workspaceId = store.snapshot().workspaces[0]!.id;
    const request = store.createRequest(workspaceId, null);
    expect(request.name).toBe('New request');
    expect(request.method).toBe('GET');
    expect(request.url).toBe('');
    expect(request.query).toEqual([]);
    expect(request.headers).toEqual([]);
    expect(request.body).toEqual({ mode: 'none', raw: '', form: [] });
    expect(request.preScript).toBe('');
    expect(request.testScript).toBe('');
  });

  it('deleteFolder reparents child folders and requests to the parent', async () => {
    const store = await ApiClientStore.load(storePath);
    const workspaceId = store.snapshot().workspaces[0]!.id;
    const root = store.createFolder(workspaceId, 'root', null);
    const middle = store.createFolder(workspaceId, 'middle', root.id);
    const leaf = store.createFolder(workspaceId, 'leaf', middle.id);
    const requestInMiddle = store.createRequest(workspaceId, middle.id);
    const requestInLeaf = store.createRequest(workspaceId, leaf.id);
    store.deleteFolder(middle.id);
    const snapshot = store.snapshot();
    expect(snapshot.folders.map((folder) => folder.id)).toEqual([root.id, leaf.id]);
    expect(snapshot.folders.find((folder) => folder.id === leaf.id)?.parentId).toBe(root.id);
    expect(snapshot.requests.find((req) => req.id === requestInMiddle.id)?.folderId).toBe(root.id);
    expect(snapshot.requests.find((req) => req.id === requestInLeaf.id)?.folderId).toBe(leaf.id);
  });

  it('deleteWorkspace cascades folders, requests and environments', async () => {
    const store = await ApiClientStore.load(storePath);
    const workspaceId = store.snapshot().workspaces[0]!.id;
    const folder = store.createFolder(workspaceId, 'f', null);
    store.createRequest(workspaceId, folder.id);
    store.createEnvironment(workspaceId, 'staging');
    const other = store.createWorkspace('keep');
    const keptFolder = store.createFolder(other.id, 'kept', null);
    store.deleteWorkspace(workspaceId);
    const snapshot = store.snapshot();
    expect(snapshot.workspaces.map((workspace) => workspace.id)).toEqual([other.id]);
    expect(snapshot.folders).toEqual([
      expect.objectContaining({ id: keptFolder.id, workspaceId: other.id }),
    ]);
    expect(snapshot.requests.every((req) => req.workspaceId === other.id)).toBe(true);
    expect(snapshot.environments.every((env) => env.workspaceId === other.id)).toBe(true);
  });

  it('clears activeEnvironmentId when the active environment is deleted', async () => {
    const store = await ApiClientStore.load(storePath);
    const workspace = store.snapshot().workspaces[0]!;
    const activeId = workspace.activeEnvironmentId!;
    store.deleteEnvironment(activeId);
    expect(store.snapshot().workspaces[0]?.activeEnvironmentId).toBeNull();
  });

  it('throws not found for unknown ids', async () => {
    const store = await ApiClientStore.load(storePath);
    expect(() => store.deleteRequest('missing')).toThrowError('not found');
    expect(() => store.updateFolder('missing', { name: 'x' })).toThrowError('not found');
    expect(() => store.deleteWorkspace('missing')).toThrowError('not found');
  });

  it('round-trips through disk', async () => {
    const store = await ApiClientStore.load(storePath);
    const workspaceId = store.snapshot().workspaces[0]!.id;
    store.createFolder(workspaceId, 'apis', null);
    store.createRequest(workspaceId, null);
    await store.flush();
    const reloaded = await ApiClientStore.load(storePath);
    expect(reloaded.snapshot()).toEqual(store.snapshot());
  });
});

describe('store applyEnvironmentVariables', () => {
  it('writes script env changes into the active environment', async () => {
    const store = await ApiClientStore.load(storePath);
    const workspace = store.snapshot().workspaces[0]!;
    store.applyEnvironmentVariables(
      workspace.id,
      new Map<string, string | null>([['token', 'abc']]),
    );
    const env = store.snapshot().environments.find((e) => e.id === workspace.activeEnvironmentId);
    expect(env?.variables).toEqual([{ key: 'token', value: 'abc', enabled: true }]);
  });

  it('falls back to workspace variables when no active environment', async () => {
    const store = await ApiClientStore.load(storePath);
    const workspace = store.snapshot().workspaces[0]!;
    store.updateWorkspace(workspace.id, { activeEnvironmentId: null });
    store.applyEnvironmentVariables(
      workspace.id,
      new Map<string, string | null>([['base', 'https://api']]),
    );
    expect(store.snapshot().workspaces[0]?.variables).toEqual([
      { key: 'base', value: 'https://api', enabled: true },
    ]);
  });

  it('removes a variable when the change value is null', async () => {
    const store = await ApiClientStore.load(storePath);
    const workspace = store.snapshot().workspaces[0]!;
    store.applyEnvironmentVariables(workspace.id, new Map([['token', 'abc']]));
    store.applyEnvironmentVariables(workspace.id, new Map([['token', null]]));
    const env = store.snapshot().environments.find((e) => e.id === workspace.activeEnvironmentId);
    expect(env?.variables).toEqual([]);
  });
});
