import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import {
  AUTOMATION_KEY,
  AUTOMATION_NODE_TYPE,
  type AndroidDevice,
  type AutomationNode,
} from '@frigg/shared';
import { listAndroidDevices } from '../devices/android.ts';
import { AndroidAutomationDevice, type DeviceScreenshot } from './adb.ts';
import { automationAccessMiddleware } from './access.ts';
import { AutomationManager } from './manager.ts';
import { AutomationRunStore } from './run-store.ts';
import { AutomationStore } from './store.ts';
import { validateAutomation } from './validation.ts';
import type { AutomationDevice } from './runner.ts';

export interface AutomationRouterOptions {
  automations: AutomationStore;
  runs: AutomationRunStore;
  manager: AutomationManager;
  device?: AutomationDevice;
  apiPort: () => number;
  configuredUiPort: number;
  listDevices?: () => Promise<AndroidDevice[]>;
}

class RouteError extends Error {
  constructor(readonly status: number, message: string, readonly details?: unknown) {
    super(message);
    this.name = 'RouteError';
  }
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new RouteError(400, `${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function parseNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new RouteError(400, `${label} must be a non-empty string.`);
  return value.trim();
}

function parseRevision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new RouteError(400, 'expectedRevision must be a positive integer.');
  }
  return value;
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string') return error.code;
  return undefined;
}

function mapError(error: unknown): RouteError {
  if (error instanceof RouteError) return error;
  const code = errorCode(error);
  if (code && ['not_found', 'run_not_found', 'artifact_not_found'].includes(code)) return new RouteError(404, error instanceof Error ? error.message : 'Not found.');
  if (code && [
    'revision_conflict', 'automation_active', 'device_busy', 'idempotency_conflict', 'run_terminal',
  ].includes(code)) return new RouteError(409, error instanceof Error ? error.message : 'Conflict.');
  if (code && [
    'invalid_automation', 'invalid_request', 'invalid_run', 'unsupported_action', 'invalid_point',
    'invalid_package_name', 'unsupported_key', 'unsupported_text', 'invalid_gesture_duration',
  ].includes(code)) return new RouteError(400, error instanceof Error ? error.message : 'Invalid request.');
  if (code === 'artifact_limit_exceeded') return new RouteError(507, error instanceof Error ? error.message : 'Screenshot storage is full.');
  if (code && ['device_not_ready', 'adb_failed', 'invalid_device_serial', 'invalid_screenshot', 'unsupported_rotation'].includes(code)) {
    return new RouteError(409, error instanceof Error ? error.message : 'Android device is not ready.');
  }
  return new RouteError(500, error instanceof Error ? error.message : 'Automation request failed.');
}

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void handler(req, res).catch(next);
  };
}

function sendScreenshot(res: Response, screen: DeviceScreenshot): void {
  res.status(200)
    .set('Content-Type', 'image/png')
    .set('Cache-Control', 'no-store')
    .set('X-Frigg-Screen-Width', String(screen.width))
    .set('X-Frigg-Screen-Height', String(screen.height))
    .set('X-Frigg-Screen-Rotation', String(screen.rotation))
    .send(screen.png);
}

function parseTestAction(body: unknown): AutomationNode {
  const record = asRecord(body, 'action');
  const rawNode = record.node === undefined ? record : asRecord(record.node, 'action.node');
  const positionValue = rawNode.position;
  const position = typeof positionValue === 'object' && positionValue !== null &&
    typeof (positionValue as Record<string, unknown>).x === 'number' && typeof (positionValue as Record<string, unknown>).y === 'number'
    ? positionValue
    : { x: 0, y: 0 };
  const flow = {
    name: 'Test action',
    description: '',
    schemaVersion: 1,
    nodes: [
      { id: 'start', type: AUTOMATION_NODE_TYPE.start, data: {}, position: { x: 0, y: 0 } },
      {
        id: typeof rawNode.id === 'string' ? rawNode.id : 'test-action',
        type: rawNode.type,
        data: rawNode.data,
        position,
      },
      { id: 'end', type: AUTOMATION_NODE_TYPE.end, data: {}, position: { x: 100, y: 0 } },
    ],
    edges: [
      { id: 'start-action', source: 'start', target: typeof rawNode.id === 'string' ? rawNode.id : 'test-action' },
      { id: 'action-end', source: typeof rawNode.id === 'string' ? rawNode.id : 'test-action', target: 'end' },
    ],
  };
  const validation = validateAutomation(flow);
  if (!validation.valid) throw new RouteError(400, 'Action block is invalid.', validation.issues);
  const action = validation.automation.nodes[1];
  if (!action || action.type === AUTOMATION_NODE_TYPE.start || action.type === AUTOMATION_NODE_TYPE.end) {
    throw new RouteError(400, 'Select an action block to test.');
  }
  return action;
}

export function buildAutomationRouter(options: AutomationRouterOptions): Router {
  const router = Router();
  const device = options.device ?? new AndroidAutomationDevice();
  const access = automationAccessMiddleware({
    configuredUiPort: options.configuredUiPort,
    apiPort: options.apiPort,
  });

  router.use('/api/automations', access);
  router.use('/api/automation-runs', access);
  router.use('/api/automation-devices', access);

  router.get('/api/automations/catalog', asyncRoute(async (_req, res) => {
    res.json({
      devices: await (options.listDevices ?? listAndroidDevices)(),
      nodeTypes: Object.values(AUTOMATION_NODE_TYPE),
      keys: Object.values(AUTOMATION_KEY),
    });
  }));

  router.post('/api/automations/validate', (req, res) => {
    res.json(validateAutomation(req.body));
  });

  router.get('/api/automations', (_req, res) => {
    res.json(options.automations.snapshot());
  });

  router.post('/api/automations', (req, res, next) => {
    const validation = validateAutomation(req.body);
    if (!validation.valid) {
      res.status(400).json({ error: 'Automation is invalid.', issues: validation.issues });
      return;
    }
    void options.automations.create(validation.automation)
      .then((automation) => res.status(201).json(automation))
      .catch(next);
  });

  router.get('/api/automations/:id', (req, res, next) => {
    const automation = options.automations.get(req.params.id);
    if (!automation) {
      next(new RouteError(404, 'Automation not found.'));
      return;
    }
    res.json(automation);
  });

  router.put('/api/automations/:id', asyncRoute(async (req, res) => {
    const body = asRecord(req.body, 'automation');
    const expectedRevision = parseRevision(body.expectedRevision);
    const validation = validateAutomation(body);
    if (!validation.valid) throw new RouteError(400, 'Automation is invalid.', validation.issues);
    res.json(await options.automations.update(req.params.id, validation.automation, expectedRevision));
  }));

  router.post('/api/automations/:id/duplicate', asyncRoute(async (req, res) => {
    res.status(201).json(await options.automations.duplicate(req.params.id));
  }));

  router.delete('/api/automations/:id', asyncRoute(async (req, res) => {
    await options.manager.deleteAutomation(req.params.id);
    res.json({ ok: true });
  }));

  router.post('/api/automations/:id/runs', asyncRoute(async (req, res) => {
    const body = asRecord(req.body, 'run');
    const run = await options.manager.start({
      automationId: req.params.id,
      expectedRevision: parseRevision(body.expectedRevision),
      serial: parseNonEmptyString(body.serial, 'serial'),
      requestId: parseNonEmptyString(body.requestId, 'requestId'),
    });
    res.status(202).json(run);
  }));

  router.post('/api/automation-devices/:serial/test-action', asyncRoute(async (req, res) => {
    const body = asRecord(req.body, 'action');
    const action = parseTestAction(req.body);
    res.json(await options.manager.testAction({
      serial: req.params.serial,
      requestId: parseNonEmptyString(body.requestId, 'requestId'),
      node: action,
    }));
  }));

  router.get('/api/automation-devices/:serial/screenshot', asyncRoute(async (req, res) => {
    sendScreenshot(res, await device.screenshot(req.params.serial, new AbortController().signal));
  }));

  router.get('/api/automation-runs', (_req, res) => {
    const automationId = typeof _req.query.automationId === 'string' ? _req.query.automationId : undefined;
    res.json(options.manager.list(automationId));
  });

  router.get('/api/automation-runs/:id', (req, res, next) => {
    const run = options.manager.get(req.params.id);
    if (!run) {
      next(new RouteError(404, 'Automation run not found.'));
      return;
    }
    res.json(run);
  });

  router.post('/api/automation-runs/:id/cancel', asyncRoute(async (req, res) => {
    res.json(await options.manager.cancel(req.params.id));
  }));

  router.get('/api/automation-runs/:id/artifacts/:artifactId/image', asyncRoute(async (req, res) => {
    const png = await options.runs.readArtifact(req.params.id, req.params.artifactId);
    res.status(200).set('Content-Type', 'image/png').set('Cache-Control', 'no-store').send(png);
  }));

  router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const mapped = mapError(error);
    res.status(mapped.status).json({ error: mapped.message, ...(mapped.details === undefined ? {} : { issues: mapped.details }) });
  });

  return router;
}
