import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { lstat, mkdir, open, readFile, realpath, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import type {
  AgentClientId,
  AgentResourceStatus,
} from '@frigg/shared';
import { AGENT_CLIENT, AGENT_RESOURCE_STATE } from '@frigg/shared';
import type { McpServerInfo } from '@frigg/shared';
import { run } from '../lib/exec.ts';
import { mcpIdentityHash, type McpIdentity } from './registry.ts';

const MCP_SERVER_NAME = 'frigg';
const API_URL_ENV = 'FRIGG_API_URL';

type JsonObject = Record<string, unknown>;

interface ObservedMcpEntry {
  status: AgentResourceStatus;
  entry?: JsonObject;
  identityHash?: string;
}

export interface AgentClientAdapter {
  id: AgentClientId;
  mcpPaths(homeDir: string): string[];
  skillsRoots(homeDir: string): string[];
  getMcpStatus(homeDir: string, expected: McpServerInfo, managedIdentity?: string): Promise<AgentResourceStatus>;
  installMcp(
    homeDir: string,
    input: McpServerInfo,
    replaceConflict: boolean,
    managedIdentity?: string,
  ): Promise<AgentResourceStatus>;
}

export type AgentClientAdapters = Record<AgentClientId, AgentClientAdapter>;

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isObject(value) && Object.values(value).every((item) => typeof item === 'string');
}

function pathsForMcp(client: AgentClientId, homeDir: string): string[] {
  if (client === AGENT_CLIENT.codex) {
    const codexHome = process.env.CODEX_HOME ? path.resolve(process.env.CODEX_HOME) : path.join(homeDir, '.codex');
    return [path.join(codexHome, 'config.toml')];
  }
  if (client === AGENT_CLIENT.claudeCode) {
    const configDir = process.env.CLAUDE_CONFIG_DIR
      ? path.resolve(process.env.CLAUDE_CONFIG_DIR)
      : homeDir;
    return [path.join(configDir, '.claude.json')];
  }
  return [path.join(homeDir, '.cursor', 'mcp.json')];
}

interface ClientCommand {
  command: string;
  prefixArgs: string[];
}

function packageName(client: typeof AGENT_CLIENT.codex | typeof AGENT_CLIENT.claudeCode): string[] {
  return client === AGENT_CLIENT.codex ? ['@openai', 'codex'] : ['@anthropic-ai', 'claude-code'];
}

async function findWindowsCliPath(commandName: string): Promise<string | null> {
  const where = process.env.SystemRoot
    ? path.join(process.env.SystemRoot, 'System32', 'where.exe')
    : 'where.exe';
  const result = await run(where, [commandName]);
  if (!result.ok) return null;
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).find((line) => line.length > 0) ?? null;
}

async function npmPackageCommand(
  client: typeof AGENT_CLIENT.codex | typeof AGENT_CLIENT.claudeCode,
): Promise<ClientCommand | null> {
  const baseName = client === AGENT_CLIENT.codex ? 'codex' : 'claude';
  const shim = await findWindowsCliPath(`${baseName}.cmd`);
  if (!shim) return null;
  const packageRoot = path.join(path.dirname(shim), 'node_modules', ...packageName(client));
  const manifestPath = path.join(packageRoot, 'package.json');
  try {
    const manifest: unknown = JSON.parse(await readFile(manifestPath, 'utf8'));
    if (!isObject(manifest)) return null;
    const bin = manifest.bin;
    const entry = typeof bin === 'string'
      ? bin
      : isObject(bin) && typeof bin[baseName] === 'string'
        ? bin[baseName] as string
        : undefined;
    if (!entry) return null;
    const entryPath = path.resolve(packageRoot, entry);
    const relative = path.relative(packageRoot, entryPath);
    if (relative.startsWith('..') || path.isAbsolute(relative) || !existsSync(entryPath)) return null;
    return { command: 'node.exe', prefixArgs: [entryPath] };
  } catch {
    return null;
  }
}

