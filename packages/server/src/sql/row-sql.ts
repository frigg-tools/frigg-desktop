import type { SqlCell, SqlEngine, SqlRowEdit } from '@frigg/shared';

function usesBackticks(engine: SqlEngine): boolean {
  return engine === 'mysql' || engine === 'mariadb';
}

export function quoteIdent(name: string, engine: SqlEngine): string {
  if (usesBackticks(engine)) {
    return `\`${name.replace(/`/g, '``')}\``;
  }
  return `"${name.replace(/"/g, '""')}"`;
}

function qualifiedTable(edit: SqlRowEdit, engine: SqlEngine): string {
  const table = quoteIdent(edit.table, engine);
  return edit.schema ? `${quoteIdent(edit.schema, engine)}.${table}` : table;
}

function createPlaceholders(engine: SqlEngine): () => string {
  if (engine === 'postgres') {
    let index = 0;
    return () => {
      index += 1;
      return `$${index}`;
    };
  }
  return () => '?';
}

export function buildRowEdit(
  edit: SqlRowEdit,
  engine: SqlEngine,
): { sql: string; params: SqlCell[] } {
  const table = qualifiedTable(edit, engine);
  const placeholder = createPlaceholders(engine);
  const params: SqlCell[] = [];
  const changes = edit.changes ?? [];

  if (edit.op === 'insert') {
    const columns = changes.map((c) => quoteIdent(c.column, engine));
    const values = changes.map((c) => {
      params.push(c.value);
      return placeholder();
    });
    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${values.join(', ')})`;
    return { sql, params };
  }

  if (edit.op === 'update') {
    if (edit.pk.length === 0) throw new Error('update requires a primary key');
    const setClause = changes.map((c) => {
      params.push(c.value);
      return `${quoteIdent(c.column, engine)} = ${placeholder()}`;
    });
    const whereClause = edit.pk.map((p) => {
      params.push(p.value);
      return `${quoteIdent(p.column, engine)} = ${placeholder()}`;
    });
    const sql = `UPDATE ${table} SET ${setClause.join(', ')} WHERE ${whereClause.join(' AND ')}`;
    return { sql, params };
  }

  if (edit.pk.length === 0) throw new Error('delete requires a primary key');
  const whereClause = edit.pk.map((p) => {
    params.push(p.value);
    return `${quoteIdent(p.column, engine)} = ${placeholder()}`;
  });
  const sql = `DELETE FROM ${table} WHERE ${whereClause.join(' AND ')}`;
  return { sql, params };
}
