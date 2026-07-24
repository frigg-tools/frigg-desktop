# Real-Time Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local, temporary, real-time logging system covering server, desktop, and web so users can diagnose errors, crashes, and misbehaviors from inside the app or from log files on disk.

**Architecture:** A single `LoggerService` in `packages/server` receives structured log entries from server, Electron main, and the React UI; persists them as daily-rotated JSONL files under `~/.frigg/logs/`; broadcasts new entries over the existing WebSocket hub; and serves historical queries via a REST endpoint. The UI renders a new Logs screen with live stream and filters.

**Tech Stack:** TypeScript, Node.js `node:fs`, existing `WsHub`, Express, React, Zustand, Vitest.

## Global Constraints

- Logs must stay local; no external telemetry service.
- Must not log intercepted HTTP traffic (no request/response bodies or headers).
- Daily file rotation, keep the last 7 days.
- Source values: `'server' | 'desktop' | 'web'`.
- Log levels: `'debug' | 'info' | 'warn' | 'error' | 'fatal'`.
- The existing `LogEntry` type in `@frigg/shared` is reserved for device logcat; internal logs use a new type named `AppLogEntry`.

---

## File Structure

- `packages/shared/src/index.ts` — add `AppLogEntry`, `AppLogLevel`, `AppLogSource`, `AppLogEvent` types.
- `packages/server/src/lib/paths.ts` — add `logsPath()` helper.
- `packages/server/src/logging/logger-service.ts` — new `LoggerService` class.
- `packages/server/src/logging/index.ts` — new public exports (`LoggerService`, `createLogger`).
- `packages/server/src/start.ts` — instantiate `LoggerService`, add to `deps`, dispose on stop, return in `FriggHandles`.
- `packages/server/src/api/router.ts` — add `loggerService` to `ApiDeps`, add `GET /api/logs` and `POST /api/logs` routes.
- `packages/server/src/api/ws.ts` — no change if broadcast is done via `hub.broadcast` in `start.ts`.
- `packages/server/src/index.ts` — replace `console.log`/`console.error` with logger calls.
- `packages/web/src/logging/web-logger.ts` — new web logger; sends logs via `POST /api/logs`.
- `packages/web/src/components/ErrorBoundary.tsx` — new React error boundary.
- `packages/web/src/main.tsx` — wrap `<App />` with `<ErrorBoundary>`.
- `packages/web/src/App.tsx` — call `initWebLogger()`, add `'logs'` screen to `NAV_ITEMS`, render `<LogsScreen />`.
- `packages/web/src/store.ts` — add `appLogs`, `appLogFilters`, `applyEvent` case for `'app-log'`.
- `packages/web/src/screens/LogsScreen.tsx` — new screen component.
- `packages/desktop/src/main.ts` — capture `uncaughtException`/`unhandledRejection`, log via returned `loggerService`.
- `packages/desktop/src/logging/desktop-logger.ts` — helper to publish desktop logs.
- `packages/server/test/logger-service.test.ts` — unit tests.
- `packages/server/test/logs-router.test.ts` — integration tests for REST endpoints.

---

### Task 1: Shared types for internal logs

**Files:**
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces: `AppLogLevel`, `AppLogSource`, `AppLogEntry`, `AppLogEvent` exported from `@frigg/shared`.

- [ ] **Step 1: Add types after `LogSessionStatus`**

```ts
export type AppLogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';
export type AppLogSource = 'server' | 'desktop' | 'web';

export interface AppLogEntry {
  timestamp: string; // ISO 8601
  level: AppLogLevel;
  source: AppLogSource;
  context?: string;
  message: string;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  metadata?: Record<string, unknown>;
}

export interface AppLogEvent {
  type: 'app-log';
  entry: AppLogEntry;
}
```

- [ ] **Step 2: Update `ServerEvent` union to include `AppLogEvent`**