async function clientCommand(
  client: typeof AGENT_CLIENT.codex | typeof AGENT_CLIENT.claudeCode,
): Promise<ClientCommand | null> {
  const baseName = client === AGENT_CLIENT.codex ? 'codex' : 'claude';
  if (process.platform !== 'win32') return { command: baseName, prefixArgs: [] };
  const executable = await findWindowsCliPath(`${baseName}.exe`);
  if (executable) return { command: executable, prefixArgs: [] };
  return npmPackageCommand(client);
}

function resourceStatus(
  state: AgentResourceStatus['state'],
  managed: boolean,
  paths: string[],
  message?: string,
): AgentResourceStatus {
  return { state, managed, paths, ...(message ? { message } : {}) };
}

function expectedIdentity(input: McpServerInfo): McpIdentity {
  return {
    command: input.command,
    args: input.args,
    apiUrl: input.env[API_URL_ENV] ?? '',
  };
}

function observedIdentity(entry: JsonObject): { identity: McpIdentity; supportedShape: boolean } | null {
  if (typeof entry.command !== 'string' || !Array.isArray(entry.args) || !entry.args.every((arg) => typeof arg === 'string')) {
    return null;
  }

  const env = entry.env === undefined ? {} : entry.env;
  if (!isStringRecord(env)) return null;
  const supportedFields = new Set(['command', 'args', 'env', 'enabled', 'type', 'transport', 'name']);
  const supportedShape = Object.keys(entry).every((key) => supportedFields.has(key)) &&
    (entry.name === undefined || entry.name === MCP_SERVER_NAME) &&
    (entry.enabled === undefined || entry.enabled === true) &&
    (entry.type === undefined || entry.type === 'stdio') &&
    (entry.transport === undefined || entry.transport === 'stdio') &&
    Object.keys(env).every((key) => key === API_URL_ENV);

  return {
    identity: {
      command: entry.command,
      args: entry.args as string[],
      apiUrl: env[API_URL_ENV] ?? '',
    },
    supportedShape,
  };
}

function classifyEntry(
  client: AgentClientId,
  configPath: string,
  entry: JsonObject | undefined,
  expected: McpServerInfo,
  managedIdentity?: string,
): ObservedMcpEntry {
  if (!entry) {
    return { status: resourceStatus(AGENT_RESOURCE_STATE.missing, false, [configPath]) };
  }

  const parsed = observedIdentity(entry);
  if (!parsed || !parsed.supportedShape) {
    return {
      status: resourceStatus(
        AGENT_RESOURCE_STATE.conflict,
        false,
        [configPath],
        `A different MCP configuration named ${MCP_SERVER_NAME} is already present for ${client}.`,
      ),
      entry,
    };
  }

  const identityHash = mcpIdentityHash(parsed.identity);
  const expectedHash = mcpIdentityHash(expectedIdentity(expected));
  if (identityHash === managedIdentity) {
    return {
      status: resourceStatus(
        AGENT_RESOURCE_STATE.installed,
        true,
        [configPath],
        identityHash === expectedHash ? undefined : 'The Frigg-managed MCP entry is ready to update.',
      ),
      entry,
      identityHash,
    };
  }

  return {
    status: resourceStatus(
      AGENT_RESOURCE_STATE.conflict,
      false,
      [configPath],
      `An MCP entry named ${MCP_SERVER_NAME} is not managed by Frigg. Choose Replace to overwrite only that entry.`,
    ),
    entry,
    identityHash,
  };
}

