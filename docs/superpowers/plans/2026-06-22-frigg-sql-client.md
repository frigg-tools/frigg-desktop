# Frigg SQL Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a top-level **SQL** screen to Frigg: register DB credentials and use Frigg as a GUI client to browse/edit tables and run SQL with schema-aware autocomplete, against MySQL, MariaDB, PostgreSQL and SQLite.

**Architecture:** New `packages/server/src/sql/` module (EventEmitter connection store + encrypted secret store + per-engine drivers behind one `SqlDriver` interface + a `SqlManager` holding live pools). REST under `/api/sql/*` plus a `sql-connections-updated` WS event. New web `SqlScreen` with a CodeMirror editor and an editable results grid. All domain types come from `@frigg/shared`.

**Tech Stack:** Node + TypeScript (ESM, `.ts` imports), Express, `ws`, `mysql2`, `pg`, `better-sqlite3`, vitest; React 19 + zustand + Tailwind v4 + CodeMirror 6; Electron `safeStorage`.

## Global Constraints

- TypeScript strict everywhere. ESM. Server local imports use the `.ts` extension.
- **No code comments** (self-explanatory naming; formal API docs only where the project already uses them).
- Domain types **only** from `@frigg/shared` — never redefine.
- Server never crashes on driver/connection failure — degrade into 400 `{ error }` results.
- Every user-visible string goes through `useT()`; add both `en` and `pt` keys. Shared strings in `common`, per-screen strings in the `sql` namespace.
- Passwords: never stored in plaintext, never returned by any endpoint. Snapshots carry only `hasPassword: boolean`.
- Inline row edits are always parameterized — never string-interpolate values.
- `SQL_ROW_LIMIT = 1000`.
- Engine set is exactly: `mysql`, `mariadb`, `postgres`, `sqlite`.
- Web package has **no test runner**: web tasks verify with `npm run build -w @frigg/web` (tsc + vite). Server tasks use vitest (`npm test`).
- Commits: no Claude co-author trailer, no Claude attribution.

---

### Task 1: Shared domain types + event

**Files:**
- Modify: `packages/shared/src/index.ts` (append before the trailing port constants)

**Interfaces:**
- Produces: `SqlEngine`, `SqlSslMode`, `SqlCommandKind`, `SqlCell`, `SqlConnection`, `SqlConnectionInput`, `SqlColumn`, `SqlTable`, `SqlSchema`, `SqlQueryResult`, `SqlConnectionTestResult`, `SqlRowEdit`, `SQL_ROW_LIMIT`, and a new `ServerEvent` member `{ type: 'sql-connections-updated'; connections: SqlConnection[] }`.

- [ ] **Step 1: Add the types** exactly as in spec §4 (copy the full block) into `packages/shared/src/index.ts`, and add the `sql-connections-updated` member to the `ServerEvent` union.

- [ ] **Step 2: Type-check** — Run: `npm run build -w @frigg/server` Expected: PASS (types compile; nothing consumes them yet).

- [ ] **Step 3: Commit**
```bash
git add packages/shared/src/index.ts
git commit -m "feat(shared): SQL client domain types"
```

---

### Task 2: Filesystem paths

**Files:**
- Modify: `packages/server/src/lib/paths.ts`

**Interfaces:**
- Produces: `sqlConnectionsPath`, `sqlSecretsPath`, `sqlSecretKeyPath` (all under `friggDir`).

- [ ] **Step 1: Add path constants**
```ts
export const sqlConnectionsPath = path.join(friggDir, 'sql-connections.json');
export const sqlSecretsPath = path.join(friggDir, 'sql-secrets.json');
export const sqlSecretKeyPath = path.join(friggDir, 'sql-secret.key');
```

- [ ] **Step 2: Type-check** — Run: `npm run build -w @frigg/server` Expected: PASS.

- [ ] **Step 3: Commit**
```bash
git add packages/server/src/lib/paths.ts
git commit -m "feat(sql): persistence paths"
```

---

### Task 3: SecretBox (file AES-256-GCM)

**Files:**
- Create: `packages/server/src/sql/secret-box.ts`
- Test: `packages/server/src/sql/secret-box.test.ts`

**Interfaces:**
- Produces: `interface SecretBox { encrypt(plain: string): string; decrypt(blob: string): string }`, `createFileSecretBox(keyPath: string): SecretBox`.

