import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AUTOMATION_RUN_STATUS,
  AUTOMATION_STEP_STATUS,
  type AutomationRun,
  type AutomationStepResult,
} from '@frigg/shared';
import { AutomationRunStore } from './run-store.ts';

const graph = {
  name: 'Wait smoke test',
  description: '',
  schemaVersion: 1 as const,
  nodes: [
    { id: 'start', type: 'start' as const, data: {}, position: { x: 0, y: 0 } },
    { id: 'end', type: 'end' as const, data: {}, position: { x: 100, y: 0 } },
  ],
  edges: [{ id: 'edge', source: 'start', target: 'end' }],
};

function run(id: string, status: AutomationRun['status'] = AUTOMATION_RUN_STATUS.starting): AutomationRun {
  return {
    id,
    automationId: `automation-${id}`,
    automationRevision: 1,
    automation: structuredClone(graph),
    deviceSerial: 'emulator-5554',
    status,
    requestId: `request-${id}`,
    createdAt: Number(id.slice(4)) || 1,
    steps: [],
    artifacts: [],
  };
}

function step(nodeId: string, status: AutomationStepResult['status']): AutomationStepResult {
  return { nodeId, nodeType: 'wait', status, startedAt: 1 };
}

async function seedRun(store: AutomationRunStore, value: AutomationRun): Promise<void> {
  await store.create({ ...value, status: AUTOMATION_RUN_STATUS.starting });
  if (value.status === AUTOMATION_RUN_STATUS.starting) return;
  await store.update(value.id, { status: AUTOMATION_RUN_STATUS.running, startedAt: value.startedAt ?? value.createdAt });
  if (value.status !== AUTOMATION_RUN_STATUS.running) {
    await store.update(value.id, { status: value.status, finishedAt: value.finishedAt ?? value.createdAt });
  }
}

describe('AutomationRunStore', () => {
  let directory: string;
  let store: AutomationRunStore;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'frigg-runs-'));
    store = await AutomationRunStore.load(directory);
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('persists each run transition and reloads the final status', async () => {
    const created = run('run-1');
    await seedRun(store, created);
    await store.update(created.id, { status: AUTOMATION_RUN_STATUS.running, startedAt: 2 });
    await store.update(created.id, { status: AUTOMATION_RUN_STATUS.completed, finishedAt: 3 });
    const reloaded = await AutomationRunStore.load(directory);
    expect(reloaded.get(created.id)).toMatchObject({ status: 'completed', startedAt: 2, finishedAt: 3 });
  });

  it('keeps step order stable and rejects terminal-state regression or removed steps', async () => {
    const created = run('run-1', AUTOMATION_RUN_STATUS.running);
    await seedRun(store, created);
    const activeStep = step('wait-a', AUTOMATION_STEP_STATUS.running);
    await store.update(created.id, { steps: [activeStep] });
    await store.update(created.id, { steps: [{ ...activeStep, status: AUTOMATION_STEP_STATUS.completed, finishedAt: 4 }] });
    await expect(store.update(created.id, { steps: [] })).rejects.toMatchObject({ code: 'invalid_step_history' });
    await store.update(created.id, { status: AUTOMATION_RUN_STATUS.completed });
    await expect(store.update(created.id, { status: AUTOMATION_RUN_STATUS.running })).rejects.toMatchObject({ code: 'run_terminal' });
  });

  it('writes screenshot artifacts atomically and reads them by opaque artifact ID', async () => {
    const created = run('run-1', AUTOMATION_RUN_STATUS.running);
    await seedRun(store, created);
    const png = Buffer.from([137, 80, 78, 71, 0, 255]);
    const artifact = await store.addArtifact(created.id, png, { width: 4, height: 8, rotation: 2, nodeId: 'shot' });
    expect(artifact).toMatchObject({ mimeType: 'image/png', size: 6, width: 4, height: 8, rotation: 2, nodeId: 'shot' });
    expect(await store.readArtifact(created.id, artifact.id)).toEqual(png);
    await expect(store.readArtifact('../run-1', artifact.id)).rejects.toMatchObject({ code: 'artifact_not_found' });
    await expect(store.readArtifact(created.id, '../../run.json')).rejects.toMatchObject({ code: 'artifact_not_found' });
  });

  it('rejects invalid run state changes without losing the last persisted status', async () => {
    const created = run('run-1');
    await store.create(created);
    await expect(store.update(created.id, { status: AUTOMATION_RUN_STATUS.completed })).rejects.toMatchObject({ code: 'invalid_run_transition' });
    expect(store.get(created.id)?.status).toBe(AUTOMATION_RUN_STATUS.starting);
  });

  it('retains 100 completed runs and removes the oldest finished run first', async () => {
    for (let index = 0; index < 101; index += 1) {
      await seedRun(store, run(`run-${index}`, AUTOMATION_RUN_STATUS.completed));
    }
    expect(store.snapshot()).toHaveLength(100);
    expect(store.get('run-0')).toBeUndefined();
    expect(store.get('run-100')).toBeDefined();
  });

  it('frees old completed artifacts before accepting a new artifact under the storage cap', async () => {
    const limited = await AutomationRunStore.load(directory, { maxArtifactBytes: 8 });
    const old = run('run-old', AUTOMATION_RUN_STATUS.running);
    await seedRun(limited, old);
    await limited.addArtifact(old.id, Buffer.alloc(6, 1), { width: 2, height: 3, rotation: 0 });
    await limited.update(old.id, { status: AUTOMATION_RUN_STATUS.completed, finishedAt: old.createdAt });
    const active = run('run-active', AUTOMATION_RUN_STATUS.running);
    await seedRun(limited, active);
    const artifact = await limited.addArtifact(active.id, Buffer.alloc(5, 2), { width: 2, height: 3, rotation: 0 });
    expect(artifact.size).toBe(5);
    expect(limited.get(old.id)).toBeUndefined();
    expect(limited.get(active.id)).toBeDefined();
  });

  it('deletes the selected automation history and its associated artifacts', async () => {
    const created = run('run-1');
    await seedRun(store, created);
    await store.addArtifact(created.id, Buffer.from([1, 2]), { width: 1, height: 2, rotation: 0 });
    await store.deleteForAutomation(created.automationId);
    expect(store.snapshot()).toEqual([]);
    await expect(store.readArtifact(created.id, 'missing')).rejects.toMatchObject({ code: 'artifact_not_found' });
  });
});
