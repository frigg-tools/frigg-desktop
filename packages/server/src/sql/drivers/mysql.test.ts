import { describe, expect, it } from 'vitest';
import type { SqlConnection } from '@frigg/shared';
import { createMysqlDriver } from './mysql.ts';

const url = process.env.FRIGG_TEST_MYSQL_URL;

function connFromUrl(raw: string): { conn: SqlConnection; password: string | null } {
  const parsed = new URL(raw);
  const engine = parsed.protocol.replace(':', '') === 'mariadb' ? 'mariadb' : 'mysql';
  const conn: SqlConnection = {
    id: 'test',
    name: 'test',
    engine,
    host: parsed.hostname,
    port: parsed.port === '' ? 3306 : Number(parsed.port),
    user: decodeURIComponent(parsed.username),
    database: parsed.pathname.replace(/^\//, ''),
    ssl: 'disable',
    hasPassword: parsed.password !== '',
    createdAt: 0,
    updatedAt: 0,
  };
  return { conn, password: parsed.password === '' ? null : decodeURIComponent(parsed.password) };
}

describe.skipIf(!url)('mysql driver (integration)', () => {
  const table = `frigg_test_${Date.now()}`;

  it('tests, introspects, reads and writes', async () => {
    const { conn, password } = connFromUrl(url as string);
    const driver = createMysqlDriver(conn, password);
    try {
      expect((await driver.test()).ok).toBe(true);

      await driver.query(`DROP TABLE IF EXISTS \`${table}\``);
      await driver.query(`CREATE TABLE \`${table}\` (id INT PRIMARY KEY, name VARCHAR(64))`);
      const insert = await driver.query(
        `INSERT INTO \`${table}\` (id, name) VALUES (?, ?), (?, ?)`,
        [1, 'Ann', 2, 'Bob'],
      );
      expect(insert.affectedRows).toBe(2);

      const schema = await driver.introspect();
      const found = schema.tables.find((t) => t.name === table);
      expect(found?.columns.find((c) => c.name === 'id')?.isPrimaryKey).toBe(true);

      const read = await driver.query(`SELECT id, name FROM \`${table}\` ORDER BY id`);
      expect(read.columns).toEqual(['id', 'name']);
      expect(read.rowCount).toBe(2);

      const update = await driver.query(`UPDATE \`${table}\` SET name = ? WHERE id = ?`, ['Cara', 1]);
      expect(update.affectedRows).toBe(1);
    } finally {
      await driver.query(`DROP TABLE IF EXISTS \`${table}\``).catch(() => undefined);
      await driver.close();
    }
  });
});