Find the existing `ServerEvent` union (around line 420) and add `AppLogEvent` to it. The exact ordering does not matter as long as the new variant is listed.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/index.ts
git commit -m "feat(shared): add AppLogEntry and AppLogEvent types"
```

---

### Task 2: LoggerService core

**Files:**
- Create: `packages/server/src/logging/logger-service.ts`
- Create: `packages/server/src/logging/index.ts`
- Modify: `packages/server/src/lib/paths.ts`

**Interfaces:**
- Consumes: `AppLogEntry`, `AppLogLevel`, `AppLogSource` from `@frigg/shared`.
- Produces: `LoggerService` class with methods:
  - `log(entry: Omit<AppLogEntry, 'timestamp'>): AppLogEntry`
  - `debug/info/warn/error/fatal(message, ...): AppLogEntry`
  - `query(filters): AppLogEntry[]`
  - `onLog(listener): () => void`
  - `dispose(): void`

- [ ] **Step 1: Add `logsPath` helper**

In `packages/server/src/lib/paths.ts`, append:

```ts
export function logsPath(): string {
  return path.join(friggHome(), 'logs');
}
```

Ensure `path` and `friggHome` are imported.

- [ ] **Step 2: Write failing test**

Create `packages/server/test/logger-service.test.ts`:

```ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LoggerService } from '../src/logging/logger-service.ts';

