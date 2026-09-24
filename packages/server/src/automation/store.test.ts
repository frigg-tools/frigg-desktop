import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { validateAutomation } from './validation.ts';
import { AutomationStore } from './store.ts';

const definition = {
  name: 'Open app',
  description: '',
  schemaVersion: 1 as const,
  nodes: [
    { id: 'start', type: 'start' as const, data: {}, position: { x: 0, y: 0 } },
    { id: 'end', type: 'end' as const, data: {}, position: { x: 200, y: 0 } },
  ],
  edges: [{ id: 'start-end', source: 'start', target: 'end' }],
};

describe('AutomationStore', () => {
  let directory: string;
  let filePath: string;
  let store: AutomationStore;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'frigg-automations-'));
    filePath = join(directory, 'automations.json');
    store = await AutomationStore.load(filePath);
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('creates, renames, lists and persists automation folders', async () => {
    const created = await store.createFolder('  Sign-in flows  ');
    expect(created.name).toBe('Sign-in flows');

    const unfiled = await store.create(definition);
    const assigned = await store.update(unfiled.id, { ...definition, folderId: created.id }, unfiled.revision);
    expect(assigned.folderId).toBe(created.id);
    expect((await store.duplicate(assigned.id)).folderId).toBe(created.id);

    const renamed = await store.renameFolder(created.id, 'Account checks');
    expect(renamed).toMatchObject({ id: created.id, name: 'Account checks', createdAt: created.createdAt });
    expect(await store.listFolders()).toEqual([renamed]);

    const reloaded = await AutomationStore.load(filePath);
    expect(await reloaded.listFolders()).toEqual([renamed]);
    expect(reloaded.get(assigned.id)?.folderId).toBe(created.id);
  });

  it('keeps old automation files without a folder collection readable', async () => {
    await writeFile(filePath, JSON.stringify({
      schemaVersion: 1,
      automations: [{ ...definition, id: 'legacy-automation', revision: 1, createdAt: 1, updatedAt: 1 }],
    }), 'utf8');
    const legacyStore = await AutomationStore.load(filePath);

    expect(await legacyStore.listFolders()).toEqual([]);
    expect(legacyStore.get('legacy-automation')).toMatchObject({ name: definition.name, revision: 1 });
    expect(legacyStore.get('legacy-automation')).not.toHaveProperty('folderId');
  });

  it('unfiles automations when deleting their folder and preserves their workflow', async () => {
    const folder = await store.createFolder('Login');
    const created = await store.create({ ...definition, folderId: folder.id });

    await store.deleteFolder(folder.id);

    const unfiled = store.get(created.id);
    expect(unfiled).toMatchObject({ id: created.id, name: definition.name, revision: 2, nodes: definition.nodes, edges: definition.edges });
    expect(unfiled).not.toHaveProperty('folderId');
    expect(await store.listFolders()).toEqual([]);
    const reloaded = await AutomationStore.load(filePath);
    expect(reloaded.get(created.id)).not.toHaveProperty('folderId');
  });

  it('rejects duplicate folder names and automation assignments to missing folders', async () => {
    await store.createFolder('Login');
    await expect(store.createFolder(' login ')).rejects.toMatchObject({ code: 'folder_name_conflict' });
    await expect(store.create({ ...definition, folderId: 'missing-folder' })).rejects.toMatchObject({ code: 'folder_not_found' });
  });

  it('persists a new definition and reloads it with stable metadata', async () => {
    const created = await store.create(definition);
    const loaded = await AutomationStore.load(filePath);
    expect(loaded.get(created.id)).toEqual(created);
    expect(created.revision).toBe(1);
    expect(created.createdAt).toBeGreaterThan(0);
  });

  it('increments a revision while preserving the definition identity and creation time', async () => {
    const created = await store.create(definition);
    const updated = await store.update(created.id, { ...definition, name: 'Launch the app' }, created.revision);
    expect(updated).toMatchObject({ id: created.id, revision: 2, createdAt: created.createdAt, name: 'Launch the app' });
    expect(updated.updatedAt).toBeGreaterThanOrEqual(created.updatedAt);
  });

  it('rejects stale updates without changing the current revision', async () => {
    const created = await store.create(definition);
    await store.update(created.id, { ...definition, name: 'Renamed' }, created.revision);
    await expect(store.update(created.id, { ...definition, name: 'Stale edit' }, created.revision))
      .rejects.toMatchObject({ code: 'revision_conflict' });
    expect(store.get(created.id)?.name).toBe('Renamed');
    expect(store.get(created.id)?.revision).toBe(2);
  });

  it('serializes concurrent updates that share the same expected revision', async () => {
    const created = await store.create(definition);
    const results = await Promise.allSettled([
      store.update(created.id, { ...definition, name: 'First edit' }, 1),
      store.update(created.id, { ...definition, name: 'Second edit' }, 1),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(store.get(created.id)?.revision).toBe(2);
  });

  it('duplicates with a new identity and independent mutable graph data', async () => {
    const created = await store.create(definition);
    const duplicate = await store.duplicate(created.id);
    duplicate.nodes[0]!.position.x = 900;
    expect(duplicate.id).not.toBe(created.id);
    expect(duplicate.revision).toBe(1);
    expect(store.get(created.id)?.nodes[0]?.position.x).toBe(0);
    expect(store.get(duplicate.id)?.nodes[0]?.position.x).toBe(0);
  });

  it('duplicates coordinate actions without keeping the original reference screenshot pointer', async () => {
    const coordinateDefinition = {
      ...definition,
      nodes: [
        definition.nodes[0]!,
        { id: 'tap', type: 'tap' as const, data: { point: { x: 0.5, y: 0.5, referenceWidth: 400, referenceHeight: 800, referenceRotation: 0 as const }, referenceCaptureId: '8c7fb58a-5cf9-46fa-829b-d443fe611388' }, position: { x: 100, y: 0 } },
        definition.nodes[1]!,
      ],
      edges: [{ id: 'a', source: 'start', target: 'tap' }, { id: 'b', source: 'tap', target: 'end' }],
    };
    const created = await store.create(coordinateDefinition);
    const duplicate = await store.duplicate(created.id);
    expect(duplicate.nodes[1]?.data).toMatchObject({ point: { x: 0.5, y: 0.5, referenceWidth: 400, referenceHeight: 800, referenceRotation: 0 } });
    expect(duplicate.nodes[1]?.data).not.toHaveProperty('referenceCaptureId');
  });

  it('chooses a new duplicate name when a copy with that name already exists', async () => {
    const created = await store.create(definition);
    await store.create({ ...definition, name: `${definition.name} copy` });
    const firstDuplicate = await store.duplicate(created.id);
    const secondDuplicate = await store.duplicate(created.id);
    expect(firstDuplicate.name).toBe('Open app copy 2');
    expect(secondDuplicate.name).toBe('Open app copy 3');
    expect(new Set(store.snapshot().map((automation) => automation.name.toLowerCase())).size).toBe(4);
  });

  it('keeps duplicates within the name limit when the original uses all 80 characters', async () => {
    const created = await store.create({ ...definition, name: 'A'.repeat(80) });
    const duplicate = await store.duplicate(created.id);
    expect(duplicate.name).toHaveLength(80);
    expect(validateAutomation(duplicate).valid).toBe(true);
  });

  it('rejects deletion while an automation has an active run', async () => {
    let active = true;
    const activeStore = await AutomationStore.load(filePath, { isActive: () => active });
    const created = await activeStore.create(definition);
    await expect(activeStore.delete(created.id)).rejects.toMatchObject({ code: 'automation_active' });
    expect(activeStore.get(created.id)).toBeDefined();
    active = false;
    await activeStore.delete(created.id);
    expect(activeStore.get(created.id)).toBeUndefined();
  });

  it('does not replace malformed persisted JSON with an empty store', async () => {
    const corrupt = '{ "automations": [broken';
    await writeFile(filePath, corrupt, 'utf8');
    await expect(AutomationStore.load(filePath)).rejects.toMatchObject({ code: 'corrupt_store' });
    expect(await readFile(filePath, 'utf8')).toBe(corrupt);
  });

  it('rejects invalid definitions before writing them', async () => {
    await expect(store.create({ ...definition, name: '  ' })).rejects.toMatchObject({ code: 'invalid_automation' });
    expect(store.snapshot()).toEqual([]);
    await expect(readFile(filePath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
