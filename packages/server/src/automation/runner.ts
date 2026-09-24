import {
  AUTOMATION_NODE_TYPE,
  AUTOMATION_RUN_STATUS,
  AUTOMATION_STEP_STATUS,
  type AutomationDefinition,
  type AutomationNode,
  type AutomationPoint,
  type AutomationRun,
} from '@frigg/shared';
import { AndroidAutomationDevice, DeviceAutomationError, type DeviceScreenshot } from './adb.ts';
import { AutomationRunStore } from './run-store.ts';
import { validateAutomation } from './validation.ts';

export interface AutomationDevice {
  assertReady(serial: string, signal: AbortSignal): Promise<void>;
  screenshot(serial: string, signal: AbortSignal): Promise<DeviceScreenshot>;
  perform(serial: string, node: AutomationNode, signal: AbortSignal): Promise<void>;
}

export interface AutomationRunInput {
  automation: AutomationDefinition;
  serial: string;
  runId: string;
  signal: AbortSignal;
  device?: AutomationDevice;
  runs: AutomationRunStore;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
}

function pointsFor(node: AutomationNode): AutomationPoint[] {
  const data = asRecord(node.data);
  if (node.type === AUTOMATION_NODE_TYPE.tap || node.type === AUTOMATION_NODE_TYPE.longPress) {
    return [data.point as AutomationPoint];
  }
  if (node.type === AUTOMATION_NODE_TYPE.swipe) {
    return [data.start as AutomationPoint, data.end as AutomationPoint];
  }
  return [];
}

function isAbort(error: unknown, signal: AbortSignal): boolean {
  return signal.aborted || (error instanceof Error && error.name === 'AbortError');
}

function errorCode(error: unknown): string {
  if (error instanceof DeviceAutomationError) return error.code;
  if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string') return error.code;
  return 'action_failed';
}

function errorMessage(error: unknown): string {
  if (error instanceof DeviceAutomationError) return error.message;
  return error instanceof Error ? error.message : 'Automation action failed.';
}

function delay(durationMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Automation cancelled.', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, durationMs);
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException('Automation cancelled.', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
  });
}

function orderedPath(automation: AutomationDefinition): AutomationNode[] {
  const outgoing = new Map(automation.edges.map((edge) => [edge.source, edge.target]));
  const byId = new Map(automation.nodes.map((node) => [node.id, node]));
  const start = automation.nodes.find((node) => node.type === AUTOMATION_NODE_TYPE.start);
  if (!start) throw new DeviceAutomationError('invalid_automation', 'Automation has no start block.');
  const path: AutomationNode[] = [];
  const visited = new Set<string>();
  let current: AutomationNode | undefined = start;
  while (current && !visited.has(current.id)) {
    path.push(current);
    visited.add(current.id);
    if (current.type === AUTOMATION_NODE_TYPE.end) return path;
    const targetId = outgoing.get(current.id);
    current = targetId ? byId.get(targetId) : undefined;
  }
  throw new DeviceAutomationError('invalid_automation', 'Automation does not have a complete sequential path.');
}

async function executeNode(
  node: AutomationNode,
  serial: string,
  signal: AbortSignal,
  device: AutomationDevice,
  runs: AutomationRunStore,
  runId: string,
): Promise<string | undefined> {
  if (signal.aborted) throw new DOMException('Automation cancelled.', 'AbortError');
  if (node.type === AUTOMATION_NODE_TYPE.wait) {
    await delay(Number(asRecord(node.data).durationMs), signal);
    return undefined;
  }
  if (node.type === AUTOMATION_NODE_TYPE.screenshot) {
    const image = await device.screenshot(serial, signal);
    if (signal.aborted) throw new DOMException('Automation cancelled.', 'AbortError');
    const artifact = await runs.addArtifact(runId, image.png, {
      width: image.width,
      height: image.height,
      rotation: image.rotation,
      nodeId: node.id,
    });
    return artifact.id;
  }
  if (node.type === AUTOMATION_NODE_TYPE.start || node.type === AUTOMATION_NODE_TYPE.end) return undefined;
  await device.perform(serial, node, signal);
  if (signal.aborted) throw new DOMException('Automation cancelled.', 'AbortError');
  return undefined;
}

