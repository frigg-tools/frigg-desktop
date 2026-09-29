import {
  AGENT_CLIENT,
  AGENT_RESOURCE,
  AGENT_RESOURCE_STATE,
  type AgentClientId,
  type AgentIntegrationActionResult,
  type AgentIntegrationSnapshot,
  type AgentIntegrationStatus,
  type AgentResourceId,
  type AgentResourceStatus,
} from '@frigg/shared';
import type { McpServerInfo } from '@frigg/shared';
import { createAgentClientAdapters, type AgentClientAdapters } from './clients.ts';
import {
  mcpIdentityHash,
  readRegistry,
  registryPath,
  writeRegistry,
  type AgentIntegrationRegistry,
  type ManagedResourceRecord,
} from './registry.ts';
import { inspectSkills, installSkills } from './skills.ts';

export interface AgentIntegrationServiceOptions {
  homeDir: string;
  dataDir: string;
  mcpServer: McpServerInfo | (() => McpServerInfo);
  skillsSource: string | null;
  adapters?: AgentClientAdapters;
  appVersion?: string;
}

const CLIENTS = [AGENT_CLIENT.codex, AGENT_CLIENT.claudeCode, AGENT_CLIENT.cursor] as const;

function status(
  state: AgentResourceStatus['state'],
  message: string,
  paths: string[] = [],
): AgentResourceStatus {
  return { state, managed: false, paths, message };
}

function registryResource(
  registry: AgentIntegrationRegistry,
  client: AgentClientId,
  resource: AgentResourceId,
): ManagedResourceRecord | undefined {
  return registry.entries[client]?.[resource];
}

function updateRegistry(
  registry: AgentIntegrationRegistry,
  client: AgentClientId,
  resource: AgentResourceId,
  record: ManagedResourceRecord | undefined,
): AgentIntegrationRegistry {
  const entries = { ...registry.entries };
  const clientEntries = { ...(entries[client] ?? {}) };
  if (record) clientEntries[resource] = record;
  else delete clientEntries[resource];
  if (Object.keys(clientEntries).length > 0) entries[client] = clientEntries;
  else delete entries[client];
  return { version: 1, entries };
}

function actionMessage(
  resource: AgentResourceId,
  client: AgentClientId,
  resourceStatus: AgentResourceStatus,
): string {
  if (resourceStatus.message) return resourceStatus.message;
  if (resourceStatus.state === AGENT_RESOURCE_STATE.installed) {
    const label = resource === AGENT_RESOURCE.mcp ? 'MCP server is' : 'skills are';
    return `Frigg ${label} installed for ${client}. Reload the client if they are not available yet.`;
  }
  return `Unable to install Frigg ${resource} for ${client}.`;
}

function errorSnapshot(message: string): AgentIntegrationSnapshot {
  return {
    clients: CLIENTS.map((client) => ({
      client,
      mcp: status(AGENT_RESOURCE_STATE.error, message),
      skills: status(AGENT_RESOURCE_STATE.error, message),
      skillDetails: [],
    })),
  };
}

export class AgentIntegrationService {
  private readonly adapters: AgentClientAdapters;

  constructor(private readonly options: AgentIntegrationServiceOptions) {
    this.adapters = options.adapters ?? createAgentClientAdapters();
  }

  private currentMcpServer(): McpServerInfo {
    return typeof this.options.mcpServer === 'function' ? this.options.mcpServer() : this.options.mcpServer;
  }

  private async loadRegistry(): Promise<AgentIntegrationRegistry> {
    return readRegistry(this.options.homeDir);
  }

  async getSnapshot(): Promise<AgentIntegrationSnapshot> {
    let registry: AgentIntegrationRegistry;
    try {
      registry = await this.loadRegistry();
    } catch {
      return errorSnapshot(`The Frigg installation registry is invalid. Inspect ${registryPath(this.options.homeDir)} before retrying.`);
    }

    const codexRoots = this.adapters[AGENT_CLIENT.codex].skillsRoots(this.options.homeDir);
    const claudeRoots = this.adapters[AGENT_CLIENT.claudeCode].skillsRoots(this.options.homeDir);
    const mcpServer = this.currentMcpServer();
    const clients = await Promise.all(CLIENTS.map(async (client): Promise<AgentIntegrationStatus> => {
      const mcpRecord = registryResource(registry, client, AGENT_RESOURCE.mcp);
      const skillsRecord = registryResource(registry, client, AGENT_RESOURCE.skills);
      const mcpPaths = this.adapters[client].mcpPaths(this.options.homeDir);
      const managedMcpIdentity = mcpRecord?.paths.some((item) => mcpPaths.includes(item))
        ? mcpRecord.identityHash
        : undefined;
      const sharedRoots = client === AGENT_CLIENT.cursor ? [...codexRoots, ...claudeRoots] : [];
      const [mcp, skillInspection] = await Promise.all([
        this.adapters[client].getMcpStatus(
          this.options.homeDir,
          mcpServer,
          managedMcpIdentity,
        ).catch(() => status(AGENT_RESOURCE_STATE.error, `Unable to inspect ${client} MCP configuration.`)),
        this.options.skillsSource
          ? inspectSkills(
              this.options.skillsSource,
              this.adapters[client].skillsRoots(this.options.homeDir)[0],
              skillsRecord,
              sharedRoots,
            )
          : Promise.resolve({
              status: status(AGENT_RESOURCE_STATE.error, 'The bundled Frigg skills are unavailable.'),
              skills: [],
            }),
      ]);
      return { client, mcp, skills: skillInspection.status, skillDetails: skillInspection.skills };
    }));
    return { clients };
  }

