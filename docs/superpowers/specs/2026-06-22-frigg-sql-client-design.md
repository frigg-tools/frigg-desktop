# Frigg SQL — design spec (cliente de banco de dados por credenciais)

Date: 2026-06-22 · Branch: `feat/db-connections`

## 1. Goal

Add a new top-level **SQL** screen to Frigg that lets the user register database
credentials and use Frigg as a graphical client to: browse tables, edit table
data, and run SQL queries with schema-aware autocomplete. Standalone DB servers,
reached over the network by credentials — distinct from the existing **Database**
screen, which inspects SQLite files pulled off a connected device.

## 2. Supported engines

| Engine | Driver (npm) | Notes |
|--------|--------------|-------|
| MySQL | `mysql2` | pure-JS, real prepared statements |
| MariaDB | `mysql2` | same driver as MySQL |
| PostgreSQL | `pg` | pure-JS, real prepared statements |
| SQLite | `better-sqlite3` | native module; real prepared statements (needed for safe inline edits). Connection target = a local `.sqlite` file path. |

`better-sqlite3` is the only native dependency. It requires `electron-builder`
to rebuild it for the Electron ABI when packaging the desktop app
(`asarUnpack` + `npmRebuild`). The dev (`npm run dev`) and web (`npm start`)
paths use the Node ABI directly and need no special handling.

## 3. Scope

In scope:
- Connection profiles CRUD (persisted), with the password stored encrypted at rest.
- "Test connection" before saving.
- Connect → introspect schema (tables + columns + primary keys).
- Tables list; click a table → browse rows (paginated `SELECT`).
- Free SQL editor with schema-aware autocomplete (keywords + tables + columns).
- Run read/write/DDL statements. Auto-`LIMIT` on bare `SELECT`. Row cap.
- Destructive statements (`UPDATE`/`DELETE` without `WHERE`, `DROP`, `TRUNCATE`)
  require explicit confirmation.
- Inline cell edit in the results grid → parameterized `UPDATE`. Add/delete row →
  parameterized `INSERT`/`DELETE`.
- Bilingual UI (en/pt) via `useT()`.

Out of scope (future):
- SSH tunneling, connection over a bastion.
- Visual schema/DDL designer, ER diagrams.
- Export/import (CSV/SQL dump).
- NoSQL engines (MongoDB etc.).
- Multi-statement scripts in one run (one statement per execution — see §7).

## 4. Shared domain types (`packages/shared/src/index.ts`)

Add (never redefine elsewhere — import from `@frigg/shared`):

```ts
export type SqlEngine = 'mysql' | 'mariadb' | 'postgres' | 'sqlite';
export type SqlSslMode = 'disable' | 'require' | 'verify';
export type SqlCommandKind = 'read' | 'write' | 'ddl' | 'other';
export type SqlCell = string | number | boolean | null;

export interface SqlConnection {
  id: string;
  name: string;
  engine: SqlEngine;
  host: string;        // network engines; '' for sqlite
  port: number;        // network engines; 0 for sqlite
  user: string;        // network engines; '' for sqlite
  database: string;    // db name for network engines; file path for sqlite
  ssl: SqlSslMode;     // network engines; 'disable' for sqlite
  hasPassword: boolean; // server-derived; the password itself is NEVER returned
  createdAt: number;
  updatedAt: number;
}

export interface SqlConnectionInput {
  name: string;
  engine: SqlEngine;
  host: string;
  port: number;
  user: string;
  database: string;
  ssl: SqlSslMode;
  password?: string;   // write-only; present only on create/update; never echoed back
  caCert?: string;     // optional PEM, used when ssl = 'verify'
}

export interface SqlColumn {
  name: string;
  dataType: string;
  nullable: boolean;
  isPrimaryKey: boolean;
}

export interface SqlTable {
  name: string;
  schema?: string;     // postgres schema / mysql database; omitted for sqlite
  columns: SqlColumn[];
}

export interface SqlSchema {
  tables: SqlTable[];
}

export interface SqlQueryResult {
  columns: string[];
  rows: SqlCell[][];
  rowCount: number;
  affectedRows: number | null; // for writes/DDL; null for reads
  truncated: boolean;          // true when a SELECT hit the row cap
  durationMs: number;
  command: SqlCommandKind;
}

export interface SqlConnectionTestResult {
  ok: boolean;
  serverVersion?: string;
  error?: string;
}

export interface SqlRowEdit {
  op: 'update' | 'insert' | 'delete';
  table: string;
  schema?: string;
  pk: Array<{ column: string; value: SqlCell }>;      // locates the row (update/delete)
  changes?: Array<{ column: string; value: SqlCell }>; // update: changed cols; insert: all cols
}

export const SQL_ROW_LIMIT = 1000;
```