- [ ] **Step 1: Write the failing test**
```ts
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFileSecretBox } from './secret-box.ts';

describe('file secret box', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'frigg-secret-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('round-trips a secret', () => {
    const box = createFileSecretBox(join(dir, 'k.key'));
    const blob = box.encrypt('hunter2');
    expect(blob).not.toContain('hunter2');
    expect(box.decrypt(blob)).toBe('hunter2');
  });

  it('reuses the persisted key across instances', () => {
    const keyPath = join(dir, 'k.key');
    const blob = createFileSecretBox(keyPath).encrypt('s3cr3t');
    expect(createFileSecretBox(keyPath).decrypt(blob)).toBe('s3cr3t');
  });

  it('rejects a tampered blob', () => {
    const box = createFileSecretBox(join(dir, 'k.key'));
    const blob = box.encrypt('x');
    const tampered = Buffer.from(blob, 'base64');
    tampered[tampered.length - 1] ^= 0xff;
    expect(() => box.decrypt(tampered.toString('base64'))).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npm test -w @frigg/server -- secret-box` Expected: FAIL (module not found).

- [ ] **Step 3: Implement**
```ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface SecretBox {
  encrypt(plain: string): string;
  decrypt(blob: string): string;
}

function loadOrCreateKey(keyPath: string): Buffer {
  if (existsSync(keyPath)) return readFileSync(keyPath);
  mkdirSync(dirname(keyPath), { recursive: true });
  const key = randomBytes(32);
  writeFileSync(keyPath, key, { mode: 0o600 });
  chmodSync(keyPath, 0o600);
  return key;
}

export function createFileSecretBox(keyPath: string): SecretBox {
  const key = loadOrCreateKey(keyPath);
  return {
    encrypt(plain) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');
    },
    decrypt(blob) {
      const buf = Buffer.from(blob, 'base64');
      const iv = buf.subarray(0, 12);
      const tag = buf.subarray(12, 28);
      const enc = buf.subarray(28);
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes** — Run: `npm test -w @frigg/server -- secret-box` Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add packages/server/src/sql/secret-box.ts packages/server/src/sql/secret-box.test.ts
git commit -m "feat(sql): file-backed AES secret box"
```

---

### Task 4: SqlSecretStore

**Files:**
- Create: `packages/server/src/sql/secret-store.ts`

**Interfaces:**
- Consumes: `SecretBox` (Task 3).
- Produces: `class SqlSecretStore` with `static async load(filePath: string, box: SecretBox): Promise<SqlSecretStore>`, `has(id): boolean`, `get(id): string | null`, `set(id, password): Promise<void>`, `delete(id): Promise<void>`.

- [ ] **Step 1: Implement** — persists `{ [id]: blob }` to `filePath` (atomic tmp+rename), decrypts on `get`. On any read/parse error, start empty.
```ts
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { SecretBox } from './secret-box.ts';

export class SqlSecretStore {
  private blobs = new Map<string, string>();
  private constructor(private readonly filePath: string, private readonly box: SecretBox) {}

  static async load(filePath: string, box: SecretBox): Promise<SqlSecretStore> {
    const store = new SqlSecretStore(filePath, box);
    await mkdir(dirname(filePath), { recursive: true });
    try {
      const parsed = JSON.parse(await readFile(filePath, 'utf8')) as Record<string, string>;
      for (const [id, blob] of Object.entries(parsed)) {
        if (typeof blob === 'string') store.blobs.set(id, blob);
      }
    } catch { /* start empty */ }
    return store;
  }

  has(id: string): boolean { return this.blobs.has(id); }

  get(id: string): string | null {
    const blob = this.blobs.get(id);
    if (blob === undefined) return null;
    try { return this.box.decrypt(blob); } catch { return null; }
  }

  async set(id: string, password: string): Promise<void> {
    this.blobs.set(id, this.box.encrypt(password));
    await this.persist();
  }

  async delete(id: string): Promise<void> {
    if (this.blobs.delete(id)) await this.persist();
  }

  private async persist(): Promise<void> {
    const payload = JSON.stringify(Object.fromEntries(this.blobs), null, 2);
    const tmp = `${this.filePath}.${randomUUID()}.tmp`;
    await writeFile(tmp, payload, 'utf8');
    await rename(tmp, this.filePath);
  }
}
```

- [ ] **Step 2: Type-check** — Run: `npm run build -w @frigg/server` Expected: PASS.

- [ ] **Step 3: Commit**
```bash
git add packages/server/src/sql/secret-store.ts
git commit -m "feat(sql): encrypted secret store"
```

---

### Task 5: SQL analyzer

**Files:**
- Create: `packages/server/src/sql/analyze.ts`
- Test: `packages/server/src/sql/analyze.test.ts`

