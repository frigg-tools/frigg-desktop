import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ProxyCertsSnapshot, ProxyClientCert } from '@frigg/shared';

const PERSIST_DEBOUNCE_MS = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidCert(value: unknown): value is ProxyClientCert {
  return (
    isRecord(value) &&
    typeof value.host === 'string' &&
    typeof value.pfxPath === 'string' &&
    (value.passphrase === undefined || typeof value.passphrase === 'string')
  );
}

function normalizeCert(cert: ProxyClientCert): ProxyClientCert {
  const normalized: ProxyClientCert = {
    id: typeof cert.id === 'string' && cert.id !== '' ? cert.id : randomUUID(),
    host: cert.host,
    pfxPath: cert.pfxPath,
  };
  if (cert.passphrase !== undefined) normalized.passphrase = cert.passphrase;
  return normalized;
}

export class ProxyCertStore {
  private certs: ProxyClientCert[] = [];
  private readonly filePath: string;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingWrite: Promise<void> = Promise.resolve();
  private dirty = false;

  private constructor(filePath: string) {
    this.filePath = filePath;
  }

  static async load(filePath: string): Promise<ProxyCertStore> {
    const store = new ProxyCertStore(filePath);
    await mkdir(dirname(filePath), { recursive: true });
    try {
      const raw = await readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<ProxyCertsSnapshot> | null;
      if (parsed && Array.isArray(parsed.certs)) {
        store.certs = parsed.certs.filter(isValidCert).map(normalizeCert);
      }
    } catch {
      store.certs = [];
    }
    return store;
  }

  snapshot(): ProxyCertsSnapshot {
    return structuredClone({ certs: this.certs });
  }

  replace(certs: ProxyClientCert[]): void {
    this.certs = certs.map(normalizeCert);
    this.schedulePersist();
  }

  async flush(): Promise<void> {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    if (this.dirty) {
      await this.persistNow();
    } else {
      await this.pendingWrite;
    }
  }

  private schedulePersist(): void {
    this.dirty = true;
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.persistNow();
    }, PERSIST_DEBOUNCE_MS);
  }

  private persistNow(): Promise<void> {
    this.dirty = false;
    this.pendingWrite = this.pendingWrite.then(() => this.writeSnapshotFile()).catch(() => undefined);
    return this.pendingWrite;
  }

  private async writeSnapshotFile(): Promise<void> {
    const payload = JSON.stringify({ certs: this.certs }, null, 2);
    const tmpPath = `${this.filePath}.${randomUUID()}.tmp`;
    await writeFile(tmpPath, payload, 'utf8');
    await rename(tmpPath, this.filePath);
  }
}
