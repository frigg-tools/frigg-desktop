import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

interface StoredRegistry {
  schemaVersion: 1;
  ports: Record<string, number>;
}

const FIRST_DEVICE_PROXY_PORT = 10_000;
const LAST_DEVICE_PROXY_PORT = 19_999;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMissingFile(error: unknown): boolean {
  return isObject(error) && error.code === 'ENOENT';
}

function isValidPort(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 65_535;
}

export class DeviceProxyRegistry {
  private ports = new Map<string, number>();
  private mutationTail: Promise<void> = Promise.resolve();

  private constructor(private readonly filePath: string) {}

  static async load(filePath: string): Promise<DeviceProxyRegistry> {
    const registry = new DeviceProxyRegistry(filePath);
    let contents: string;
    try {
      contents = await readFile(filePath, 'utf8');
    } catch (error) {
      if (isMissingFile(error)) return registry;
      throw error;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(contents);
    } catch {
      throw new Error(`Could not read device proxy registry from ${filePath}: invalid JSON.`);
    }
    if (!isObject(parsed) || parsed.schemaVersion !== 1 || !isObject(parsed.ports)) {
      throw new Error(`Could not read device proxy registry from ${filePath}: unexpected file format.`);
    }

    const assignedPorts = new Set<number>();
    for (const [deviceId, port] of Object.entries(parsed.ports)) {
      if (deviceId.length === 0 || !isValidPort(port) || assignedPorts.has(port)) {
        throw new Error(`Could not read device proxy registry from ${filePath}: invalid assignment for ${deviceId}.`);
      }
      registry.ports.set(deviceId, port);
      assignedPorts.add(port);
    }
    return registry;
  }

  get(deviceId: string): number | undefined {
    return this.ports.get(deviceId);
  }

  getOrAssign(deviceId: string, reservedPorts: ReadonlySet<number>): Promise<number | null> {
    const operation = this.mutationTail.then(async () => {
      const existing = this.ports.get(deviceId);
      if (existing !== undefined) return existing;

      const usedPorts = new Set([...this.ports.values(), ...reservedPorts]);
      let selectedPort: number | null = null;
      for (let port = FIRST_DEVICE_PROXY_PORT; port <= LAST_DEVICE_PROXY_PORT; port += 1) {
        if (usedPorts.has(port)) continue;
        selectedPort = port;
        break;
      }
      if (selectedPort === null) return null;

      const next = new Map(this.ports);
      next.set(deviceId, selectedPort);
      await mkdir(dirname(this.filePath), { recursive: true });
      const contents: StoredRegistry = {
        schemaVersion: 1,
        ports: Object.fromEntries(next.entries()),
      };
      const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
      await writeFile(temporaryPath, `${JSON.stringify(contents, null, 2)}\n`, { mode: 0o600 });
      await rename(temporaryPath, this.filePath);
      this.ports = next;
      return selectedPort;
    });
    this.mutationTail = operation.then(() => undefined, () => undefined);
    return operation;
  }

  flush(): Promise<void> {
    return this.mutationTail;
  }
}
