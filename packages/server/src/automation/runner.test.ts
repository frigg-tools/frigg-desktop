import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTOMATION_RUN_STATUS,
  AUTOMATION_STEP_STATUS,
  type Automation,
  type AutomationNode,
  type AutomationRun,
} from '@frigg/shared';
import { DeviceAutomationError, type DeviceScreenshot } from './adb.ts';
import { AutomationRunStore } from './run-store.ts';
import { AutomationRunner } from './runner.ts';

const screen: DeviceScreenshot = {
  png: Buffer.from([137, 80, 78, 71, 1]),
  width: 400,
  height: 800,
  rotation: 0,
};

function tapNode(id = 'tap'): AutomationNode {
  return {
    id,
    type: 'tap',
    data: { point: { x: 0.5, y: 0.5, referenceWidth: 400, referenceHeight: 800, referenceRotation: 0 } },
    position: { x: 100, y: 100 },
  };
}

function flow(actions: AutomationNode[]): Automation {
  const nodes: AutomationNode[] = [
    { id: 'start', type: 'start', data: {}, position: { x: 0, y: 0 } },
    ...actions,
    { id: 'end', type: 'end', data: {}, position: { x: 500, y: 0 } },
  ];
  return {
    id: 'automation-1', name: 'Automated sign in', description: '', schemaVersion: 1, revision: 4,
    createdAt: 1, updatedAt: 2, nodes,
    edges: nodes.slice(1).map((node, index) => ({ id: `edge-${index}`, source: nodes[index]!.id, target: node.id })),
  };
}

function runFor(automation: Automation): AutomationRun {
  return {
    id: 'run-1', automationId: automation.id, automationRevision: automation.revision,
    automation: structuredClone(automation), deviceSerial: 'emulator-5554', status: AUTOMATION_RUN_STATUS.starting,
    requestId: 'request-1', createdAt: 3, steps: [], artifacts: [],
  };
}

function waitForRun(runs: AutomationRunStore, runId: string, predicate: (run: AutomationRun) => boolean): Promise<AutomationRun> {
  const current = runs.get(runId);
  if (current && predicate(current)) return Promise.resolve(current);
  return new Promise((resolve) => {
    const listener = (updated: AutomationRun) => {
      if (updated.id !== runId || !predicate(updated)) return;
      runs.off('updated', listener);
      resolve(updated);
    };
    runs.on('updated', listener);
  });
}

