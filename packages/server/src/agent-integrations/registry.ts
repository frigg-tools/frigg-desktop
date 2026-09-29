import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  AGENT_CLIENT,
  AGENT_RESOURCE,
  type AgentClientId,
  type AgentResourceId,
} from '@frigg/shared';

export interface ManagedResourceRecord {
  paths: string[];
  version?: string;
  fileHashes?: Record<string, string>;
  identityHash?: string;
}

export interface AgentIntegrationRegistry {
  version: 1;
  entries: Partial<Record<AgentClientId, Partial<Record<AgentResourceId, ManagedResourceRecord>>>>;
}

export interface McpIdentity {
  command: string;
  args: string[];
  apiUrl: string;
}

const REGISTRY_FILE = 'agent-integrations.json';

export function registryPath(homeDir: string): string {
  return path.join(homeDir, '.frigg', REGISTRY_FILE);
}

export function emptyRegistry(): AgentIntegrationRegistry {
  return { version: 1, entries: {} };
}

export function mcpIdentityHash(identity: McpIdentity): string {
  const canonical = JSON.stringify({
    command: identity.command,
    args: [...identity.args],
    apiUrl: identity.apiUrl,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateRegistry(value: unknown): AgentIntegrationRegistry {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.entries)) {
    throw new Error('The Frigg integration registry is invalid or uses an unsupported version.');
  }

  const clientIds = new Set<string>(Object.values(AGENT_CLIENT));
  const resourceIds = new Set<string>(Object.values(AGENT_RESOURCE));
  const isHash = (candidate: unknown): candidate is string =>
    typeof candidate === 'string' && /^[a-f0-9]{64}$/.test(candidate);
  for (const [client, resources] of Object.entries(value.entries)) {
    if (!clientIds.has(client) || !isRecord(resources)) {
      throw new Error('The Frigg integration registry contains an unsupported client.');
    }
    for (const [resource, record] of Object.entries(resources)) {
      if (!resourceIds.has(resource) || !isRecord(record)) {
        throw new Error('The Frigg integration registry contains an unsupported resource.');
      }
      if (!Array.isArray(record.paths) || !record.paths.every((item) => typeof item === 'string')) {
        throw new Error('The Frigg integration registry contains invalid managed paths.');
      }
      if (record.version !== undefined && typeof record.version !== 'string') {
        throw new Error('The Frigg integration registry contains an invalid resource version.');
      }
      if (record.identityHash !== undefined && !isHash(record.identityHash)) {
        throw new Error('The Frigg integration registry contains an invalid identity hash.');
      }
      if (record.fileHashes !== undefined) {
        if (!isRecord(record.fileHashes) || !Object.values(record.fileHashes).every(isHash)) {
          throw new Error('The Frigg integration registry contains invalid file hashes.');
        }
      }
      const allowedKeys = new Set(['paths', 'version', 'fileHashes', 'identityHash']);
      if (Object.keys(record).some((key) => !allowedKeys.has(key))) {
        throw new Error('The Frigg integration registry contains unsupported fields.');
      }
    }
  }
  return value as unknown as AgentIntegrationRegistry;
}

export async function readRegistry(homeDir: string): Promise<AgentIntegrationRegistry> {
  const file = registryPath(homeDir);
  let source: string;
  try {
    source = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyRegistry();
    throw new Error('Unable to read the Frigg integration registry.');
  }

  try {
    return validateRegistry(JSON.parse(source) as unknown);
  } catch {
    throw new Error('The Frigg integration registry is invalid or uses an unsupported version.');
  }
}

export async function writeRegistry(homeDir: string, registry: AgentIntegrationRegistry): Promise<void> {
  const file = registryPath(homeDir);
  const directory = path.dirname(file);
  await mkdir(directory, { recursive: true, mode: 0o700 });

  let mode = 0o600;
  try {
    mode = (await stat(file)).mode & 0o777;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new Error('Unable to inspect the Frigg integration registry permissions.');
    }
  }

  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(temporary, 'wx', mode);
    await handle.writeFile(`${JSON.stringify(registry, null, 2)}\n`, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, file);
  } catch {
    await handle?.close().catch(() => undefined);
    await rm(temporary, { force: true }).catch(() => undefined);
    throw new Error('Unable to save the Frigg integration registry.');
  }
}