**Interfaces:**
- Consumes: `SqlCommandKind`, `SqlEngine`, `SQL_ROW_LIMIT` from `@frigg/shared`.
- Produces: `interface SqlAnalysis { kind: SqlCommandKind; destructive: boolean; effectiveSql: string; limited: boolean }`, `analyzeSql(sql: string, opts: { engine: SqlEngine; rowLimit: number }): SqlAnalysis`.

- [ ] **Step 1: Write the failing test**
```ts
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
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npm test -w @frigg/server -- analyze` Expected: FAIL.

- [ ] **Step 3: Implement**
```ts
import { type SqlCommandKind, type SqlEngine } from '@frigg/shared';

export interface SqlAnalysis {
  kind: SqlCommandKind;
  destructive: boolean;
  effectiveSql: string;
  limited: boolean;
}

function stripLeading(sql: string): string {
  let s = sql.trim();
  while (true) {
    if (s.startsWith('--')) { const nl = s.indexOf('\n'); s = nl === -1 ? '' : s.slice(nl + 1).trimStart(); continue; }
    if (s.startsWith('/*')) { const end = s.indexOf('*/'); s = end === -1 ? '' : s.slice(end + 2).trimStart(); continue; }
    if (s.startsWith('(')) { s = s.slice(1).trimStart(); continue; }
    return s;
  }
}

const READ = /^(select|with|show|explain|pragma|describe|desc)\b/i;
const WRITE = /^(insert|update|delete|replace|merge|upsert)\b/i;
const DDL = /^(create|alter|drop|truncate|rename)\b/i;

function classify(head: string): SqlCommandKind {
  if (READ.test(head)) return 'read';
  if (WRITE.test(head)) return 'write';
  if (DDL.test(head)) return 'ddl';
  return 'other';
}

function isDestructive(head: string): boolean {
  if (/^(drop|truncate)\b/i.test(head)) return true;
  if (/^(update|delete)\b/i.test(head) && !/\bwhere\b/i.test(head)) return true;
  return false;
}

export function analyzeSql(sql: string, opts: { engine: SqlEngine; rowLimit: number }): SqlAnalysis {
  const head = stripLeading(sql);
  const kind = classify(head);
  const destructive = isDestructive(head);
  const isPlainSelect = /^(select|with)\b/i.test(head) && !/\blimit\b/i.test(head);
  const trimmedNoSemi = sql.trim().replace(/;\s*$/, '');
  const effectiveSql = isPlainSelect ? `${trimmedNoSemi} LIMIT ${opts.rowLimit + 1}` : sql.trim();
  return { kind, destructive, effectiveSql, limited: isPlainSelect };
}
```

- [ ] **Step 4: Run test to verify it passes** — Run: `npm test -w @frigg/server -- analyze` Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add packages/server/src/sql/analyze.ts packages/server/src/sql/analyze.test.ts
git commit -m "feat(sql): statement analyzer (classify, destructive, auto-limit)"
```

---

### Task 6: Row-edit SQL builder

**Files:**
- Create: `packages/server/src/sql/row-sql.ts`
- Test: `packages/server/src/sql/row-sql.test.ts`

**Interfaces:**
- Consumes: `SqlRowEdit`, `SqlEngine`, `SqlCell` from `@frigg/shared`.
- Produces: `quoteIdent(name: string, engine: SqlEngine): string`, `buildRowEdit(edit: SqlRowEdit, engine: SqlEngine): { sql: string; params: SqlCell[] }`.

- [ ] **Step 1: Write the failing test**
```ts
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
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npm test -w @frigg/server -- row-sql` Expected: FAIL.

- [ ] **Step 3: Implement** — postgres uses `$n` placeholders and `"` quoting; mysql/mariadb use `?` and backticks; sqlite uses `?` and `"` quoting. Build `UPDATE ... SET col = ph WHERE pk = ph`, `INSERT INTO t (cols) VALUES (ph...)`, `DELETE FROM t WHERE pk = ph`. Throw if `pk` is empty for update/delete. (Placeholder index counts across SET then WHERE for postgres.)

- [ ] **Step 4: Run test to verify it passes** — Run: `npm test -w @frigg/server -- row-sql` Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add packages/server/src/sql/row-sql.ts packages/server/src/sql/row-sql.test.ts
git commit -m "feat(sql): parameterized row-edit SQL builder"
```

---

### Task 7: SqlConnectionStore

**Files:**
- Create: `packages/server/src/sql/connection-store.ts`
- Test: `packages/server/src/sql/connection-store.test.ts`

