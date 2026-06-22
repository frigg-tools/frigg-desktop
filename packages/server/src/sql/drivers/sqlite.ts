import Database from 'better-sqlite3';
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

interface TableInfoRow {
  name: string;
  type: string;
  notnull: number;
  pk: number;
}

interface MasterRow {
  name: string;
}

export function createSqliteDriver(conn: SqlConnection): SqlDriver {
  let db: Database.Database | null = null;

  function open(): Database.Database {
    if (db === null) db = new Database(conn.database);
    return db;
  }

  return {
    async test(): Promise<SqlConnectionTestResult> {
      let probe: Database.Database | null = null;
      try {
        probe = new Database(conn.database, { readonly: true, fileMustExist: true });
        const row = probe.prepare('SELECT sqlite_version() AS version').get() as
          | { version?: string }
          | undefined;
        return { ok: true, serverVersion: row?.version };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      } finally {
        try {
          probe?.close();
        } catch {
          /* ignore */
        }
      }
    },

    async introspect(): Promise<SqlSchema> {
      const handle = open();
      const tableNames = handle
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all() as MasterRow[];
      const tables: SqlTable[] = tableNames.map((entry) => {
        const info = handle.prepare(`PRAGMA table_info(${quoteSqliteIdent(entry.name)})`).all() as TableInfoRow[];
        const columns: SqlColumn[] = info.map((col) => ({
          name: col.name,
          dataType: col.type === '' ? 'BLOB' : col.type,
          nullable: col.notnull === 0,
          isPrimaryKey: col.pk > 0,
        }));
        return { name: entry.name, columns } satisfies SqlTable;
      });
      return { tables };
    },

    async query(sql: string, params?: SqlCell[]): Promise<SqlQueryResult> {
      const handle = open();
      const command = commandFor(sql);
      const started = Date.now();
      const statement = handle.prepare(sql);
      const bind = (params ?? []) as unknown[];
      if (statement.reader) {
        statement.raw(true);
        const rawRows = statement.all(...bind) as unknown[][];
        const durationMs = Date.now() - started;
        const columns = statement.columns().map((column) => column.name);
        return shapeResult(columns, rawRows, command, SQL_ROW_LIMIT, { durationMs });
      }
      const info = statement.run(...bind);
      const durationMs = Date.now() - started;
      return {
        columns: [],
        rows: [],
        rowCount: 0,
        affectedRows: info.changes,
        truncated: false,
        durationMs,
        command,
      };
    },

    async close(): Promise<void> {
      if (db !== null) {
        try {
          db.close();
        } catch {
          /* ignore */
        }
        db = null;
      }
    },
  };
}

function quoteSqliteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}
