import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { BodyPayload, TrafficExchange } from '@frigg/shared';
import { get } from './frigg-api.ts';

export const DEFAULT_TRAFFIC_BODY_LIMIT = 65_536;
export const MAX_TRAFFIC_BODY_LIMIT = 262_144;

function ok(value: unknown): { content: [{ type: 'text'; text: string }] } {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

function err(error: unknown): { content: [{ type: 'text'; text: string }]; isError: true } {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: 'text', text: message }], isError: true };
}

function limitTrafficBody(body: BodyPayload, maxBodyBytes: number): BodyPayload {
  const captured = body.encoding === 'base64' ? Buffer.from(body.data, 'base64') : Buffer.from(body.data, 'utf8');
  let returned = captured.subarray(0, maxBodyBytes);

  if (body.encoding === 'utf8' && returned.length < captured.length) {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let end = returned.length;
    while (end > 0) {
      try {
        decoder.decode(returned.subarray(0, end));
        break;
      } catch {
        end -= 1;
      }
    }
    returned = returned.subarray(0, end);
  }

  const truncated = body.truncated || captured.length < body.size || returned.length < captured.length;
  if (!truncated) return body;

  return {
    ...body,
    data: body.encoding === 'base64' ? returned.toString('base64') : returned.toString('utf8'),
    truncated: true,
  };
}

function limitTrafficExchange(exchange: TrafficExchange, maxBodyBytes: number): TrafficExchange {
  const request = { ...exchange.request, body: limitTrafficBody(exchange.request.body, maxBodyBytes) };
  if (!exchange.response) return { ...exchange, request };

  return {
    ...exchange,
    request,
    response: { ...exchange.response, body: limitTrafficBody(exchange.response.body, maxBodyBytes) },
  };
}

export function registerTrafficTools(server: McpServer): void {
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
          exchanges = exchanges.filter((exchange) => exchange.request.host.includes(hostContains));
        }
        if (limit !== undefined) {
          exchanges = exchanges.slice(-limit);
        }
        const summary = exchanges.map((exchange) => ({
          id: exchange.id,
          method: exchange.request.method,
          url: exchange.request.url,
          status: exchange.response?.statusCode ?? null,
          durationMs: exchange.response?.durationMs ?? null,
          mocked: exchange.response?.mockRuleId !== undefined,
        }));
        return ok(summary);
      } catch (error) {
        return err(error);
      }
    },
  );

  server.tool(
    'frigg_get_traffic_detail',
    'Get one captured HTTP exchange by ID, including request and response headers and bounded bodies. Read-only.',
    {
      id: z.string().trim().min(1).describe('ID returned by frigg_list_traffic'),
      maxBodyBytes: z
        .number()
        .int()
        .min(0)
        .max(MAX_TRAFFIC_BODY_LIMIT)
        .default(DEFAULT_TRAFFIC_BODY_LIMIT)
        .describe('Maximum returned bytes for each present request/response body (default 65536; max 262144)'),
    },
    async ({ id, maxBodyBytes }) => {
      try {
        const exchanges = await get<TrafficExchange[]>('/api/traffic');
        const exchange = exchanges.find((candidate) => candidate.id === id);
        if (!exchange) return err(new Error(`Traffic exchange not found: ${id}`));
        return ok(limitTrafficExchange(exchange, maxBodyBytes));
      } catch (error) {
        return err(error);
      }
    },
  );
}
