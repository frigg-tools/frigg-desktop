import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MockRuleInput, MocksSnapshot, ServerEvent } from '@frigg/shared';
import { MockStore } from '../src/mocks/store.ts';

let tempDir: string;
let mocksPath: string;

function buildRuleInput(overrides: Partial<MockRuleInput> = {}): MockRuleInput {
  return {
    folderId: null,
    name: 'sample rule',
    enabled: true,
    priority: 0,
    matcher: { pathPattern: '/users/*' },
    response: { statusCode: 200, headers: { 'content-type': 'application/json' }, body: '{"ok":true}' },
    ...overrides,
  };
}

function buildMatchInput(path: string) {
  return { method: 'GET', host: 'api.example.com', path, query: '', bodyText: '' };
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'frigg-mockstore-'));
  mocksPath = join(tempDir, 'nested', 'dir', 'mocks.json');
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('MockStore.load', () => {
  it('starts empty when the file is missing and creates the parent directory', async () => {
    const store = await MockStore.load(mocksPath);
    expect(store.snapshot()).toEqual({ folders: [], rules: [] });
    const entries = await readdir(join(tempDir, 'nested'));
    expect(entries).toContain('dir');
  });

  it('starts empty when the file is corrupt', async () => {
    await mkdir(join(tempDir, 'nested', 'dir'), { recursive: true });
    await writeFile(mocksPath, 'not json {{{', 'utf8');
    const store = await MockStore.load(mocksPath);
    expect(store.snapshot()).toEqual({ folders: [], rules: [] });
  });

  it('starts empty when the file holds json of the wrong shape', async () => {
    await mkdir(join(tempDir, 'nested', 'dir'), { recursive: true });
    await writeFile(mocksPath, JSON.stringify({ folders: 'nope' }), 'utf8');
    const store = await MockStore.load(mocksPath);
    expect(store.snapshot()).toEqual({ folders: [], rules: [] });
  });
});

