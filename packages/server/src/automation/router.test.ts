import express from 'express';
import request from 'supertest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AutomationDefinition, AutomationNode, AndroidDevice } from '@frigg/shared';
import type { DeviceScreenshot } from './adb.ts';
import { AutomationStore } from './store.ts';
import { AutomationRunStore } from './run-store.ts';
import { AutomationManager } from './manager.ts';
import { buildAutomationRouter } from './router.ts';

const screenshotBytes = Buffer.from([137, 80, 78, 71, 1, 2, 3]);
const definition: AutomationDefinition = {
  name: 'Capture screen', description: '', schemaVersion: 1,
  nodes: [
    { id: 'start', type: 'start', data: {}, position: { x: 0, y: 0 } },
    { id: 'capture', type: 'screenshot', data: {}, position: { x: 100, y: 0 } },
    { id: 'end', type: 'end', data: {}, position: { x: 200, y: 0 } },
  ],
  edges: [
    { id: 'one', source: 'start', target: 'capture' },
    { id: 'two', source: 'capture', target: 'end' },
  ],
};

describe('automation REST router', () => {
  let directory: string;
  let automations: AutomationStore;
  let runs: AutomationRunStore;
  let manager: AutomationManager;
  let app: express.Express;
  let device: {
    assertReady: ReturnType<typeof vi.fn>;
    screenshot: ReturnType<typeof vi.fn>;
    perform: ReturnType<typeof vi.fn>;
  };
  let listDevices: ReturnType<typeof vi.fn>;
  const android: AndroidDevice = {
    serial: 'emulator-5554', model: 'Pixel', avdName: 'Pixel', state: 'device', isEmulator: true, proxyConfigured: false,
  };

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'frigg-automation-api-'));
    automations = await AutomationStore.load(join(directory, 'automations.json'));
    runs = await AutomationRunStore.load(join(directory, 'runs'));
    device = {
      assertReady: vi.fn(async () => undefined),
      screenshot: vi.fn(async (): Promise<DeviceScreenshot> => ({ png: screenshotBytes, width: 400, height: 800, rotation: 0 })),
      perform: vi.fn(async (_serial: string, _node: AutomationNode) => undefined),
    };
    manager = new AutomationManager({ automations, runs, device });
    await manager.initialize();
    listDevices = vi.fn(async () => [android]);
    app = express();
    app.use(express.json());
    app.use(buildAutomationRouter({
      automations, runs, manager, device,
      apiPort: () => 4848, configuredUiPort: 5173,
      listDevices,
    }));
  });

  afterEach(async () => {
    await manager.shutdown();
    await rm(directory, { recursive: true, force: true });
  });

  function local(requestBuilder: request.Test): request.Test {
    return requestBuilder.set('Host', 'localhost:4848');
  }

  it('lists the Android catalog and returns binary screenshots with geometry headers', async () => {
    const catalog = await local(request(app).get('/api/automations/catalog')).expect(200);
    expect(catalog.body.devices).toEqual([android]);
    const screenshot = await local(request(app).get('/api/automation-devices/emulator-5554/screenshot')).expect(200);
    expect(screenshot.headers['content-type']).toContain('image/png');
    expect(screenshot.headers['x-frigg-screen-width']).toBe('400');
    expect(screenshot.body).toEqual(screenshotBytes);
  });

  it('validates before create and provides revision-aware CRUD and duplication', async () => {
    await local(request(app).post('/api/automations')).send({ ...definition, nodes: [] }).expect(400);
    const created = await local(request(app).post('/api/automations')).send(definition).expect(201);
    expect(created.body).toMatchObject({ name: definition.name, revision: 1 });
    await local(request(app).get('/api/automations')).expect(200).expect(({ body }) => expect(body).toHaveLength(1));
    await local(request(app).get(`/api/automations/${created.body.id}`)).expect(200);
    await local(request(app).put(`/api/automations/${created.body.id}`))
      .send({ ...definition, expectedRevision: 8 }).expect(409);
    const copy = await local(request(app).post(`/api/automations/${created.body.id}/duplicate`)).expect(201);
    expect(copy.body.id).not.toBe(created.body.id);
    await local(request(app).delete(`/api/automations/${created.body.id}`)).expect(200);
    await local(request(app).get(`/api/automations/${created.body.id}`)).expect(404);
  });

  it('tests only schema-validated typed device actions', async () => {
    await local(request(app).post('/api/automation-devices/emulator-5554/test-action'))
      .send({ requestId: 'home-test', node: { id: 'press-home', type: 'key', data: { key: 'HOME' } } }).expect(200);
    expect(device.perform).toHaveBeenCalledWith('emulator-5554', expect.objectContaining({ type: 'key', data: { key: 'HOME' } }), expect.any(AbortSignal));
    await local(request(app).post('/api/automation-devices/emulator-5554/test-action'))
      .send({ requestId: 'home-test', node: { id: 'press-home', type: 'key', data: { key: 'HOME' } } }).expect(200);
    await local(request(app).post('/api/automation-devices/emulator-5554/test-action'))
      .send({ node: { id: 'shell', type: 'shell', data: { command: 'anything' } } }).expect(400);
    expect(device.perform).toHaveBeenCalledTimes(1);
  });

  it('creates a run, polls its final snapshot, and fetches its opaque screenshot artifact', async () => {
    const created = await automations.create(definition);
    const response = await local(request(app).post(`/api/automations/${created.id}/runs`))
      .send({ expectedRevision: 1, serial: android.serial, requestId: 'api-run-1' }).expect(202);
    const completed = await manager.waitForTerminal(response.body.id);
    expect(completed.status).toBe('completed');
    const listed = await local(request(app).get(`/api/automation-runs?automationId=${created.id}`)).expect(200);
    expect(listed.body[0]).toMatchObject({ id: response.body.id, status: 'completed' });
    const artifactId = completed.artifacts[0]!.id;
    const artifact = await local(request(app).get(`/api/automation-runs/${completed.id}/artifacts/${artifactId}/image`)).expect(200);
    expect(artifact.headers['content-type']).toContain('image/png');
    expect(artifact.body).toEqual(screenshotBytes);
    await local(request(app).get('/api/automation-runs/missing')).expect(404);
  });

  it('rejects non-loopback requests before reading stores or accessing a device', async () => {
    const snapshot = vi.spyOn(automations, 'snapshot');
    const remote = express();
    remote.use((req, _res, next) => {
      Object.defineProperty(req.socket, 'remoteAddress', { configurable: true, value: '203.0.113.9' });
      next();
    });
    remote.use(buildAutomationRouter({
      automations, runs, manager, device,
      apiPort: () => 4848, configuredUiPort: 5173,
      listDevices,
    }));
    await request(remote).get('/api/automations').set('Host', 'localhost:4848').expect(403);
    await request(remote).get('/api/automation-devices/emulator-5554/screenshot')
      .set('Host', 'localhost:4848').expect(403);
    expect(snapshot).not.toHaveBeenCalled();
    expect(listDevices).not.toHaveBeenCalled();
    expect(device.screenshot).not.toHaveBeenCalled();
  });

  it('returns a conflict when the selected Android serial is already running a flow', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    device.perform.mockImplementation(async () => gate);
    const created = await automations.create({
      ...definition,
      nodes: [
        { id: 'start', type: 'start', data: {}, position: { x: 0, y: 0 } },
        { id: 'key', type: 'key', data: { key: 'HOME' }, position: { x: 100, y: 0 } },
        { id: 'end', type: 'end', data: {}, position: { x: 200, y: 0 } },
      ],
      edges: [{ id: 'one', source: 'start', target: 'key' }, { id: 'two', source: 'key', target: 'end' }],
    });
    const started = await manager.start({ automationId: created.id, expectedRevision: 1, serial: android.serial, requestId: 'busy-1' });
    await vi.waitFor(() => expect(device.perform).toHaveBeenCalledTimes(1));
    await local(request(app).delete(`/api/automations/${created.id}`)).expect(409);
    await local(request(app).post(`/api/automations/${created.id}/runs`))
      .send({ expectedRevision: 1, serial: android.serial, requestId: 'busy-2' }).expect(409);
    await local(request(app).post(`/api/automation-runs/${started.id}/cancel`)).expect(200);
    release();
    expect((await manager.waitForTerminal(started.id)).status).toBe('cancelled');
  });
});