describe('AutomationRunner', () => {
  let directory: string;
  let runs: AutomationRunStore;
  let device: {
    assertReady: ReturnType<typeof vi.fn>;
    screenshot: ReturnType<typeof vi.fn>;
    perform: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'frigg-runner-'));
    runs = await AutomationRunStore.load(join(directory, 'runs'));
    device = {
      assertReady: vi.fn(async () => undefined),
      screenshot: vi.fn(async () => structuredClone(screen)),
      perform: vi.fn(async () => undefined),
    };
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('executes each connected action once in path order and persists the revision snapshot', async () => {
    const automation = flow([
      tapNode('tap-first'),
      { id: 'confirm', type: 'key', data: { key: 'ENTER' }, position: { x: 250, y: 100 } },
    ]);
    const created = runFor(automation);
    await runs.create(created);
    const executionOrder: string[] = [];
    device.perform.mockImplementation(async (_serial: string, node: AutomationNode) => { executionOrder.push(node.id); });
    const final = await new AutomationRunner().run({
      automation, serial: created.deviceSerial, runId: created.id, signal: new AbortController().signal, device, runs,
    });
    expect(final.status).toBe(AUTOMATION_RUN_STATUS.completed);
    expect(executionOrder).toEqual(['tap-first', 'confirm']);
    expect(final.automationRevision).toBe(4);
    expect(final.automation.nodes.map((node) => node.id)).toEqual(['start', 'tap-first', 'confirm', 'end']);
    expect(final.steps.map((step) => step.status)).toEqual(Array(4).fill(AUTOMATION_STEP_STATUS.completed));
  });

  it('stops at the first failed device action without executing later actions', async () => {
    const automation = flow([
      tapNode('tap-first'),
      { id: 'type-next', type: 'text', data: { text: 'never' }, position: { x: 250, y: 100 } },
    ]);
    const created = runFor(automation);
    await runs.create(created);
    device.perform.mockRejectedValueOnce(new Error('device disconnected'));
    const final = await new AutomationRunner().run({
      automation, serial: created.deviceSerial, runId: created.id, signal: new AbortController().signal, device, runs,
    });
    expect(final.status).toBe(AUTOMATION_RUN_STATUS.failed);
    expect(device.perform).toHaveBeenCalledTimes(1);
    expect(final.steps.find((step) => step.nodeId === 'tap-first')?.status).toBe(AUTOMATION_STEP_STATUS.failed);
    expect(final.steps.some((step) => step.nodeId === 'type-next')).toBe(false);
  });

  it('checks all referenced screen geometry before performing the first device action', async () => {
    const automation = flow([tapNode()]);
    const created = runFor(automation);
    await runs.create(created);
    device.screenshot.mockResolvedValue({ ...screen, width: 800, height: 400, rotation: 1 });
    const final = await new AutomationRunner().run({
      automation, serial: created.deviceSerial, runId: created.id, signal: new AbortController().signal, device, runs,
    });
    expect(final.status).toBe(AUTOMATION_RUN_STATUS.failed);
    expect(final.errorCode).toBe('geometry_changed');
    expect(device.perform).not.toHaveBeenCalled();
  });

  it('fails a disconnected device before any action is sent', async () => {
    const automation = flow([tapNode()]);
    const created = runFor(automation);
    await runs.create(created);
    device.assertReady.mockRejectedValueOnce(new DeviceAutomationError('device_not_ready', 'Device is offline.'));
    const final = await new AutomationRunner().run({
      automation, serial: created.deviceSerial, runId: created.id, signal: new AbortController().signal, device, runs,
    });
    expect(final.status).toBe(AUTOMATION_RUN_STATUS.failed);
    expect(final.errorCode).toBe('device_not_ready');
    expect(device.perform).not.toHaveBeenCalled();
  });

  it('stores screenshot action artifacts with their node reference', async () => {
    const automation = flow([{ id: 'shot', type: 'screenshot', data: {}, position: { x: 250, y: 100 } }]);
    const created = runFor(automation);
    await runs.create(created);
    const final = await new AutomationRunner().run({
      automation, serial: created.deviceSerial, runId: created.id, signal: new AbortController().signal, device, runs,
    });
    expect(final.status).toBe(AUTOMATION_RUN_STATUS.completed);
    expect(final.artifacts).toHaveLength(1);
    expect(final.artifacts[0]).toMatchObject({ nodeId: 'shot', width: 400, height: 800, mimeType: 'image/png' });
  });

  it('cancels a wait and does not proceed to later device actions', async () => {
    const automation = flow([
      { id: 'wait', type: 'wait', data: { durationMs: 60_000 }, position: { x: 100, y: 100 } },
      tapNode('tap-later'),
    ]);
    const created = runFor(automation);
    await runs.create(created);
    const controller = new AbortController();
    const waitStarted = waitForRun(runs, created.id, (current) =>
      current.steps.some((step) => step.nodeId === 'wait' && step.status === AUTOMATION_STEP_STATUS.running),
    );
    const execution = new AutomationRunner().run({ automation, serial: created.deviceSerial, runId: created.id, signal: controller.signal, device, runs });
    await waitStarted;
    controller.abort();
    const final = await execution;
    expect(final.status).toBe(AUTOMATION_RUN_STATUS.cancelled);
    expect(device.perform).not.toHaveBeenCalled();
  });

  it('does not start the next step while an in-flight command is finishing after cancellation', async () => {
    const automation = flow([
      tapNode('tap-current'),
      { id: 'key-later', type: 'key', data: { key: 'HOME' }, position: { x: 250, y: 100 } },
    ]);
    const created = runFor(automation);
    await runs.create(created);
    let signalCommandStarted!: () => void;
    let releaseCommand!: () => void;
    const commandStarted = new Promise<void>((resolve) => { signalCommandStarted = resolve; });
    const commandRelease = new Promise<void>((resolve) => { releaseCommand = resolve; });
    device.perform.mockImplementation(async () => {
      signalCommandStarted();
      await commandRelease;
    });
    const controller = new AbortController();
    const execution = new AutomationRunner().run({ automation, serial: created.deviceSerial, runId: created.id, signal: controller.signal, device, runs });
    await commandStarted;
    controller.abort();
    releaseCommand();
    const final = await execution;
    expect(final.status).toBe(AUTOMATION_RUN_STATUS.cancelled);
    expect(device.perform).toHaveBeenCalledTimes(1);
    expect(device.perform.mock.calls[0]?.[1]).toMatchObject({ id: 'tap-current' });
  });
});
