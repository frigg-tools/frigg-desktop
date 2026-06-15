import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type {
  ApiBody,
  ApiClientCert,
  ApiClientSnapshot,
  ApiEnvironment,
  ApiFolder,
  ApiKeyValue,
  ApiRequest,
  ApiRequestInput,
  ApiWorkspace,
} from '@frigg/shared';

const PERSIST_DEBOUNCE_MS = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isKeyValueArray(value: unknown): value is ApiKeyValue[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.key === 'string' &&
        typeof entry.value === 'string' &&
        typeof entry.enabled === 'boolean',
    )
  );
}

function isValidWorkspaceShape(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    isKeyValueArray(value.variables) &&
    (value.activeEnvironmentId === null || typeof value.activeEnvironmentId === 'string') &&
    typeof value.createdAt === 'number'
  );
}

function isClientCert(value: unknown): value is ApiClientCert {
  return (
    isRecord(value) &&
    typeof value.host === 'string' &&
    typeof value.certPath === 'string' &&
    typeof value.keyPath === 'string' &&
    (value.caPath === undefined || typeof value.caPath === 'string') &&
    (value.passphrase === undefined || typeof value.passphrase === 'string')
  );
}

function normalizeClientCert(cert: ApiClientCert): ApiClientCert {
  const normalized: ApiClientCert = {
    id: typeof cert.id === 'string' && cert.id !== '' ? cert.id : randomUUID(),
    host: cert.host,
    certPath: cert.certPath,
    keyPath: cert.keyPath,
  };
  if (cert.caPath !== undefined) normalized.caPath = cert.caPath;
  if (cert.passphrase !== undefined) normalized.passphrase = cert.passphrase;
  return normalized;
}

function normalizeWorkspace(value: Record<string, unknown>): ApiWorkspace {
  const rawCerts = Array.isArray(value.clientCerts) ? value.clientCerts : [];
  const clientCerts = rawCerts.filter(isClientCert).map(normalizeClientCert);
  return {
    id: value.id as string,
    name: value.name as string,
    variables: value.variables as ApiKeyValue[],
    activeEnvironmentId: value.activeEnvironmentId as string | null,
    clientCerts,
    createdAt: value.createdAt as number,
  };
}

function isValidFolder(value: unknown): value is ApiFolder {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.workspaceId === 'string' &&
    (value.parentId === null || typeof value.parentId === 'string') &&
    typeof value.name === 'string' &&
    typeof value.createdAt === 'number'
  );
}

function isValidBody(value: unknown): value is ApiBody {
  return (
    isRecord(value) &&
    (value.mode === 'none' ||
      value.mode === 'json' ||
      value.mode === 'raw' ||
      value.mode === 'form') &&
    typeof value.raw === 'string' &&
    isKeyValueArray(value.form)
  );
}

function isValidRequest(value: unknown): value is ApiRequest {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.workspaceId === 'string' &&
    (value.folderId === null || typeof value.folderId === 'string') &&
    typeof value.name === 'string' &&
    typeof value.method === 'string' &&
    typeof value.url === 'string' &&
    isKeyValueArray(value.query) &&
    isKeyValueArray(value.headers) &&
    isValidBody(value.body) &&
    typeof value.preScript === 'string' &&
    typeof value.testScript === 'string' &&
    typeof value.createdAt === 'number' &&
    typeof value.updatedAt === 'number'
  );
}

function isValidEnvironment(value: unknown): value is ApiEnvironment {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.workspaceId === 'string' &&
    typeof value.name === 'string' &&
    isKeyValueArray(value.variables)
  );
}

function emptyBody(): ApiBody {
  return { mode: 'none', raw: '', form: [] };
}

export class ApiClientStore extends EventEmitter {
  private workspaces: ApiWorkspace[] = [];
  private folders: ApiFolder[] = [];
  private requests: ApiRequest[] = [];
  private environments: ApiEnvironment[] = [];
  private readonly filePath: string;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingWrite: Promise<void> = Promise.resolve();
  private dirty = false;