**Interfaces:**
- Consumes: `SqlConnection`, `SqlConnectionInput` from `@frigg/shared`; `SqlSecretStore` (Task 4) for `hasPassword` derivation (passed a `(id) => boolean` predicate to stay decoupled).
- Produces: `class SqlConnectionStore extends EventEmitter` with `static async load(filePath: string): Promise<SqlConnectionStore>`, `list(hasPassword: (id: string) => boolean): SqlConnection[]`, `get(id): SqlConnection | undefined`, `create(input): SqlConnection`, `update(id, patch): SqlConnection`, `delete(id): void`, `flush(): Promise<void>`. Emits `{ type: 'sql-connections-updated', connections }` (computed with the predicate captured at construction via `setHasPassword`).

- [ ] **Step 1: Write the failing test**
```ts
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqlConnectionStore } from './connection-store.ts';

const input = { name: 'local', engine: 'postgres' as const, host: 'localhost',
  port: 5432, user: 'me', database: 'app', ssl: 'disable' as const };

describe('SqlConnectionStore', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'frigg-conn-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('creates, updates and deletes, persisting across loads', async () => {
    const store = await SqlConnectionStore.load(join(dir, 'c.json'));
    const conn = store.create(input);
    expect(conn.id).toBeTruthy();
    store.update(conn.id, { name: 'renamed' });
    await store.flush();
    const reloaded = await SqlConnectionStore.load(join(dir, 'c.json'));
    expect(reloaded.get(conn.id)?.name).toBe('renamed');
    reloaded.delete(conn.id);
    expect(reloaded.get(conn.id)).toBeUndefined();
  });

  it('derives hasPassword from the predicate', async () => {
    const store = await SqlConnectionStore.load(join(dir, 'c.json'));
    const conn = store.create(input);
    store.setHasPassword((id) => id === conn.id);
    expect(store.list().find((c) => c.id === conn.id)?.hasPassword).toBe(true);
  });

  it('emits on mutation', async () => {
    const store = await SqlConnectionStore.load(join(dir, 'c.json'));
    let events = 0;
    store.on('event', () => { events += 1; });
    store.create(input);
    expect(events).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npm test -w @frigg/server -- connection-store` Expected: FAIL.

- [ ] **Step 3: Implement** — model on `ApiClientStore` (debounced atomic write, `structuredClone` on the way out, validation on load). Store metadata only. `setHasPassword(pred)` sets the predicate used by `list()` / emitted events; default predicate returns `false`. `create` fills `id`/`createdAt`/`updatedAt`; `update` bumps `updatedAt`. Emit after each mutation via `this.emit('event', { type: 'sql-connections-updated', connections: this.list() })`.