export class AutomationRunner {
  async run(input: AutomationRunInput): Promise<AutomationRun> {
    const { automation, serial, runId, signal, runs } = input;
    const device = input.device ?? new AndroidAutomationDevice();
    const current = runs.get(runId);
    if (!current) throw new Error(`Run not found: ${runId}`);
    if (signal.aborted || current.status === AUTOMATION_RUN_STATUS.cancelling) {
      return runs.update(runId, { status: AUTOMATION_RUN_STATUS.cancelled, finishedAt: Date.now() });
    }

    const validation = validateAutomation(automation);
    if (!validation.valid) {
      return runs.update(runId, {
        status: AUTOMATION_RUN_STATUS.failed,
        finishedAt: Date.now(),
        errorCode: 'invalid_automation',
        errorMessage: validation.issues[0]?.message ?? 'Automation graph is invalid.',
      });
    }

    const startedAt = Date.now();
    await runs.update(runId, { status: AUTOMATION_RUN_STATUS.running, startedAt });
    try {
      await device.assertReady(serial, signal);
      const path = orderedPath(validation.automation);
      const coordinateNodes = path.filter((node) => pointsFor(node).length > 0);
      if (coordinateNodes.length > 0) {
        const screen = await device.screenshot(serial, signal);
        for (const node of coordinateNodes) {
          for (const point of pointsFor(node)) {
            if (!point || point.referenceWidth !== screen.width || point.referenceHeight !== screen.height || point.referenceRotation !== screen.rotation) {
              throw new DeviceAutomationError(
                'geometry_changed',
                `Screen size or rotation changed before block ${node.id}. Capture a new screenshot and mark the point again.`,
              );
            }
          }
        }
      }

      for (const node of path) {
        if (signal.aborted) throw new DOMException('Automation cancelled.', 'AbortError');
        const stepStarted = Date.now();
        const existing = runs.get(runId)?.steps ?? [];
        const stepIndex = existing.length;
        await runs.update(runId, {
          steps: [...existing, { nodeId: node.id, nodeType: node.type, status: AUTOMATION_STEP_STATUS.running, startedAt: stepStarted }],
        });
        try {
          const artifactId = await executeNode(node, serial, signal, device, runs, runId);
          const after = runs.get(runId)!.steps;
          after[stepIndex] = {
            ...after[stepIndex]!, status: AUTOMATION_STEP_STATUS.completed,
            finishedAt: Date.now(), durationMs: Date.now() - stepStarted,
            ...(artifactId ? { artifactId } : {}),
          };
          await runs.update(runId, { steps: after });
        } catch (error) {
          const cancelled = isAbort(error, signal);
          const after = runs.get(runId)!.steps;
          after[stepIndex] = {
            ...after[stepIndex]!,
            status: cancelled ? AUTOMATION_STEP_STATUS.cancelled : AUTOMATION_STEP_STATUS.failed,
            finishedAt: Date.now(), durationMs: Date.now() - stepStarted,
            ...(cancelled ? { errorCode: 'cancelled', message: 'Run cancelled.' } : { errorCode: errorCode(error), message: errorMessage(error) }),
          };
          await runs.update(runId, {
            steps: after,
            status: cancelled ? AUTOMATION_RUN_STATUS.cancelled : AUTOMATION_RUN_STATUS.failed,
            finishedAt: Date.now(),
            ...(cancelled ? { errorCode: 'cancelled', errorMessage: 'Run cancelled.' } : { errorCode: errorCode(error), errorMessage: errorMessage(error) }),
          });
          return runs.get(runId)!;
        }
      }

      return runs.update(runId, { status: AUTOMATION_RUN_STATUS.completed, finishedAt: Date.now() });
    } catch (error) {
      const cancelled = isAbort(error, signal);
      return runs.update(runId, {
        status: cancelled ? AUTOMATION_RUN_STATUS.cancelled : AUTOMATION_RUN_STATUS.failed,
        finishedAt: Date.now(),
        ...(cancelled
          ? { errorCode: 'cancelled', errorMessage: 'Run cancelled.' }
          : { errorCode: errorCode(error), errorMessage: errorMessage(error) }),
      });
    }
  }
}
