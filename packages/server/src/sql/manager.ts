import {
  SQL_MAX_ROWS,
  SQL_PAGE_SIZE,
  SQL_ROW_LIMIT,
  type SqlConnection,
  type SqlConnectionInput,
  type SqlConnectionTestResult,
  type SqlQueryResult,
  type SqlRowEdit,
  type SqlSchema,
} from '@frigg/shared';
import { analyzeSql, hasMultipleStatements } from './analyze.ts';
import type { SqlConnectionStore } from './connection-store.ts';
import { createMysqlDriver } from './drivers/mysql.ts';
import { createPostgresDriver } from './drivers/postgres.ts';
import { createSqliteDriver } from './drivers/sqlite.ts';
import type { SqlDriver } from './drivers/types.ts';
import { buildRowEdit } from './row-sql.ts';
import type { SqlSecretStore } from './secret-store.ts';

interface LiveConnection {
  driver: SqlDriver;
  schema?: SqlSchema;
}

function buildDriver(conn: SqlConnection, password: string | null): SqlDriver {
  switch (conn.engine) {
    case 'sqlite':
      return createSqliteDriver(conn);
    case 'postgres':
      return createPostgresDriver(conn, password);
    case 'mysql':
    case 'mariadb':
      return createMysqlDriver(conn, password);
  }
}

function inputToConnection(input: SqlConnectionInput): SqlConnection {
  return {
    id: 'transient',
    name: input.name,
    engine: input.engine,
    host: input.host,
    port: input.port,
    user: input.user,
    database: input.database,
    ssl: input.ssl,
    ...(input.caCert !== undefined ? { caCert: input.caCert } : {}),
    hasPassword: false,
    createdAt: 0,
    updatedAt: 0,
  };
}

export interface SqlQueryOptions {
  confirmDestructive?: boolean;
  offset?: number;
  pageSize?: number;
  withCount?: boolean;
}

function clampPageSize(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return SQL_PAGE_SIZE;
  return Math.min(SQL_MAX_ROWS, Math.max(1, Math.floor(value)));
}

export class SqlManager {
  private live = new Map<string, LiveConnection>();

  constructor(
    private readonly connections: SqlConnectionStore,
    private readonly secrets: SqlSecretStore,
  ) {}

  async setPassword(id: string, password: string): Promise<void> {
    await this.secrets.set(id, password);
    await this.disconnect(id);
  }

  async deletePassword(id: string): Promise<void> {
    await this.secrets.delete(id);
    await this.disconnect(id);
  }

  async test(body: SqlConnectionInput | { id: string }): Promise<SqlConnectionTestResult> {
    if ('id' in body) {
      const conn = this.connections.get(body.id);
      if (!conn) return { ok: false, error: 'not found' };
      const driver = buildDriver(conn, this.secrets.get(body.id));
      try {
        return await driver.test();
      } finally {
        await driver.close();
      }
    }
    const driver = buildDriver(inputToConnection(body), body.password ?? null);
    try {
      return await driver.test();
    } finally {
      await driver.close();
    }
  }

  async schema(id: string): Promise<SqlSchema> {
    const entry = this.ensure(id);
    if (entry.schema) return entry.schema;
    const schema = await entry.driver.introspect();
    entry.schema = schema;
    return schema;
  }

  async query(id: string, sql: string, opts: SqlQueryOptions = {}): Promise<SqlQueryResult> {
    const conn = this.requireConn(id);
    if (hasMultipleStatements(sql)) {
      throw new Error('run one statement at a time');
    }
    const analysis = analyzeSql(sql, { engine: conn.engine, rowLimit: SQL_ROW_LIMIT });
    if (analysis.destructive && !opts.confirmDestructive) {
      throw new Error('destructive');
    }
    const entry = this.ensure(id);

    if (!analysis.limited) {
      const result = await entry.driver.query(analysis.effectiveSql);
      if (analysis.kind === 'ddl') entry.schema = undefined;
      return result;
    }

    const pageSize = clampPageSize(opts.pageSize);
    const offset = Math.max(0, Math.floor(opts.offset ?? 0));
    const base = sql.trim().replace(/;\s*$/, '');
    const paged = `SELECT * FROM (${base}) AS _frigg_page LIMIT ${pageSize + 1} OFFSET ${offset}`;
    const result = await entry.driver.query(paged);
    const hasMore = result.rows.length > pageSize;
    const rows = hasMore ? result.rows.slice(0, pageSize) : result.rows;

    let totalRows: number | null = null;
    if (opts.withCount) {
      try {
        const countResult = await entry.driver.query(
          `SELECT COUNT(*) AS c FROM (${base}) AS _frigg_count`,
        );
        const value = countResult.rows[0]?.[0];
        const parsed = typeof value === 'number' ? value : Number(value);
        totalRows = Number.isFinite(parsed) ? parsed : null;
      } catch {
        totalRows = null;
      }
    }

    return { ...result, rows, rowCount: rows.length, truncated: false, offset, hasMore, totalRows };
  }

  async editRow(id: string, edit: SqlRowEdit): Promise<SqlQueryResult> {
    const conn = this.requireConn(id);
    const { sql, params } = buildRowEdit(edit, conn.engine);
    const entry = this.ensure(id);
    return entry.driver.query(sql, params);
  }

  async disconnect(id: string): Promise<void> {
    const entry = this.live.get(id);
    if (!entry) return;
    this.live.delete(id);
    await entry.driver.close().catch(() => undefined);
  }

  async disposeAll(): Promise<void> {
    const drivers = [...this.live.values()].map((entry) => entry.driver);
    this.live.clear();
    await Promise.all(drivers.map((driver) => driver.close().catch(() => undefined)));
  }

  private ensure(id: string): LiveConnection {
    const existing = this.live.get(id);
    if (existing) return existing;
    const conn = this.requireConn(id);
    const entry: LiveConnection = { driver: buildDriver(conn, this.secrets.get(id)) };
    this.live.set(id, entry);
    return entry;
  }

  private requireConn(id: string): SqlConnection {
    const conn = this.connections.get(id);
    if (!conn) throw new Error('not found');
    return conn;
  }
}
