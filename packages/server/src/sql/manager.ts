import {
  SQL_ROW_LIMIT,
  type SqlConnection,
  type SqlConnectionInput,
  type SqlConnectionTestResult,
  type SqlQueryResult,
  type SqlRowEdit,
  type SqlSchema,
} from '@frigg/shared';
import { analyzeSql } from './analyze.ts';
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
    hasPassword: false,
    createdAt: 0,
    updatedAt: 0,
  };
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

  async query(id: string, sql: string, confirmDestructive: boolean): Promise<SqlQueryResult> {
    const conn = this.requireConn(id);
    const analysis = analyzeSql(sql, { engine: conn.engine, rowLimit: SQL_ROW_LIMIT });
    if (analysis.destructive && !confirmDestructive) {
      throw new Error('destructive');
    }
    const entry = this.ensure(id);
    const result = await entry.driver.query(analysis.effectiveSql);
    if (analysis.kind === 'ddl') entry.schema = undefined;
    return result;
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