  private constructor(filePath: string) {
    super();
    this.filePath = filePath;
  }

  static async load(filePath: string): Promise<ApiClientStore> {
    const store = new ApiClientStore(filePath);
    await mkdir(dirname(filePath), { recursive: true });
    try {
      const raw = await readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<ApiClientSnapshot> | null;
      if (
        parsed &&
        Array.isArray(parsed.workspaces) &&
        Array.isArray(parsed.folders) &&
        Array.isArray(parsed.requests) &&
        Array.isArray(parsed.environments)
      ) {
        store.workspaces = (parsed.workspaces as unknown[])
          .filter(isValidWorkspaceShape)
          .map(normalizeWorkspace);
        store.folders = parsed.folders.filter(isValidFolder);
        store.requests = parsed.requests.filter(isValidRequest);
        store.environments = parsed.environments.filter(isValidEnvironment);
      }
    } catch {
      store.workspaces = [];
      store.folders = [];
      store.requests = [];
      store.environments = [];
    }
    if (store.workspaces.length === 0) {
      store.seedDefaults();
    }
    return store;
  }

  snapshot(): ApiClientSnapshot {
    return structuredClone({
      workspaces: this.workspaces,
      folders: this.folders,
      requests: this.requests,
      environments: this.environments,
    });
  }

  createWorkspace(name: string): ApiWorkspace {
    const workspace: ApiWorkspace = {
      id: randomUUID(),
      name,
      variables: [],
      activeEnvironmentId: null,
      clientCerts: [],
      createdAt: Date.now(),
    };
    this.workspaces.push(workspace);
    this.commit();
    return structuredClone(workspace);
  }

  updateWorkspace(
    id: string,
    patch: {
      name?: string;
      variables?: ApiKeyValue[];
      activeEnvironmentId?: string | null;
      clientCerts?: ApiClientCert[];
    },
  ): ApiWorkspace {
    const workspace = this.requireWorkspace(id);
    if (patch.name !== undefined) workspace.name = patch.name;
    if (patch.variables !== undefined) workspace.variables = structuredClone(patch.variables);
    if (patch.activeEnvironmentId !== undefined) {
      if (patch.activeEnvironmentId !== null) {
        this.requireEnvironmentInWorkspace(patch.activeEnvironmentId, id);
      }
      workspace.activeEnvironmentId = patch.activeEnvironmentId;
    }
    if (patch.clientCerts !== undefined) {
      workspace.clientCerts = patch.clientCerts.map(normalizeClientCert);
    }
    this.commit();
    return structuredClone(workspace);
  }

  deleteWorkspace(id: string): void {
    const index = this.workspaces.findIndex((workspace) => workspace.id === id);
    if (index === -1) {
      throw new Error('not found');
    }
    this.workspaces.splice(index, 1);
    this.folders = this.folders.filter((folder) => folder.workspaceId !== id);
    this.requests = this.requests.filter((request) => request.workspaceId !== id);
    this.environments = this.environments.filter((environment) => environment.workspaceId !== id);
    this.commit();
  }

  createFolder(workspaceId: string, name: string, parentId: string | null): ApiFolder {
    this.requireWorkspace(workspaceId);
    if (parentId !== null) {
      this.requireFolderInWorkspace(parentId, workspaceId);
    }
    const folder: ApiFolder = {
      id: randomUUID(),
      workspaceId,
      parentId,
      name,
      createdAt: Date.now(),
    };
    this.folders.push(folder);
    this.commit();
    return structuredClone(folder);
  }

  updateFolder(id: string, patch: { name?: string; parentId?: string | null }): ApiFolder {
    const folder = this.requireFolder(id);
    if (patch.parentId !== undefined) {
      const nextParentId = patch.parentId;
      if (nextParentId !== null) {
        this.requireFolderInWorkspace(nextParentId, folder.workspaceId);
        this.assertNoCycle(id, nextParentId);
      }
      folder.parentId = nextParentId;
    }
    if (patch.name !== undefined) folder.name = patch.name;
    this.commit();
    return structuredClone(folder);
  }

