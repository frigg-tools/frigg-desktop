import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  AUTOMATION_NODE_TYPE,
  AUTOMATION_RUN_STATUS,
  type AutomationDefinition,
  type AutomationNode,
} from '@frigg/shared';
import { del, get, getImage, post, put, type McpImageContent } from './frigg-api.ts';

export interface AutomationApi {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
  put<T>(path: string, body: unknown): Promise<T>;
  del<T>(path: string): Promise<T>;
  image(path: string): Promise<McpImageContent>;
}

const defaultApi: AutomationApi = { get, post, put, del, image: getImage };

const positionSchema = z.object({ x: z.number(), y: z.number() });
const nodeSchema = z.object({
  id: z.string().min(1).max(128),
  type: z.enum(AUTOMATION_NODE_TYPE),
  data: z.record(z.string(), z.unknown()).default({}),
  position: positionSchema.optional(),
});
const edgeSchema = z.object({
  id: z.string().min(1).max(128),
  source: z.string().min(1),
  target: z.string().min(1),
});
const automationSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).default(''),
  schemaVersion: z.literal(1).default(1),
  nodes: z.array(nodeSchema).min(2).max(100),
  edges: z.array(edgeSchema),
});

type AutomationInput = z.infer<typeof automationSchema>;

function normalizeAutomation(input: AutomationInput): AutomationDefinition {
  return {
    ...input,
    nodes: input.nodes.map((node, index) => ({
      ...node,
      position: node.position ?? { x: 80 + index * 240, y: 160 },
    })) as AutomationNode[],
  };
}

