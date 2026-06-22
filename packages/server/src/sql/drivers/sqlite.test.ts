import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SqlConnection } from '@frigg/shared';
import { createSqliteDriver } from './sqlite.ts';

function conn(file: string): SqlConnection {
  return { id: 'x', name: 't', engine: 'sqlite', host: '', port: 0, user: '',
    database: file, ssl: 'disable', hasPassword: false, createdAt: 0, updatedAt: 0 };
}

describe('sqlite driver', () => {
  let dir: string, file: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'frigg-sqlite-'));
    file = join(dir, 'd.sqlite');
    const db = new Database(file);
    db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)');
    db.exec("INSERT INTO users (name) VALUES ('Ann'), ('Bob')");
    db.close();
  });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('tests, introspects with PK flags, and reads', async () => {
    const d = createSqliteDriver(conn(file));
    expect((await d.test()).ok).toBe(true);
    const schema = await d.introspect();
    const users = schema.tables.find((t) => t.name === 'users');
    expect(users?.columns.find((c) => c.name === 'id')?.isPrimaryKey).toBe(true);
    const res = await d.query('SELECT * FROM users ORDER BY id');
    expect(res.columns).toEqual(['id', 'name']);
    expect(res.rowCount).toBe(2);
    await d.close();
  });

  it('reports affectedRows on a write', async () => {
    const d = createSqliteDriver(conn(file));
    const res = await d.query('UPDATE users SET name = ? WHERE id = ?', ['Cara', 1]);
    expect(res.affectedRows).toBe(1);
    await d.close();
  });
});
