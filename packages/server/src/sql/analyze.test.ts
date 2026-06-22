import { describe, expect, it } from 'vitest';
import { analyzeSql } from './analyze.ts';
const opts = { engine: 'postgres' as const, rowLimit: 1000 };

describe('analyzeSql', () => {
  it('classifies a select as read and injects a limit', () => {
    const a = analyzeSql('SELECT * FROM users', opts);
    expect(a.kind).toBe('read');
    expect(a.limited).toBe(true);
    expect(a.effectiveSql).toMatch(/limit 1001/i);
  });
  it('does not double-limit', () => {
    const a = analyzeSql('SELECT * FROM users LIMIT 10', opts);
    expect(a.limited).toBe(false);
    expect(a.effectiveSql).toBe('SELECT * FROM users LIMIT 10');
  });
  it('flags update without where as destructive write', () => {
    const a = analyzeSql('UPDATE users SET active = true', opts);
    expect(a.kind).toBe('write');
    expect(a.destructive).toBe(true);
  });
  it('update with where is not destructive', () => {
    expect(analyzeSql('UPDATE users SET active = true WHERE id = 1', opts).destructive).toBe(false);
  });
  it('flags drop/truncate as destructive ddl', () => {
    expect(analyzeSql('DROP TABLE users', opts)).toMatchObject({ kind: 'ddl', destructive: true });
    expect(analyzeSql('TRUNCATE users', opts).destructive).toBe(true);
  });
  it('ignores leading comments and parens', () => {
    expect(analyzeSql('  -- c\n (SELECT 1)', opts).kind).toBe('read');
  });
});
