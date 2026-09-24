import { randomUUID } from 'node:crypto';
import {
  AUTOMATION_RUN_STATUS,
  AUTOMATION_NODE_TYPE,
  type Automation,
  type AutomationNode,
  type AutomationRun,
  type AutomationRunStatus,
} from '@frigg/shared';
import { AutomationStore } from './store.ts';
import { AutomationRunStore } from './run-store.ts';
import { AutomationRunner, type AutomationDevice } from './runner.ts';

export interface AutomationStartInput {
  automationId: string;
  expectedRevision: number;
  serial: string;
  requestId: string;
}

export interface AutomationManagerOptions {
  automations: AutomationStore;
  runs: AutomationRunStore;
  device: AutomationDevice;
  runner?: AutomationRunner;
  maxRunMs?: number;
}

type RequestIdentity = Pick<AutomationStartInput, 'automationId' | 'expectedRevision' | 'serial'>;

export class AutomationManagerError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'AutomationManagerError';
  }
}

const terminalStatuses = new Set<AutomationRunStatus>([
  AUTOMATION_RUN_STATUS.completed,
  AUTOMATION_RUN_STATUS.failed,
  AUTOMATION_RUN_STATUS.cancelled,
  AUTOMATION_RUN_STATUS.interrupted,
]);

function isActiveStatus(status: AutomationRunStatus): boolean {
  return !terminalStatuses.has(status);
}

function identityMatches(left: RequestIdentity, right: RequestIdentity): boolean {
  return left.automationId === right.automationId && left.expectedRevision === right.expectedRevision && left.serial === right.serial;
}

export class AutomationManager {
  private readonly runner: AutomationRunner;
  private readonly maxRunMs: number;
  private readonly activeBySerial = new Map<string, string>();
  private readonly requestIndex = new Map<string, { identity: RequestIdentity; runId: string }>();
  private readonly pendingStarts = new Map<string, { identity: RequestIdentity; promise: Promise<AutomationRun> }>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly executions = new Map<string, Promise<unknown>>();
  private readonly testActionRequests = new Map<string, { fingerprint: string; promise: Promise<{ ok: true }> }>();
  private readonly testActionControllers = new Map<string, AbortController>();
  private readonly testActionWork = new Map<string, Promise<{ ok: true }>>();
  private readonly deletingAutomations = new Set<string>();
  private shuttingDown = false;
  private initialized = false;

  constructor(private readonly options: AutomationManagerOptions) {
    this.runner = options.runner ?? new AutomationRunner();
    this.maxRunMs = options.maxRunMs ?? 10 * 60 * 1000;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    for (const run of this.options.runs.snapshot()) {
      const identity = { automationId: run.automationId, expectedRevision: run.automationRevision, serial: run.deviceSerial };
      this.requestIndex.set(run.requestId, { identity, runId: run.id });
      if (isActiveStatus(run.status)) {
        await this.options.runs.update(run.id, {
          status: AUTOMATION_RUN_STATUS.interrupted,
          finishedAt: Date.now(),
          errorCode: 'process_restarted',
          errorMessage: 'Frigg restarted before this run finished. The device actions were not replayed.',
        });
      }
    }
  }

  async start(input: AutomationStartInput): Promise<AutomationRun> {
    if (this.shuttingDown) throw new AutomationManagerError('manager_stopping', 'Frigg is shutting down and cannot start a new automation.');
    this.assertStartInput(input);

    const identity: RequestIdentity = {
      automationId: input.automationId,
      expectedRevision: input.expectedRevision,
      serial: input.serial,
    };
    const previous = this.requestIndex.get(input.requestId);
    if (previous) {
      if (!identityMatches(previous.identity, identity)) {
        throw new AutomationManagerError('idempotency_conflict', 'This request ID was already used for a different automation run.');
      }
      const existingRun = this.options.runs.get(previous.runId);
      if (existingRun) return existingRun;
      throw new AutomationManagerError('not_found', 'The run associated with this request ID has expired from history.');
    }
    const pending = this.pendingStarts.get(input.requestId);
    if (pending) {
      if (!identityMatches(pending.identity, identity)) {
        throw new AutomationManagerError('idempotency_conflict', 'This request ID is already starting a different automation run.');
      }
      return pending.promise;
    }

    if (this.deletingAutomations.has(input.automationId)) {
      throw new AutomationManagerError('automation_active', 'Automation is being deleted.');
    }

    const automation = this.options.automations.get(input.automationId);
    if (!automation) throw new AutomationManagerError('not_found', 'Automation not found.');
    if (automation.revision !== input.expectedRevision) {
      throw new AutomationManagerError('revision_conflict', `Automation revision is now ${automation.revision}.`);
    }
    if (this.activeBySerial.has(input.serial)) {
      throw new AutomationManagerError('device_busy', `Android device ${input.serial} already has an active automation run.`);
    }

    const runId = randomUUID();
    this.activeBySerial.set(input.serial, runId);
    const promise = Promise.resolve().then(() => this.createAndLaunch(automation, input, runId));
    this.pendingStarts.set(input.requestId, { identity, promise });
    try {
      return await promise;
    } finally {
      this.pendingStarts.delete(input.requestId);
    }
  }