Extend the `ServerEvent` union with:

```ts
  | { type: 'sql-connections-updated'; connections: SqlConnection[] }
```

## 5. Server architecture (`packages/server/src/sql/`)

New module. Mirrors the existing `api-client` / `db` patterns (EventEmitter
stores, `static async load(path)`, atomic debounced writes, never crash on tool
failures — degrade into error results).

- `connection-store.ts` — `SqlConnectionStore extends EventEmitter`.
  Persists connection **metadata only** to `~/.frigg/sql-connections.json`
  (atomic tmp+rename, debounced — copy `ApiClientStore`). CRUD: `list()`,
  `create(input)`, `update(id, patch)`, `delete(id)`, `snapshot()`. Emits
  `{ type: 'sql-connections-updated', connections }` on every mutation.
  `hasPassword` is computed from the secret store, never persisted here.

- `secret-box.ts` — `SecretBox` interface `{ encrypt(plain): string; decrypt(blob): string }`.
  - `createFileSecretBox(keyPath)` — AES-256-GCM, 32-byte key auto-created at
    `keyPath` with mode `0600`. Blob = base64(iv ‖ authTag ‖ ciphertext).
  - The desktop app injects an Electron `safeStorage`-backed box instead (see §6).

- `secret-store.ts` — `SqlSecretStore`. Persists `{ [connId]: encryptedBlob }` to
  `~/.frigg/sql-secrets.json` via the injected `SecretBox`. `get(id)`, `set(id, pw)`,
  `delete(id)`, `has(id)`. Kept separate from the metadata file so snapshots can
  never leak a secret.

- `drivers/types.ts` — `SqlDriver` interface:
  ```ts
  interface SqlDriver {
    test(): Promise<SqlConnectionTestResult>;
    introspect(): Promise<SqlSchema>;
    query(sql: string, params?: SqlCell[]): Promise<SqlQueryResult>;
    close(): Promise<void>;
  }
  ```
  plus `createDriver(conn: SqlConnection, password: string | null): SqlDriver`.

- `drivers/mysql.ts` — `mysql2` pool; used for both `mysql` and `mariadb`.
  Introspect via `information_schema.columns` + `information_schema.statistics`
  / `key_column_usage` for PKs, scoped to `conn.database`.

- `drivers/postgres.ts` — `pg` Pool. Introspect via `information_schema.columns`
  joined with `pg_index`/`pg_attribute` (or `table_constraints` +
  `key_column_usage`) for PKs; include non-system schemas.

- `drivers/sqlite.ts` — `better-sqlite3` over `conn.database` (file path).
  Introspect: tables from `sqlite_master`, columns + PK flag from
  `PRAGMA table_info(name)`. Synchronous driver wrapped in async signatures.

- `analyze.ts` — `analyzeSql(sql, { engine, rowLimit }): SqlAnalysis`:
  ```ts
  interface SqlAnalysis {
    kind: SqlCommandKind;     // read | write | ddl | other
    destructive: boolean;     // UPDATE/DELETE w/o WHERE, DROP, TRUNCATE
    effectiveSql: string;     // bare SELECT gets LIMIT (rowLimit+1) appended
    limited: boolean;         // we injected the limit
  }
  ```
  Classification by leading keyword (ignoring leading comments/parens):
  `select|with|show|explain|pragma|describe|desc` → read; `insert|update|delete|replace|merge` → write;
  `create|alter|drop|truncate|rename` → ddl; else other. Pure & unit-tested.

- `manager.ts` — `SqlManager`. Holds live `SqlDriver` instances keyed by
  connection id (lazy connect, idle-dispose), plus an introspected-schema cache
  used by autocomplete. Methods: `test(input | id)`, `schema(id)` (connect +
  introspect, cached), `query(id, sql, confirmDestructive)`, `editRow(id, edit)`,
  `disconnect(id)`, `disposeAll()`. Builds passwords from `SqlSecretStore`.
  `editRow` builds **parameterized** `UPDATE`/`INSERT`/`DELETE` (identifiers
  quoted per engine, values bound as params — never string-interpolated).

- `row-sql.ts` — pure builder: `buildRowEdit(edit, engine): { sql, params }`.
  Unit-tested for all three ops × engines (identifier quoting, placeholder style:
  `?` for mysql/sqlite, `$n` for postgres).

