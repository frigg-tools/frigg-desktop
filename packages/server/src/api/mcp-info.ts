import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { McpServerInfo } from '@frigg/shared';

const MCP_TOOL_COUNT = 52;

function packagedEntry(): string | null {
  const resources = (process as { resourcesPath?: string }).resourcesPath;
  if (!resources) return null;
  const candidate = path.join(resources, 'mcp', 'frigg-mcp.mjs');
  return existsSync(candidate) ? candidate : null;
}

function devEntry(): string | null {
  try {
    const candidate = fileURLToPath(new URL('../../../mcp/src/index.ts', import.meta.url));
    return existsSync(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

export function agentSkillsSource(): string | null {
  const resources = (process as { resourcesPath?: string }).resourcesPath;
  if (resources) {
    const packaged = path.join(resources, 'skills');
    if (existsSync(packaged)) return packaged;
  }
  try {
    const development = fileURLToPath(new URL('../../../../plugin/skills', import.meta.url));
    return existsSync(development) ? development : null;
  } catch {
    return null;
  }
}

export function mcpServerInfo(apiPort: number): McpServerInfo {
  const env = { FRIGG_API_URL: `http://localhost:${apiPort}` };
  const packaged = packagedEntry();
  if (packaged) {
    return { command: 'node', args: [packaged], env, available: true, toolCount: MCP_TOOL_COUNT };
  }
  const dev = devEntry();
  if (dev) {
    return { command: 'npx', args: ['tsx', dev], env, available: true, toolCount: MCP_TOOL_COUNT };
  }
  return { command: 'node', args: [], env, available: false, toolCount: MCP_TOOL_COUNT };
}