  async cancel(runId: string): Promise<AutomationRun> {
    const run = this.options.runs.get(runId);
    if (!run) throw new AutomationManagerError('not_found', 'Automation run not found.');
    if (terminalStatuses.has(run.status)) return run;

    let updated = run;
    if (run.status !== AUTOMATION_RUN_STATUS.cancelling) {
      updated = await this.options.runs.update(runId, { status: AUTOMATION_RUN_STATUS.cancelling });
    }
    this.controllers.get(runId)?.abort();
    return updated;
  }

  testAction(input: { serial: string; requestId: string; node: AutomationNode }): Promise<{ ok: true }> {
    if (this.shuttingDown) return Promise.reject(new AutomationManagerError('manager_stopping', 'Frigg is shutting down.'));
    if (input.requestId.trim() === '' || input.requestId.length > 128 || /[\0\r\n]/.test(input.requestId)) {
      return Promise.reject(new AutomationManagerError('invalid_request', 'Test action request ID must contain between 1 and 128 safe characters.'));
    }
    if (input.serial.trim() === '' || input.serial.length > 128 || /[\s\0]/.test(input.serial)) {
      return Promise.reject(new AutomationManagerError('invalid_request', 'Select a connected Android device.'));
    }
    if (
      input.node.type === AUTOMATION_NODE_TYPE.start ||
      input.node.type === AUTOMATION_NODE_TYPE.end ||
      input.node.type === AUTOMATION_NODE_TYPE.wait ||
      input.node.type === AUTOMATION_NODE_TYPE.screenshot
    ) {
      return Promise.reject(new AutomationManagerError('invalid_request', 'Only a device action block can be tested directly.'));
    }

    const fingerprint = `${input.serial}:${JSON.stringify(input.node)}`;
    const existing = this.testActionRequests.get(input.requestId);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        return Promise.reject(new AutomationManagerError('idempotency_conflict', 'This request ID was already used for a different test action.'));
      }
      return existing.promise;
    }
    if (this.activeBySerial.has(input.serial)) {
      return Promise.reject(new AutomationManagerError('device_busy', `Android device ${input.serial} already has an active operation.`));
    }

    const operationId = `test-${randomUUID()}`;
    const controller = new AbortController();
    this.activeBySerial.set(input.serial, operationId);
    this.testActionControllers.set(operationId, controller);
    const promise = Promise.resolve()
      .then(async () => {
        await this.options.device.perform(input.serial, structuredClone(input.node), controller.signal);
        return { ok: true as const };
      })
      .finally(() => {
        this.testActionControllers.delete(operationId);
        this.testActionWork.delete(operationId);
        if (this.activeBySerial.get(input.serial) === operationId) this.activeBySerial.delete(input.serial);
      });
    this.testActionRequests.set(input.requestId, { fingerprint, promise });
    while (this.testActionRequests.size > 500) {
      const oldestRequest = this.testActionRequests.keys().next().value;
      if (oldestRequest === undefined) break;
      this.testActionRequests.delete(oldestRequest);
    }
    this.testActionWork.set(operationId, promise);
    return promise;
  }

  get(runId: string): AutomationRun | undefined {
    return this.options.runs.get(runId);
  }

  list(automationId?: string): AutomationRun[] {
    return this.options.runs.snapshot(automationId);
  }

  isActive(automationId: string): boolean {
    return [...this.pendingStarts.values()].some(({ identity }) => identity.automationId === automationId) ||
      this.options.runs.snapshot(automationId).some((run) => isActiveStatus(run.status));
  }

  async deleteAutomation(automationId: string): Promise<void> {
    if (this.deletingAutomations.has(automationId)) {
      throw new AutomationManagerError('automation_active', 'Automation is already being deleted.');
    }
    if (!this.options.automations.get(automationId)) {
      throw new AutomationManagerError('not_found', 'Automation not found.');
    }
    this.deletingAutomations.add(automationId);
    try {
      if (this.isActive(automationId)) {
        throw new AutomationManagerError('automation_active', 'Cancel the active run before deleting this automation.');
      }
      await this.options.automations.delete(automationId);
      await this.options.runs.deleteForAutomation(automationId);
      for (const [requestId, entry] of this.requestIndex) {
        if (entry.identity.automationId === automationId) this.requestIndex.delete(requestId);
      }
    } finally {
      this.deletingAutomations.delete(automationId);
    }
  }

  async waitForTerminal(runId: string): Promise<AutomationRun> {
    const current = this.options.runs.get(runId);
    if (!current) throw new AutomationManagerError('not_found', 'Automation run not found.');
    if (terminalStatuses.has(current.status)) return current;
    return new Promise((resolve) => {
      const listener = (updated: AutomationRun) => {
        if (updated.id !== runId || !terminalStatuses.has(updated.status)) return;
        this.options.runs.off('updated', listener);
        const execution = this.executions.get(runId);
        if (execution) void execution.then(() => resolve(this.options.runs.get(runId) ?? updated));
        else resolve(updated);
      };
      this.options.runs.on('updated', listener);
    });
  }

  async shutdown(): Promise<void> {
    if (this.shuttingDown) {
      await Promise.allSettled([...this.pendingStarts.values()].map(({ promise }) => promise));
      await Promise.allSettled(this.executions.values());
      await Promise.all([this.options.automations.flush(), this.options.runs.flush()]);
      return;
    }
    this.shuttingDown = true;
    for (const controller of this.testActionControllers.values()) controller.abort();
    const active = this.options.runs.snapshot().filter((run) => isActiveStatus(run.status));
    await Promise.allSettled(active.map((run) => this.cancel(run.id)));
    await Promise.allSettled([...this.pendingStarts.values()].map(({ promise }) => promise));
    await Promise.allSettled(this.executions.values());
    await Promise.allSettled(this.testActionWork.values());
    await Promise.all([this.options.automations.flush(), this.options.runs.flush()]);
  }

  private async createAndLaunch(automation: Automation, input: AutomationStartInput, runId: string): Promise<AutomationRun> {
    const controller = new AbortController();
    this.controllers.set(runId, controller);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      if (this.shuttingDown) throw new AutomationManagerError('manager_stopping', 'Frigg is shutting down.');
      const run: AutomationRun = {
        id: runId,
        automationId: automation.id,
        automationRevision: automation.revision,
        automation: {
          name: automation.name,
          description: automation.description,
          schemaVersion: automation.schemaVersion,
          nodes: structuredClone(automation.nodes),
          edges: structuredClone(automation.edges),
        },
        deviceSerial: input.serial,
        status: AUTOMATION_RUN_STATUS.starting,
        requestId: input.requestId,
        createdAt: Date.now(),
        steps: [],
        artifacts: [],
      };
      const created = await this.options.runs.create(run);
      this.requestIndex.set(input.requestId, {
        identity: { automationId: input.automationId, expectedRevision: input.expectedRevision, serial: input.serial },
        runId,
      });

      timeout = setTimeout(() => controller.abort(), this.maxRunMs);
      timeout.unref?.();
      const execution = Promise.resolve()
        .then(() => this.runner.run({
          automation: created.automation,
          serial: created.deviceSerial,
          runId: created.id,
          signal: controller.signal,
          device: this.options.device,
          runs: this.options.runs,
        }))
        .catch(async (error: unknown) => {
          const latest = this.options.runs.get(runId);
          if (latest && !terminalStatuses.has(latest.status)) {
            await this.options.runs.update(runId, {
              status: controller.signal.aborted ? AUTOMATION_RUN_STATUS.cancelled : AUTOMATION_RUN_STATUS.failed,
              finishedAt: Date.now(),
              errorCode: controller.signal.aborted ? 'cancelled' : 'runner_failed',
              errorMessage: error instanceof Error ? error.message : 'Automation runner failed.',
            });
          }
        })
        .finally(() => {
          if (timeout) clearTimeout(timeout);
          this.controllers.delete(runId);
          this.executions.delete(runId);
          if (this.activeBySerial.get(input.serial) === runId) this.activeBySerial.delete(input.serial);
        });
      this.executions.set(runId, execution);
      return created;
    } catch (error) {
      if (timeout) clearTimeout(timeout);
      this.controllers.delete(runId);
      if (this.activeBySerial.get(input.serial) === runId) this.activeBySerial.delete(input.serial);
      throw error;
    }
  }

  private assertStartInput(input: AutomationStartInput): void {
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1) {
      throw new AutomationManagerError('invalid_request', 'Automation revision must be a positive integer.');
    }
    if (input.requestId.trim() === '' || input.requestId.length > 128 || /[\0\r\n]/.test(input.requestId)) {
      throw new AutomationManagerError('invalid_request', 'Run request ID must contain between 1 and 128 safe characters.');
    }
    if (input.serial.trim() === '' || input.serial.length > 128 || /[\s\0]/.test(input.serial)) {
      throw new AutomationManagerError('invalid_request', 'Select a connected Android device.');
    }
  }
}
