import mysql from 'mysql2/promise';
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

interface ColumnInfoRow {
  TABLE_NAME: string;
  COLUMN_NAME: string;
  DATA_TYPE: string;
  IS_NULLABLE: string;
}

interface KeyInfoRow {
  TABLE_NAME: string;
  COLUMN_NAME: string;
}

function sslOptionsFor(conn: SqlConnection): mysql.PoolOptions['ssl'] {
  if (conn.ssl === 'disable') return undefined;
  if (conn.ssl === 'require') return { rejectUnauthorized: false };
  return { rejectUnauthorized: true };
}

export function createMysqlDriver(conn: SqlConnection, password: string | null): SqlDriver {
  let pool: mysql.Pool | null = null;

  function getPool(): mysql.Pool {
    if (pool === null) {
      pool = mysql.createPool({
        host: conn.host,
        port: conn.port,
        user: conn.user,
        password: password ?? undefined,
        database: conn.database === '' ? undefined : conn.database,
        ssl: sslOptionsFor(conn),
        connectionLimit: 4,
        waitForConnections: true,
        decimalNumbers: false,
        dateStrings: true,
      });
    }
    return pool;
  }

  return {
    async test(): Promise<SqlConnectionTestResult> {
      try {
        const [rows] = await getPool().query('SELECT VERSION() AS version');
        const list = rows as Array<{ version?: string }>;
        return { ok: true, serverVersion: list[0]?.version };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },

    async introspect(): Promise<SqlSchema> {
      const handle = getPool();
      const [columnRows] = await handle.query(
        `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE
         FROM information_schema.columns
         WHERE TABLE_SCHEMA = ?
         ORDER BY TABLE_NAME, ORDINAL_POSITION`,
        [conn.database],
      );
      const [keyRows] = await handle.query(
        `SELECT TABLE_NAME, COLUMN_NAME
         FROM information_schema.key_column_usage
         WHERE TABLE_SCHEMA = ? AND CONSTRAINT_NAME = 'PRIMARY'`,
        [conn.database],
      );
      const primaryKeys = new Set<string>();
      for (const key of keyRows as KeyInfoRow[]) {
        primaryKeys.add(`${key.TABLE_NAME}.${key.COLUMN_NAME}`);
      }
      const byTable = new Map<string, SqlColumn[]>();
      for (const row of columnRows as ColumnInfoRow[]) {
        const columns = byTable.get(row.TABLE_NAME) ?? [];
        columns.push({
          name: row.COLUMN_NAME,
          dataType: row.DATA_TYPE,
          nullable: row.IS_NULLABLE.toUpperCase() === 'YES',
          isPrimaryKey: primaryKeys.has(`${row.TABLE_NAME}.${row.COLUMN_NAME}`),
        });
        byTable.set(row.TABLE_NAME, columns);
      }
      const tables: SqlTable[] = [...byTable.entries()].map(([name, columns]) => ({
        name,
        schema: conn.database,
        columns,
      }));
      return { tables };
    },

    async query(sql: string, params?: SqlCell[]): Promise<SqlQueryResult> {
      const handle = getPool();
      const command = commandFor(sql);
      const started = Date.now();
      const [result, fields] = await handle.query({ sql, rowsAsArray: true }, params ?? []);
      const durationMs = Date.now() - started;
      if (Array.isArray(result) && Array.isArray(fields)) {
        const columns = fields.map((field) => field.name);
        return shapeResult(columns, result as unknown[][], command, SQL_ROW_LIMIT, { durationMs });
      }
      const header = result as mysql.ResultSetHeader;
      return {
        columns: [],
        rows: [],
        rowCount: 0,
        affectedRows: typeof header?.affectedRows === 'number' ? header.affectedRows : null,
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
