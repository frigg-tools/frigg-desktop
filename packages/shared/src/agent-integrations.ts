export const AGENT_CLIENT = {
  codex: 'codex',
  claudeCode: 'claude-code',
  cursor: 'cursor',
} as const;

export type AgentClientId = (typeof AGENT_CLIENT)[keyof typeof AGENT_CLIENT];

export const AGENT_RESOURCE = {
  mcp: 'mcp',
  skills: 'skills',
} as const;

export type AgentResourceId = (typeof AGENT_RESOURCE)[keyof typeof AGENT_RESOURCE];

export const AGENT_RESOURCE_STATE = {
  installed: 'installed',
  missing: 'missing',
  conflict: 'conflict',
  unavailable: 'unavailable',
  error: 'error',
} as const;

export type AgentResourceState = (typeof AGENT_RESOURCE_STATE)[keyof typeof AGENT_RESOURCE_STATE];

export interface ConflictActionInput {
  replaceConflict?: boolean;
}

export interface AgentResourceStatus {
  state: AgentResourceState;
  managed: boolean;
  paths: string[];
  updateAvailable?: boolean;
  message?: string;
}

export interface AgentSkillStatus {
  name: string;
  state: AgentResourceState;
  managed: boolean;
  paths: string[];
  installedVersion: string | null;
  availableVersion: string | null;
  updateAvailable: boolean;
  message?: string;
}

export interface AgentIntegrationStatus {
  client: AgentClientId;
  mcp: AgentResourceStatus;
  skills: AgentResourceStatus;
  skillDetails: AgentSkillStatus[];
}

export interface AgentIntegrationSnapshot {
  clients: AgentIntegrationStatus[];
}

export interface AgentIntegrationActionResult {
  ok: boolean;
  client: AgentClientId;
  resource: AgentResourceId;
  skillName?: string;
  status: AgentIntegrationStatus;
  message: string;
}