function textResult(value: unknown): { content: [{ type: 'text'; text: string }] } {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

function errorResult(error: unknown): { content: [{ type: 'text'; text: string }]; isError: true } {
  return {
    content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
    isError: true,
  };
}

async function runTool(work: () => Promise<unknown>) {
  try {
    return textResult(await work());
  } catch (error) {
    return errorResult(error);
  }
}

async function runImageTool(work: () => Promise<McpImageContent>) {
  try {
    return { content: [await work()] };
  } catch (error) {
    return errorResult(error);
  }
}

export function registerAutomationTools(server: McpServer, api: AutomationApi = defaultApi): void {
  server.tool('frigg_automations_catalog', 'List connected Android devices and the supported automation blocks and keys.', async () =>
    runTool(() => api.get('/api/automations/catalog')));

  server.tool('frigg_list_automations', 'List saved Android automations.', async () =>
    runTool(() => api.get('/api/automations')));

  server.tool(
    'frigg_get_automation',
    'Get an automation graph and its current revision.',
    { id: z.string().min(1).describe('Automation ID') },
    async ({ id }) => runTool(() => api.get(`/api/automations/${encodeURIComponent(id)}`)),
  );

  server.tool(
    'frigg_create_automation',
    'Create an automation from a connected sequence of typed Android action blocks.',
    { automation: automationSchema.describe('Graph with nodes and edges; node positions are optional') },
    async ({ automation }) => runTool(() => api.post('/api/automations', normalizeAutomation(automation))),
  );

  server.tool(
    'frigg_update_automation',
    'Update a saved automation using its expected revision to prevent overwriting newer edits.',
    {
      id: z.string().min(1).describe('Automation ID'),
      expectedRevision: z.number().int().positive().describe('Revision returned by the last read'),
      automation: automationSchema.describe('Updated graph with nodes and edges'),
    },
    async ({ id, expectedRevision, automation }) => runTool(() => api.put(
      `/api/automations/${encodeURIComponent(id)}`,
      { ...normalizeAutomation(automation), expectedRevision },
    )),
  );

  server.tool(
    'frigg_duplicate_automation',
    'Duplicate an automation, including its block positions and action settings.',
    { id: z.string().min(1).describe('Automation ID') },
    async ({ id }) => runTool(() => api.post(`/api/automations/${encodeURIComponent(id)}/duplicate`, {})),
  );

  server.tool(
    'frigg_delete_automation',
    'Delete an automation and its saved run history. An active automation must be cancelled first.',
    { id: z.string().min(1).describe('Automation ID') },
    async ({ id }) => runTool(() => api.del(`/api/automations/${encodeURIComponent(id)}`)),
  );

  server.tool(
    'frigg_validate_automation',
    'Validate an automation graph without saving or executing it.',
    { automation: automationSchema.describe('Graph to validate') },
    async ({ automation }) => runTool(() => api.post('/api/automations/validate', normalizeAutomation(automation))),
  );

  server.tool(
    'frigg_run_automation',
    'Run one saved automation on a selected connected Android device. Use a stable request ID to make retries idempotent.',
    {
      id: z.string().min(1).describe('Automation ID'),
      expectedRevision: z.number().int().positive(),
      serial: z.string().min(1).describe('Exact Android serial from the device catalog'),
      requestId: z.string().min(1).max(128).describe('Caller-generated ID reused if this request is retried'),
    },
    async ({ id, expectedRevision, serial, requestId }) => runTool(() => api.post(
      `/api/automations/${encodeURIComponent(id)}/runs`,
      { expectedRevision, serial, requestId },
    )),
  );

  server.tool(
    'frigg_list_automation_runs',
    'List automation run snapshots, optionally filtered by automation ID or run status.',
    {
      automationId: z.string().optional(),
      status: z.enum(AUTOMATION_RUN_STATUS).optional(),
    },
    async ({ automationId, status }) => runTool(async () => {
      const query = new URLSearchParams();
      if (automationId !== undefined) query.set('automationId', automationId);
      const suffix = query.size > 0 ? `?${query.toString()}` : '';
      const runs = await api.get<Array<{ status: string }>>(`/api/automation-runs${suffix}`);
      return status ? runs.filter((run) => run.status === status) : runs;
    }),
  );

  server.tool(
    'frigg_get_automation_run',
    'Get the saved snapshot, step results, and artifact metadata for one automation run.',
    { id: z.string().min(1).describe('Run ID') },
    async ({ id }) => runTool(() => api.get(`/api/automation-runs/${encodeURIComponent(id)}`)),
  );

  server.tool(
    'frigg_cancel_automation_run',
    'Cancel a running automation after its current device command returns.',
    { id: z.string().min(1).describe('Run ID') },
    async ({ id }) => runTool(() => api.post(`/api/automation-runs/${encodeURIComponent(id)}/cancel`, {})),
  );

  server.tool(
    'frigg_test_automation_action',
    'Test one validated action block on a selected Android device. Reuse requestId to deduplicate a retried command.',
    {
      serial: z.string().min(1).describe('Exact Android serial from the device catalog'),
      requestId: z.string().min(1).max(128).describe('Caller-generated ID reused if this request is retried'),
      node: nodeSchema.describe('One supported action node with its typed settings'),
    },
    async ({ serial, requestId, node }) => runTool(() => api.post(
      `/api/automation-devices/${encodeURIComponent(serial)}/test-action`,
      { requestId, node: { ...node, position: node.position ?? { x: 0, y: 0 } } },
    )),
  );

  server.tool(
    'frigg_automation_screenshot',
    'Capture and return the current screen of one connected Android device as an image.',
    { serial: z.string().min(1).describe('Exact Android serial from the device catalog') },
    async ({ serial }) => runImageTool(() => api.image(
      `/api/automation-devices/${encodeURIComponent(serial)}/screenshot`,
    )),
  );

  server.tool(
    'frigg_automation_artifact',
    'Fetch one PNG screenshot artifact from an automation run.',
    {
      runId: z.string().min(1).describe('Automation run ID'),
      artifactId: z.string().min(1).describe('Opaque artifact ID returned in the run snapshot'),
    },
    async ({ runId, artifactId }) => runImageTool(() => api.image(
      `/api/automation-runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(artifactId)}/image`,
    )),
  );
}
