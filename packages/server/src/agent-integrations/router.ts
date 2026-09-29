import { Router, type Request, type Response } from 'express';
import {
  AGENT_CLIENT,
  AGENT_RESOURCE_STATE,
  type AgentClientId,
  type AgentResourceStatus,
} from '@frigg/shared';
import { localUiAccessMiddleware, type LocalUiAccessPorts } from '../lib/local-ui-access.ts';
import type { AgentIntegrationService } from './service.ts';

export interface AgentIntegrationRouterOptions extends LocalUiAccessPorts {
  service: AgentIntegrationService;
}

function parseClient(value: unknown): AgentClientId | null {
  return typeof value === 'string' && Object.values(AGENT_CLIENT).includes(value as AgentClientId)
    ? value as AgentClientId
    : null;
}

function parseSkillName(value: unknown): string | null {
  return typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) ? value : null;
}

function parseReplaceConflict(body: unknown): { value?: boolean; error?: string } {
  if (body === undefined || body === null) return { value: false };
  if (typeof body !== 'object' || Array.isArray(body)) return { error: 'Request body must be an object.' };
  const record = body as Record<string, unknown>;
  if (record.replaceConflict === undefined) return { value: false };
  return typeof record.replaceConflict === 'boolean'
    ? { value: record.replaceConflict }
    : { error: 'replaceConflict must be a boolean.' };
}

function statusCode(status: AgentResourceStatus): number {
  if (status.state === AGENT_RESOURCE_STATE.conflict) return 409;
  if (status.state === AGENT_RESOURCE_STATE.error) {
    if (/configuration|registry is invalid|bundled Frigg skills are unavailable|requested Frigg skill is unavailable/i.test(status.message ?? '')) return 400;
    return 500;
  }
  return 200;
}

function sendAction(res: Response, result: Awaited<ReturnType<AgentIntegrationService['installMcp']>>): void {
  res.status(statusCode(result.status[result.resource])).json(result);
}

export function buildAgentIntegrationRouter(options: AgentIntegrationRouterOptions) {
  const router = Router();
  const requireLocalUi = localUiAccessMiddleware(options);

  router.get('/api/agent-integrations', requireLocalUi, async (_req, res) => {
    try {
      res.json(await options.service.getSnapshot());
    } catch {
      res.status(500).json({ error: 'Unable to read Frigg integration status.' });
    }
  });

  router.post('/api/agent-integrations/:client/mcp/install', requireLocalUi, async (req: Request, res: Response) => {
    const client = parseClient(req.params.client);
    if (!client) {
      res.status(400).json({ error: 'Unknown AI client.' });
      return;
    }
    const replace = parseReplaceConflict(req.body);
    if (replace.error) {
      res.status(400).json({ error: replace.error });
      return;
    }
    try {
      sendAction(res, await options.service.installMcp(client, replace.value));
    } catch {
      res.status(500).json({ error: 'Unable to install the Frigg MCP server.' });
    }
  });

  router.post('/api/agent-integrations/:client/skills/install', requireLocalUi, async (req: Request, res: Response) => {
    const client = parseClient(req.params.client);
    if (!client) {
      res.status(400).json({ error: 'Unknown AI client.' });
      return;
    }
    const replace = parseReplaceConflict(req.body);
    if (replace.error) {
      res.status(400).json({ error: replace.error });
      return;
    }
    try {
      sendAction(res, await options.service.installSkills(client, replace.value));
    } catch {
      res.status(500).json({ error: 'Unable to install Frigg skills.' });
    }
  });

  router.post('/api/agent-integrations/:client/skills/:skillName/install', requireLocalUi, async (req: Request, res: Response) => {
    const client = parseClient(req.params.client);
    if (!client) {
      res.status(400).json({ error: 'Unknown AI client.' });
      return;
    }
    const skillName = parseSkillName(req.params.skillName);
    if (!skillName) {
      res.status(400).json({ error: 'Invalid Frigg skill name.' });
      return;
    }
    const replace = parseReplaceConflict(req.body);
    if (replace.error) {
      res.status(400).json({ error: replace.error });
      return;
    }
    try {
      sendAction(res, await options.service.installSkills(client, replace.value, skillName));
    } catch {
      res.status(500).json({ error: 'Unable to install the Frigg skill.' });
    }
  });

  router.post('/api/mcp/install/claude-code', requireLocalUi, async (_req, res) => {
    try {
      sendAction(res, await options.service.installMcp(AGENT_CLIENT.claudeCode));
    } catch {
      res.status(500).json({ error: 'Unable to install the Frigg MCP server for Claude Code.' });
    }
  });

  return router;
}
