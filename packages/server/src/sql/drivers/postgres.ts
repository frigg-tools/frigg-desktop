import pg from 'pg';
import {
  SQL_ROW_LIMIT,
  type SqlCell,
  type SqlColumn,
  type SqlConnection,
  type SqlConnectionTestResult,
  type SqlQueryResult,
  type SqlSchema,
  type SqlTable,
} from '@frigg/shared';
import { commandFor, shapeResult, type SqlDriver } from './types.ts';

const { Pool } = pg;

interface ColumnInfoRow {
  table_schema: string;
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
}

interface KeyInfoRow {
  table_schema: string;
  table_name: string;
  column_name: string;
}

function sslConfigFor(conn: SqlConnection): pg.PoolConfig['ssl'] {
  if (conn.ssl === 'disable') return undefined;
  if (conn.ssl === 'require') return { rejectUnauthorized: false };
  return conn.caCert ? { ca: conn.caCert, rejectUnauthorized: true } : { rejectUnauthorized: true };
}

export function createPostgresDriver(conn: SqlConnection, password: string | null): SqlDriver {
  let pool: pg.Pool | null = null;

  function getPool(): pg.Pool {
    if (pool === null) {
      pool = new Pool({
        host: conn.host,
        port: conn.port,
        user: conn.user,
        password: password ?? undefined,
        database: conn.database === '' ? undefined : conn.database,
        ssl: sslConfigFor(conn),
        max: 4,
      });
    }
    return pool;
  }

  return {
    async test(): Promise<SqlConnectionTestResult> {
      try {
        const result = await getPool().query('SELECT version() AS version');
        const version = result.rows[0]?.version as string | undefined;
        return { ok: true, serverVersion: version };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },

    async introspect(): Promise<SqlSchema> {
      const handle = getPool();
      const columnResult = await handle.query<ColumnInfoRow>(
        `SELECT table_schema, table_name, column_name, data_type, is_nullable
         FROM information_schema.columns
         WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
           AND table_schema NOT LIKE 'pg_toast%'
         ORDER BY table_schema, table_name, ordinal_position`,
      );
      const keyResult = await handle.query<KeyInfoRow>(
        `SELECT kcu.table_schema, kcu.table_name, kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
         WHERE tc.constraint_type = 'PRIMARY KEY'
           AND tc.table_schema NOT IN ('pg_catalog', 'information_schema')`,
      );
      const primaryKeys = new Set<string>();
      for (const key of keyResult.rows) {
        primaryKeys.add(`${key.table_schema}.${key.table_name}.${key.column_name}`);
      }
      const byTable = new Map<string, SqlTable>();
      for (const row of columnResult.rows) {
        const tableKey = `${row.table_schema}.${row.table_name}`;
        let table = byTable.get(tableKey);
        if (table === undefined) {
          table = { name: row.table_name, schema: row.table_schema, columns: [] };
          byTable.set(tableKey, table);
        }
        const column: SqlColumn = {
          name: row.column_name,
          dataType: row.data_type,
          nullable: row.is_nullable.toUpperCase() === 'YES',
          isPrimaryKey: primaryKeys.has(`${row.table_schema}.${row.table_name}.${row.column_name}`),
        };
        table.columns.push(column);
      }
      return { tables: [...byTable.values()] };
    },

    async query(sql: string, params?: SqlCell[]): Promise<SqlQueryResult> {
      const handle = getPool();
      const command = commandFor(sql);
      const started = Date.now();
      const result = await handle.query<unknown[]>({
        text: sql,
        values: (params ?? []) as unknown[],
        rowMode: 'array',
      });
      const durationMs = Date.now() - started;
      if (command === 'read') {
        const columns = result.fields.map((field) => field.name);
        return shapeResult(columns, result.rows as unknown[][], command, SQL_ROW_LIMIT, { durationMs });
      }
      const hasColumns = result.fields.length > 0 && result.rows.length > 0;
      if (hasColumns) {
        const columns = result.fields.map((field) => field.name);
        return shapeResult(columns, result.rows as unknown[][], command, SQL_ROW_LIMIT, {
          durationMs,
          affectedRows: typeof result.rowCount === 'number' ? result.rowCount : null,
        });
      }
      return {
        columns: [],
        rows: [],
        rowCount: 0,
        affectedRows: typeof result.rowCount === 'number' ? result.rowCount : null,
        truncated: false,
        durationMs,
        command,
      };
    },

    async close(): Promise<void> {
      if (pool !== null) {
        try {
          await pool.end();
        } catch {
          /* ignore */
        }
        pool = null;
      }
    },
  };
}
