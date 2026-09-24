import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { EventEmitter } from 'node:events';
import {
  AUTOMATION_RUN_STATUS,
  AUTOMATION_STEP_STATUS,
  type AutomationArtifact,
  type AutomationRun,
  type AutomationRunStatus,
  type AutomationStepResult,
} from '@frigg/shared';

export interface AutomationRunStoreLimits {
  maxCompletedRuns?: number;
  maxArtifactBytes?: number;
}

export interface AutomationArtifactMetadata {
  width: number;
  height: number;
  rotation: 0 | 1 | 2 | 3;
  nodeId?: string;
}

export type AutomationRunStoreErrorCode =
  | 'run_not_found'
  | 'artifact_not_found'
  | 'invalid_run'
  | 'invalid_run_transition'
  | 'invalid_step_history'
  | 'run_terminal'
  | 'artifact_limit_exceeded'
  | 'corrupt_run_store'
  | 'persistence_failed';

export class AutomationRunStoreError extends Error {
  constructor(readonly code: AutomationRunStoreErrorCode, message: string) {
    super(message);
    this.name = 'AutomationRunStoreError';
  }
}

type RunPatch = Partial<Omit<AutomationRun, 'id' | 'automationId' | 'automationRevision' | 'automation' | 'deviceSerial' | 'requestId' | 'createdAt'>>;

const terminalStatuses = new Set<AutomationRunStatus>([
  AUTOMATION_RUN_STATUS.completed,
  AUTOMATION_RUN_STATUS.failed,
  AUTOMATION_RUN_STATUS.cancelled,
  AUTOMATION_RUN_STATUS.interrupted,
]);

const allowedTransitions: Record<AutomationRunStatus, ReadonlySet<AutomationRunStatus>> = {
  [AUTOMATION_RUN_STATUS.starting]: new Set([
    AUTOMATION_RUN_STATUS.running, AUTOMATION_RUN_STATUS.cancelling,
    AUTOMATION_RUN_STATUS.failed, AUTOMATION_RUN_STATUS.cancelled, AUTOMATION_RUN_STATUS.interrupted,
  ]),
  [AUTOMATION_RUN_STATUS.running]: new Set([
    AUTOMATION_RUN_STATUS.cancelling, AUTOMATION_RUN_STATUS.completed,
    AUTOMATION_RUN_STATUS.failed, AUTOMATION_RUN_STATUS.cancelled, AUTOMATION_RUN_STATUS.interrupted,
  ]),
  [AUTOMATION_RUN_STATUS.cancelling]: new Set([
    AUTOMATION_RUN_STATUS.cancelled, AUTOMATION_RUN_STATUS.failed, AUTOMATION_RUN_STATUS.interrupted,
  ]),
  [AUTOMATION_RUN_STATUS.completed]: new Set(),
  [AUTOMATION_RUN_STATUS.failed]: new Set(),
  [AUTOMATION_RUN_STATUS.cancelled]: new Set(),
  [AUTOMATION_RUN_STATUS.interrupted]: new Set(),
};

