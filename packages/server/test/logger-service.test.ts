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
