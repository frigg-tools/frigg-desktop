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

  it('filters by level', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frigg-logs-'));
    const loggerService = new LoggerService(tmpDir);
    loggerService.info('server', 'test', 'info');
    loggerService.error('server', 'test', 'error');
    const app = express();
    app.use(express.json());
    app.use(buildRouter(stubDeps(loggerService)));
    const res = await request(app).get('/api/logs?level=error');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].message).toBe('error');
    loggerService.dispose();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe('POST /api/logs', () => {
  it('accepts a log entry from the web', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frigg-logs-'));
    const loggerService = new LoggerService(tmpDir);
    const app = express();
    app.use(express.json());
    app.use(buildRouter(stubDeps(loggerService)));
    const res = await request(app).post('/api/logs').send({ message: 'from-web' });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('from-web');
    expect(res.body.source).toBe('web');
    loggerService.dispose();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