  async installMcp(client: AgentClientId, replaceConflict = false): Promise<AgentIntegrationActionResult> {
    const registry = await this.safeRegistry();
    if (!registry) return this.failedAction(client, AGENT_RESOURCE.mcp, 'The Frigg installation registry is invalid.');
    const mcpServer = this.currentMcpServer();
    const mcpRecord = registryResource(registry, client, AGENT_RESOURCE.mcp);
    const mcpPaths = this.adapters[client].mcpPaths(this.options.homeDir);
    const managedMcpIdentity = mcpRecord?.paths.some((item) => mcpPaths.includes(item))
      ? mcpRecord.identityHash
      : undefined;
    const installed = await this.adapters[client].installMcp(
      this.options.homeDir,
      mcpServer,
      replaceConflict,
      managedMcpIdentity,
    );
    if (installed.state !== AGENT_RESOURCE_STATE.installed) {
      return this.actionResult(client, AGENT_RESOURCE.mcp, installed, false);
    }

    const updated = updateRegistry(registry, client, AGENT_RESOURCE.mcp, {
      paths: installed.paths,
      ...(this.options.appVersion ? { version: this.options.appVersion } : {}),
      identityHash: mcpIdentityHash({
        command: mcpServer.command,
        args: mcpServer.args,
        apiUrl: mcpServer.env.FRIGG_API_URL ?? '',
      }),
    });
    try {
      await writeRegistry(this.options.homeDir, updated);
    } catch {
      const failed = status(AGENT_RESOURCE_STATE.error, 'Frigg MCP was configured, but its ownership record could not be saved. Retry setup to repair it.', installed.paths);
      return this.actionResult(client, AGENT_RESOURCE.mcp, failed, false);
    }
    return this.actionResult(client, AGENT_RESOURCE.mcp, installed, true);
  }

  async installSkills(
    client: AgentClientId,
    replaceConflict = false,
    skillName?: string,
  ): Promise<AgentIntegrationActionResult> {
    const registry = await this.safeRegistry();
    if (!registry) {
      return this.failedAction(client, AGENT_RESOURCE.skills, 'The Frigg installation registry is invalid.', skillName);
    }
    if (!this.options.skillsSource) {
      return this.failedAction(client, AGENT_RESOURCE.skills, 'The bundled Frigg skills are unavailable.', skillName);
    }
    const roots = this.adapters[client].skillsRoots(this.options.homeDir);
    const sharedRoots = client === AGENT_CLIENT.cursor
      ? [
          ...this.adapters[AGENT_CLIENT.codex].skillsRoots(this.options.homeDir),
          ...this.adapters[AGENT_CLIENT.claudeCode].skillsRoots(this.options.homeDir),
        ]
      : [];
    const result = await installSkills(
      this.options.skillsSource,
      roots[0],
      registryResource(registry, client, AGENT_RESOURCE.skills),
      replaceConflict,
      sharedRoots,
      async (fileHashes, paths) => {
        const previous = registryResource(registry, client, AGENT_RESOURCE.skills);
        const managedPaths = skillName
          ? [...new Set([...(previous?.paths ?? []), ...paths])]
          : paths;
        const managedHashes = skillName
          ? { ...(previous?.fileHashes ?? {}), ...fileHashes }
          : fileHashes;
        const updated = updateRegistry(
          registry,
          client,
          AGENT_RESOURCE.skills,
          managedPaths.length
            ? {
                paths: managedPaths,
                ...(this.options.appVersion ? { version: this.options.appVersion } : {}),
                fileHashes: managedHashes,
              }
            : undefined,
        );
        await writeRegistry(this.options.homeDir, updated);
      },
      skillName,
    );
    if (result.status.state !== AGENT_RESOURCE_STATE.installed) {
      return this.actionResult(client, AGENT_RESOURCE.skills, result.status, false, skillName);
    }
    return this.actionResult(client, AGENT_RESOURCE.skills, result.status, true, skillName);
  }

  private async safeRegistry(): Promise<AgentIntegrationRegistry | null> {
    try {
      return await this.loadRegistry();
    } catch {
      return null;
    }
  }

  private async failedAction(
    client: AgentClientId,
    resource: AgentResourceId,
    message: string,
    skillName?: string,
  ): Promise<AgentIntegrationActionResult> {
    return this.actionResult(client, resource, status(AGENT_RESOURCE_STATE.error, message), false, skillName);
  }

  private async actionResult(
    client: AgentClientId,
    resource: AgentResourceId,
    resourceStatus: AgentResourceStatus,
    ok: boolean,
    skillName?: string,
  ): Promise<AgentIntegrationActionResult> {
    let snapshot = await this.getSnapshot();
    const clients = snapshot.clients.map((clientStatus) => {
      if (clientStatus.client !== client) return clientStatus;
      return { ...clientStatus, [resource]: resourceStatus };
    });
    snapshot = { clients };
    return {
      ok,
      client,
      resource,
      ...(skillName ? { skillName } : {}),
      status: clients.find((candidate) => candidate.client === client)!,
      message: actionMessage(resource, client, resourceStatus),
    };
  }
}

export function createAgentIntegrationService(options: AgentIntegrationServiceOptions): AgentIntegrationService {
  return new AgentIntegrationService(options);
}