- [ ] **Step 4: Run test to verify it passes** — Run: `npm test -w @frigg/server -- connection-store` Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add packages/server/src/sql/connection-store.ts packages/server/src/sql/connection-store.test.ts
git commit -m "feat(sql): connection profile store"
```

---

### Task 8: Driver interface + SQLite driver

**Files:**
- Create: `packages/server/src/sql/drivers/types.ts`, `packages/server/src/sql/drivers/sqlite.ts`
- Test: `packages/server/src/sql/drivers/sqlite.test.ts`
- Modify: `packages/server/package.json` (add `better-sqlite3`, dev `@types/better-sqlite3`)

**Interfaces:**
- Consumes: `SqlConnection`, `SqlSchema`, `SqlQueryResult`, `SqlConnectionTestResult`, `SqlCell`, `SQL_ROW_LIMIT`.
- Produces: `interface SqlDriver { test(): Promise<SqlConnectionTestResult>; introspect(): Promise<SqlSchema>; query(sql: string, params?: SqlCell[]): Promise<SqlQueryResult>; close(): Promise<void> }`; `createSqliteDriver(conn: SqlConnection): SqlDriver`. Shared helper `shapeResult(columns, rawRows, command, rowLimit): SqlQueryResult` (truncation + cell coercion) lives in `types.ts` and is reused by all drivers.

- [ ] **Step 1: Add deps** — Run: `npm install better-sqlite3 -w @frigg/server && npm install -D @types/better-sqlite3 -w @frigg/server`

- [ ] **Step 2: Write the failing test**
```ts
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
```

- [ ] **Step 3: Run test to verify it fails** — Run: `npm test -w @frigg/server -- sqlite` Expected: FAIL.

- [ ] **Step 4: Implement `types.ts`** (`SqlDriver` + `shapeResult` + cell coercion capping long strings) **and `sqlite.ts`** using `better-sqlite3`: `test()` opens read-only and runs `SELECT sqlite_version()`; `introspect()` reads `sqlite_master` + `PRAGMA table_info`; `query()` uses `db.prepare(sql)`, `.reader` → `.all()` else `.run()` (`affectedRows = changes`); `command` from a local re-check of the leading keyword.

- [ ] **Step 5: Run test to verify it passes** — Run: `npm test -w @frigg/server -- sqlite` Expected: PASS.

- [ ] **Step 6: Commit**
```bash
git add packages/server/src/sql/drivers/types.ts packages/server/src/sql/drivers/sqlite.ts packages/server/src/sql/drivers/sqlite.test.ts packages/server/package.json package-lock.json
git commit -m "feat(sql): driver interface + sqlite driver"
```

---

### Task 9: MySQL/MariaDB driver

**Files:**
- Create: `packages/server/src/sql/drivers/mysql.ts`
- Test: `packages/server/src/sql/drivers/mysql.test.ts` (gated on `FRIGG_TEST_MYSQL_URL`)
- Modify: `packages/server/package.json` (add `mysql2`)

**Interfaces:**
- Produces: `createMysqlDriver(conn: SqlConnection, password: string | null): SqlDriver` (used for `mysql` and `mariadb`).

- [ ] **Step 1: Add dep** — Run: `npm install mysql2 -w @frigg/server`
- [ ] **Step 2: Write a gated integration test** that `describe.skipIf(!process.env.FRIGG_TEST_MYSQL_URL)` — create temp table, insert, introspect (PK), select, update; asserts shape. (No CI server; runs when the env var points at a throwaway DB.)
- [ ] **Step 3: Implement** with `mysql2/promise` pool. `ssl` per `conn.ssl` (`verify` → `{ ca: conn caCert, rejectUnauthorized: true }` passed via manager; `require` → `{ rejectUnauthorized: false }`). Introspect from `information_schema.columns` + `information_schema.key_column_usage` scoped to `conn.database`. `query` via `pool.query`; `affectedRows` from the result for writes; reuse `shapeResult`.
- [ ] **Step 4: Type-check** — Run: `npm run build -w @frigg/server` Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/server/src/sql/drivers/mysql.ts packages/server/src/sql/drivers/mysql.test.ts packages/server/package.json package-lock.json
git commit -m "feat(sql): mysql/mariadb driver"
```

---

### Task 10: PostgreSQL driver

**Files:**
- Create: `packages/server/src/sql/drivers/postgres.ts`
- Test: `packages/server/src/sql/drivers/postgres.test.ts` (gated on `FRIGG_TEST_PG_URL`)
- Modify: `packages/server/package.json` (add `pg`, dev `@types/pg`)

**Interfaces:**
- Produces: `createPostgresDriver(conn: SqlConnection, password: string | null): SqlDriver`.

