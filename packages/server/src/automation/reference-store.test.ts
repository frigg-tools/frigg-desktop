import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AutomationReferenceStore } from './reference-store.ts';

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);
const automationId = 'a46e43a2-3237-493b-89b6-9f127ecaf6f5';

describe('AutomationReferenceStore', () => {
  let directory: string;

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it('persists screenshots and returns a per-card history in newest-first order', async () => {
    directory = await mkdtemp(join(tmpdir(), 'frigg-reference-store-'));
    const store = await AutomationReferenceStore.load(directory);
    const first = await store.add({ automationId, nodeId: 'tap-a', serial: 'emulator-5554', png, width: 400, height: 800, rotation: 0 });
    const second = await store.add({ automationId, nodeId: 'tap-a', serial: 'emulator-5554', png, width: 400, height: 800, rotation: 0 });
    await store.add({ automationId, nodeId: 'tap-b', serial: 'emulator-5554', png, width: 400, height: 800, rotation: 0 });

    const reopened = await AutomationReferenceStore.load(directory);

    expect(reopened.list(automationId, 'tap-a').map((item) => item.id)).toEqual([second.id, first.id]);
    await expect(reopened.readImage(second.id)).resolves.toEqual(png);
    expect(reopened.list(automationId, 'tap-b')).toHaveLength(1);
  });

  it('keeps the newest configured number of captures for each card', async () => {
    directory = await mkdtemp(join(tmpdir(), 'frigg-reference-retention-'));
    const store = await AutomationReferenceStore.load(directory, { maxCapturesPerNode: 2 });
    const first = await store.add({ automationId, nodeId: 'tap-a', serial: 'emulator-5554', png, width: 400, height: 800, rotation: 0 });
    await store.add({ automationId, nodeId: 'tap-a', serial: 'emulator-5554', png, width: 400, height: 800, rotation: 0 });
    const third = await store.add({ automationId, nodeId: 'tap-a', serial: 'emulator-5554', png, width: 400, height: 800, rotation: 0 });

    expect(store.list(automationId, 'tap-a')).toHaveLength(2);
    await expect(store.readImage(first.id)).rejects.toMatchObject({ code: 'capture_not_found' });
    await expect(store.readImage(third.id)).resolves.toEqual(png);
  });

  it('removes captures for deleted cards and automations', async () => {
    directory = await mkdtemp(join(tmpdir(), 'frigg-reference-delete-'));
    const store = await AutomationReferenceStore.load(directory);
    const card = await store.add({ automationId, nodeId: 'tap-a', serial: 'emulator-5554', png, width: 400, height: 800, rotation: 0 });
    const other = await store.add({ automationId, nodeId: 'tap-b', serial: 'emulator-5554', png, width: 400, height: 800, rotation: 0 });

    await store.retainNodes(automationId, new Set(['tap-b']));
    expect(store.list(automationId, 'tap-a')).toEqual([]);
    await expect(store.readImage(card.id)).rejects.toMatchObject({ code: 'capture_not_found' });
    await store.deleteForAutomation(automationId);
    expect(store.list(automationId)).toEqual([]);
    await expect(store.readImage(other.id)).rejects.toMatchObject({ code: 'capture_not_found' });
  });

  it('rejects invalid metadata and does not accept a path-shaped capture ID', async () => {
    directory = await mkdtemp(join(tmpdir(), 'frigg-reference-validation-'));
    const store = await AutomationReferenceStore.load(directory);

    await expect(store.add({ automationId, nodeId: 'tap-a', serial: '', png, width: 0, height: 800, rotation: 9 as 0 | 1 | 2 | 3 })).rejects.toMatchObject({ code: 'invalid_capture' });
    await expect(store.readImage('../index.json')).rejects.toMatchObject({ code: 'capture_not_found' });
  });
});