function normalizeCodexEntry(candidate: JsonObject): JsonObject {
  if (!isObject(candidate.transport)) return candidate;
  const transport = candidate.transport;
  if (transport.type !== 'stdio') return candidate;

  const rootFields = new Set([
    'name', 'enabled', 'disabled_reason', 'transport', 'enabled_tools', 'disabled_tools',
    'startup_timeout_sec', 'tool_timeout_sec',
  ]);
  const transportFields = new Set(['type', 'command', 'args', 'env', 'env_vars', 'cwd']);
  const unsupportedRoot = Object.keys(candidate).some((key) => !rootFields.has(key));
  const unsupportedTransport = Object.keys(transport).some((key) => !transportFields.has(key));
  const unsupportedValues = (candidate.enabled !== true) ||
    (candidate.disabled_reason !== null && candidate.disabled_reason !== undefined) ||
    (candidate.enabled_tools !== null && candidate.enabled_tools !== undefined) ||
    (candidate.disabled_tools !== null && candidate.disabled_tools !== undefined) ||
    (candidate.startup_timeout_sec !== null && candidate.startup_timeout_sec !== undefined) ||
    (candidate.tool_timeout_sec !== null && candidate.tool_timeout_sec !== undefined) ||
    (transport.env_vars !== undefined && (!Array.isArray(transport.env_vars) || transport.env_vars.length > 0)) ||
    (transport.cwd !== null && transport.cwd !== undefined);

  return {
    name: candidate.name,
    enabled: candidate.enabled,
    type: transport.type,
    transport: transport.type,
    command: transport.command,
    args: transport.args,
    env: transport.env ?? {},
    ...((unsupportedRoot || unsupportedTransport || unsupportedValues) ? { __unsupportedCodexFields: true } : {}),
  };
}

function entryFromCliJson(source: string): JsonObject | undefined {
  const parsed: unknown = JSON.parse(source);
  if (!isObject(parsed)) throw new Error('The Codex MCP response was not a JSON object.');

  const servers = isObject(parsed.mcp_servers) ? parsed.mcp_servers : isObject(parsed.mcpServers) ? parsed.mcpServers : undefined;
  if (servers) {
    const entry = servers[MCP_SERVER_NAME];
    return isObject(entry) ? normalizeCodexEntry(entry) : undefined;
  }
  if (isObject(parsed[MCP_SERVER_NAME])) return normalizeCodexEntry(parsed[MCP_SERVER_NAME] as JsonObject);
  if (typeof parsed.command === 'string' || typeof parsed.url === 'string' || isObject(parsed.transport)) {
    return normalizeCodexEntry(parsed);
  }
  throw new Error('The Codex MCP response did not contain an entry.');
}

function cliSaysMissing(result: { stdout: string; stderr: string }): boolean {
  return /no mcp server|server named .?frigg.? not found|frigg.+not found|not configured/i.test(`${result.stdout}\n${result.stderr}`);
}

function cliFailureStatus(client: AgentClientId, configPath: string, result: { code: number | null }): AgentResourceStatus {
  if (result.code === null) {
    return resourceStatus(
      AGENT_RESOURCE_STATE.unavailable,
      false,
      [configPath],
      `${client} CLI is unavailable. Install the client CLI or use the manual setup instructions.`,
    );
  }
  return resourceStatus(
    AGENT_RESOURCE_STATE.error,
    false,
    [configPath],
    `Unable to read the ${client} MCP configuration.`,
  );
}

async function observeCodex(
  homeDir: string,
  expected: McpServerInfo,
  managedIdentity?: string,
): Promise<ObservedMcpEntry> {
  const configPath = pathsForMcp(AGENT_CLIENT.codex, homeDir)[0];
  if (!expected.available) {
    return { status: resourceStatus(AGENT_RESOURCE_STATE.error, false, [configPath], 'The Frigg MCP bundle is unavailable.') };
  }

  const cli = await clientCommand(AGENT_CLIENT.codex);
  if (!cli) return { status: cliFailureStatus(AGENT_CLIENT.codex, configPath, { code: null }) };
  const result = await run(cli.command, [...cli.prefixArgs, 'mcp', 'get', MCP_SERVER_NAME, '--json']);
  if (!result.ok) {
    if (cliSaysMissing(result)) {
      return classifyEntry(AGENT_CLIENT.codex, configPath, undefined, expected, managedIdentity);
    }
    return { status: cliFailureStatus(AGENT_CLIENT.codex, configPath, result) };
  }

  try {
    const entry = entryFromCliJson(result.stdout);
    return classifyEntry(AGENT_CLIENT.codex, configPath, entry, expected, managedIdentity);
  } catch {
    return {
      status: resourceStatus(AGENT_RESOURCE_STATE.error, false, [configPath], 'Unable to interpret the Codex MCP configuration.'),
    };
  }
}

