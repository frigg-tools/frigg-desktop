import { createReadStream, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