  deleteFolder(id: string): void {
    const index = this.folders.findIndex((folder) => folder.id === id);
    if (index === -1) {
      throw new Error('not found');
    }
    const removed = this.folders[index];
    this.folders.splice(index, 1);
    for (const folder of this.folders) {
      if (folder.parentId === id) {
        folder.parentId = removed.parentId;
      }
    }
    for (const request of this.requests) {
      if (request.folderId === id) {
        request.folderId = removed.parentId;
      }
    }
    this.commit();
  }

  createRequest(workspaceId: string, folderId: string | null): ApiRequest {
    this.requireWorkspace(workspaceId);
    if (folderId !== null) {
      this.requireFolderInWorkspace(folderId, workspaceId);
    }
    const now = Date.now();
    const request: ApiRequest = {
      id: randomUUID(),
      workspaceId,
      folderId,
      name: 'New request',
      method: 'GET',
      url: '',
      query: [],
      headers: [],
      body: emptyBody(),
      preScript: '',
      testScript: '',
      createdAt: now,
      updatedAt: now,
    };
    this.requests.push(request);
    this.commit();
    return structuredClone(request);
  }

  updateRequest(id: string, patch: Partial<ApiRequestInput>): ApiRequest {
    const request = this.requireRequest(id);
    const cloned = structuredClone(patch);
    if (cloned.workspaceId !== undefined) request.workspaceId = cloned.workspaceId;
    if (cloned.folderId !== undefined) request.folderId = cloned.folderId;
    if (cloned.name !== undefined) request.name = cloned.name;
    if (cloned.method !== undefined) request.method = cloned.method;
    if (cloned.url !== undefined) request.url = cloned.url;
    if (cloned.query !== undefined) request.query = cloned.query;
    if (cloned.headers !== undefined) request.headers = cloned.headers;
    if (cloned.body !== undefined) request.body = cloned.body;
    if (cloned.preScript !== undefined) request.preScript = cloned.preScript;
    if (cloned.testScript !== undefined) request.testScript = cloned.testScript;
    request.updatedAt = Date.now();
    this.commit();
    return structuredClone(request);
  }

  deleteRequest(id: string): void {
    const index = this.requests.findIndex((request) => request.id === id);
    if (index === -1) {
      throw new Error('not found');
    }
    this.requests.splice(index, 1);
    this.commit();
  }

  createEnvironment(workspaceId: string, name: string): ApiEnvironment {
    this.requireWorkspace(workspaceId);
    const environment: ApiEnvironment = {
      id: randomUUID(),
      workspaceId,
      name,
      variables: [],
    };
    this.environments.push(environment);
    this.commit();
    return structuredClone(environment);
  }

  updateEnvironment(
    id: string,
    patch: { name?: string; variables?: ApiKeyValue[] },
  ): ApiEnvironment {
    const environment = this.requireEnvironment(id);
    if (patch.name !== undefined) environment.name = patch.name;
    if (patch.variables !== undefined) environment.variables = structuredClone(patch.variables);
    this.commit();
    return structuredClone(environment);
  }

  deleteEnvironment(id: string): void {
    const index = this.environments.findIndex((environment) => environment.id === id);
    if (index === -1) {
      throw new Error('not found');
    }
    const removed = this.environments[index];
    this.environments.splice(index, 1);
    for (const workspace of this.workspaces) {
      if (workspace.activeEnvironmentId === removed.id) {
        workspace.activeEnvironmentId = null;
      }
    }
    this.commit();
  }

