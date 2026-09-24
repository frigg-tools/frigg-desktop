import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Automation, AutomationDefinition } from '@frigg/shared';
import { validateAutomation } from './validation.ts';

export type AutomationStoreErrorCode =
  | 'not_found'
  | 'revision_conflict'
  | 'automation_active'
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
      if (!isObject(parsed) || parsed.schemaVersion !== 1 || !Array.isArray(parsed.automations)) {
        throw new Error('Unexpected automation storage format.');
      }
      for (const raw of parsed.automations) {
        if (!isAutomationMetadata(raw)) throw new Error('Automation metadata is invalid.');
        const definition = validateDefinition(raw);
        if (store.entries.has(raw.id)) throw new Error('Duplicate automation ID.');
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

  get(id: string): Automation | undefined {
    const automation = this.entries.get(id);
    return automation ? copy(automation) : undefined;
  }

  create(input: unknown): Promise<Automation> {
    return this.mutate(async () => {
      const definition = validateDefinition(input);
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
      await this.persist(next);
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
      const updated: Automation = {
        ...copy(definition),
        id: current.id,
        revision: current.revision + 1,
        createdAt: current.createdAt,
        updatedAt: Date.now(),
      };
      const next = new Map(this.entries);
      next.set(id, updated);
      await this.persist(next);
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
      const duplicate: Automation = {
        name: copyName,
        description: current.description,
        schemaVersion: current.schemaVersion,
        nodes: copy(current.nodes),
        edges: copy(current.edges),
        id: randomUUID(),
        revision: 1,
        createdAt: now,
        updatedAt: now,
      };
      const next = new Map(this.entries);
      next.set(duplicate.id, duplicate);
      await this.persist(next);
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
      await this.persist(next);
      this.entries = next;
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

  private async persist(entries: Map<string, Automation>): Promise<void> {
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
    const payload: StoredEnvelope = { schemaVersion: 1, automations: [...entries.values()] };
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
