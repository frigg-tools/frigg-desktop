import type {
  ApiClientSnapshot,
  ApiEnvironment,
  ApiFolder,
  ApiKeyValue,
  ApiRequest,
  ApiRunResult,
  ApiWorkspace,
  CollectionRunResult,
  CollectionRunStep,
  LoginResult,
} from '@frigg/shared';
import type { ApiClientStore } from './store.ts';
import { runRequest } from './runner.ts';

export interface RunCollectionOptions {
  stopOnError?: boolean;
}

const TOKEN_FIELDS = ['access_token', 'accessToken', 'token', 'jwt', 'id_token'];
const REFRESH_FIELDS = ['refresh_token', 'refreshToken'];

function childFolders(folders: ApiFolder[], parentId: string | null): ApiFolder[] {
  return folders.filter((folder) => folder.parentId === parentId);
}

function descendantFolderIds(folders: ApiFolder[], rootId: string): Set<string> {
  const ids = new Set<string>([rootId]);
  const queue: string[] = [rootId];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const child of childFolders(folders, current)) {
      if (!ids.has(child.id)) {
        ids.add(child.id);
        queue.push(child.id);
      }
    }
  }
  return ids;
}

function requestsInFolder(requests: ApiRequest[], folderId: string | null): ApiRequest[] {
  return requests.filter((request) => request.folderId === folderId);
}

function gatherRequests(
  snapshot: ApiClientSnapshot,
  workspaceId: string,
  folderId: string | null,
): ApiRequest[] {
  const folders = snapshot.folders.filter((folder) => folder.workspaceId === workspaceId);
  const requests = snapshot.requests.filter((request) => request.workspaceId === workspaceId);

  if (folderId === null) {
    const ordered: ApiRequest[] = [...requestsInFolder(requests, null)];
    const walk = (parentId: string | null): void => {
      for (const folder of childFolders(folders, parentId)) {
        ordered.push(...requestsInFolder(requests, folder.id));
        walk(folder.id);
      }
    };
    walk(null);
    return ordered;
  }

  const includedFolderIds = descendantFolderIds(folders, folderId);
  const ordered: ApiRequest[] = [];
  const walk = (currentId: string): void => {
    ordered.push(...requestsInFolder(requests, currentId));
    for (const child of childFolders(folders, currentId)) {
      if (includedFolderIds.has(child.id)) walk(child.id);
    }
  };
  walk(folderId);
  return ordered;
}

function stepFromResult(request: ApiRequest, result: ApiRunResult): CollectionRunStep {
  const testsPassed = result.tests.every((test) => test.passed);
  return {
    requestId: request.id,
    name: request.name,
    method: request.method,
    url: result.effectiveUrl,
    ok: result.ok && testsPassed,
    status: result.status,
    durationMs: result.durationMs,
    tests: result.tests,
    error: result.error,
    skipped: false,
  };
}

function skippedStep(request: ApiRequest): CollectionRunStep {
  return {
    requestId: request.id,
    name: request.name,
    method: request.method,
    url: request.url,
    ok: false,
    status: 0,
    durationMs: 0,
    tests: [],
    error: null,
    skipped: true,
  };
}

export async function runCollection(
  store: ApiClientStore,
  workspaceId: string,
  folderId: string | null,
  opts: RunCollectionOptions = {},
): Promise<CollectionRunResult> {
  const snapshot = store.snapshot();
  const requests = gatherRequests(snapshot, workspaceId, folderId);
  const stopOnError = opts.stopOnError === true;

  const steps: CollectionRunStep[] = [];
  const startedAt = Date.now();
  let stopped = false;

  for (const request of requests) {
    if (stopped) {
      steps.push(skippedStep(request));
      continue;
    }
    const result = await runRequest(store, request);
    const step = stepFromResult(request, result);
    steps.push(step);
    if (stopOnError && !step.ok) {
      stopped = true;
    }
  }

  const finishedAt = Date.now();
  const ran = steps.filter((step) => !step.skipped);
  const passed = ran.filter((step) => step.ok).length;
  const failed = ran.filter((step) => !step.ok).length;

  return { workspaceId, folderId, startedAt, finishedAt, steps, passed, failed };
}

function activeVariableMap(snapshot: ApiClientSnapshot, workspace: ApiWorkspace): Map<string, string> {
  const target = activeVariableTarget(snapshot, workspace);
  const map = new Map<string, string>();
  for (const entry of target) {
    map.set(entry.key, entry.value);
  }
  return map;
}

function activeVariableTarget(
  snapshot: ApiClientSnapshot,
  workspace: ApiWorkspace,
): ApiKeyValue[] {
  const activeEnvironment: ApiEnvironment | undefined =
    workspace.activeEnvironmentId === null
      ? undefined
      : snapshot.environments.find((environment) => environment.id === workspace.activeEnvironmentId);
  return activeEnvironment ? activeEnvironment.variables : workspace.variables;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

function firstStringField(body: Record<string, unknown>, fields: string[]): string | undefined {
  for (const field of fields) {
    const value = body[field];
    if (typeof value === 'string' && value !== '') return value;
  }
  return undefined;
}

export async function runLogin(store: ApiClientStore, workspaceId: string): Promise<LoginResult> {
  const before = store.snapshot();
  const workspace = before.workspaces.find((candidate) => candidate.id === workspaceId);
  if (!workspace) {
    throw new Error('not found');
  }
  if (workspace.authRequestId === null) {
    throw new LoginValidationError('workspace has no auth request configured');
  }
  const authRequest = before.requests.find((request) => request.id === workspace.authRequestId);
  if (!authRequest) {
    throw new LoginValidationError('workspace auth request no longer exists');
  }

  const varsBefore = activeVariableMap(before, workspace);
  const result = await runRequest(store, authRequest);

  const after = store.snapshot();
  const afterWorkspace = after.workspaces.find((candidate) => candidate.id === workspaceId) ?? workspace;
  const varsAfter = activeVariableMap(after, afterWorkspace);

  const tokensSet: string[] = [];
  const body = parseJsonObject(result.bodyText);
  if (body) {
    const extracted = new Map<string, string>();
    const token = firstStringField(body, TOKEN_FIELDS);
    if (token !== undefined) extracted.set('token', token);
    const refresh = firstStringField(body, REFRESH_FIELDS);
    if (refresh !== undefined) extracted.set('refresh_token', refresh);

    const changes = new Map<string, string | null>();
    for (const [key, value] of extracted) {
      const hadKey = varsBefore.has(key);
      if (!hadKey) continue;
      const changedByRun = varsBefore.get(key) !== varsAfter.get(key);
      if (changedByRun) continue;
      changes.set(key, value);
      tokensSet.push(key);
    }
    if (changes.size > 0) {
      store.applyEnvironmentVariables(workspaceId, changes);
      await store.flush();
    }
  }

  return { result, tokensSet, snapshot: store.snapshot() };
}

export class LoginValidationError extends Error {}