describe('LoggerService', () => {
  let tmpDir: string;
  let service: LoggerService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frigg-logs-'));
    service = new LoggerService(tmpDir);
  });

  afterEach(() => {
    service.dispose();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes a log entry to JSONL file', () => {
    service.info('server', 'test', 'hello');
    const files = fs.readdirSync(tmpDir);
    expect(files).toHaveLength(1);
    const content = fs.readFileSync(path.join(tmpDir, files[0]!), 'utf8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]!);
    expect(entry.level).toBe('info');
    expect(entry.source).toBe('server');
    expect(entry.context).toBe('test');
    expect(entry.message).toBe('hello');
    expect(typeof entry.timestamp).toBe('string');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd packages/server
npx vitest run test/logger-service.test.ts
```

Expected: FAIL — `Cannot find module '../src/logging/logger-service.ts'`.

- [ ] **Step 4: Implement LoggerService**

Create `packages/server/src/logging/logger-service.ts`:

```ts
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import type { AppLogEntry, AppLogLevel, AppLogSource } from '@frigg/shared';

export interface LoggerQuery {
  from?: string;
  to?: string;
  level?: AppLogLevel;
  source?: AppLogSource;
  q?: string;
  limit?: number;
}

export class LoggerService {
  private readonly dir: string;
  private readonly buffer: AppLogEntry[] = [];
  private readonly maxBuffer = 500;
  private readonly listeners = new Set<(entry: AppLogEntry) => void>();
  private disposed = false;

  constructor(dir: string) {
    this.dir = dir;
    this.ensureDir();
    this.cleanupOldFiles();
  }

  private ensureDir(): void {
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
  }

  private fileNameFor(date = new Date()): string {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return path.join(this.dir, `frigg-${y}-${m}-${d}.logl`);
  }

  private cleanupOldFiles(): void {
    if (!existsSync(this.dir)) return;
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const name of readdirSync(this.dir)) {
      if (!name.startsWith('frigg-') || !name.endsWith('.logl')) continue;
      const full = path.join(this.dir, name);
      try {
        const stats = statSync(full);
        if (stats.mtimeMs < cutoff) rmSync(full);
      } catch {
        // ignore
      }
    }
  }

  log(partial: Omit<AppLogEntry, 'timestamp'>): AppLogEntry {
    if (this.disposed) throw new Error('LoggerService is disposed');
    const entry: AppLogEntry = { timestamp: new Date().toISOString(), ...partial };
    this.buffer.push(entry);
    if (this.buffer.length > this.maxBuffer) this.buffer.shift();
    this.appendToFile(entry);
    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch {
        // ignore listener errors
      }
    }
    return entry;
  }

  private appendToFile(entry: AppLogEntry): void {
    try {
      const line = JSON.stringify(entry) + '\n';
      writeFileSync(this.fileNameFor(), line, { flag: 'a' });
    } catch {
      // best-effort persistence
    }
  }

  debug(source: AppLogSource, context: string, message: string, metadata?: Record<string, unknown>): AppLogEntry {
    return this.log({ level: 'debug', source, context, message, metadata });
  }

  info(source: AppLogSource, context: string, message: string, metadata?: Record<string, unknown>): AppLogEntry {
    return this.log({ level: 'info', source, context, message, metadata });
  }

  warn(source: AppLogSource, context: string, message: string, metadata?: Record<string, unknown>): AppLogEntry {
    return this.log({ level: 'warn', source, context, message, metadata });
  }

  error(
    source: AppLogSource,
    context: string,
    message: string,
    error?: unknown,
    metadata?: Record<string, unknown>,
  ): AppLogEntry {
    const err = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : undefined;
    return this.log({ level: 'error', source, context, message, error: err, metadata });
  }

  fatal(
    source: AppLogSource,
    context: string,
    message: string,
    error?: unknown,
    metadata?: Record<string, unknown>,
  ): AppLogEntry {
    const err = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : undefined;
    return this.log({ level: 'fatal', source, context, message, error: err, metadata });
  }

  onLog(listener: (entry: AppLogEntry) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  recent(limit = 100): AppLogEntry[] {
    return this.buffer.slice(-limit);
  }

  async query(filters: LoggerQuery = {}): Promise<AppLogEntry[]> {
    const results: AppLogEntry[] = [];
    const files = this.listLogFiles();
    for (const file of files) {
      if (filters.limit !== undefined && results.length >= filters.limit) break;
      await this.readFileFiltered(file, filters, results);
    }
    return results.slice(0, filters.limit ?? results.length);
  }

  private listLogFiles(): string[] {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir)
      .filter((n) => n.startsWith('frigg-') && n.endsWith('.logl'))
      .sort()
      .map((n) => path.join(this.dir, n));
  }

  private async readFileFiltered(file: string, filters: LoggerQuery, out: AppLogEntry[]): Promise<void> {
    const stream = createReadStream(file, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      let entry: AppLogEntry;
      try {
        entry = JSON.parse(line) as AppLogEntry;
      } catch {
        continue;
      }
      if (filters.from !== undefined && entry.timestamp < filters.from) continue;
      if (filters.to !== undefined && entry.timestamp > filters.to) continue;
      if (filters.level !== undefined && entry.level !== filters.level) continue;
      if (filters.source !== undefined && entry.source !== filters.source) continue;
      if (filters.q !== undefined) {
        const haystack = `${entry.message} ${entry.context ?? ''} ${entry.error?.message ?? ''}`.toLowerCase();
        if (!haystack.includes(filters.q.toLowerCase())) continue;
      }
      out.push(entry);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
  }
}
```

Add the missing `fs` import at the top:

```ts
import fs from 'node:fs';
```

- [ ] **Step 5: Create barrel export**

Create `packages/server/src/logging/index.ts`:

```ts
export { LoggerService, type LoggerQuery } from './logger-service.ts';
export { createLogger, type Logger } from './create-logger.ts';
```

- [ ] **Step 6: Create createLogger factory**

Create `packages/server/src/logging/create-logger.ts`:

```ts
import type { AppLogEntry, AppLogSource } from '@frigg/shared';
import { LoggerService } from './logger-service.ts';

export interface Logger {
  debug(message: string, metadata?: Record<string, unknown>): AppLogEntry;
  info(message: string, metadata?: Record<string, unknown>): AppLogEntry;
  warn(message: string, metadata?: Record<string, unknown>): AppLogEntry;
  error(message: string, error?: unknown, metadata?: Record<string, unknown>): AppLogEntry;
  fatal(message: string, error?: unknown, metadata?: Record<string, unknown>): AppLogEntry;
}

export function createLogger(service: LoggerService, source: AppLogSource, context: string): Logger {
  return {
    debug: (message, metadata) => service.debug(source, context, message, metadata),
    info: (message, metadata) => service.info(source, context, message, metadata),
    warn: (message, metadata) => service.warn(source, context, message, metadata),
    error: (message, error, metadata) => service.error(source, context, message, error, metadata),
    fatal: (message, error, metadata) => service.fatal(source, context, message, error, metadata),
  };
}
```

- [ ] **Step 7: Run tests**

```bash
cd packages/server
npx vitest run test/logger-service.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/server/src/logging packages/server/src/lib/paths.ts packages/server/test/logger-service.test.ts
git commit -m "feat(server): add LoggerService with daily rotation and query"
```

---

### Task 3: Wire LoggerService into server bootstrap and REST routes

**Files:**
- Modify: `packages/server/src/start.ts`
- Modify: `packages/server/src/api/router.ts`
- Modify: `packages/server/src/index.ts`

**Interfaces:**
- Consumes: `LoggerService` from `packages/server/src/logging`.
- Produces: `loggerService` available in `ApiDeps` and `FriggHandles`.

- [ ] **Step 1: Update `ApiDeps` in router.ts**

In `packages/server/src/api/router.ts` add to `ApiDeps`:

```ts
import type { LoggerService } from '../logging/logger-service.ts';

export interface ApiDeps {
  // ...existing fields
  loggerService: LoggerService;
}
```

- [ ] **Step 2: Add REST routes for logs**

After the existing logcat routes block (`router.get('/api/logs/status', ...)`), add:

```ts
import type { AppLogEntry, AppLogSource, AppLogLevel } from '@frigg/shared';

router.get('/api/logs', asyncHandler(async (req, res) => {
  const from = typeof req.query.from === 'string' ? req.query.from : undefined;
  const to = typeof req.query.to === 'string' ? req.query.to : undefined;
  const level = typeof req.query.level === 'string' ? (req.query.level as AppLogLevel) : undefined;
  const source = typeof req.query.source === 'string' ? (req.query.source as AppLogSource) : undefined;
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
  const entries = await deps.loggerService.query({ from, to, level, source, q, limit });
  res.json(entries);
}));

router.post('/api/logs', (req, res) => {
  const body = req.body as Partial<AppLogEntry>;
  if (!body.message || typeof body.message !== 'string') {
    badRequest('message is required');
  }
  const entry = deps.loggerService.log({
    level: body.level ?? 'info',
    source: body.source ?? 'web',
    context: body.context ?? 'web',
    message: body.message,
    error: body.error,
    metadata: body.metadata,
  });
  res.json(entry);
});
```

- [ ] **Step 3: Instantiate LoggerService in start.ts**

In `packages/server/src/start.ts`:

```ts
import { LoggerService } from './logging/logger-service.ts';
import { logsPath } from './lib/paths.ts';
```

After `ensureFriggDirs()` (line 103) add:

```ts
const loggerService = new LoggerService(logsPath());
```

Add `loggerService` to `deps` (line 127):

```ts
const deps: ApiDeps = {
  // ...existing
  loggerService,
};
```

In `stop` add before `httpServer.close`:

```ts
loggerService.dispose();
```

Return `loggerService` in `FriggHandles`:

```ts
return {
  // ...existing fields
  loggerService,
};
```

- [ ] **Step 4: Replace console logging in server CLI**

In `packages/server/src/index.ts`, import and use logger:

```ts
import { startFrigg } from './start.ts';

async function main(): Promise<void> {
  const frigg = await startFrigg();
  frigg.loggerService.info('server', 'cli', 'Frigg server started', {
    apiPort: frigg.apiPort,
    proxyPort: frigg.proxyPort,
  });
  // ...existing banner code
}

main().catch((error) => {
  console.error('Fatal error starting Frigg:', error);
  process.exit(1);
});
```

Keep the `console.error` in the top-level catch because the logger may not exist yet.

- [ ] **Step 5: Run server build**

```bash
cd packages/server
npm run build
```

Expected: no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/start.ts packages/server/src/api/router.ts packages/server/src/index.ts
git commit -m "feat(server): wire LoggerService into bootstrap and add /api/logs routes"
```

---

### Task 4: Broadcast logs over WebSocket

**Files:**
- Modify: `packages/server/src/start.ts`

**Interfaces:**
- Consumes: `LoggerService.onLog`.
- Produces: `ServerEvent` of type `'app-log'` broadcast via `WsHub`.

- [ ] **Step 1: Subscribe LoggerService to WsHub**

In `packages/server/src/start.ts`, after the other `.on('event', ...)` subscriptions (around line 163), add:

```ts
loggerService.onLog((entry) => {
  const event: AppLogEvent = { type: 'app-log', entry };
  hub.broadcast(event);
});
```

Import `AppLogEvent` from `@frigg/shared`:

```ts
import type { ServerEvent, AppLogEvent } from '@frigg/shared';
```

- [ ] **Step 2: Run server build**

```bash
cd packages/server
npm run build
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/start.ts
git commit -m "feat(server): broadcast app logs via WebSocket"
```

---

### Task 5: Web logger and ErrorBoundary

**Files:**
- Create: `packages/web/src/logging/web-logger.ts`
- Create: `packages/web/src/components/ErrorBoundary.tsx`
- Modify: `packages/web/src/main.tsx`
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/store.ts`

**Interfaces:**
- Produces: `initWebLogger()` that sends `window.onerror` / `unhandledrejection` to `POST /api/logs`.
- Produces: `<ErrorBoundary>` that logs React errors.

- [ ] **Step 1: Export `request` helper and add `getAppLogs`**

In `packages/web/src/api/client.ts`:

1. Change `async function request<T>` to `export async function request<T>`.
2. Add the import of `AppLogEntry` from `@frigg/shared`.
3. Add:

```ts
export function getAppLogs(limit = 200): Promise<AppLogEntry[]> {
  return request(`/api/logs?limit=${limit}`);
}
```

- [ ] **Step 2: Create web logger**

Create `packages/web/src/logging/web-logger.ts`:

```ts
import { jsonInit, request } from '../api/client';
import type { AppLogEntry, AppLogLevel } from '@frigg/shared';

let initialized = false;

function send(level: AppLogLevel, message: string, error?: Error, metadata?: Record<string, unknown>): void {
  const entry: Partial<AppLogEntry> = {
    level,
    source: 'web',
    context: 'web',
    message,
    error: error
      ? { name: error.name, message: error.message, stack: error.stack }
      : undefined,
    metadata,
  };
  void request('/api/logs', jsonInit('POST', entry)).catch(() => undefined);
}

export function webLog(level: AppLogLevel, message: string, metadata?: Record<string, unknown>): void {
  send(level, message, undefined, metadata);
}

export function webError(message: string, error?: unknown, metadata?: Record<string, unknown>): void {
  const err = error instanceof Error ? error : new Error(String(error));
  send('error', message, err, metadata);
}

export function initWebLogger(): void {
  if (initialized) return;
  initialized = true;

  window.addEventListener('error', (event) => {
    webError('Unhandled window error', event.error, { filename: event.filename, lineno: event.lineno });
  });

  window.addEventListener('unhandledrejection', (event) => {
    webError('Unhandled promise rejection', event.reason);
  });
}
```

- [ ] **Step 2: Create ErrorBoundary**

Create `packages/web/src/components/ErrorBoundary.tsx`:

```ts
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { webError } from '../logging/web-logger';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    webError('React error boundary', error, { componentStack: info.componentStack });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex h-full items-center justify-center text-zinc-400">
          <p>Something went wrong. Check the logs for details.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
```

- [ ] **Step 3: Wrap App with ErrorBoundary**

Modify `packages/web/src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
```

- [ ] **Step 4: Initialize web logger in App**

Modify `packages/web/src/App.tsx`:

```ts
import { initWebLogger } from './logging/web-logger';
```

At the top of the `useEffect` (line 219):

```ts
useEffect(() => {
  initWebLogger();
  // ...existing loads
}, []);
```

- [ ] **Step 5: Handle app-log events in store**

Modify `packages/web/src/store.ts`:

Add state fields after `logFilters`:

```ts
appLogs: AppLogEntry[];
appLogFilters: { minLevel: AppLogLevel | 'ALL'; text: string; source: AppLogSource | 'ALL' };
setAppLogFilters: (patch: Partial<AppState['appLogFilters']>) => void;
loadAppLogs: () => Promise<void>;
```

Import `AppLogEntry` and `AppLogSource` from `@frigg/shared`.

Add to initial state in `create<AppState>((set, get) => ({...}))`:

```ts
appLogs: [],
appLogFilters: { minLevel: 'ALL', text: '', source: 'ALL' },
setAppLogFilters: (patch) => set((s) => ({ appLogFilters: { ...s.appLogFilters, ...patch } })),
loadAppLogs: async () => {
  const entries = await api.getAppLogs();
  set({ appLogs: entries.slice(-5000) });
},
```

Add case in `applyEvent`:

```ts
case 'app-log': {
  set((s) => ({ appLogs: [...s.appLogs, ev.entry].slice(-5000) }));
  break;
}
```

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/logging packages/web/src/components/ErrorBoundary.tsx packages/web/src/main.tsx packages/web/src/App.tsx packages/web/src/store.ts
git commit -m "feat(web): init web logger, ErrorBoundary, and app-log store handling"
```

---

### Task 6: Desktop logger

**Files:**
- Create: `packages/desktop/src/logging/desktop-logger.ts`
- Modify: `packages/desktop/src/main.ts`

**Interfaces:**
- Consumes: `FriggHandles.loggerService` from `@frigg/server`.
- Produces: desktop error handlers that publish to `LoggerService`.

- [ ] **Step 1: Create desktop logger helper**

Create `packages/desktop/src/logging/desktop-logger.ts`:

```ts
import type { AppLogEntry, AppLogLevel } from '@frigg/shared';
import type { LoggerService } from '@frigg/server';

type Sender = (entry: Omit<AppLogEntry, 'timestamp'>) => void;

let sender: Sender | undefined;

export function setDesktopLogService(service: LoggerService): void {
  sender = (entry) => {
    try {
      service.log(entry);
    } catch {
      // ignore
    }
  };
}

export function desktopLog(level: AppLogLevel, context: string, message: string, metadata?: Record<string, unknown>): void {
  sender?.({ level, source: 'desktop', context, message, metadata });
}

export function desktopError(context: string, message: string, error?: unknown, metadata?: Record<string, unknown>): void {
  const err = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : undefined;
  sender?.({ level: 'error', source: 'desktop', context, message, error: err, metadata });
}

export function initDesktopErrorHandlers(): void {
  process.on('uncaughtException', (error) => {
    desktopError('desktop', 'Uncaught exception', error);
  });
  process.on('unhandledRejection', (reason) => {
    desktopError('desktop', 'Unhandled rejection', reason);
  });
}
```

- [ ] **Step 2: Expose LoggerService from server package**

In `packages/server/src/start.ts`, ensure `LoggerService` is exported from `@frigg/server` by adding to `packages/server/src/index.ts`:

```ts
export { LoggerService } from './logging/logger-service.ts';
```

- [ ] **Step 3: Wire desktop logger in main.ts**

Modify `packages/desktop/src/main.ts`:

```ts
import { initDesktopErrorHandlers, setDesktopLogService } from './logging/desktop-logger';
```

In `resolveAppUrl`, after `const frigg = await startFrigg(...)`:

```ts
setDesktopLogService(frigg.loggerService);
```

In `bootstrap()`, at the top:

```ts
async function bootstrap(): Promise<void> {
  ensureToolingOnPath();
  buildMenu();
  initDesktopErrorHandlers();
  // ...existing
}
```

- [ ] **Step 4: Build desktop main**

```bash
cd packages/desktop
npm run build:main
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/desktop/src/logging packages/desktop/src/main.ts packages/server/src/index.ts
git commit -m "feat(desktop): capture desktop errors and publish to LoggerService"
```

---

### Task 7: Logs screen UI

**Files:**
- Create: `packages/web/src/screens/LogsScreen.tsx`
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/i18n/` (add translation keys)

**Interfaces:**
- Consumes: `appLogs`, `appLogFilters`, `setAppLogFilters` from store.

- [ ] **Step 1: Create LogsScreen component**

Create `packages/web/src/screens/LogsScreen.tsx`:

```tsx
import { useEffect, useMemo } from 'react';
import { useAppStore } from '../store';
import { useT } from '../i18n';
import type { AppLogLevel, AppLogSource } from '@frigg/shared';

const LEVEL_COLORS: Record<AppLogLevel, string> = {
  debug: 'text-zinc-500',
  info: 'text-blue-400',
  warn: 'text-amber-400',
  error: 'text-rose-400',
  fatal: 'text-rose-500 font-bold',
};

export default function LogsScreen(): JSX.Element {
  const logs = useAppStore((s) => s.appLogs);
  const filters = useAppStore((s) => s.appLogFilters);
  const setFilters = useAppStore((s) => s.setAppLogFilters);
  const loadAppLogs = useAppStore((s) => s.loadAppLogs);
  const t = useT();

  useEffect(() => {
    void loadAppLogs().catch(() => undefined);
  }, [loadAppLogs]);

  const filtered = useMemo(() => {
    const minRank: Record<AppLogLevel | 'ALL', number> = {
      ALL: 0,
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
      fatal: 4,
    };
    const rank: Record<AppLogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3, fatal: 4 };
    const text = filters.text.toLowerCase();
    return logs.filter((log) => {
      if (filters.minLevel !== 'ALL' && rank[log.level] < minRank[filters.minLevel]) return false;
      if (filters.source !== 'ALL' && log.source !== filters.source) return false;
      if (text) {
        const hay = `${log.message} ${log.context ?? ''} ${log.error?.message ?? ''}`.toLowerCase();
        if (!hay.includes(text)) return false;
      }
      return true;
    });
  }, [logs, filters]);

  return (
    <div className="flex h-full flex-col bg-zinc-950">
      <div className="flex items-center gap-3 border-b border-zinc-800/80 px-4 py-2">
        <select
          value={filters.minLevel}
          onChange={(e) => setFilters({ minLevel: e.target.value as AppLogLevel | 'ALL' })}
          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
        >
          <option value="ALL">All levels</option>
          <option value="debug">Debug</option>
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
          <option value="fatal">Fatal</option>
        </select>
        <select
          value={filters.source}
          onChange={(e) => setFilters({ source: e.target.value as AppLogSource | 'ALL' })}
          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
        >
          <option value="ALL">All sources</option>
          <option value="server">Server</option>
          <option value="desktop">Desktop</option>
          <option value="web">Web</option>
        </select>
        <input
          type="text"
          placeholder="Search..."
          value={filters.text}
          onChange={(e) => setFilters({ text: e.target.value })}
          className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
        />
        <span className="text-xs text-zinc-500">{filtered.length} entries</span>
      </div>
      <div className="flex-1 overflow-auto font-mono text-xs">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-zinc-900 text-zinc-400">
            <tr>
              <th className="px-3 py-1">Time</th>
              <th className="px-3 py-1">Level</th>
              <th className="px-3 py-1">Source</th>
              <th className="px-3 py-1">Context</th>
              <th className="px-3 py-1">Message</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((log, i) => (
              <tr key={i} className="border-b border-zinc-900/50 hover:bg-zinc-900/30">
                <td className="px-3 py-1 text-zinc-500">{new Date(log.timestamp).toLocaleTimeString()}</td>
                <td className={`px-3 py-1 ${LEVEL_COLORS[log.level]}`}>{log.level}</td>
                <td className="px-3 py-1 text-zinc-400">{log.source}</td>
                <td className="px-3 py-1 text-zinc-400">{log.context ?? '—'}</td>
                <td className="px-3 py-1 text-zinc-300">
                  {log.message}
                  {log.error && <div className="mt-1 text-rose-400">{log.error.message}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add logs screen to navigation**

Modify `packages/web/src/App.tsx`:

```ts
import LogsScreen from './screens/LogsScreen';
```

Add `'logs'` to `Screen` type in `store.ts`:

```ts
export type Screen = 'traffic' | 'mocks' | 'devices' | 'logcat' | 'database' | 'client' | 'mcp' | 'sql' | 'frida' | 'logs';
```

Add icon function (or reuse `TerminalIcon`) and add to `NAV_ITEMS`:

```ts
{ screen: 'logs', labelKey: 'nav.logs', icon: <TerminalIcon /> },
```

Add render branch:

```tsx
} : screen === 'logs' ? (
  <LogsScreen />
) : (
  <DevicesScreen />
)
```

- [ ] **Step 3: Add i18n keys**

Add to `packages/web/src/i18n/index.ts` or locale JSON files:

```ts
nav: {
  logs: 'Logs',
}
```

and Portuguese equivalent:

```ts
nav: {
  logs: 'Logs',
}
```

- [ ] **Step 4: Build web**

```bash
cd packages/web
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/screens/LogsScreen.tsx packages/web/src/App.tsx packages/web/src/store.ts packages/web/src/i18n
git commit -m "feat(web): add Logs screen with live stream and filters"
```

---

### Task 8: Migrate existing console.log/console.error calls

**Files:**
- Modify: `packages/server/src/start.ts`
- Modify: `packages/server/src/api/router.ts`
- Modify: `packages/desktop/src/main.ts`
- Modify: `packages/server/src/frida/examples.ts`

**Interfaces:**
- Consumes: `LoggerService` / `createLogger`.

- [ ] **Step 1: Replace server start.ts console.error**

In `packages/server/src/start.ts`, line 168:

```ts
httpServer.on('error', (error) => {
  loggerService.error('server', 'http-server', 'HTTP server error', error);
});
```

- [ ] **Step 2: Replace router 500 error log**

In `packages/server/src/api/router.ts` around line 1297, change:

```ts
console.error('API error:', error);
```

To:

```ts
deps.loggerService.error('server', 'api-router', 'API error', error instanceof Error ? error : new Error(String(error)));
```

- [ ] **Step 3: Replace desktop shutdown error log**

In `packages/desktop/src/main.ts`, line 181:

```ts
.catch((error) => {
  desktopError('desktop', 'Shutdown error', error);
})
```

- [ ] **Step 4: Replace Frida example console.log**

In `packages/server/src/frida/examples.ts`, keep `console.log` inside example scripts if they are user-facing Frida payloads. Otherwise replace with `loggerService.debug('server', 'frida-examples', ...)` if appropriate.

- [ ] **Step 5: Build all affected packages**

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/start.ts packages/server/src/api/router.ts packages/desktop/src/main.ts
git commit -m "chore: migrate existing console logging to LoggerService"
```

---

### Task 9: Tests

**Files:**
- Create: `packages/server/test/logs-router.test.ts`
- Modify: `packages/server/test/logger-service.test.ts` (add cases)

- [ ] **Step 1: Expand LoggerService tests**

Add to `packages/server/test/logger-service.test.ts`:

```ts
it('queries by level', async () => {
  service.info('server', 'a', 'info msg');
  service.error('server', 'a', 'error msg');
  const entries = await service.query({ level: 'error' });
  expect(entries).toHaveLength(1);
  expect(entries[0]!.message).toBe('error msg');
});

it('rotates files daily', () => {
  // Mocking dates is acceptable; test that two different UTC days create two files.
  const d1 = new Date('2026-07-24T12:00:00Z');
  const d2 = new Date('2026-07-25T12:00:00Z');
  service.log({ level: 'info', source: 'server', context: 't', message: 'day1', timestamp: d1.toISOString() });
  service.log({ level: 'info', source: 'server', context: 't', message: 'day2', timestamp: d2.toISOString() });
  const files = fs.readdirSync(tmpDir);
  expect(files).toHaveLength(2);
});
```

- [ ] **Step 2: Add router integration tests**

Create `packages/server/test/logs-router.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { buildRouter, type ApiDeps } from '../src/api/router.ts';
import { LoggerService } from '../src/logging/logger-service.ts';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function stubDeps(loggerService: LoggerService): ApiDeps {
  return {
    traffic: {} as ApiDeps['traffic'],
    mocks: {} as ApiDeps['mocks'],
    ca: {} as ApiDeps['ca'],
    proxyPort: 0,
    apiPort: 0,
    logcat: {} as ApiDeps['logcat'],
    db: {} as ApiDeps['db'],
    apiClient: {} as ApiDeps['apiClient'],
    breakpoints: {} as ApiDeps['breakpoints'],
    proxyCerts: {} as ApiDeps['proxyCerts'],
    sql: {} as ApiDeps['sql'],
    sqlConnections: {} as ApiDeps['sqlConnections'],
    frida: {} as ApiDeps['frida'],
    certTrust: {} as ApiDeps['certTrust'],
    reloadProxy: async () => {},
    loggerService,
  };
}

describe('GET /api/logs', () => {
  it('returns empty array when no logs', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frigg-logs-'));
    const loggerService = new LoggerService(tmpDir);
    const app = express();
    app.use(express.json());
    app.use(buildRouter(stubDeps(loggerService)));
    const res = await request(app).get('/api/logs');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    loggerService.dispose();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns persisted logs', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frigg-logs-'));
    const loggerService = new LoggerService(tmpDir);
    loggerService.info('server', 'test', 'hello');
    const app = express();
    app.use(express.json());
    app.use(buildRouter(stubDeps(loggerService)));
    const res = await request(app).get('/api/logs');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].message).toBe('hello');
    loggerService.dispose();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 3: Install supertest if needed**

Check if `supertest` is already in `packages/server/package.json`. If not:

```bash
cd packages/server
npm install --save-dev supertest @types/supertest
```

- [ ] **Step 4: Run tests**

```bash
cd packages/server
npx vitest run
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/test packages/server/package.json package-lock.json
git commit -m "test(server): add LoggerService and /api/logs tests"
```

---

## Self-Review

**Spec coverage:**
- Local temporary storage → Task 2 (`~/.frigg/logs/`, JSONL, rotation).
- Real-time UI → Tasks 4 and 7 (WebSocket broadcast + LogsScreen).
- Server/desktop/web coverage → Tasks 3, 5, 6.
- Crash capture → Tasks 3, 5, 6 (`uncaughtException`, `unhandledRejection`, ErrorBoundary).
- No HTTP traffic logging → Privacidade section and implementation choices.
- 7-day retention → Task 2 `cleanupOldFiles`.

**Placeholder scan:**
- No TBD/TODO/"implement later" remain.
- Every step includes code or exact command.

**Type consistency:**
- `AppLogEntry` used throughout.
- `ServerEvent` includes `AppLogEvent`.
- `LoggerService` methods match usage in all tasks.

**Potential issue:** `supertest` may need to be added as dev dependency. Task 9 covers this.

**Potential issue:** `App.tsx` uses translated keys; Task 7 includes i18n additions.
