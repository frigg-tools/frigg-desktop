import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerAutomationTools, type AutomationApi } from './automation.ts';
import { getImage } from './frigg-api.ts';

const graph = {
  name: 'MCP smoke test',
  description: '',
  schemaVersion: 1 as const,
  nodes: [
    { id: 'start', type: 'start' as const, data: {} },
    { id: 'tap', type: 'tap' as const, data: { point: { x: 0.5, y: 0.5, referenceWidth: 400, referenceHeight: 800, referenceRotation: 0 } } },
    { id: 'end', type: 'end' as const, data: {} },
  ],
  edges: [{ id: 'one', source: 'start', target: 'tap' }, { id: 'two', source: 'tap', target: 'end' }],
};

function apiMock(): AutomationApi {
  return {
    get: vi.fn(async () => ({})),
    post: vi.fn(async () => ({})),
    put: vi.fn(async () => ({})),
    del: vi.fn(async () => ({ ok: true })),
    image: vi.fn(async () => ({ type: 'image', mimeType: 'image/png', data: 'AQID' })),
  } as unknown as AutomationApi;
}

async function connected(api: AutomationApi) {
  const server = new McpServer({ name: 'frigg-test', version: '1.0.0' });
  registerAutomationTools(server, api);
  const client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server };
}

describe('Frigg automation MCP tools', () => {
  const open: Array<{ client: Client; server: McpServer }> = [];
  afterEach(async () => {
    await Promise.all(open.splice(0).flatMap(({ client, server }) => [client.close(), server.close()]));
  });

  it('registers the complete automation tool family', async () => {
    const { client, server } = await connected(apiMock());
    open.push({ client, server });
    const tools = (await client.listTools()).tools.map((tool) => tool.name);
    expect(tools).toEqual(expect.arrayContaining([
      'frigg_automations_catalog', 'frigg_list_automations', 'frigg_get_automation', 'frigg_create_automation',
      'frigg_update_automation', 'frigg_duplicate_automation', 'frigg_delete_automation', 'frigg_validate_automation',
      'frigg_list_automation_folders', 'frigg_create_automation_folder', 'frigg_rename_automation_folder', 'frigg_delete_automation_folder',
      'frigg_run_automation', 'frigg_list_automation_runs', 'frigg_get_automation_run', 'frigg_cancel_automation_run',
      'frigg_test_automation_action', 'frigg_automation_screenshot', 'frigg_automation_artifact',
    ]));
  });

  it('exposes folder CRUD and preserves folder assignments in workflow create and update calls', async () => {
    const api = apiMock();
    const { client, server } = await connected(api);
    open.push({ client, server });

    await client.callTool({ name: 'frigg_list_automation_folders', arguments: {} });
    await client.callTool({ name: 'frigg_create_automation_folder', arguments: { name: 'Login' } });
    await client.callTool({ name: 'frigg_rename_automation_folder', arguments: { id: 'folder/id', name: 'Account checks' } });
    await client.callTool({ name: 'frigg_delete_automation_folder', arguments: { id: 'folder/id' } });
    expect(api.get).toHaveBeenCalledWith('/api/automation-folders');
    expect(api.post).toHaveBeenCalledWith('/api/automation-folders', { name: 'Login' });
    expect(api.put).toHaveBeenCalledWith('/api/automation-folders/folder%2Fid', { name: 'Account checks' });
    expect(api.del).toHaveBeenCalledWith('/api/automation-folders/folder%2Fid');

    const assigned = { ...graph, folderId: 'folder-1' };
    await client.callTool({ name: 'frigg_create_automation', arguments: { automation: assigned } });
    expect(api.post).toHaveBeenCalledWith('/api/automations', expect.objectContaining({ folderId: 'folder-1' }));
    await client.callTool({ name: 'frigg_update_automation', arguments: { id: 'flow-1', expectedRevision: 2, automation: assigned } });
    expect(api.put).toHaveBeenCalledWith('/api/automations/flow-1', expect.objectContaining({ folderId: 'folder-1', expectedRevision: 2 }));
  });

  it('uses the shared CRUD and validation endpoints and fills omitted canvas positions deterministically', async () => {
    const api = apiMock();
    const { client, server } = await connected(api);
    open.push({ client, server });
    await client.callTool({ name: 'frigg_create_automation', arguments: { automation: graph } });
    expect(api.post).toHaveBeenCalledWith('/api/automations', expect.objectContaining({
      nodes: [
        expect.objectContaining({ id: 'start', position: { x: 80, y: 160 } }),
        expect.objectContaining({ id: 'tap', position: { x: 320, y: 160 } }),
        expect.objectContaining({ id: 'end', position: { x: 560, y: 160 } }),
      ],
    }));
    await client.callTool({ name: 'frigg_get_automation', arguments: { id: 'one/two' } });
    expect(api.get).toHaveBeenCalledWith('/api/automations/one%2Ftwo');
    await client.callTool({ name: 'frigg_update_automation', arguments: { id: 'one/two', expectedRevision: 3, automation: graph } });
    expect(api.put).toHaveBeenCalledWith('/api/automations/one%2Ftwo', expect.objectContaining({ expectedRevision: 3 }));
    await client.callTool({ name: 'frigg_duplicate_automation', arguments: { id: 'one/two' } });
    expect(api.post).toHaveBeenCalledWith('/api/automations/one%2Ftwo/duplicate', {});
    await client.callTool({ name: 'frigg_delete_automation', arguments: { id: 'one/two' } });
    expect(api.del).toHaveBeenCalledWith('/api/automations/one%2Ftwo');
    await client.callTool({ name: 'frigg_validate_automation', arguments: { automation: graph } });
    expect(api.post).toHaveBeenCalledWith('/api/automations/validate', expect.objectContaining({ nodes: expect.any(Array) }));
    await client.callTool({ name: 'frigg_automations_catalog', arguments: {} });
    await client.callTool({ name: 'frigg_list_automations', arguments: {} });
    expect(api.get).toHaveBeenCalledWith('/api/automations/catalog');
    expect(api.get).toHaveBeenCalledWith('/api/automations');
  });

  it('accepts the new app-management and ADB blocks through MCP automation tools', async () => {
    const api = apiMock();
    const { client, server } = await connected(api);
    open.push({ client, server });
    const automation = {
      name: 'App maintenance',
      nodes: [
        { id: 'start', type: 'start', data: {} },
        { id: 'close', type: 'forceStopApp', data: { packageName: 'com.example.app' } },
        { id: 'clear', type: 'clearAppData', data: { packageName: 'com.example.app' } },
        { id: 'adb', type: 'adbCommand', data: { command: 'dumpsys activity' } },
        { id: 'end', type: 'end', data: {} },
      ],
      edges: [
        { id: 'a', source: 'start', target: 'close' },
        { id: 'b', source: 'close', target: 'clear' },
        { id: 'c', source: 'clear', target: 'adb' },
        { id: 'd', source: 'adb', target: 'end' },
      ],
    };

    const result = await client.callTool({ name: 'frigg_create_automation', arguments: { automation } });

    expect(result.isError).not.toBe(true);
    expect(api.post).toHaveBeenCalledWith('/api/automations', expect.objectContaining({
      nodes: expect.arrayContaining([
        expect.objectContaining({ type: 'forceStopApp' }),
        expect.objectContaining({ type: 'clearAppData' }),
        expect.objectContaining({ type: 'adbCommand' }),
      ]),
    }));
  });

  it('passes request IDs unchanged for runs and device test actions and encodes path IDs', async () => {
    const api = apiMock();
    const { client, server } = await connected(api);
    open.push({ client, server });
    await client.callTool({
      name: 'frigg_run_automation',
      arguments: { id: 'auto/id', expectedRevision: 7, serial: 'emulator-5554', requestId: 'run-request-exact' },
    });
    expect(api.post).toHaveBeenCalledWith('/api/automations/auto%2Fid/runs', {
      expectedRevision: 7, serial: 'emulator-5554', requestId: 'run-request-exact',
    });
    await client.callTool({ name: 'frigg_test_automation_action', arguments: {
      serial: 'device:1', requestId: 'test-request-exact', node: { id: 'tap', type: 'tap', data: graph.nodes[1]!.data },
    } });
    expect(api.post).toHaveBeenCalledWith('/api/automation-devices/device%3A1/test-action', {
      requestId: 'test-request-exact', node: expect.objectContaining({ id: 'tap', position: expect.any(Object) }),
    });
    await client.callTool({ name: 'frigg_list_automation_runs', arguments: { automationId: 'auto/id' } });
    expect(api.get).toHaveBeenCalledWith('/api/automation-runs?automationId=auto%2Fid');
    await client.callTool({ name: 'frigg_get_automation_run', arguments: { id: 'run/id' } });
    expect(api.get).toHaveBeenCalledWith('/api/automation-runs/run%2Fid');
    await client.callTool({ name: 'frigg_cancel_automation_run', arguments: { id: 'run/id' } });
    expect(api.post).toHaveBeenCalledWith('/api/automation-runs/run%2Fid/cancel', {});
  });

  it('filters run statuses returned by the shared REST endpoint', async () => {
    const api = apiMock();
    vi.mocked(api.get).mockResolvedValueOnce([
      { id: 'ok', status: 'completed' },
      { id: 'failed', status: 'failed' },
    ]);
    const { client, server } = await connected(api);
    open.push({ client, server });
    const result = await client.callTool({ name: 'frigg_list_automation_runs', arguments: { status: 'completed' } });
    expect(api.get).toHaveBeenCalledWith('/api/automation-runs');
    expect(result.content).toContainEqual(expect.objectContaining({ type: 'text', text: expect.stringContaining('"ok"') }));
    expect(result.content).not.toContainEqual(expect.objectContaining({ type: 'text', text: expect.stringContaining('"failed"') }));
  });

  it('returns MCP image content for device screenshots and run artifacts', async () => {
    const api = apiMock();
    const { client, server } = await connected(api);
    open.push({ client, server });
    const screenshot = await client.callTool({ name: 'frigg_automation_screenshot', arguments: { serial: 'emulator-5554' } });
    expect(api.image).toHaveBeenCalledWith('/api/automation-devices/emulator-5554/screenshot');
    expect(screenshot.content).toContainEqual({ type: 'image', mimeType: 'image/png', data: 'AQID' });
    await client.callTool({ name: 'frigg_automation_artifact', arguments: { runId: 'run/id', artifactId: 'artifact/id' } });
    expect(api.image).toHaveBeenCalledWith('/api/automation-runs/run%2Fid/artifacts/artifact%2Fid/image');
  });

  it('propagates API conflicts as MCP errors', async () => {
    const api = apiMock();
    vi.mocked(api.post).mockRejectedValueOnce(new Error('device_busy: emulator-5554 is already running an automation.'));
    const { client, server } = await connected(api);
    open.push({ client, server });
    const result = await client.callTool({ name: 'frigg_run_automation', arguments: {
      id: 'automation-1', expectedRevision: 1, serial: 'emulator-5554', requestId: 'busy-run',
    } });
    expect(result.isError).toBe(true);
    expect(result.content).toContainEqual(expect.objectContaining({ type: 'text', text: expect.stringContaining('device_busy') }));
  });

  it('fetches binary image bytes and converts only PNG responses to MCP base64 content', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response(Buffer.from([1, 2, 3]), {
      status: 200, headers: { 'Content-Type': 'image/png' },
    }));
    try {
      const image = await getImage('/api/automation-devices/emulator-5554/screenshot');
      expect(image).toEqual({ type: 'image', mimeType: 'image/png', data: 'AQID' });
      globalThis.fetch = vi.fn(async () => new Response('no image', {
        status: 200, headers: { 'Content-Type': 'application/json' },
      }));
      await expect(getImage('/api/automation-devices/emulator-5554/screenshot')).rejects.toThrow('instead of a PNG image');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
