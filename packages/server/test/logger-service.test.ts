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

  it('queries by level', async () => {
    service.info('server', 'a', 'info msg');
    service.error('server', 'a', 'error msg');
    const entries = await service.query({ level: 'error' });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.message).toBe('error msg');
  });

  it('queries by source', async () => {
    service.info('server', 'a', 'server msg');
    service.info('web', 'a', 'web msg');
    const entries = await service.query({ source: 'web' });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.message).toBe('web msg');
  });

  it('queries by text', async () => {
    service.info('server', 'ctx', 'alpha');
    service.info('server', 'ctx', 'beta');
    const entries = await service.query({ q: 'bet' });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.message).toBe('beta');
  });

  it('rotates files daily', () => {
    service.log({
      level: 'info',
      source: 'server',
      context: 't',
      message: 'day1',
      timestamp: new Date('2026-07-24T12:00:00Z').toISOString(),
    });
    service.log({
      level: 'info',
      source: 'server',
      context: 't',
      message: 'day2',
      timestamp: new Date('2026-07-25T12:00:00Z').toISOString(),
    });
    const files = fs.readdirSync(tmpDir);
    expect(files).toHaveLength(2);
  });

  it('notifies listeners', () => {
    const received: unknown[] = [];
    const unsubscribe = service.onLog((entry) => received.push(entry));
    service.info('server', 'a', 'event');
    unsubscribe();
    service.info('server', 'a', 'ignored');
    expect(received).toHaveLength(1);
    expect((received[0] as { message: string }).message).toBe('event');
  });

  it('serializes errors', () => {
    const error = new Error('boom');
    service.error('server', 'a', 'failed', error);
    const files = fs.readdirSync(tmpDir);
    const content = fs.readFileSync(path.join(tmpDir, files[0]!), 'utf8');
    const entry = JSON.parse(content.trim());
    expect(entry.error).toMatchObject({ name: 'Error', message: 'boom' });
    expect(typeof entry.error.stack).toBe('string');
  });
});