function copy<T>(value: T): T {
  return structuredClone(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRunId(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function isMissing(error: unknown): boolean {
  return isObject(error) && error.code === 'ENOENT';
}

function validateRun(value: unknown): asserts value is AutomationRun {
  if (!isObject(value) || typeof value.id !== 'string' || !isRunId(value.id) ||
      typeof value.automationId !== 'string' || typeof value.automationRevision !== 'number' ||
      typeof value.deviceSerial !== 'string' || typeof value.requestId !== 'string' ||
      typeof value.createdAt !== 'number' || !Array.isArray(value.steps) || !Array.isArray(value.artifacts) ||
      !Object.values(AUTOMATION_RUN_STATUS).includes(value.status as AutomationRunStatus) ||
      !isObject(value.automation) || !Array.isArray(value.automation.nodes) || !Array.isArray(value.automation.edges)) {
    throw new AutomationRunStoreError('invalid_run', 'Automation run data is malformed.');
  }
}

function validateStepHistory(previous: AutomationStepResult[], next: AutomationStepResult[]): void {
  if (next.length < previous.length) {
    throw new AutomationRunStoreError('invalid_step_history', 'Run step history cannot remove earlier steps.');
  }
  for (let index = 0; index < previous.length; index += 1) {
    const before = previous[index]!;
    const after = next[index]!;
    if (before.nodeId !== after.nodeId || before.nodeType !== after.nodeType || before.startedAt !== after.startedAt) {
      throw new AutomationRunStoreError('invalid_step_history', 'Run step history must retain its original order and identity.');
    }
    if (before.status !== after.status) {
      const allowed = before.status === AUTOMATION_STEP_STATUS.running && (
        after.status === AUTOMATION_STEP_STATUS.completed ||
        after.status === AUTOMATION_STEP_STATUS.failed ||
        after.status === AUTOMATION_STEP_STATUS.cancelled
      );
      if (!allowed) throw new AutomationRunStoreError('invalid_step_history', 'A step can only move from running to a terminal state.');
    }
  }
}

export class AutomationRunStore extends EventEmitter {
  private readonly entries = new Map<string, AutomationRun>();
  private mutationTail: Promise<void> = Promise.resolve();
  private readonly maxCompletedRuns: number;
  private readonly maxArtifactBytes: number;

  private constructor(private readonly directory: string, limits: AutomationRunStoreLimits) {
    super();
    this.maxCompletedRuns = limits.maxCompletedRuns ?? 100;
    this.maxArtifactBytes = limits.maxArtifactBytes ?? 500 * 1024 * 1024;
  }

  static async load(directory: string, limits: AutomationRunStoreLimits = {}): Promise<AutomationRunStore> {
    const store = new AutomationRunStore(resolve(directory), limits);
    await mkdir(store.directory, { recursive: true, mode: 0o700 });
    const folders = await readdir(store.directory, { withFileTypes: true });
    for (const folder of folders) {
      if (!folder.isDirectory() || !isRunId(folder.name)) continue;
      const filePath = store.runFilePath(folder.name);
      let content: string;
      try {
        content = await readFile(filePath, 'utf8');
      } catch (error) {
        if (isMissing(error)) continue;
        throw new AutomationRunStoreError('corrupt_run_store', `Could not read run ${folder.name}.`);
      }
      try {
        const parsed: unknown = JSON.parse(content);
        validateRun(parsed);
        if (parsed.id !== folder.name) throw new Error('Run ID does not match its folder.');
        store.entries.set(parsed.id, copy(parsed));
      } catch (error) {
        throw new AutomationRunStoreError(
          'corrupt_run_store',
          `Could not load run ${folder.name}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    await store.enforceRunRetention();
    return store;
  }

  snapshot(automationId?: string): AutomationRun[] {
    return [...this.entries.values()]
      .filter((run) => automationId === undefined || run.automationId === automationId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(copy);
  }

  get(runId: string): AutomationRun | undefined {
    const run = this.entries.get(runId);
    return run ? copy(run) : undefined;
  }

  create(run: AutomationRun): Promise<AutomationRun> {
    return this.mutate(async () => {
      validateRun(run);
      if (this.entries.has(run.id)) throw new AutomationRunStoreError('invalid_run', `Run already exists: ${run.id}`);
      if (run.status !== AUTOMATION_RUN_STATUS.starting) {
        throw new AutomationRunStoreError('invalid_run', 'A new run must start in the starting state.');
      }
      const next = copy(run);
      await mkdir(this.artifactDirectory(run.id), { recursive: true, mode: 0o700 });
      await this.persist(next);
      this.entries.set(next.id, next);
      await this.enforceRunRetention();
      const created = this.get(next.id);
      if (!created) throw new AutomationRunStoreError('invalid_run', 'Run exceeded the configured retention limit.');
      this.emit('updated', copy(created));
      return created;
    });
  }

  update(runId: string, patch: RunPatch): Promise<AutomationRun> {
    return this.mutate(async () => {
      const previous = this.entries.get(runId);
      if (!previous) throw new AutomationRunStoreError('run_not_found', `Run not found: ${runId}`);
      const next = { ...previous, ...copy(patch) };
      if (terminalStatuses.has(previous.status)) {
        throw new AutomationRunStoreError('run_terminal', 'A terminal run cannot change state.');
      }
      if (next.status !== previous.status && !allowedTransitions[previous.status].has(next.status)) {
        throw new AutomationRunStoreError('invalid_run_transition', `Cannot move a run from ${previous.status} to ${next.status}.`);
      }
      if (patch.steps) validateStepHistory(previous.steps, next.steps);
      validateRun(next);
      await this.persist(next);
      this.entries.set(runId, next);
      if (terminalStatuses.has(next.status)) await this.enforceRunRetention();
      this.emit('updated', copy(next));
      return copy(next);
    });
  }

  addArtifact(runId: string, png: Buffer, metadata: AutomationArtifactMetadata): Promise<AutomationArtifact> {
    return this.mutate(async () => {
      const run = this.entries.get(runId);
      if (!run) throw new AutomationRunStoreError('run_not_found', `Run not found: ${runId}`);
      if (terminalStatuses.has(run.status)) {
        throw new AutomationRunStoreError('run_terminal', 'A screenshot cannot be added to a terminal run.');
      }
      if (png.length > this.maxArtifactBytes) {
        throw new AutomationRunStoreError('artifact_limit_exceeded', 'Screenshot exceeds the available artifact storage.');
      }
      await this.ensureArtifactSpace(png.length);
      const artifact: AutomationArtifact = {
        id: randomUUID(), mimeType: 'image/png', size: png.length,
        width: metadata.width, height: metadata.height, rotation: metadata.rotation,
        createdAt: Date.now(), ...(metadata.nodeId === undefined ? {} : { nodeId: metadata.nodeId }),
      };
      const runDirectory = this.artifactDirectory(runId);
      await mkdir(runDirectory, { recursive: true, mode: 0o700 });
      const artifactPath = this.artifactPath(runId, artifact.id);
      const temporaryPath = `${artifactPath}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporaryPath, png, { mode: 0o600, flag: 'wx' });
        await rename(temporaryPath, artifactPath);
      } catch (error) {
        await rm(temporaryPath, { force: true }).catch(() => undefined);
        throw new AutomationRunStoreError('persistence_failed', error instanceof Error ? error.message : String(error));
      }
      const updated = { ...run, artifacts: [...run.artifacts, artifact] };
      try {
        await this.persist(updated);
      } catch (error) {
        await rm(artifactPath, { force: true }).catch(() => undefined);
        throw error;
      }
      this.entries.set(runId, updated);
      this.emit('updated', copy(updated));
      return copy(artifact);
    });
  }

  async readArtifact(runId: string, artifactId: string): Promise<Buffer> {
    if (!isRunId(runId) || !/^[0-9a-f-]{36}$/i.test(artifactId)) {
      throw new AutomationRunStoreError('artifact_not_found', 'Screenshot artifact was not found.');
    }
    const run = this.entries.get(runId);
    if (!run || !run.artifacts.some((artifact) => artifact.id === artifactId)) {
      throw new AutomationRunStoreError('artifact_not_found', 'Screenshot artifact was not found.');
    }
    try {
      return await readFile(this.artifactPath(runId, artifactId));
    } catch {
      throw new AutomationRunStoreError('artifact_not_found', 'Screenshot artifact was not found.');
    }
  }

  deleteForAutomation(automationId: string): Promise<void> {
    return this.mutate(async () => {
      const matches = [...this.entries.values()].filter((run) => run.automationId === automationId);
      for (const run of matches) {
        await rm(this.safeRunDirectory(run.id), { recursive: true, force: true });
        this.entries.delete(run.id);
      }
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

  private async persist(run: AutomationRun): Promise<void> {
    const path = this.runFilePath(run.id);
    const temporaryPath = `${path}.${randomUUID()}.tmp`;
    try {
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      await writeFile(temporaryPath, `${JSON.stringify(run, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await rename(temporaryPath, path);
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw new AutomationRunStoreError('persistence_failed', error instanceof Error ? error.message : String(error));
    }
  }

  private async enforceRunRetention(): Promise<void> {
    const completed = [...this.entries.values()]
      .filter((run) => terminalStatuses.has(run.status))
      .sort((a, b) => (a.finishedAt ?? a.createdAt) - (b.finishedAt ?? b.createdAt));
    const excess = Math.max(0, completed.length - this.maxCompletedRuns);
    for (const run of completed.slice(0, excess)) await this.removeRun(run.id);
  }

  private async ensureArtifactSpace(incomingBytes: number): Promise<void> {
    const currentBytes = () => [...this.entries.values()].reduce(
      (sum, run) => sum + run.artifacts.reduce((artifactSum, artifact) => artifactSum + artifact.size, 0), 0,
    );
    while (currentBytes() + incomingBytes > this.maxArtifactBytes) {
      const oldestCompleted = [...this.entries.values()]
        .filter((run) => terminalStatuses.has(run.status) && run.artifacts.length > 0)
        .sort((a, b) => (a.finishedAt ?? a.createdAt) - (b.finishedAt ?? b.createdAt))[0];
      if (!oldestCompleted) {
        throw new AutomationRunStoreError('artifact_limit_exceeded', 'Screenshot storage is full; active runs are preserved.');
      }
      await this.removeRun(oldestCompleted.id);
    }
  }

  private async removeRun(runId: string): Promise<void> {
    await rm(this.safeRunDirectory(runId), { recursive: true, force: true });
    this.entries.delete(runId);
  }

  private safeRunDirectory(runId: string): string {
    if (!isRunId(runId)) throw new AutomationRunStoreError('invalid_run', 'Run ID contains unsupported characters.');
    const path = resolve(this.directory, runId);
    if (!path.startsWith(`${this.directory}${sep}`)) throw new AutomationRunStoreError('invalid_run', 'Run path is outside the configured directory.');
    return path;
  }

  private runFilePath(runId: string): string {
    return join(this.safeRunDirectory(runId), 'run.json');
  }

  private artifactDirectory(runId: string): string {
    return join(this.safeRunDirectory(runId), 'artifacts');
  }

  private artifactPath(runId: string, artifactId: string): string {
    if (!/^[0-9a-f-]{36}$/i.test(artifactId)) throw new AutomationRunStoreError('artifact_not_found', 'Screenshot artifact was not found.');
    const directory = this.artifactDirectory(runId);
    const path = resolve(directory, `${artifactId}.png`);
    if (!path.startsWith(`${directory}${sep}`)) throw new AutomationRunStoreError('artifact_not_found', 'Screenshot artifact was not found.');
    return path;
  }
}
