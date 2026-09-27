import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface AndroidProxyLease {
  proxyValue: string;
  previousProxyValue: string | null;
}

interface StoredRegistry {
  schemaVersion: 1;
  devices: Record<string, AndroidProxyLease>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLease(value: unknown): value is AndroidProxyLease {
  return (
    isObject(value) &&
    typeof value.proxyValue === 'string' &&
    value.proxyValue.length > 0 &&
    (value.previousProxyValue === null || typeof value.previousProxyValue === 'string')
  );
}

function isMissingFile(error: unknown): boolean {
  return isObject(error) && error.code === 'ENOENT';
}

export class AndroidProxyRegistry {
  private leases = new Map<string, AndroidProxyLease>();
  private activeSerials = new Set<string>();
  private mutationTail: Promise<void> = Promise.resolve();

  private constructor(private readonly filePath: string) {}

  static async load(filePath: string): Promise<AndroidProxyRegistry> {
    const registry = new AndroidProxyRegistry(filePath);
    let contents: string;
    try {
      contents = await readFile(filePath, 'utf8');
    } catch (error) {
      if (isMissingFile(error)) return registry;
      throw error;
    }

    const parsed: unknown = JSON.parse(contents);
    if (!isObject(parsed) || parsed.schemaVersion !== 1 || !isObject(parsed.devices)) {
      throw new Error(`Could not read Android proxy registry from ${filePath}: unexpected file format.`);
    }
    for (const [serial, lease] of Object.entries(parsed.devices)) {
      if (!isLease(lease)) {
        throw new Error(`Could not read Android proxy registry from ${filePath}: invalid entry for ${serial}.`);
      }
      registry.leases.set(serial, { ...lease });
    }
    return registry;
  }

  get(serial: string): AndroidProxyLease | undefined {
    const lease = this.leases.get(serial);
    return lease ? { ...lease } : undefined;
  }

  entries(): Array<[string, AndroidProxyLease]> {
    return [...this.leases.entries()].map(([serial, lease]) => [serial, { ...lease }]);
  }

  markActive(serial: string): void {
    this.activeSerials.add(serial);
  }

  markInactive(serial: string): void {
    this.activeSerials.delete(serial);
  }

  isActive(serial: string): boolean {
    return this.activeSerials.has(serial);
  }

  set(serial: string, lease: AndroidProxyLease): Promise<void> {
    return this.update((next) => next.set(serial, { ...lease }));
  }

  delete(serial: string): Promise<void> {
    if (!this.leases.has(serial)) {
      this.activeSerials.delete(serial);
      return this.mutationTail;
    }
    return this.update((next) => next.delete(serial)).then(() => {
      this.activeSerials.delete(serial);
    });
  }

  flush(): Promise<void> {
    return this.mutationTail;
  }

  private update(change: (next: Map<string, AndroidProxyLease>) => void): Promise<void> {
    const operation = this.mutationTail.then(async () => {
      const next = new Map(this.leases);
      change(next);
      await mkdir(dirname(this.filePath), { recursive: true });
      const contents: StoredRegistry = {
        schemaVersion: 1,
        devices: Object.fromEntries(next.entries()),
      };
      const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
      await writeFile(temporaryPath, `${JSON.stringify(contents, null, 2)}\n`, { mode: 0o600 });
      await rename(temporaryPath, this.filePath);
      this.leases = next;
    });
    this.mutationTail = operation.catch(() => undefined);
    return operation;
  }
}