async function readJsonConfig(file: string): Promise<{ value?: JsonObject; error?: string }> {
  let source: string;
  try {
    source = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    return { error: 'Unable to read the MCP configuration file.' };
  }

  try {
    const parsed: unknown = JSON.parse(source);
    return isObject(parsed) ? { value: parsed } : { error: 'The MCP configuration must be a JSON object.' };
  } catch {
    return { error: 'The MCP configuration contains invalid JSON.' };
  }
}

function entryInConfig(config: JsonObject | undefined): { entry?: JsonObject; error?: string } {
  if (!config) return {};
  if (config.mcpServers === undefined) return {};
  if (!isObject(config.mcpServers)) return { error: 'The mcpServers setting must be a JSON object.' };
  const entry = config.mcpServers[MCP_SERVER_NAME];
  if (entry === undefined) return {};
  return isObject(entry) ? { entry } : { error: 'The Frigg MCP entry must be a JSON object.' };
}

async function inspectClaudeCli(homeDir: string, expected: McpServerInfo, managedIdentity?: string): Promise<ObservedMcpEntry> {
  const configPath = pathsForMcp(AGENT_CLIENT.claudeCode, homeDir)[0];
  if (!expected.available) {
    return { status: resourceStatus(AGENT_RESOURCE_STATE.error, false, [configPath], 'The Frigg MCP bundle is unavailable.') };
  }

  const cli = await clientCommand(AGENT_CLIENT.claudeCode);
  if (!cli) return { status: cliFailureStatus(AGENT_CLIENT.claudeCode, configPath, { code: null }) };
  const version = await run(cli.command, [...cli.prefixArgs, '--version']);
  if (!version.ok) return { status: cliFailureStatus(AGENT_CLIENT.claudeCode, configPath, version) };

  const config = await readJsonConfig(configPath);
  if (config.error) return { status: resourceStatus(AGENT_RESOURCE_STATE.error, false, [configPath], config.error) };
  const found = entryInConfig(config.value);
  if (found.error) return { status: resourceStatus(AGENT_RESOURCE_STATE.error, false, [configPath], found.error) };
  return classifyEntry(AGENT_CLIENT.claudeCode, configPath, found.entry, expected, managedIdentity);
}

async function inspectCursor(homeDir: string, expected: McpServerInfo, managedIdentity?: string): Promise<ObservedMcpEntry> {
  const configPath = pathsForMcp(AGENT_CLIENT.cursor, homeDir)[0];
  if (!expected.available) {
    return { status: resourceStatus(AGENT_RESOURCE_STATE.error, false, [configPath], 'The Frigg MCP bundle is unavailable.') };
  }

  const config = await readJsonConfig(configPath);
  if (config.error) return { status: resourceStatus(AGENT_RESOURCE_STATE.error, false, [configPath], config.error) };
  const found = entryInConfig(config.value);
  if (found.error) return { status: resourceStatus(AGENT_RESOURCE_STATE.error, false, [configPath], found.error) };
  return classifyEntry(AGENT_CLIENT.cursor, configPath, found.entry, expected, managedIdentity);
}

async function atomicWriteJson(file: string, value: JsonObject): Promise<void> {
  const directory = path.dirname(file);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  let mode = 0o600;
  try {
    const metadata = await lstat(file);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error('Unsupported MCP configuration path.');
    }
    mode = metadata.mode & 0o777;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new Error('Unable to inspect MCP configuration permissions.');
    }
  }

  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(temporary, 'wx', mode);
    await handle.chmod(mode);
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, file);
  } catch {
    await handle?.close().catch(() => undefined);
    await rm(temporary, { force: true }).catch(() => undefined);
    throw new Error('Unable to save the MCP configuration file.');
  }
}

