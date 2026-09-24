import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTOMATION_RUN_STATUS, type AutomationDefinition, type AutomationNode } from '@frigg/shared';
import { AutomationStore } from './store.ts';
import { AutomationRunStore } from './run-store.ts';
import { AutomationManager } from './manager.ts';

const definition: AutomationDefinition = {
  name: 'Smoke test', description: '', schemaVersion: 1 as const,
  nodes: [
    { id: 'start', type: 'start' as const, data: {}, position: { x: 0, y: 0 } },
    { id: 'key', type: 'key' as const, data: { key: 'HOME' as const }, position: { x: 100, y: 0 } },
    { id: 'end', type: 'end' as const, data: {}, position: { x: 200, y: 0 } },
  ],
  edges: [
    { id: 'edge-1', source: 'start', target: 'key' },
    { id: 'edge-2', source: 'key', target: 'end' },
  ],
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('AutomationManager', () => {
  let directory: string;
  let automations: AutomationStore;
  let runs: AutomationRunStore;
  let perform: ReturnType<typeof vi.fn>;
  let manager: AutomationManager;
  let releaseFor: (serial: string) => void;
  let waitForPerform: (serial: string) => Promise<void>;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'frigg-manager-'));
    runs = await AutomationRunStore.load(join(directory, 'runs'));
    automations = await AutomationStore.load(join(directory, 'automations.json'));
    const started = new Map<string, ReturnType<typeof deferred>>();
    const gates = new Map<string, ReturnType<typeof deferred>>();
    perform = vi.fn(async (serial: string, _node: AutomationNode) => {
      let gate = started.get(serial);
      if (!gate) { gate = deferred(); started.set(serial, gate); }
      gate.resolve();
      let release = gates.get(serial);
      if (!release) { release = deferred(); gates.set(serial, release); }
      await release.promise;
    });
    const device = {
      assertReady: vi.fn(async () => undefined),
      screenshot: vi.fn(async () => ({ png: Buffer.from([137, 80, 78, 71, 1]), width: 400, height: 800, rotation: 0 as const })),
      perform,
    };
    manager = new AutomationManager({ automations, runs, device });
    releaseFor = (serial: string) => gates.get(serial)?.resolve();
    waitForPerform = (serial: string) => {
      let gate = started.get(serial);
      if (!gate) { gate = deferred(); started.set(serial, gate); }
      return gate.promise;
    };
    await manager.initialize();
  });

  afterEach(async () => {
    releaseFor('emulator-5554');
    releaseFor('emulator-5556');
    await manager.shutdown();
    await rm(directory, { recursive: true, force: true });
  });

  it('reserves one active run per serial, deduplicates request IDs, and runs other devices independently', async () => {
    const automation = await automations.create(definition);
    const first = await manager.start({ automationId: automation.id, expectedRevision: 1, serial: 'emulator-5554', requestId: 'req-a' });
    await waitForPerform('emulator-5554');
    const firstAgain = await manager.start({ automationId: automation.id, expectedRevision: 1, serial: 'emulator-5554', requestId: 'req-a' });
    expect(firstAgain.id).toBe(first.id);

    const [busy] = await Promise.allSettled([
      manager.start({ automationId: automation.id, expectedRevision: 1, serial: 'emulator-5554', requestId: 'req-b' }),
    ]);
    expect(busy).toMatchObject({ status: 'rejected', reason: { code: 'device_busy' } });

    const secondDevice = await manager.start({ automationId: automation.id, expectedRevision: 1, serial: 'emulator-5556', requestId: 'req-c' });
    await waitForPerform('emulator-5556');
    expect(secondDevice.id).not.toBe(first.id);
    expect(perform).toHaveBeenCalledTimes(2);
  });

  it('reserves the serial before concurrent start requests can both launch', async () => {
    const automation = await automations.create(definition);
    const results = await Promise.allSettled([
      manager.start({ automationId: automation.id, expectedRevision: 1, serial: 'emulator-5554', requestId: 'parallel-a' }),
      manager.start({ automationId: automation.id, expectedRevision: 1, serial: 'emulator-5554', requestId: 'parallel-b' }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toMatchObject([
      { reason: { code: 'device_busy' } },
    ]);
    await waitForPerform('emulator-5554');
    expect(perform).toHaveBeenCalledTimes(1);
  });

  it('deduplicates a direct action test by request ID and serializes it with runs', async () => {
    const node = { id: 'press-home', type: 'key', data: { key: 'HOME' }, position: { x: 0, y: 0 } } as AutomationNode;
    const first = manager.testAction({ serial: 'emulator-5554', requestId: 'test-action-1', node });
    const duplicate = manager.testAction({ serial: 'emulator-5554', requestId: 'test-action-1', node });
    await waitForPerform('emulator-5554');
    expect(perform).toHaveBeenCalledTimes(1);
    await expect(manager.testAction({ serial: 'emulator-5554', requestId: 'test-action-1', node: { ...node, id: 'different' } }))
      .rejects.toMatchObject({ code: 'idempotency_conflict' });
    releaseFor('emulator-5554');
    await expect(Promise.all([first, duplicate])).resolves.toEqual([{ ok: true }, { ok: true }]);
  });

  it('cancels the active runner and releases its device lock after the current command exits', async () => {
    const automation = await automations.create(definition);
    const started = await manager.start({ automationId: automation.id, expectedRevision: 1, serial: 'emulator-5554', requestId: 'req-cancel' });
    await waitForPerform('emulator-5554');
    const terminal = manager.waitForTerminal(started.id);
    await manager.cancel(started.id);
    releaseFor('emulator-5554');
    expect((await terminal).status).toBe(AUTOMATION_RUN_STATUS.cancelled);
    const next = await manager.start({ automationId: automation.id, expectedRevision: 1, serial: 'emulator-5554', requestId: 'req-next' });
    await waitForPerform('emulator-5554');
    expect(next.deviceSerial).toBe('emulator-5554');
  });

  it('marks persisted live runs interrupted during startup and never replays them', async () => {
    const automation = await automations.create(definition);
    const beforeRestart = await AutomationRunStore.load(join(directory, 'runs'));
    await beforeRestart.create({
      id: 'crashed-run', automationId: automation.id, automationRevision: automation.revision,
      automation: definition, deviceSerial: 'emulator-5554', status: AUTOMATION_RUN_STATUS.starting,
      requestId: 'old-request', createdAt: Date.now(), steps: [], artifacts: [],
    });
    await beforeRestart.update('crashed-run', { status: AUTOMATION_RUN_STATUS.running, startedAt: Date.now() });
    const replacement = new AutomationManager({ automations, runs: await AutomationRunStore.load(join(directory, 'runs')), device: {
      assertReady: vi.fn(), screenshot: vi.fn(), perform: vi.fn(),
    } });
    await replacement.initialize();
    expect(replacement.get('crashed-run')).toMatchObject({ status: 'interrupted', errorCode: 'process_restarted' });
    expect(perform).not.toHaveBeenCalled();
    await replacement.shutdown();
  });

  it('drains and cancels live runs on shutdown without starting another action', async () => {
    const shutdownDefinition: AutomationDefinition = {
      ...definition,
      name: 'Shutdown test',
      nodes: [
        ...definition.nodes.slice(0, 2),
        { id: 'key-later', type: 'key', data: { key: 'ENTER' }, position: { x: 150, y: 0 } },
        definition.nodes[2]!,
      ],
      edges: [
        { id: 'edge-1', source: 'start', target: 'key' },
        { id: 'edge-2', source: 'key', target: 'key-later' },
        { id: 'edge-3', source: 'key-later', target: 'end' },
      ],
    };
    const automation = await automations.create(shutdownDefinition);
    const started = await manager.start({ automationId: automation.id, expectedRevision: 1, serial: 'emulator-5554', requestId: 'shutdown' });
    await waitForPerform('emulator-5554');
    const shutdown = manager.shutdown();
    releaseFor('emulator-5554');
    await shutdown;
    expect(manager.get(started.id)).toMatchObject({ status: 'cancelled' });
    expect(perform).toHaveBeenCalledTimes(1);
    await expect(manager.start({ automationId: automation.id, expectedRevision: 1, serial: 'emulator-5554', requestId: 'late' }))
      .rejects.toMatchObject({ code: 'manager_stopping' });
  });

  it('checks the saved revision before taking a run snapshot', async () => {
    const automation = await automations.create(definition);
    await automations.update(automation.id, { ...definition, name: 'Edited' }, 1);
    await expect(manager.start({ automationId: automation.id, expectedRevision: 1, serial: 'emulator-5554', requestId: 'stale' }))
      .rejects.toMatchObject({ code: 'revision_conflict' });
    expect(runs.snapshot()).toEqual([]);
  });
});