  applyEnvironmentVariables(workspaceId: string, changes: Map<string, string | null>): void {
    if (changes.size === 0) return;
    const workspace = this.workspaces.find((candidate) => candidate.id === workspaceId);
    if (!workspace) return;
    const activeEnvironment =
      workspace.activeEnvironmentId === null
        ? undefined
        : this.environments.find(
            (environment) => environment.id === workspace.activeEnvironmentId,
          );
    const target = activeEnvironment ? activeEnvironment.variables : workspace.variables;
    for (const [key, value] of changes) {
      const existingIndex = target.findIndex((entry) => entry.key === key);
      if (value === null) {
        if (existingIndex !== -1) target.splice(existingIndex, 1);
        continue;
      }
      if (existingIndex === -1) {
        target.push({ key, value, enabled: true });
      } else {
        target[existingIndex] = { ...target[existingIndex], value };
      }
    }
    this.commit();
  }

  async flush(): Promise<void> {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    if (this.dirty) {
      await this.persistNow();
    } else {
      await this.pendingWrite;
    }
  }

  private seedDefaults(): void {
    const workspace: ApiWorkspace = {
      id: randomUUID(),
      name: 'My Workspace',
      variables: [],
      activeEnvironmentId: null,
      clientCerts: [],
      createdAt: Date.now(),
    };
    const environment: ApiEnvironment = {
      id: randomUUID(),
      workspaceId: workspace.id,
      name: 'Default',
      variables: [],
    };
    workspace.activeEnvironmentId = environment.id;
    this.workspaces.push(workspace);
    this.environments.push(environment);
    this.schedulePersist();
  }

  private requireWorkspace(id: string): ApiWorkspace {
    const workspace = this.workspaces.find((candidate) => candidate.id === id);
    if (!workspace) {
      throw new Error('not found');
    }
    return workspace;
  }

  private requireFolder(id: string): ApiFolder {
    const folder = this.folders.find((candidate) => candidate.id === id);
    if (!folder) {
      throw new Error('not found');
    }
    return folder;
  }

  private requireFolderInWorkspace(id: string, workspaceId: string): ApiFolder {
    const folder = this.requireFolder(id);
    if (folder.workspaceId !== workspaceId) {
      throw new Error('not found');
    }
    return folder;
  }

  private requireRequest(id: string): ApiRequest {
    const request = this.requests.find((candidate) => candidate.id === id);
    if (!request) {
      throw new Error('not found');
    }
    return request;
  }

  private requireEnvironment(id: string): ApiEnvironment {
    const environment = this.environments.find((candidate) => candidate.id === id);
    if (!environment) {
      throw new Error('not found');
    }
    return environment;
  }

  private requireEnvironmentInWorkspace(id: string, workspaceId: string): ApiEnvironment {
    const environment = this.requireEnvironment(id);
    if (environment.workspaceId !== workspaceId) {
      throw new Error('not found');
    }
    return environment;
  }

  private assertNoCycle(folderId: string, parentId: string | null): void {
    const foldersById = new Map(this.folders.map((folder) => [folder.id, folder]));
    let currentId = parentId;
    while (currentId !== null) {
      if (currentId === folderId) {
        throw new Error('cycle');
      }
      const parent = foldersById.get(currentId);
      if (!parent) {
        throw new Error('not found');
      }
      currentId = parent.parentId;
    }
  }

  private commit(): void {
    this.schedulePersist();
  }

  private schedulePersist(): void {
    this.dirty = true;
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.persistNow();
    }, PERSIST_DEBOUNCE_MS);
  }

  private persistNow(): Promise<void> {
    this.dirty = false;
    this.pendingWrite = this.pendingWrite.then(() => this.writeSnapshotFile()).catch(() => undefined);
    return this.pendingWrite;
  }

  private async writeSnapshotFile(): Promise<void> {
    const payload = JSON.stringify(
      {
        workspaces: this.workspaces,
        folders: this.folders,
        requests: this.requests,
        environments: this.environments,
      },
      null,
      2,
    );
    const tmpPath = `${this.filePath}.${randomUUID()}.tmp`;
    await writeFile(tmpPath, payload, 'utf8');
    await rename(tmpPath, this.filePath);
  }
}