- [ ] **Step 1: Add deps** — Run: `npm install pg -w @frigg/server && npm install -D @types/pg -w @frigg/server`
- [ ] **Step 2: Write a gated integration test** (`describe.skipIf(!process.env.FRIGG_TEST_PG_URL)`) mirroring Task 9.
- [ ] **Step 3: Implement** with `pg` Pool. `ssl` per `conn.ssl`. Introspect `information_schema.columns` for non-system schemas + PKs via `information_schema.table_constraints`/`key_column_usage`. `query`: pass `params` as `$n`; `command='read'` → `rows`; writes → `rowCount` as `affectedRows`. Reuse `shapeResult`.
- [ ] **Step 4: Type-check** — Run: `npm run build -w @frigg/server` Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/server/src/sql/drivers/postgres.ts packages/server/src/sql/drivers/postgres.test.ts packages/server/package.json package-lock.json
git commit -m "feat(sql): postgres driver"
```

---

### Task 11: SqlManager

**Files:**
- Create: `packages/server/src/sql/manager.ts`, `packages/server/src/sql/index.ts`

**Interfaces:**
- Consumes: `SqlConnectionStore`, `SqlSecretStore`, the three `create*Driver` factories, `analyzeSql`, `buildRowEdit`, all shared SQL types.
- Produces: `class SqlManager` with `test(input: SqlConnectionInput | { id: string }): Promise<SqlConnectionTestResult>`, `schema(id): Promise<SqlSchema>`, `query(id, sql, confirmDestructive): Promise<SqlQueryResult>`, `editRow(id, edit): Promise<SqlQueryResult>`, `disconnect(id): Promise<void>`, `disposeAll(): Promise<void>`. `index.ts` re-exports `SqlConnectionStore`, `SqlSecretStore`, `SqlManager`, `createFileSecretBox`, type `SecretBox`.

- [ ] **Step 1: Implement `manager.ts`** — keep a `Map<id, { driver: SqlDriver; schema?: SqlSchema }>`. `driverFor(conn)` builds the password from secrets and dispatches by `conn.engine` (`mysql`/`mariadb` → mysql driver). `query` runs `analyzeSql`; if `destructive && !confirmDestructive` throw `Error('destructive')` (router maps to 400 with a `confirmRequired` hint); else run `effectiveSql`, trimming to `SQL_ROW_LIMIT` and setting `truncated` when `limited`. `editRow` → `buildRowEdit` then `driver.query`. `test({id})` loads the stored conn; `test(input)` builds a transient driver and closes it. Refresh `schema` cache on connect and after DDL.

- [ ] **Step 2: Type-check** — Run: `npm run build -w @frigg/server` Expected: PASS.

- [ ] **Step 3: Commit**
```bash
git add packages/server/src/sql/manager.ts packages/server/src/sql/index.ts
git commit -m "feat(sql): connection manager"
```

---

### Task 12: REST endpoints + validators

**Files:**
- Modify: `packages/server/src/api/router.ts`

**Interfaces:**
- Consumes: `SqlManager`, `SqlConnectionStore` via `ApiDeps`.
- Produces: the 9 routes in spec §8, with `parseSqlConnectionInput`, `parseSqlConnectionPatch`, `parseSqlRowEdit` validators (style: `asRecord`/`parseNonEmpty`/`badRequest`). `ApiDeps` gains `sql: SqlManager; sqlConnections: SqlConnectionStore`.

- [ ] **Step 1: Add validators + routes.** Engine must be one of the four; `ssl` one of three; `port` an integer ≥ 0; `password`/`caCert` optional strings. `GET` returns `sqlConnections.list()`; create/update persist password into the manager's secret store via a manager method (`setPassword(id, pw)`) then re-derive `hasPassword`. Map a thrown `Error('destructive')` to `res.status(400).json({ error: 'destructive', confirmRequired: true })`.

- [ ] **Step 2: Type-check** — Run: `npm run build -w @frigg/server` Expected: PASS (after Task 13 wires deps; if `ApiDeps` is incomplete here, do Step 1 of Task 13 first). 

- [ ] **Step 3: Commit**
```bash
git add packages/server/src/api/router.ts
git commit -m "feat(sql): REST endpoints"
```

---

### Task 13: Server boot wiring

**Files:**
- Modify: `packages/server/src/start.ts`

**Interfaces:**
- Consumes: everything from `sql/index.ts`, `sqlConnectionsPath`/`sqlSecretsPath`/`sqlSecretKeyPath`.
- Produces: `StartFriggOptions.secretBox?: SecretBox`; `sql`/`sqlConnections` passed into `buildRouter`; `sqlConnections` wired to `hub.broadcast`; `stop()` flushes + disposes.

- [ ] **Step 1: Wire it** per spec §6 (build secret box, secret store, connection store, manager; set the `hasPassword` predicate to `(id) => sqlSecrets.has(id)`; pass into deps; `sqlConnections.on('event', (ev) => hub.broadcast(ev))`; `stop()` adds `sqlConnections.flush()` and `sql.disposeAll()`).

- [ ] **Step 2: Type-check** — Run: `npm run build -w @frigg/server` Expected: PASS.

- [ ] **Step 3: Smoke** — Run: `npm run dev:server` briefly; `curl -s localhost:4848/api/sql/connections` Expected: `[]`. Stop the server.

- [ ] **Step 4: Commit**
```bash
git add packages/server/src/start.ts
git commit -m "feat(sql): boot wiring + injectable secret box"
```

---

### Task 14: Desktop safeStorage injection

**Files:**
- Modify: `packages/desktop/src/main.ts`

- [ ] **Step 1:** In `resolveAppUrl()`, build a `SecretBox` from Electron `safeStorage` when `safeStorage.isEncryptionAvailable()` (encrypt → `safeStorage.encryptString(s).toString('base64')`; decrypt → `safeStorage.decryptString(Buffer.from(blob,'base64'))`), and pass `{ webDir, secretBox }` into `startFrigg`. Fall back to omitting `secretBox` (server uses the file box) when unavailable.
- [ ] **Step 2: Type-check** — Run: `npm run build -w @frigg/desktop` (or the desktop typecheck script) Expected: PASS.
- [ ] **Step 3: Commit**
```bash
git add packages/desktop/src/main.ts
git commit -m "feat(sql): desktop safeStorage-backed secret box"
```

---

### Task 15: Web API client functions

**Files:**
- Modify: `packages/web/src/api/client.ts`

**Interfaces:**
- Produces: `getSqlConnections()`, `createSqlConnection(input)`, `updateSqlConnection(id, patch)`, `deleteSqlConnection(id)`, `testSqlConnection(body)`, `sqlSchema(id)`, `runSql(id, sql, confirmDestructive?)`, `editSqlRow(id, edit)`, `disconnectSql(id)` — all over the `request<T>` helper, typed with shared types.

- [ ] **Step 1:** Add the functions + import the shared SQL types. `runSql` returns `SqlQueryResult`; on a 400 with `confirmRequired`, surface a typed error the store can detect (throw an `Error` whose `message` is `'destructive'`).
- [ ] **Step 2: Type-check** — Run: `npm run build -w @frigg/web` Expected: PASS.
- [ ] **Step 3: Commit**
```bash
git add packages/web/src/api/client.ts
git commit -m "feat(sql): web api client"
```

---

### Task 16: Store slice

**Files:**
- Modify: `packages/web/src/store.ts`

**Interfaces:**
- Produces: `Screen` union `+ 'sql'`; state + actions from spec §9; `applyEvent` handles `sql-connections-updated`.

- [ ] **Step 1:** Add the slice (state fields, actions). `selectSqlConnection(id)` sets `sqlActiveId`, calls `api.sqlSchema(id)`, stores `sqlSchema`, derives `sqlTables`. `runSql(sql)` calls `api.runSql`; on `Error('destructive')` set `pendingDestructiveSql = sql` (UI opens the confirm dialog); `confirmRunSql()` re-runs with `confirmDestructive: true`. `editSqlRow(edit)` calls `api.editSqlRow` then re-runs the current browse query. `applyEvent` `sql-connections-updated` → `set({ sqlConnections: ev.connections })`.
- [ ] **Step 2: Type-check** — Run: `npm run build -w @frigg/web` Expected: PASS.
- [ ] **Step 3: Commit**
```bash
git add packages/web/src/store.ts
git commit -m "feat(sql): web store slice"
```

---

### Task 17: i18n bundle

**Files:**
- Create: `packages/web/src/i18n/sql.ts`
- Modify: `packages/web/src/i18n/index.ts` (import + register `sql` in `bundles`), `packages/web/src/i18n/common.ts` (add `nav.sql`)

- [ ] **Step 1:** Create the `sql` bundle (en + pt) covering every visible string the components use (connection form labels, engine names, buttons, empty states, errors, destructive-confirm copy). Register it. Add `nav.sql` to `common` (en `SQL`, pt `SQL`).
- [ ] **Step 2: Type-check** — Run: `npm run build -w @frigg/web` Expected: PASS.
- [ ] **Step 3: Commit**
```bash
git add packages/web/src/i18n/sql.ts packages/web/src/i18n/index.ts packages/web/src/i18n/common.ts
git commit -m "feat(sql): i18n strings"
```

---

### Task 18: Query editor (CodeMirror)

**Files:**
- Create: `packages/web/src/components/sql/SqlQueryEditor.tsx`
- Modify: `packages/web/package.json` (add CodeMirror deps)

**Interfaces:**
- Consumes: `SqlSchema`, store `runSql`/`sqlEditorSql`.
- Produces: `<SqlQueryEditor />` — CodeMirror 6 with `sql()` lang fed a `{ [table]: string[] }` schema derived from `sqlSchema`; Cmd/Ctrl+Enter runs the current statement; two-way bound to `sqlEditorSql`.

- [ ] **Step 1: Add deps** — Run: `npm install codemirror @codemirror/lang-sql @codemirror/state @codemirror/view @codemirror/autocomplete @codemirror/commands -w @frigg/web`
- [ ] **Step 2: Implement** the editor; build the schema map from `sqlSchema.tables` (`table.name → column names`, plus `schema.table` keys for postgres). Theme to match the dark UI (Tailwind tokens / a minimal `EditorView.theme`).
- [ ] **Step 3: Type-check** — Run: `npm run build -w @frigg/web` Expected: PASS.
- [ ] **Step 4: Commit**
```bash
git add packages/web/src/components/sql/SqlQueryEditor.tsx packages/web/package.json package-lock.json
git commit -m "feat(sql): schema-aware query editor"
```

---

### Task 19: Results grid + remaining components

**Files:**
- Create: `packages/web/src/components/sql/SqlResultsGrid.tsx`, `ConnectionsSidebar.tsx`, `ConnectionDialog.tsx`, `EngineBadge.tsx`, `SqlTablesList.tsx`, `DestructiveConfirmDialog.tsx`, `EmptyState.tsx`

**Interfaces:**
- Consumes: store slice + `SqlQueryResult`/`SqlConnection`/`SqlSchema`.
- Produces: the listed components. `SqlResultsGrid` renders `result.columns`/`result.rows`; double-click a cell → edit → commit calls `editSqlRow` (op `update`, `pk` from the row's PK columns in `sqlSchema`); "add row" / "delete row" buttons. `ConnectionDialog` adapts fields per engine and has a Test button showing `testSqlConnection` result.

- [ ] **Step 1: Implement** all seven components following existing component style (`database/` components as the reference for layout/Tailwind). Reuse `database/Spinner`.
- [ ] **Step 2: Type-check** — Run: `npm run build -w @frigg/web` Expected: PASS.
- [ ] **Step 3: Commit**
```bash
git add packages/web/src/components/sql/
git commit -m "feat(sql): connections sidebar, dialog, tables list, results grid"
```

---

### Task 20: Screen + navigation

**Files:**
- Create: `packages/web/src/screens/SqlScreen.tsx`
- Modify: `packages/web/src/App.tsx` (icon, `NAV_ITEMS` entry after `database`, render case)

- [ ] **Step 1: Implement `SqlScreen`** composing sidebar + tables list + editor + grid with `ResizeHandle`/`useResizable`, plus empty states (no connection selected / connected-no-query). Wire `DestructiveConfirmDialog` to `pendingDestructiveSql`.
- [ ] **Step 2:** Add a `DatabaseServerIcon` (distinct from the existing `DatabaseIcon`), a `{ screen: 'sql', labelKey: 'nav.sql', icon: <DatabaseServerIcon /> }` nav item, and a `screen === 'sql' ? <SqlScreen /> :` render branch.
- [ ] **Step 3: Type-check + build** — Run: `npm run build -w @frigg/web` Expected: PASS.
- [ ] **Step 4: Commit**
```bash
git add packages/web/src/screens/SqlScreen.tsx packages/web/src/App.tsx
git commit -m "feat(sql): SQL screen + navigation"
```

---

### Task 21: Docs + packaging

**Files:**
- Modify: `packages/desktop` electron-builder config (`package.json` build block or `electron-builder.*`), `CLAUDE.md`, `DESIGN.md`, `README.md`

- [ ] **Step 1:** Add `npmRebuild: true` and `asarUnpack: ["**/node_modules/better-sqlite3/**"]` to the electron-builder config. Document the new SQL screen + engines + the encrypted-credentials note in `CLAUDE.md`/`DESIGN.md`/`README.md` (include the "Frigg can reach any DB host you configure" caveat).
- [ ] **Step 2: Commit**
```bash
git add -A
git commit -m "docs(sql): document SQL client + native rebuild for packaging"
```

---

### Task 22: Full verification

- [ ] **Step 1:** Run: `npm test` Expected: all server suites PASS.
- [ ] **Step 2:** Run: `npm run build` Expected: server tsc + web build clean.
- [ ] **Step 3: Manual smoke (SQLite)** — `npm run dev`, open the SQL screen, create a SQLite connection to a temp `.sqlite`, browse a table, edit a cell, run a `SELECT`, run a destructive statement and confirm the dialog. Record the result.
- [ ] **Step 4:** Fix anything that fails, re-run Steps 1-2, commit fixes.

## Self-Review notes

- Spec coverage: every spec section maps to a task (types→T1, paths→T2, secrets→T3/T4, analyze→T5, row-sql→T6, store→T7, drivers→T8-10, manager→T11, REST→T12, boot→T13, desktop→T14, web client/store/i18n/editor/grid/screen→T15-20, docs/packaging→T21, verify→T22).
- Type consistency: driver factory names (`createSqliteDriver`/`createMysqlDriver`/`createPostgresDriver`), `SqlDriver` methods, and store action names are fixed here and referenced consistently downstream.
- Note: Task 12 and Task 13 are mutually dependent on `ApiDeps` shape — extend the `ApiDeps` interface as part of Task 12 Step 1 so Task 12 type-checks once Task 13 supplies the values; if executed strictly in order, allow Task 12's build to pass only after Task 13.
