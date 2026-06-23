import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { SqlConnection, SqlConnectionInput, SqlEngine, SqlSslMode } from '@frigg/shared';

const PERSIST_DEBOUNCE_MS = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSqlEngine(value: unknown): value is SqlEngine {
  return (
    value === 'mysql' || value === 'mariadb' || value === 'postgres' || value === 'sqlite'
  );
}

function isSqlSslMode(value: unknown): value is SqlSslMode {
  return value === 'disable' || value === 'require' || value === 'verify';
}

function isValidConnection(value: unknown): value is SqlConnection {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    isSqlEngine(value.engine) &&
    typeof value.host === 'string' &&
    typeof value.port === 'number' &&
    typeof value.user === 'string' &&
    typeof value.database === 'string' &&
    isSqlSslMode(value.ssl) &&
    (value.caCert === undefined || typeof value.caCert === 'string') &&
    typeof value.createdAt === 'number' &&
    typeof value.updatedAt === 'number'
  );
}

export type SqlConnectionPatch = Partial<Omit<SqlConnectionInput, 'password'>>;

export class SqlConnectionStore extends EventEmitter {
  private connections: SqlConnection[] = [];
  private readonly filePath: string;
  private hasPasswordPredicate: (id: string) => boolean = () => false;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingWrite: Promise<void> = Promise.resolve();
  private dirty = false;

  private constructor(filePath: string) {
    super();
    this.filePath = filePath;
  }

  static async load(filePath: string): Promise<SqlConnectionStore> {
    const store = new SqlConnectionStore(filePath);
    await mkdir(dirname(filePath), { recursive: true });
    try {
      const raw = await readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      if (isRecord(parsed) && Array.isArray(parsed.connections)) {
        store.connections = parsed.connections.filter(isValidConnection);
      }
    } catch {
      store.connections = [];
    }
    return store;
  }

  setHasPassword(predicate: (id: string) => boolean): void {
    this.hasPasswordPredicate = predicate;
  }

  list(): SqlConnection[] {
    return this.connections.map((connection) => this.withHasPassword(connection));
  }

  get(id: string): SqlConnection | undefined {
    const connection = this.connections.find((candidate) => candidate.id === id);
    return connection ? this.withHasPassword(connection) : undefined;
  }

  create(input: SqlConnectionInput): SqlConnection {
    const now = Date.now();
    const connection: SqlConnection = {
      id: randomUUID(),
      name: input.name,
      engine: input.engine,
      host: input.host,
      port: input.port,
      user: input.user,
      database: input.database,
      ssl: input.ssl,
      ...(input.caCert !== undefined ? { caCert: input.caCert } : {}),
      hasPassword: false,
      createdAt: now,
      updatedAt: now,
    };
    this.connections.push(connection);
    this.commit();
    return this.withHasPassword(connection);
  }

  update(id: string, patch: SqlConnectionPatch): SqlConnection {
    const connection = this.requireConnection(id);
    if (patch.name !== undefined) connection.name = patch.name;
    if (patch.engine !== undefined) connection.engine = patch.engine;
    if (patch.host !== undefined) connection.host = patch.host;
    if (patch.port !== undefined) connection.port = patch.port;
    if (patch.user !== undefined) connection.user = patch.user;
    if (patch.database !== undefined) connection.database = patch.database;
    if (patch.ssl !== undefined) connection.ssl = patch.ssl;
    if (patch.caCert !== undefined) connection.caCert = patch.caCert;
    connection.updatedAt = Date.now();
    this.commit();
    return this.withHasPassword(connection);
  }

  delete(id: string): void {
    const index = this.connections.findIndex((connection) => connection.id === id);
    if (index === -1) {
      throw new Error('not found');
    }
    this.connections.splice(index, 1);
    this.commit();
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

  private withHasPassword(connection: SqlConnection): SqlConnection {
    return structuredClone({
      ...connection,
      hasPassword: this.hasPasswordPredicate(connection.id),
    });
  }

  private requireConnection(id: string): SqlConnection {
    const connection = this.connections.find((candidate) => candidate.id === id);
    if (!connection) {
      throw new Error('not found');
    }
    return connection;
  }

  private commit(): void {
    this.schedulePersist();
    this.emit('event', { type: 'sql-connections-updated', connections: this.list() });
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
    this.pendingWrite = this.pendingWrite
      .then(() => this.writeSnapshotFile())
      .catch(() => undefined);
    return this.pendingWrite;
  }

  private async writeSnapshotFile(): Promise<void> {
    const payload = JSON.stringify({ connections: this.connections }, null, 2);
    const tmpPath = `${this.filePath}.${randomUUID()}.tmp`;
    await writeFile(tmpPath, payload, 'utf8');
    await rename(tmpPath, this.filePath);
  }
}
