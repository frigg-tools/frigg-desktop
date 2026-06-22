import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import type {
  ApiClientSnapshot,
  ApiRequest,
  ApiRunResult,
  MockRule,
  MocksSnapshot,
  ProxyStatus,
  TrafficExchange,
} from '@frigg/shared';
import { del, get, post, put } from './frigg-api.ts';

function ok(value: unknown): { content: [{ type: 'text'; text: string }] } {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

function err(e: unknown): { content: [{ type: 'text'; text: string }]; isError: true } {
  const msg = e instanceof Error ? e.message : String(e);
  return { content: [{ type: 'text', text: msg }], isError: true };
}

const server = new McpServer({ name: 'frigg', version: '0.1.0' });

server.tool('frigg_status', 'Get Frigg proxy status (ports, LAN IP, cert fingerprint, exchange count)', async () => {
  try {
    return ok(await get<ProxyStatus>('/api/status'));
  } catch (e) {
    return err(e);
  }
});

server.tool(
  'frigg_list_traffic',
  'List captured HTTP traffic exchanges. Optionally filter by limit and/or a substring of the host.',
  {
    limit: z.number().int().positive().optional().describe('Maximum number of most-recent exchanges to return'),
    hostContains: z.string().optional().describe('Return only exchanges whose host contains this substring'),
  },
  async ({ limit, hostContains }) => {
    try {
      let exchanges = await get<TrafficExchange[]>('/api/traffic');
      if (hostContains) {
        exchanges = exchanges.filter((ex) => ex.request.host.includes(hostContains));
      }
      if (limit !== undefined) {
        exchanges = exchanges.slice(-limit);
      }
      const summary = exchanges.map((ex) => ({
        id: ex.id,
        method: ex.request.method,
        url: ex.request.url,
        status: ex.response?.statusCode ?? null,
        durationMs: ex.response?.durationMs ?? null,
        mocked: ex.response?.mockRuleId !== undefined,
      }));
      return ok(summary);
    } catch (e) {
      return err(e);
    }
  },
);

server.tool('frigg_clear_traffic', 'Delete all captured traffic exchanges', async () => {
  try {
    return ok(await del('/api/traffic'));
  } catch (e) {
    return err(e);
  }
});

server.tool('frigg_list_mocks', 'List all mock folders and rules', async () => {
  try {
    return ok(await get<MocksSnapshot>('/api/mocks'));
  } catch (e) {
    return err(e);
  }
});

server.tool(
  'frigg_create_mock_folder',
  'Create a mock folder',
  {
    name: z.string().min(1).describe('Folder name'),
    parentId: z.string().optional().describe('Parent folder ID (omit for root)'),
  },
  async ({ name, parentId }) => {
    try {
      return ok(await post('/api/mocks/folders', { name, parentId: parentId ?? null }));
    } catch (e) {
      return err(e);
    }
  },
);

server.tool(
  'frigg_create_mock_rule',
  'Create a mock rule that intercepts matching requests and returns a configured response',
  {
    name: z.string().optional().describe('Rule name (auto-generated from method+path if omitted)'),
    pathPattern: z.string().min(1).describe('Glob pattern matched against the request path (required)'),
    statusCode: z.number().int().min(100).max(599).describe('HTTP status code to respond with'),
    method: z.string().optional().describe('HTTP method to match (omit for any method)'),
    hostPattern: z.string().optional().describe('Glob pattern matched against the request host'),
    body: z.string().optional().describe('Response body string'),
    headers: z.record(z.string(), z.string()).optional().describe('Response headers as key-value object'),
    enabled: z.boolean().optional().describe('Whether the rule is active (default true)'),
    priority: z.number().optional().describe('Rule priority — higher wins when multiple rules match (default 0)'),
    folderId: z.string().optional().describe('Folder to place this rule in'),
    delayMs: z.number().optional().describe('Artificial response delay in milliseconds'),
    queryContains: z.string().optional().describe('Response only fires when query string contains this substring'),
  },
  async ({ name, pathPattern, statusCode, method, hostPattern, body, headers, enabled, priority, folderId, delayMs, queryContains }) => {
    try {
      const matcher: Record<string, unknown> = { pathPattern };
      if (method) matcher.method = method;
      if (hostPattern) matcher.hostPattern = hostPattern;
      if (queryContains) matcher.queryContains = queryContains;

      const response: Record<string, unknown> = {
        statusCode,
        body: body ?? '',
        headers: headers ?? {},
      };
      if (delayMs !== undefined) response.delayMs = delayMs;

      const payload: Record<string, unknown> = {
        matcher,
        response,
        enabled: enabled ?? true,
        priority: priority ?? 0,
        folderId: folderId ?? null,
      };
      if (name) payload.name = name;

      return ok(await post<MockRule>('/api/mocks/rules', payload));
    } catch (e) {
      return err(e);
    }
  },
);

server.tool(
  'frigg_update_mock_rule',
  'Update fields of an existing mock rule',
  {
    id: z.string().describe('Rule ID'),
    name: z.string().optional(),
    enabled: z.boolean().optional(),
    priority: z.number().optional(),
    folderId: z.string().nullable().optional(),
    pathPattern: z.string().optional().describe('New path glob pattern'),
    method: z.string().optional(),
    hostPattern: z.string().optional(),
    statusCode: z.number().int().min(100).max(599).optional(),
    body: z.string().optional(),
    headers: z.record(z.string(), z.string()).optional(),
    delayMs: z.number().optional(),
    queryContains: z.string().optional(),
  },
  async ({ id, name, enabled, priority, folderId, pathPattern, method, hostPattern, statusCode, body, headers, delayMs, queryContains }) => {
    try {
      const patch: Record<string, unknown> = {};
      if (name !== undefined) patch.name = name;
      if (enabled !== undefined) patch.enabled = enabled;
      if (priority !== undefined) patch.priority = priority;
      if (folderId !== undefined) patch.folderId = folderId;

      if (pathPattern !== undefined || method !== undefined || hostPattern !== undefined || queryContains !== undefined) {
        const matcher: Record<string, unknown> = {};
        if (pathPattern !== undefined) matcher.pathPattern = pathPattern;
        if (method !== undefined) matcher.method = method;
        if (hostPattern !== undefined) matcher.hostPattern = hostPattern;
        if (queryContains !== undefined) matcher.queryContains = queryContains;
        patch.matcher = matcher;
      }

      if (statusCode !== undefined || body !== undefined || headers !== undefined || delayMs !== undefined) {
        const response: Record<string, unknown> = {};
        if (statusCode !== undefined) response.statusCode = statusCode;
        if (body !== undefined) response.body = body;
        if (headers !== undefined) response.headers = headers;
        if (delayMs !== undefined) response.delayMs = delayMs;
        patch.response = response;
      }

      return ok(await put<MockRule>(`/api/mocks/rules/${id}`, patch));
    } catch (e) {
      return err(e);
    }
  },
);

server.tool(
  'frigg_delete_mock_rule',
  'Delete a mock rule by ID',
  { id: z.string().describe('Rule ID') },
  async ({ id }) => {
    try {
      return ok(await del(`/api/mocks/rules/${id}`));
    } catch (e) {
      return err(e);
    }
  },
);

server.tool('frigg_list_devices', 'List connected Android and iOS devices and their proxy/tooling status', async () => {
  try {
    return ok(await get('/api/devices'));
  } catch (e) {
    return err(e);
  }
});

server.tool('frigg_client_snapshot', 'Get the full API client snapshot (workspaces, folders, requests, environments)', async () => {
  try {
    return ok(await get<ApiClientSnapshot>('/api/client'));
  } catch (e) {
    return err(e);
  }
});

server.tool(
  'frigg_create_workspace',
  'Create a new API client workspace',
  { name: z.string().min(1).describe('Workspace name') },
  async ({ name }) => {
    try {
      return ok(await post('/api/client/workspaces', { name }));
    } catch (e) {
      return err(e);
    }
  },
);

server.tool(
  'frigg_set_client_certs',
  'Set the workspace mTLS client certificates (replaces the whole list). Each cert is matched by host; the request runner presents it during the TLS handshake for requests whose host matches. certPath/keyPath/caPath are file paths on the machine running Frigg.',
  {
    workspaceId: z.string().describe('Workspace ID'),
    clientCerts: z
      .array(
        z.object({
          host: z.string().min(1).describe('Host or host:port to match, e.g. qa.boss4u.com.br'),
          certPath: z.string().min(1).describe('Path to the client certificate PEM file'),
          keyPath: z.string().min(1).describe('Path to the client private key PEM file'),
          caPath: z.string().optional().describe('Path to a CA PEM file (optional)'),
          passphrase: z.string().optional().describe('Private key passphrase (optional)'),
        }),
      )
      .describe('Full replacement list of client certificates for the workspace'),
  },
  async ({ workspaceId, clientCerts }) => {
    try {
      return ok(await put(`/api/client/workspaces/${encodeURIComponent(workspaceId)}`, { clientCerts }));
    } catch (e) {
      return err(e);
    }
  },
);

server.tool(
  'frigg_list_proxy_certs',
  'List the proxy upstream mTLS client certificates — the PKCS#12 certs the intercepting proxy presents to upstream hosts that require mutual TLS',
  async () => {
    try {
      return ok(await get('/api/proxy-certs'));
    } catch (e) {
      return err(e);
    }
  },
);

server.tool(
  'frigg_set_proxy_certs',
  'Set the proxy upstream mTLS client certificates (replaces the whole list). For each entry the intercepting proxy presents the PKCS#12 cert to the matching upstream host during interception, so apps whose API requires mutual TLS can be captured. pfxPath is a path to a .p12/.pfx file on the machine running Frigg. Changing this reloads the proxy.',
  {
    certs: z
      .array(
        z.object({
          host: z.string().min(1).describe('Upstream host or host:port, e.g. qa.boss4u.com.br or qa.boss4u.com.br:443'),
          pfxPath: z.string().min(1).describe('Path to the PKCS#12 (.p12/.pfx) client certificate file'),
          passphrase: z.string().optional().describe('PKCS#12 passphrase (optional)'),
        }),
      )
      .describe('Full replacement list of upstream proxy client certificates'),
  },
  async ({ certs }) => {
    try {
      return ok(await put('/api/proxy-certs', { certs }));
    } catch (e) {
      return err(e);
    }
  },
);

server.tool(
  'frigg_create_collection',
  'Create a collection (folder) inside a workspace',
  {
    workspaceId: z.string().describe('Workspace ID'),
    name: z.string().min(1).describe('Collection name'),
    parentId: z.string().optional().describe('Parent folder ID (omit for top-level)'),
  },
  async ({ workspaceId, name, parentId }) => {
    try {
      return ok(await post('/api/client/folders', { workspaceId, name, parentId: parentId ?? null }));
    } catch (e) {
      return err(e);
    }
  },
);

server.tool(
  'frigg_create_request',
  'Create a new API request (and populate its fields in one call)',
  {
    workspaceId: z.string().describe('Workspace ID'),
    folderId: z.string().optional().describe('Collection/folder ID'),
    name: z.string().optional().describe('Request name'),
    method: z.string().optional().describe('HTTP method (default GET)'),
    url: z.string().optional().describe('Request URL'),
    query: z
      .array(z.object({ key: z.string(), value: z.string(), enabled: z.boolean().optional() }))
      .optional()
      .describe('Query parameters'),
    headers: z
      .array(z.object({ key: z.string(), value: z.string(), enabled: z.boolean().optional() }))
      .optional()
      .describe('Request headers'),
    body: z
      .object({
        mode: z.enum(['none', 'json', 'raw', 'form']).optional(),
        raw: z.string().optional(),
        form: z.array(z.object({ key: z.string(), value: z.string(), enabled: z.boolean().optional() })).optional(),
      })
      .optional()
      .describe('Request body'),
    preScript: z.string().optional().describe('Pre-request JavaScript'),
    testScript: z.string().optional().describe('Test JavaScript'),
  },
  async ({ workspaceId, folderId, name, method, url, query, headers, body, preScript, testScript }) => {
    try {
      const created = await post<{ snapshot: ApiClientSnapshot; id: string }>('/api/client/requests', {
        workspaceId,
        folderId: folderId ?? null,
      });

      const patch: Record<string, unknown> = {};
      if (name !== undefined) patch.name = name;
      if (method !== undefined) patch.method = method;
      if (url !== undefined) patch.url = url;
      if (query !== undefined) patch.query = query.map((kv) => ({ ...kv, enabled: kv.enabled ?? true }));
      if (headers !== undefined) patch.headers = headers.map((kv) => ({ ...kv, enabled: kv.enabled ?? true }));
      if (body !== undefined) {
        patch.body = {
          mode: body.mode ?? 'none',
          raw: body.raw ?? '',
          form: (body.form ?? []).map((kv) => ({ ...kv, enabled: kv.enabled ?? true })),
        };
      }
      if (preScript !== undefined) patch.preScript = preScript;
      if (testScript !== undefined) patch.testScript = testScript;

      if (Object.keys(patch).length > 0) {
        const snapshot = await put<ApiClientSnapshot>(`/api/client/requests/${created.id}`, patch);
        const request = snapshot.requests.find((r: ApiRequest) => r.id === created.id);
        return ok(request);
      }

      const request = created.snapshot.requests.find((r: ApiRequest) => r.id === created.id);
      return ok(request);
    } catch (e) {
      return err(e);
    }
  },
);

server.tool(
  'frigg_update_request',
  'Update fields of an existing API request',
  {
    id: z.string().describe('Request ID'),
    name: z.string().optional(),
    method: z.string().optional(),
    url: z.string().optional(),
    folderId: z.string().nullable().optional(),
    query: z
      .array(z.object({ key: z.string(), value: z.string(), enabled: z.boolean().optional() }))
      .optional(),
    headers: z
      .array(z.object({ key: z.string(), value: z.string(), enabled: z.boolean().optional() }))
      .optional(),
    body: z
      .object({
        mode: z.enum(['none', 'json', 'raw', 'form']).optional(),
        raw: z.string().optional(),
        form: z.array(z.object({ key: z.string(), value: z.string(), enabled: z.boolean().optional() })).optional(),
      })
      .optional(),
    preScript: z.string().optional(),
    testScript: z.string().optional(),
  },
  async ({ id, name, method, url, folderId, query, headers, body, preScript, testScript }) => {
    try {
      const patch: Record<string, unknown> = {};
      if (name !== undefined) patch.name = name;
      if (method !== undefined) patch.method = method;
      if (url !== undefined) patch.url = url;
      if (folderId !== undefined) patch.folderId = folderId;
      if (query !== undefined) patch.query = query.map((kv) => ({ ...kv, enabled: kv.enabled ?? true }));
      if (headers !== undefined) patch.headers = headers.map((kv) => ({ ...kv, enabled: kv.enabled ?? true }));
      if (body !== undefined) {
        patch.body = {
          mode: body.mode ?? 'none',
          raw: body.raw ?? '',
          form: (body.form ?? []).map((kv) => ({ ...kv, enabled: kv.enabled ?? true })),
        };
      }
      if (preScript !== undefined) patch.preScript = preScript;
      if (testScript !== undefined) patch.testScript = testScript;

      return ok(await put<ApiClientSnapshot>(`/api/client/requests/${id}`, patch));
    } catch (e) {
      return err(e);
    }
  },
);

server.tool(
  'frigg_delete_request',
  'Delete an API request by ID',
  { id: z.string().describe('Request ID') },
  async ({ id }) => {
    try {
      return ok(await del(`/api/client/requests/${id}`));
    } catch (e) {
      return err(e);
    }
  },
);

server.tool(
  'frigg_run_request',
  'Execute an API request. Provide either a full request object or a requestId to look up from the client snapshot.',
  {
    requestId: z.string().optional().describe('ID of a saved request to run'),
    request: z
      .object({
        method: z.string(),
        url: z.string(),
        name: z.string().optional(),
        workspaceId: z.string().optional(),
        folderId: z.string().nullable().optional(),
        query: z.array(z.object({ key: z.string(), value: z.string(), enabled: z.boolean().optional() })).optional(),
        headers: z.array(z.object({ key: z.string(), value: z.string(), enabled: z.boolean().optional() })).optional(),
        body: z
          .object({
            mode: z.enum(['none', 'json', 'raw', 'form']).optional(),
            raw: z.string().optional(),
            form: z.array(z.object({ key: z.string(), value: z.string(), enabled: z.boolean().optional() })).optional(),
          })
          .optional(),
        preScript: z.string().optional(),
        testScript: z.string().optional(),
      })
      .optional()
      .describe('Inline request definition (alternative to requestId)'),
  },
  async ({ requestId, request: inlineRequest }) => {
    try {
      let req: ApiRequest;

      if (requestId !== undefined) {
        const snapshot = await get<ApiClientSnapshot>('/api/client');
        const found = snapshot.requests.find((r: ApiRequest) => r.id === requestId);
        if (!found) {
          return err(new Error(`Request not found: ${requestId}`));
        }
        req = found;
      } else if (inlineRequest !== undefined) {
        req = {
          id: '',
          workspaceId: inlineRequest.workspaceId ?? '',
          folderId: inlineRequest.folderId ?? null,
          name: inlineRequest.name ?? '',
          method: inlineRequest.method,
          url: inlineRequest.url,
          query: (inlineRequest.query ?? []).map((kv) => ({ ...kv, enabled: kv.enabled ?? true })),
          headers: (inlineRequest.headers ?? []).map((kv) => ({ ...kv, enabled: kv.enabled ?? true })),
          body: {
            mode: inlineRequest.body?.mode ?? 'none',
            raw: inlineRequest.body?.raw ?? '',
            form: (inlineRequest.body?.form ?? []).map((kv) => ({ ...kv, enabled: kv.enabled ?? true })),
          },
          preScript: inlineRequest.preScript ?? '',
          testScript: inlineRequest.testScript ?? '',
          createdAt: 0,
          updatedAt: 0,
        };
      } else {
        return err(new Error('Provide either requestId or request'));
      }

      return ok(await post<ApiRunResult>('/api/client/run', { request: req }));
    } catch (e) {
      return err(e);
    }
  },
);

server.tool(
  'frigg_create_environment',
  'Create a new environment in a workspace',
  {
    workspaceId: z.string().describe('Workspace ID'),
    name: z.string().min(1).describe('Environment name'),
  },
  async ({ workspaceId, name }) => {
    try {
      return ok(await post('/api/client/environments', { workspaceId, name }));
    } catch (e) {
      return err(e);
    }
  },
);

server.tool(
  'frigg_set_env_var',
  'Set (upsert) a variable in an environment',
  {
    environmentId: z.string().describe('Environment ID'),
    key: z.string().min(1).describe('Variable key'),
    value: z.string().describe('Variable value'),
  },
  async ({ environmentId, key, value }) => {
    try {
      const snapshot = await get<ApiClientSnapshot>('/api/client');
      const env = snapshot.environments.find((e) => e.id === environmentId);
      if (!env) {
        return err(new Error(`Environment not found: ${environmentId}`));
      }

      const existing = env.variables.findIndex((v) => v.key === key);
      const variables = [...env.variables];
      if (existing >= 0) {
        variables[existing] = { key, value, enabled: variables[existing].enabled };
      } else {
        variables.push({ key, value, enabled: true });
      }

      return ok(await put(`/api/client/environments/${environmentId}`, { variables }));
    } catch (e) {
      return err(e);
    }
  },
);

server.tool(
  'frigg_frida_snapshot',
  'Get the Frida toolkit snapshot: on-device frida-server status, the running script session, the built-in example scripts, and the host frida-tools version (null if not installed).',
  async () => {
    try {
      return ok(await get('/api/frida/snapshot'));
    } catch (e) {
      return err(e);
    }
  },
);

server.tool(
  'frigg_frida_status',
  'Get the frida-server status for a specific device (installed, running, version).',
  { deviceId: z.string().describe('adb serial of the Android device/emulator') },
  async ({ deviceId }) => {
    try {
      return ok(await get(`/api/frida/status?deviceId=${encodeURIComponent(deviceId)}`));
    } catch (e) {
      return err(e);
    }
  },
);

server.tool(
  'frigg_frida_install',
  'Download a matching frida-server and install it onto the device (requires frida-tools on the host).',
  { deviceId: z.string().describe('adb serial of the Android device/emulator') },
  async ({ deviceId }) => {
    try {
      return ok(await post('/api/frida/install', { deviceId }));
    } catch (e) {
      return err(e);
    }
  },
);

server.tool(
  'frigg_frida_start',
  'Start frida-server on the device (adb root + setenforce 0 + launch). Needs a rooted device/emulator (google_apis image).',
  { deviceId: z.string().describe('adb serial of the Android device/emulator') },
  async ({ deviceId }) => {
    try {
      return ok(await post('/api/frida/server/start', { deviceId }));
    } catch (e) {
      return err(e);
    }
  },
);

server.tool(
  'frigg_frida_stop',
  'Stop frida-server on the device.',
  { deviceId: z.string().optional().describe('adb serial (defaults to the last device frida-server was started on)') },
  async ({ deviceId }) => {
    try {
      return ok(await post('/api/frida/server/stop', deviceId ? { deviceId } : {}));
    } catch (e) {
      return err(e);
    }
  },
);

server.tool(
  'frigg_frida_run',
  'Inject and run a Frida script against an app on the device. Streams console.log/send() output over the Frigg WebSocket; this returns the initial session status.',
  {
    deviceId: z.string().describe('adb serial of the Android device/emulator'),
    target: z.string().min(1).describe('Target package or process name, e.g. com.example.app'),
    source: z.string().min(1).describe('The Frida JavaScript to inject'),
    spawnMode: z.boolean().optional().describe('Spawn the app (-f) instead of attaching to a running one (default false)'),
    scriptId: z.string().optional().describe('Optional label for the script'),
  },
  async ({ deviceId, target, source, spawnMode, scriptId }) => {
    try {
      return ok(
        await post('/api/frida/run', {
          deviceId,
          target,
          source,
          spawnMode: spawnMode ?? false,
          scriptId: scriptId ?? 'custom',
        }),
      );
    } catch (e) {
      return err(e);
    }
  },
);

server.tool('frigg_frida_stop_script', 'Stop the running Frida script session.', async () => {
  try {
    return ok(await post('/api/frida/stop', {}));
  } catch (e) {
    return err(e);
  }
});

server.tool('frigg_list_avds', 'List Android Virtual Devices (AVDs) and whether each is currently booted.', async () => {
  try {
    return ok(await get('/api/avd'));
  } catch (e) {
    return err(e);
  }
});

server.tool(
  'frigg_boot_avd',
  'Boot an Android emulator (AVD) by name.',
  { name: z.string().min(1).describe('AVD name') },
  async ({ name }) => {
    try {
      return ok(await post('/api/avd/boot', { name }));
    } catch (e) {
      return err(e);
    }
  },
);

server.tool(
  'frigg_create_avd',
  'Create a rooted (google_apis) AVD from an already-installed system image.',
  {
    name: z.string().min(1).describe('New AVD name'),
    apiLevel: z
      .number()
      .int()
      .optional()
      .describe('Android API level (default 34); the google_apis image for this level must already be installed'),
  },
  async ({ name, apiLevel }) => {
    try {
      return ok(await post('/api/avd/create', { name, apiLevel: apiLevel ?? 34 }));
    } catch (e) {
      return err(e);
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
