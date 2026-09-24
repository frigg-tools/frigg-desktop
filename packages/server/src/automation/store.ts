import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Automation, AutomationDefinition, AutomationFolder } from '@frigg/shared';
import { AUTOMATION_NODE_TYPE } from '@frigg/shared';
import { validateAutomation } from './validation.ts';

export type AutomationStoreErrorCode =
  | 'not_found'
  | 'revision_conflict'
  | 'automation_active'
  | 'folder_not_found'
  | 'folder_name_conflict'
  | 'invalid_folder'
  | 'invalid_automation'
  | 'corrupt_store'
  | 'persistence_failed';

export class AutomationStoreError extends Error {
  readonly code: AutomationStoreErrorCode;

  constructor(code: AutomationStoreErrorCode, message: string) {
    super(message);
    this.name = 'AutomationStoreError';
    this.code = code;
  }
}

interface StoredEnvelope {
  schemaVersion: 1;
  automations: Automation[];
  folders?: AutomationFolder[];
}

interface AutomationStoreOptions {
  isActive?: (automationId: string) => boolean | Promise<boolean>;
}

function copy<T>(value: T): T {
  return structuredClone(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAutomationMetadata(value: unknown): value is Automation {
  if (!isObject(value)) return false;
  return (
    typeof value.id === 'string' && value.id.length > 0 &&
    typeof value.revision === 'number' && Number.isInteger(value.revision) && value.revision >= 1 &&
    typeof value.createdAt === 'number' && Number.isFinite(value.createdAt) &&
    typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt)
  );
}

function isFolderMetadata(value: unknown): value is AutomationFolder {
  if (!isObject(value)) return false;
  return (
    typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 128 &&
    typeof value.name === 'string' && value.name.trim().length > 0 && value.name.length <= 80 &&
    typeof value.createdAt === 'number' && Number.isFinite(value.createdAt) &&
    typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt)
  );
}

function normalizeFolderName(value: unknown): string {
  if (typeof value !== 'string') throw new AutomationStoreError('invalid_folder', 'Folder name must contain 1 to 80 characters.');
  const name = value.trim();
  if (name === '' || name.length > 80) throw new AutomationStoreError('invalid_folder', 'Folder name must contain 1 to 80 characters.');
  return name;
}

function validateDefinition(value: unknown): AutomationDefinition {
  const result = validateAutomation(value);
  if (!result.valid) {
    throw new AutomationStoreError('invalid_automation', result.issues.map((issue) => issue.message).join(' '));
  }
  return result.automation;
}

function isMissingFile(error: unknown): boolean {
  return isObject(error) && error.code === 'ENOENT';
}

export class AutomationStore {
  private entries = new Map<string, Automation>();
  private folders = new Map<string, AutomationFolder>();
  private mutationTail: Promise<void> = Promise.resolve();

  private constructor(
    private readonly filePath: string,
    private readonly options: AutomationStoreOptions,
  ) {}