async function atomicWriteCursorConfig(file: string, value: JsonObject): Promise<void> {
  let target = file;
  let metadata;
  try {
    metadata = await lstat(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      await atomicWriteJson(file, value);
      return;
    }
    throw new Error('Unable to inspect Cursor MCP configuration path.');
  }

  if (metadata.isSymbolicLink()) {
    try {
      target = await realpath(file);
      const targetMetadata = await lstat(target);
      if (!targetMetadata.isFile() || targetMetadata.isSymbolicLink()) {
        throw new Error('Unsupported MCP configuration target.');
      }
      if (await realpath(file) !== target) throw new Error('MCP configuration link changed during setup.');
    } catch {
      throw new Error('Unable to inspect Cursor MCP configuration target.');
    }
  } else if (!metadata.isFile()) {
    throw new Error('Unable to inspect Cursor MCP configuration path.');
  }

  await atomicWriteJson(target, value);
}

function expectedEntry(input: McpServerInfo): JsonObject {
  return { command: input.command, args: [...input.args], env: { ...input.env } };
}

async function writeCursorEntry(
  homeDir: string,
  input: McpServerInfo,
  replaceConflict: boolean,
  managedIdentity?: string,
): Promise<AgentResourceStatus> {
  const configPath = pathsForMcp(AGENT_CLIENT.cursor, homeDir)[0];
  const config = await readJsonConfig(configPath);
  if (config.error) return resourceStatus(AGENT_RESOURCE_STATE.error, false, [configPath], config.error);
  const currentConfig = config.value ?? {};
  const found = entryInConfig(currentConfig);
  if (found.error) return resourceStatus(AGENT_RESOURCE_STATE.error, false, [configPath], found.error);
  const currentStatus = classifyEntry(AGENT_CLIENT.cursor, configPath, found.entry, input, managedIdentity).status;
  if (currentStatus.state === AGENT_RESOURCE_STATE.conflict && !replaceConflict) return currentStatus;
  if (currentStatus.state === AGENT_RESOURCE_STATE.installed && currentStatus.managed && currentStatus.message === undefined) {
    return currentStatus;
  }

  const servers = isObject(currentConfig.mcpServers) ? currentConfig.mcpServers : {};
  const next: JsonObject = { ...currentConfig, mcpServers: { ...servers, [MCP_SERVER_NAME]: expectedEntry(input) } };
  try {
    await atomicWriteCursorConfig(configPath, next);
    return resourceStatus(AGENT_RESOURCE_STATE.installed, true, [configPath]);
  } catch {
    return resourceStatus(AGENT_RESOURCE_STATE.error, false, [configPath], 'Unable to write Cursor MCP configuration.');
  }
}

