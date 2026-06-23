import { describe, expect, it } from 'vitest';
import type { SqlRowEdit } from '@frigg/shared';
import { buildRowEdit, quoteIdent } from './row-sql.ts';

describe('buildRowEdit', () => {
  it('builds a parameterized postgres update', () => {
    const edit: SqlRowEdit = { op: 'update', table: 'users',
      pk: [{ column: 'id', value: 7 }], changes: [{ column: 'name', value: "O'Brien" }] };
    const { sql, params } = buildRowEdit(edit, 'postgres');
    expect(sql).toBe('UPDATE "users" SET "name" = $1 WHERE "id" = $2');
    expect(params).toEqual(["O'Brien", 7]);
  });
  it('builds a mysql insert with ? placeholders', () => {
    const edit: SqlRowEdit = { op: 'insert', table: 'users', pk: [],
      changes: [{ column: 'id', value: 1 }, { column: 'name', value: 'Ann' }] };
    expect(buildRowEdit(edit, 'mysql')).toEqual({
      sql: 'INSERT INTO `users` (`id`, `name`) VALUES (?, ?)', params: [1, 'Ann'],
    });
  });
  it('builds a sqlite delete', () => {
    const edit: SqlRowEdit = { op: 'delete', table: 'users', pk: [{ column: 'id', value: 3 }] };
    expect(buildRowEdit(edit, 'sqlite')).toEqual({
      sql: 'DELETE FROM "users" WHERE "id" = ?', params: [3],
    });
  });
  it('quotes identifiers per engine and escapes the quote char', () => {
    expect(quoteIdent('a"b', 'postgres')).toBe('"a""b"');
    expect(quoteIdent('a`b', 'mysql')).toBe('`a``b`');
  });
});