  static async load(filePath: string, options: AutomationStoreOptions = {}): Promise<AutomationStore> {
    const store = new AutomationStore(filePath, options);
    let contents: string;
    try {
      contents = await readFile(filePath, 'utf8');
    } catch (error) {
      if (isMissingFile(error)) return store;
      throw error;
    }

    try {
      const parsed: unknown = JSON.parse(contents);
      if (!isObject(parsed) || parsed.schemaVersion !== 1 || !Array.isArray(parsed.automations) ||
        (parsed.folders !== undefined && !Array.isArray(parsed.folders))) {
        throw new Error('Unexpected automation storage format.');
      }
      for (const raw of parsed.folders ?? []) {
        if (!isFolderMetadata(raw)) throw new Error('Automation folder metadata is invalid.');
        if (store.folders.has(raw.id)) throw new Error('Duplicate automation folder ID.');
        if ([...store.folders.values()].some((folder) => folder.name.toLocaleLowerCase() === raw.name.toLocaleLowerCase())) {
          throw new Error('Duplicate automation folder name.');
        }
        store.folders.set(raw.id, copy(raw));
      }
      for (const raw of parsed.automations) {
        if (!isAutomationMetadata(raw)) throw new Error('Automation metadata is invalid.');
        const definition = validateDefinition(raw);
        if (store.entries.has(raw.id)) throw new Error('Duplicate automation ID.');
        if (definition.folderId && !store.folders.has(definition.folderId)) throw new Error('Automation refers to a missing folder.');
        store.entries.set(raw.id, { ...definition, id: raw.id, revision: raw.revision, createdAt: raw.createdAt, updatedAt: raw.updatedAt });
      }
      return store;
    } catch (error) {
      throw new AutomationStoreError(
        'corrupt_store',
        `Could not read automations from ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  snapshot(): Automation[] {
    return [...this.entries.values()].map(copy);
  }

  listFolders(): AutomationFolder[] {
    return [...this.folders.values()].map(copy);
  }

  get(id: string): Automation | undefined {
    const automation = this.entries.get(id);
    return automation ? copy(automation) : undefined;
  }

  create(input: unknown): Promise<Automation> {
    return this.mutate(async () => {
      const definition = validateDefinition(input);
      this.assertFolderExists(definition.folderId);
      const now = Date.now();
      const automation: Automation = {
        ...copy(definition),
        id: randomUUID(),
        revision: 1,
        createdAt: now,
        updatedAt: now,
      };
      const next = new Map(this.entries);
      next.set(automation.id, automation);
      await this.persist(next, this.folders);
      this.entries = next;
      return copy(automation);
    });
  }

  update(id: string, input: unknown, expectedRevision: number): Promise<Automation> {
    return this.mutate(async () => {
      const current = this.entries.get(id);
      if (!current) throw new AutomationStoreError('not_found', `Automation not found: ${id}`);
      if (expectedRevision !== current.revision) {
        throw new AutomationStoreError('revision_conflict', `Automation revision is now ${current.revision}.`);
      }
      const definition = validateDefinition(input);
      this.assertFolderExists(definition.folderId);
      const updated: Automation = {
        ...copy(definition),
        id: current.id,
        revision: current.revision + 1,
        createdAt: current.createdAt,
        updatedAt: Date.now(),
      };
      const next = new Map(this.entries);
      next.set(id, updated);
      await this.persist(next, this.folders);
      this.entries = next;
      return copy(updated);
    });
  }

  duplicate(id: string): Promise<Automation> {
    return this.mutate(async () => {
      const current = this.entries.get(id);
      if (!current) throw new AutomationStoreError('not_found', `Automation not found: ${id}`);
      const now = Date.now();
      let copyNumber = 1;
      let copySuffix = ' copy';
      let copyName = `${current.name.slice(0, 80 - copySuffix.length)}${copySuffix}`;
      const existingNames = new Set([...this.entries.values()].map((automation) => automation.name.toLowerCase()));
      while (existingNames.has(copyName.toLowerCase())) {
        copyNumber += 1;
        copySuffix = ` copy ${copyNumber}`;
        copyName = `${current.name.slice(0, 80 - copySuffix.length)}${copySuffix}`;
      }
      const clonedNodes = copy(current.nodes).map((node) => {
        if ((node.type === AUTOMATION_NODE_TYPE.tap || node.type === AUTOMATION_NODE_TYPE.longPress) && 'point' in node.data) {
          const { referenceCaptureId: _referenceCaptureId, ...data } = node.data;
          return { ...node, data };
        }
        if (node.type === AUTOMATION_NODE_TYPE.swipe && 'start' in node.data) {
          const { referenceCaptureId: _referenceCaptureId, ...data } = node.data;
          return { ...node, data };
        }
        return node;
      });
      const duplicate: Automation = {
        name: copyName,
        description: current.description,
        schemaVersion: current.schemaVersion,
        ...(current.folderId ? { folderId: current.folderId } : {}),
        nodes: clonedNodes,
        edges: copy(current.edges),
        id: randomUUID(),
        revision: 1,
        createdAt: now,
        updatedAt: now,
      };
      const next = new Map(this.entries);
      next.set(duplicate.id, duplicate);
      await this.persist(next, this.folders);
      this.entries = next;
      return copy(duplicate);
    });
  }

  delete(id: string): Promise<void> {
    return this.mutate(async () => {
      if (!this.entries.has(id)) throw new AutomationStoreError('not_found', `Automation not found: ${id}`);
      if (await this.options.isActive?.(id)) {
        throw new AutomationStoreError('automation_active', 'Cancel the active run before deleting this automation.');
      }
      const next = new Map(this.entries);
      next.delete(id);
      await this.persist(next, this.folders);
      this.entries = next;
    });
  }

  createFolder(name: unknown): Promise<AutomationFolder> {
    return this.mutate(async () => {
      const normalizedName = normalizeFolderName(name);
      this.assertFolderNameAvailable(normalizedName);
      const now = Date.now();
      const folder: AutomationFolder = { id: randomUUID(), name: normalizedName, createdAt: now, updatedAt: now };
      const next = new Map(this.folders);
      next.set(folder.id, folder);
      await this.persist(this.entries, next);
      this.folders = next;
      return copy(folder);
    });
  }

  renameFolder(id: string, name: unknown): Promise<AutomationFolder> {
    return this.mutate(async () => {
      const current = this.folders.get(id);
      if (!current) throw new AutomationStoreError('folder_not_found', `Automation folder not found: ${id}`);
      const normalizedName = normalizeFolderName(name);
      this.assertFolderNameAvailable(normalizedName, id);
      const renamed: AutomationFolder = { ...current, name: normalizedName, updatedAt: Date.now() };
      const next = new Map(this.folders);
      next.set(id, renamed);
      await this.persist(this.entries, next);
      this.folders = next;
      return copy(renamed);
    });
  }

  deleteFolder(id: string): Promise<void> {
    return this.mutate(async () => {
      if (!this.folders.has(id)) throw new AutomationStoreError('folder_not_found', `Automation folder not found: ${id}`);
      const now = Date.now();
      const nextEntries = new Map(this.entries);
      for (const [automationId, automation] of this.entries) {
        if (automation.folderId !== id) continue;
        const unfiled = copy(automation);
        delete unfiled.folderId;
        unfiled.revision += 1;
        unfiled.updatedAt = now;
        nextEntries.set(automationId, unfiled);
      }
      const nextFolders = new Map(this.folders);
      nextFolders.delete(id);
      await this.persist(nextEntries, nextFolders);
      this.entries = nextEntries;
      this.folders = nextFolders;
    });
  }

  flush(): Promise<void> {
    return this.mutationTail;
  }

  private mutate<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationTail.then(operation);
    this.mutationTail = result.then(() => undefined, () => undefined);
    return result;
  }

  private assertFolderExists(folderId: string | undefined): void {
    if (folderId && !this.folders.has(folderId)) {
      throw new AutomationStoreError('folder_not_found', `Automation folder not found: ${folderId}`);
    }
  }

  private assertFolderNameAvailable(name: string, exceptId?: string): void {
    if ([...this.folders.values()].some((folder) => folder.id !== exceptId && folder.name.toLowerCase() === name.toLowerCase())) {
      throw new AutomationStoreError('folder_name_conflict', `An automation folder named "${name}" already exists.`);
    }
  }

  private async persist(entries: Map<string, Automation>, folders: Map<string, AutomationFolder>): Promise<void> {
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
    const payload: StoredEnvelope = { schemaVersion: 1, automations: [...entries.values()], folders: [...folders.values()] };
    try {
      await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
      await writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await rename(temporaryPath, this.filePath);
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw new AutomationStoreError('persistence_failed', error instanceof Error ? error.message : String(error));
    }
  }
}
