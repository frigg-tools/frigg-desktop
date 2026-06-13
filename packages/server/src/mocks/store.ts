import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type {
  MockFolder,
  MockRule,
  MockRuleInput,
  MocksSnapshot,
  ServerEvent,
} from '@frigg/shared';
import { pickRule, type MatchInput } from './matcher.ts';

const PERSIST_DEBOUNCE_MS = 100;

export class MockStore extends EventEmitter {
  private folders: MockFolder[] = [];
  private rules: MockRule[] = [];
  private readonly filePath: string;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingWrite: Promise<void> = Promise.resolve();
  private dirty = false;

  private constructor(filePath: string) {
    super();
    this.filePath = filePath;
  }

  static async load(filePath: string): Promise<MockStore> {
    const store = new MockStore(filePath);
    await mkdir(dirname(filePath), { recursive: true });
    try {
      const raw = await readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<MocksSnapshot> | null;
      if (parsed && Array.isArray(parsed.folders) && Array.isArray(parsed.rules)) {
        store.folders = parsed.folders;
        store.rules = parsed.rules;
      }
    } catch {
      store.folders = [];
      store.rules = [];
    }
    return store;
  }

  snapshot(): MocksSnapshot {
    return structuredClone({ folders: this.folders, rules: this.rules });
  }

  createRule(input: MockRuleInput): MockRule {
    const now = Date.now();
    const rule: MockRule = {
      ...structuredClone(input),
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      hitCount: 0,
    };
    this.rules.push(rule);
    this.commit();
    return structuredClone(rule);
  }

  updateRule(id: string, patch: Partial<MockRuleInput>): MockRule {
    const index = this.rules.findIndex((rule) => rule.id === id);
    if (index === -1) {
      throw new Error('not found');
    }
    const existing = this.rules[index];
    const updated: MockRule = {
      ...existing,
      ...structuredClone(patch),
      id: existing.id,
      createdAt: existing.createdAt,
      hitCount: existing.hitCount,
      updatedAt: Date.now(),
    };
    this.rules[index] = updated;
    this.commit();
    return structuredClone(updated);
  }

  deleteRule(id: string): void {
    const index = this.rules.findIndex((rule) => rule.id === id);
    if (index === -1) {
      throw new Error('not found');
    }
    this.rules.splice(index, 1);
    this.commit();
  }

  createFolder(name: string, parentId: string | null): MockFolder {
    if (parentId !== null) {
      this.requireFolder(parentId);
    }
    const folder: MockFolder = {
      id: randomUUID(),
      name,
      parentId,
      createdAt: Date.now(),
    };
    this.folders.push(folder);
    this.commit();
    return structuredClone(folder);
  }

  updateFolder(id: string, patch: { name?: string; parentId?: string | null }): MockFolder {
    const existing = this.requireFolder(id);
    const nextParentId = patch.parentId === undefined ? existing.parentId : patch.parentId;
    if (patch.parentId !== undefined) {
      this.assertNoCycle(id, nextParentId);
    }
    existing.name = patch.name ?? existing.name;
    existing.parentId = nextParentId;
    this.commit();
    return structuredClone(existing);
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
    for (const rule of this.rules) {
      if (rule.folderId === id) {
        rule.folderId = removed.parentId;
      }
    }
    this.commit();
  }

  match(input: MatchInput): MockRule | undefined {
    return pickRule(this.rules, input);
  }

  recordHit(id: string): void {
    const rule = this.rules.find((candidate) => candidate.id === id);
    if (!rule) {
      return;
    }
    rule.hitCount += 1;
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

  private requireFolder(id: string): MockFolder {
    const folder = this.folders.find((candidate) => candidate.id === id);
    if (!folder) {
      throw new Error('not found');
    }
    return folder;
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
    const event: ServerEvent = { type: 'mocks-updated' };
    this.emit('event', event);
  }

  private schedulePersist(): void {
    this.dirty = true;
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
    }
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
    const payload = JSON.stringify({ folders: this.folders, rules: this.rules }, null, 2);
    const tmpPath = `${this.filePath}.${randomUUID()}.tmp`;
    await writeFile(tmpPath, payload, 'utf8');
    await rename(tmpPath, this.filePath);
  }
}
