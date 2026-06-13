import { describe, expect, it } from 'vitest';
import { DB_ROW_LIMIT } from '@frigg/shared';
import { isReadOnlySql, shapeRows } from '../src/db/inspector.ts';

describe('isReadOnlySql', () => {
  it('allows SELECT, WITH, PRAGMA and EXPLAIN', () => {
    expect(isReadOnlySql('SELECT * FROM users')).toBe(true);
    expect(isReadOnlySql('select id from t')).toBe(true);
    expect(isReadOnlySql('WITH cte AS (SELECT 1) SELECT * FROM cte')).toBe(true);
    expect(isReadOnlySql('pragma table_info(users)')).toBe(true);
    expect(isReadOnlySql('EXPLAIN QUERY PLAN SELECT 1')).toBe(true);
  });

  it('tolerates leading whitespace and parentheses', () => {
    expect(isReadOnlySql('   SELECT 1')).toBe(true);
    expect(isReadOnlySql('\n\t SELECT 1')).toBe(true);
    expect(isReadOnlySql('( SELECT 1 )')).toBe(true);
  });

  it('rejects mutating statements', () => {
    expect(isReadOnlySql('INSERT INTO t VALUES (1)')).toBe(false);
    expect(isReadOnlySql('UPDATE t SET a = 1')).toBe(false);
    expect(isReadOnlySql('DELETE FROM t')).toBe(false);
    expect(isReadOnlySql('DROP TABLE t')).toBe(false);
    expect(isReadOnlySql('ATTACH DATABASE \'x\' AS y')).toBe(false);
    expect(isReadOnlySql('CREATE TABLE t (a INT)')).toBe(false);
    expect(isReadOnlySql('REPLACE INTO t VALUES (1)')).toBe(false);
    expect(isReadOnlySql('')).toBe(false);
  });

  it('does not treat identifiers that merely start with a keyword as read-only', () => {
    expect(isReadOnlySql('selecting')).toBe(false);
    expect(isReadOnlySql('withhold something')).toBe(false);
  });
});

describe('shapeRows', () => {
  it('returns empty result for empty output', () => {
    expect(shapeRows('')).toEqual({ columns: [], rows: [], rowCount: 0, truncated: false });
    expect(shapeRows('[]')).toEqual({ columns: [], rows: [], rowCount: 0, truncated: false });
  });

  it('derives columns from the first row and aligns cells', () => {
    const result = shapeRows(
      JSON.stringify([
        { id: 1, name: 'alice', email: null },
        { id: 2, name: 'bob', email: 'bob@example.com' },
      ]),
    );
    expect(result.columns).toEqual(['id', 'name', 'email']);
    expect(result.rows).toEqual([
      [1, 'alice', null],
      [2, 'bob', 'bob@example.com'],
    ]);
    expect(result.rowCount).toBe(2);
    expect(result.truncated).toBe(false);
  });

  it('coerces nested objects to a short string', () => {
    const result = shapeRows(JSON.stringify([{ payload: { nested: true } }]));
    expect(result.columns).toEqual(['payload']);
    expect(result.rows[0][0]).toBe(JSON.stringify({ nested: true }));
  });

  it('caps the result at DB_ROW_LIMIT and flags truncation', () => {
    const oversized = Array.from({ length: DB_ROW_LIMIT + 5 }, (_, index) => ({ n: index }));
    const result = shapeRows(JSON.stringify(oversized));
    expect(result.rowCount).toBe(DB_ROW_LIMIT);
    expect(result.rows.length).toBe(DB_ROW_LIMIT);
    expect(result.truncated).toBe(true);
  });

  it('caps long cell strings', () => {
    const long = 'x'.repeat(5000);
    const result = shapeRows(JSON.stringify([{ blob: long }]));
    const cell = result.rows[0][0];
    expect(typeof cell).toBe('string');
    expect((cell as string).length).toBeLessThan(long.length);
  });
});