describe('rule CRUD', () => {
  it('creates rules with generated id, timestamps and zero hit count', async () => {
    const store = await MockStore.load(mocksPath);
    const before = Date.now();
    const rule = store.createRule(buildRuleInput());
    expect(rule.id).toMatch(/[0-9a-f-]{36}/);
    expect(rule.createdAt).toBeGreaterThanOrEqual(before);
    expect(rule.updatedAt).toBe(rule.createdAt);
    expect(rule.hitCount).toBe(0);
    expect(store.snapshot().rules).toEqual([rule]);
  });

  it('updates rules while preserving id, createdAt and hitCount', async () => {
    vi.useFakeTimers({ now: 1000 });
    try {
      const store = await MockStore.load(mocksPath);
      const rule = store.createRule(buildRuleInput());
      vi.setSystemTime(2000);
      const updated = store.updateRule(rule.id, { name: 'renamed', priority: 9 });
      expect(updated.id).toBe(rule.id);
      expect(updated.name).toBe('renamed');
      expect(updated.priority).toBe(9);
      expect(updated.createdAt).toBe(rule.createdAt);
      expect(updated.hitCount).toBe(0);
      expect(updated.updatedAt).toBe(2000);
      expect(store.snapshot().rules).toEqual([updated]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('throws not found when updating an unknown rule', async () => {
    const store = await MockStore.load(mocksPath);
    expect(() => store.updateRule('missing', { name: 'x' })).toThrowError('not found');
  });

  it('deletes rules and throws not found for unknown ids', async () => {
    const store = await MockStore.load(mocksPath);
    const rule = store.createRule(buildRuleInput());
    store.deleteRule(rule.id);
    expect(store.snapshot().rules).toEqual([]);
    expect(() => store.deleteRule(rule.id)).toThrowError('not found');
  });
});

describe('folder CRUD and reparenting', () => {
  it('creates nested folders and rejects unknown parents', async () => {
    const store = await MockStore.load(mocksPath);
    const root = store.createFolder('root', null);
    const child = store.createFolder('child', root.id);
    expect(child.parentId).toBe(root.id);
    expect(() => store.createFolder('orphan', 'missing')).toThrowError('not found');
  });

  it('renames and reparents folders', async () => {
    const store = await MockStore.load(mocksPath);
    const a = store.createFolder('a', null);
    const b = store.createFolder('b', null);
    const renamed = store.updateFolder(a.id, { name: 'a2' });
    expect(renamed.name).toBe('a2');
    expect(renamed.parentId).toBeNull();
    const moved = store.updateFolder(a.id, { parentId: b.id });
    expect(moved.parentId).toBe(b.id);
    expect(moved.name).toBe('a2');
    const backToRoot = store.updateFolder(a.id, { parentId: null });
    expect(backToRoot.parentId).toBeNull();
  });

  it('throws not found when updating an unknown folder or targeting an unknown parent', async () => {
    const store = await MockStore.load(mocksPath);
    const folder = store.createFolder('f', null);
    expect(() => store.updateFolder('missing', { name: 'x' })).toThrowError('not found');
    expect(() => store.updateFolder(folder.id, { parentId: 'missing' })).toThrowError('not found');
  });

  it('rejects moving a folder into itself', async () => {
    const store = await MockStore.load(mocksPath);
    const folder = store.createFolder('self', null);
    expect(() => store.updateFolder(folder.id, { parentId: folder.id })).toThrowError('cycle');
  });

  it('rejects moving a folder into its own descendant', async () => {
    const store = await MockStore.load(mocksPath);
    const a = store.createFolder('a', null);
    const b = store.createFolder('b', a.id);
    const c = store.createFolder('c', b.id);
    expect(() => store.updateFolder(a.id, { parentId: c.id })).toThrowError('cycle');
    expect(() => store.updateFolder(a.id, { parentId: b.id })).toThrowError('cycle');
    const snapshot = store.snapshot();
    expect(snapshot.folders.find((f) => f.id === a.id)?.parentId).toBeNull();
  });

  it('reparents child folders and rules to the deleted folder parent', async () => {
    const store = await MockStore.load(mocksPath);
    const root = store.createFolder('root', null);
    const middle = store.createFolder('middle', root.id);
    const leaf = store.createFolder('leaf', middle.id);
    const ruleInMiddle = store.createRule(buildRuleInput({ folderId: middle.id }));
    const ruleInLeaf = store.createRule(buildRuleInput({ folderId: leaf.id }));
    store.deleteFolder(middle.id);
    const snapshot = store.snapshot();
    expect(snapshot.folders.map((f) => f.id)).toEqual([root.id, leaf.id]);
    expect(snapshot.folders.find((f) => f.id === leaf.id)?.parentId).toBe(root.id);
    expect(snapshot.rules.find((r) => r.id === ruleInMiddle.id)?.folderId).toBe(root.id);
    expect(snapshot.rules.find((r) => r.id === ruleInLeaf.id)?.folderId).toBe(leaf.id);
  });

  it('reparents to null when deleting a top-level folder', async () => {
    const store = await MockStore.load(mocksPath);
    const root = store.createFolder('root', null);
    const child = store.createFolder('child', root.id);
    const rule = store.createRule(buildRuleInput({ folderId: root.id }));
    store.deleteFolder(root.id);
    const snapshot = store.snapshot();
    expect(snapshot.folders.find((f) => f.id === child.id)?.parentId).toBeNull();
    expect(snapshot.rules.find((r) => r.id === rule.id)?.folderId).toBeNull();
    expect(() => store.deleteFolder(root.id)).toThrowError('not found');
  });
});

describe('match and recordHit', () => {
  it('matches only enabled rules honoring priority order', async () => {
    const store = await MockStore.load(mocksPath);
    const disabled = store.createRule(buildRuleInput({ enabled: false, priority: 100 }));
    const low = store.createRule(buildRuleInput({ priority: 1, name: 'low' }));
    const high = store.createRule(buildRuleInput({ priority: 10, name: 'high' }));
    const matched = store.match(buildMatchInput('/users/42'));
    expect(matched?.id).toBe(high.id);
    expect(matched?.id).not.toBe(disabled.id);
    store.deleteRule(high.id);
    expect(store.match(buildMatchInput('/users/42'))?.id).toBe(low.id);
    expect(store.match(buildMatchInput('/nope'))).toBeUndefined();
  });

  it('increments hitCount on recordHit and ignores unknown ids', async () => {
    const store = await MockStore.load(mocksPath);
    const rule = store.createRule(buildRuleInput());
    store.recordHit(rule.id);
    store.recordHit(rule.id);
    store.recordHit('missing');
    expect(store.snapshot().rules[0]?.hitCount).toBe(2);
  });
});

describe('events', () => {
  it('emits mocks-updated for every mutation', async () => {
    const store = await MockStore.load(mocksPath);
    const events: ServerEvent[] = [];
    store.on('event', (event: ServerEvent) => events.push(event));
    const rule = store.createRule(buildRuleInput());
    store.updateRule(rule.id, { name: 'x' });
    store.recordHit(rule.id);
    store.deleteRule(rule.id);
    const folder = store.createFolder('f', null);
    store.updateFolder(folder.id, { name: 'g' });
    store.deleteFolder(folder.id);
    expect(events).toHaveLength(7);
    expect(events.every((event) => event.type === 'mocks-updated')).toBe(true);
  });
});

describe('persistence', () => {
  it('round-trips folders and rules through disk', async () => {
    const store = await MockStore.load(mocksPath);
    const folder = store.createFolder('apis', null);
    const child = store.createFolder('auth', folder.id);
    store.createRule(buildRuleInput({ folderId: child.id, name: 'login mock' }));
    store.createRule(buildRuleInput({ name: 'root mock', priority: 3 }));
    await store.flush();
    const reloaded = await MockStore.load(mocksPath);
    expect(reloaded.snapshot()).toEqual(store.snapshot());
  });

  it('debounces writes and persists after the debounce window', async () => {
    const store = await MockStore.load(mocksPath);
    store.createRule(buildRuleInput());
    await expect(readFile(mocksPath, 'utf8')).rejects.toThrow();
    await vi.waitFor(async () => {
      const raw = await readFile(mocksPath, 'utf8');
      const parsed = JSON.parse(raw) as MocksSnapshot;
      expect(parsed.rules).toHaveLength(1);
    });
  });

  it('writes the latest state when flushed after rapid mutations', async () => {
    const store = await MockStore.load(mocksPath);
    const rule = store.createRule(buildRuleInput({ name: 'v1' }));
    store.updateRule(rule.id, { name: 'v2' });
    store.updateRule(rule.id, { name: 'v3' });
    await store.flush();
    const parsed = JSON.parse(await readFile(mocksPath, 'utf8')) as MocksSnapshot;
    expect(parsed.rules).toHaveLength(1);
    expect(parsed.rules[0]?.name).toBe('v3');
  });

  it('leaves no tmp files behind after flushing', async () => {
    const store = await MockStore.load(mocksPath);
    store.createRule(buildRuleInput());
    store.createFolder('f', null);
    await store.flush();
    const entries = await readdir(join(tempDir, 'nested', 'dir'));
    expect(entries).toEqual(['mocks.json']);
  });

  it('flush is a no-op when nothing changed', async () => {
    const store = await MockStore.load(mocksPath);
    await store.flush();
    await expect(readFile(mocksPath, 'utf8')).rejects.toThrow();
  });
});

describe('snapshot isolation', () => {
  it('returns copies that do not leak internal state', async () => {
    const store = await MockStore.load(mocksPath);
    const rule = store.createRule(buildRuleInput());
    const snapshot = store.snapshot();
    snapshot.rules[0]!.name = 'mutated';
    snapshot.rules.pop();
    snapshot.folders.push({ id: 'fake', name: 'fake', parentId: null, createdAt: 0 });
    const fresh = store.snapshot();
    expect(fresh.rules).toHaveLength(1);
    expect(fresh.rules[0]?.name).toBe(rule.name);
    expect(fresh.folders).toHaveLength(0);
  });
});