- `index.ts` — re-exports `SqlConnectionStore`, `SqlSecretStore`, `SqlManager`,
  `createFileSecretBox`, type `SecretBox`.

## 6. Secret storage + desktop injection

- `StartFriggOptions` gains `secretBox?: SecretBox`.
- `start.ts`:
  ```ts
  const secretBox = options.secretBox ?? createFileSecretBox(sqlSecretKeyPath);
  const sqlSecrets = await SqlSecretStore.load(sqlSecretsPath, secretBox);
  const sqlConnections = await SqlConnectionStore.load(sqlConnectionsPath);
  const sql = new SqlManager(sqlConnections, sqlSecrets);
  // deps += { sqlConnections, sql }
  sqlConnections.on('event', (ev) => hub.broadcast(ev));
  // stop(): add sqlConnections.flush(), sql.disposeAll()
  ```
- `packages/desktop/src/main.ts`: after `app.whenReady()`, build an Electron
  `safeStorage`-backed `SecretBox` and pass it into `startFrigg({ webDir, secretBox })`.
  `safeStorage.encryptString` returns a `Buffer` → store as base64; `decryptString`
  takes a `Buffer`. Guard with `safeStorage.isEncryptionAvailable()`, else fall
  back to the file box.
- `paths.ts` adds: `sqlConnectionsPath`, `sqlSecretsPath`, `sqlSecretKeyPath`.

## 7. SQL safety model

- One statement per `query` call (the editor runs the statement at the cursor or
  the selection). Reject obvious multi-statement payloads to keep classification
  honest.
- `analyzeSql` runs first. Bare `SELECT`/`WITH` without an existing `LIMIT` gets
  `LIMIT (SQL_ROW_LIMIT + 1)` appended; if the row count exceeds `SQL_ROW_LIMIT`
  the result is trimmed and `truncated: true`.
- `destructive` statements require `confirmDestructive: true` in the request,
  else the endpoint returns 400 with a code the UI maps to a confirm dialog.
- Inline edits never interpolate values — always parameterized (`row-sql.ts`).
- Passwords: never written in plaintext; never returned by any endpoint; GET
  snapshots carry only `hasPassword: boolean`.
- The client can reach any host the user configures — intended power, documented
  in README/DESIGN.

## 8. REST API (`packages/server/src/api/router.ts`)