async function runClientInstall(
  client: typeof AGENT_CLIENT.codex | typeof AGENT_CLIENT.claudeCode,
  homeDir: string,
  input: McpServerInfo,
  replaceConflict: boolean,
  managedIdentity?: string,
): Promise<AgentResourceStatus> {
  const observed = client === AGENT_CLIENT.codex
    ? await observeCodex(homeDir, input, managedIdentity)
    : await inspectClaudeCli(homeDir, input, managedIdentity);
  const current = observed.status;
  if (current.state === AGENT_RESOURCE_STATE.error || current.state === AGENT_RESOURCE_STATE.unavailable) return current;
  if (current.state === AGENT_RESOURCE_STATE.conflict && !replaceConflict) return current;
  if (current.state === AGENT_RESOURCE_STATE.installed && current.managed && current.message === undefined) return current;

  const cli = await clientCommand(client);
  if (!cli) return cliFailureStatus(client, current.paths[0] ?? pathsForMcp(client, homeDir)[0], { code: null });
  const removeArgs = client === AGENT_CLIENT.codex
    ? ['mcp', 'remove', MCP_SERVER_NAME]
    : ['mcp', 'remove', MCP_SERVER_NAME, '--scope', 'user'];
  const addArgs = client === AGENT_CLIENT.codex
    ? [
        'mcp', 'add', MCP_SERVER_NAME,
        '--env', `${API_URL_ENV}=${input.env[API_URL_ENV] ?? ''}`,
        '--', input.command, ...input.args,
      ]
    : [
        'mcp', 'add', '--env', `${API_URL_ENV}=${input.env[API_URL_ENV] ?? ''}`,
        '--transport', 'stdio', '--scope', 'user', MCP_SERVER_NAME,
        '--', input.command, ...input.args,
      ];

  if (current.state === AGENT_RESOURCE_STATE.installed || observed.entry) {
    const removed = await run(cli.command, [...cli.prefixArgs, ...removeArgs]);
    if (!removed.ok) {
      return resourceStatus(
        AGENT_RESOURCE_STATE.error,
        current.managed,
        current.paths,
        `Unable to remove the existing Frigg MCP entry from ${client}. Check the client's MCP configuration before retrying.`,
      );
    }
  }

  const added = await run(cli.command, [...cli.prefixArgs, ...addArgs]);
  if (!added.ok) {
    return resourceStatus(
      AGENT_RESOURCE_STATE.error,
      false,
      current.paths,
      `Unable to install Frigg MCP in ${client}. Check the client's MCP configuration and run setup again if the Frigg entry is missing.`,
    );
  }
  return resourceStatus(AGENT_RESOURCE_STATE.installed, true, current.paths);
}

function skillsRoot(client: AgentClientId, homeDir: string): string {
  if (client === AGENT_CLIENT.codex) return path.join(homeDir, '.agents', 'skills');
  if (client === AGENT_CLIENT.claudeCode) {
    const configDir = process.env.CLAUDE_CONFIG_DIR;
    return path.join(configDir ? path.resolve(configDir) : path.join(homeDir, '.claude'), 'skills');
  }
  return path.join(homeDir, '.cursor', 'skills');
}

export function createAgentClientAdapters(): AgentClientAdapters {
  return {
    [AGENT_CLIENT.codex]: {
      id: AGENT_CLIENT.codex,
      mcpPaths: (homeDir) => pathsForMcp(AGENT_CLIENT.codex, homeDir),
      skillsRoots: (homeDir) => [skillsRoot(AGENT_CLIENT.codex, homeDir)],
      async getMcpStatus(homeDir, expected, managedIdentity) {
        return (await observeCodex(homeDir, expected, managedIdentity)).status;
      },
      installMcp(homeDir, input, replaceConflict, managedIdentity) {
        return runClientInstall(AGENT_CLIENT.codex, homeDir, input, replaceConflict, managedIdentity);
      },
    },
    [AGENT_CLIENT.claudeCode]: {
      id: AGENT_CLIENT.claudeCode,
      mcpPaths: (homeDir) => pathsForMcp(AGENT_CLIENT.claudeCode, homeDir),
      skillsRoots: (homeDir) => [skillsRoot(AGENT_CLIENT.claudeCode, homeDir)],
      async getMcpStatus(homeDir, expected, managedIdentity) {
        return (await inspectClaudeCli(homeDir, expected, managedIdentity)).status;
      },
      installMcp(homeDir, input, replaceConflict, managedIdentity) {
        return runClientInstall(AGENT_CLIENT.claudeCode, homeDir, input, replaceConflict, managedIdentity);
      },
    },
    [AGENT_CLIENT.cursor]: {
      id: AGENT_CLIENT.cursor,
      mcpPaths: (homeDir) => pathsForMcp(AGENT_CLIENT.cursor, homeDir),
      skillsRoots: (homeDir) => [skillsRoot(AGENT_CLIENT.cursor, homeDir)],
      getMcpStatus(homeDir, expected, managedIdentity) {
        return inspectCursor(homeDir, expected, managedIdentity).then((observed) => observed.status);
      },
      installMcp: writeCursorEntry,
    },
  };
}
