import {
  type SqlCell,
  type SqlCommandKind,
  type SqlConnectionTestResult,
  type SqlQueryResult,
  type SqlSchema,
} from '@frigg/shared';

const cellMaxLength = 2000;

export interface SqlDriver {
  test(): Promise<SqlConnectionTestResult>;
  introspect(): Promise<SqlSchema>;
  query(sql: string, params?: SqlCell[]): Promise<SqlQueryResult>;
  close(): Promise<void>;
}

const READ = /^(select|with|show|explain|pragma|describe|desc)\b/i;
const WRITE = /^(insert|update|delete|replace|merge|upsert)\b/i;
const DDL = /^(create|alter|drop|truncate|rename)\b/i;

export function commandFor(sql: string): SqlCommandKind {
  const head = sql.trim().replace(/^[(\s]+/, '');
  if (READ.test(head)) return 'read';
  if (WRITE.test(head)) return 'write';
  if (DDL.test(head)) return 'ddl';
  return 'other';
}

export function capString(value: string): string {
  return value.length > cellMaxLength ? `${value.slice(0, cellMaxLength)}…` : value;
}

export function coerceCell(value: unknown): SqlCell {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : capString(String(value));
  if (typeof value === 'bigint') return capString(value.toString());
  if (typeof value === 'string') return capString(value);
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return capString(value.toString('base64'));
  if (value instanceof Uint8Array) return capString(Buffer.from(value).toString('base64'));
  try {
    return capString(JSON.stringify(value));
  } catch {
    return capString(String(value));
  }
}

export function shapeResult(
  columns: string[],
  rawRows: unknown[][],
  command: SqlCommandKind,
  rowLimit: number,
  extras?: { affectedRows?: number | null; durationMs?: number },
): SqlQueryResult {
  const truncated = rawRows.length > rowLimit;
  const limited = truncated ? rawRows.slice(0, rowLimit) : rawRows;
  const rows = limited.map((row) => row.map((cell) => coerceCell(cell)));
  return {
    columns,
    rows,
    rowCount: rows.length,
    affectedRows: extras?.affectedRows ?? null,
    truncated,
    durationMs: extras?.durationMs ?? 0,
    command,
  };
}