Add `sqlConnections: SqlConnectionStore` and `sql: SqlManager` to `ApiDeps`.
New `parseSqlConnectionInput` / `parseSqlConnectionPatch` / `parseSqlRowEdit`
validators following the existing `parseX` + `badRequest` style. Endpoints:

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/api/sql/connections` | — | `SqlConnection[]` |
| POST | `/api/sql/connections` | `SqlConnectionInput` | `{ connections, id }` |
| PUT | `/api/sql/connections/:id` | partial input (+ optional `password`) | `{ connections }` |
| DELETE | `/api/sql/connections/:id` | — | `{ connections }` |
| POST | `/api/sql/test` | `SqlConnectionInput` **or** `{ id }` | `SqlConnectionTestResult` |
| POST | `/api/sql/connections/:id/schema` | — | `SqlSchema` |
| POST | `/api/sql/connections/:id/query` | `{ sql, confirmDestructive? }` | `SqlQueryResult` |
| POST | `/api/sql/connections/:id/edit` | `SqlRowEdit` | `SqlQueryResult` |
| POST | `/api/sql/connections/:id/disconnect` | — | `{ ok: true }` |

Driver/connection errors surface as 400 with `{ error }` (degrade, never crash),
matching the existing `messageForError` middleware.

## 9. Web architecture (`packages/web/src`)

- `store.ts`: `Screen` union `+ 'sql'`. New slice:
  `sqlConnections`, `sqlActiveId`, `sqlSchema`, `sqlTables` (derived), `sqlResult`,
  `sqlEditorSql`, `sqlBusy`, `sqlError`, `sqlTestResult`, `pendingDestructiveSql`.
  Actions: `loadSqlConnections`, `createSqlConnection`, `updateSqlConnection`,
  `deleteSqlConnection`, `testSqlConnection`, `selectSqlConnection` (connect +
  introspect), `refreshSqlSchema`, `browseSqlTable`, `runSql`, `confirmRunSql`,
  `editSqlRow`. `applyEvent` handles `sql-connections-updated`.
- `api/client.ts`: `getSqlConnections`, `createSqlConnection`, `updateSqlConnection`,
  `deleteSqlConnection`, `testSqlConnection`, `sqlSchema`, `runSql`, `editSqlRow`,
  `disconnectSql` (reuse the `request<T>` helper with the locale header).
- `screens/SqlScreen.tsx`: left = `ConnectionsSidebar` + `SqlTablesList`;
  center = `SqlQueryEditor` over `SqlResultsGrid`. Empty states for no-connection /
  not-connected, reusing `ResizeHandle`/`useResizable` and `database/Spinner`.
- `components/sql/`:
  - `ConnectionsSidebar.tsx` — list + "new connection".
  - `ConnectionDialog.tsx` — create/edit form; fields adapt per engine
    (sqlite → file path; network → host/port/user/password/db/ssl); "Test" button.
  - `EngineBadge.tsx` — engine chip.
  - `SqlTablesList.tsx` — tables from the schema; click → browse.
  - `SqlQueryEditor.tsx` — CodeMirror 6 + `@codemirror/lang-sql`, schema fed into
    the SQL completion source; Cmd/Ctrl+Enter runs.
  - `SqlResultsGrid.tsx` — editable cells (commit → `editSqlRow` update), add/delete row.
  - `DestructiveConfirmDialog.tsx` — shown when a run is flagged destructive.
  - `EmptyState.tsx`.
- `App.tsx`: add a `nav.sql` item with a new icon and a render case for `'sql'`.
- `i18n/sql.ts`: `sql` namespace (en + pt), registered in `i18n/index.ts`.

### Autocomplete
CodeMirror 6's `sql()` language accepts a `schema` object (`{ [table]: string[] }`).
`SqlQueryEditor` derives it from `sqlSchema` so completion offers tables after
`FROM`/`JOIN`, columns after `SELECT`/`WHERE`/`alias.`, plus SQL keywords. If
CodeMirror integration proves heavy, the implementation may fall back to a
textarea with a custom completion popup — but CodeMirror is the target.

## 10. Dependencies

- `packages/server`: `mysql2`, `pg`, `better-sqlite3`; dev `@types/pg`,
  `@types/better-sqlite3`.
- `packages/web`: `codemirror`, `@codemirror/lang-sql`, `@codemirror/view`,
  `@codemirror/state`, `@codemirror/autocomplete`, `@codemirror/commands`.
- `packages/desktop` (`electron-builder` config): `npmRebuild: true` and
  `asarUnpack` for `**/node_modules/better-sqlite3/**` so the native binary loads
  from the packaged app. Document in CLAUDE.md/DESIGN.md.

## 11. Testing (vitest, server)

- `analyze.test.ts` — classification (read/write/ddl/other), destructive detection,
  `LIMIT` injection (and not double-injecting).
- `row-sql.test.ts` — `buildRowEdit` for update/insert/delete × engines: identifier
  quoting and placeholder style; values always parameters.
- `secret-box.test.ts` — file AES box round-trip; wrong-key / tampered blob fails.
- `connection-store.test.ts` — CRUD + atomic persistence + `hasPassword` derivation.
- `sqlite-driver.test.ts` — real e2e against a temp `.sqlite`: create table, insert,
  select (+ truncation), introspect (PK flags), inline edit, destructive guard.
- MySQL/Postgres driver tests gated behind opt-in env vars (no servers in CI).

## 12. File change manifest

New (server): `sql/connection-store.ts`, `sql/secret-box.ts`, `sql/secret-store.ts`,
`sql/drivers/types.ts`, `sql/drivers/mysql.ts`, `sql/drivers/postgres.ts`,
`sql/drivers/sqlite.ts`, `sql/analyze.ts`, `sql/row-sql.ts`, `sql/manager.ts`,
`sql/index.ts`, plus the test files in §11.

New (web): `screens/SqlScreen.tsx`, `components/sql/*` (8 files), `i18n/sql.ts`.

Edited: `shared/src/index.ts` (types + event), `server/src/lib/paths.ts`,
`server/src/start.ts`, `server/src/api/router.ts`, `desktop/src/main.ts`,
`web/src/store.ts`, `web/src/App.tsx`, `web/src/api/client.ts`,
`web/src/i18n/index.ts`, the three `package.json` files, `CLAUDE.md`/`DESIGN.md`,
`README.md`.

## 13. Verification

`npm run build` (server tsc + web build) clean, `npm test` green. Manual smoke
against a local SQLite file end-to-end (connect → browse → edit → query → destructive
confirm). MySQL/Postgres/MariaDB verified opportunistically against a local server.
