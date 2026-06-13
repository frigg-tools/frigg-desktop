import { existsSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { DEFAULT_API_PORT, DEFAULT_PROXY_PORT } from '@frigg/shared';
import type { ServerEvent } from '@frigg/shared';
import { buildRouter } from './api/router.ts';
import { WsHub } from './api/ws.ts';
import { getLanIp } from './lib/net.ts';
import { ensureFriggDirs, mocksPath } from './lib/paths.ts';
import { MockStore } from './mocks/store.ts';
import { ensureCa } from './proxy/ca.ts';
import { ProxyEngine } from './proxy/engine.ts';
import { TrafficStore } from './proxy/traffic-store.ts';

function portFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65536 ? parsed : fallback;
}

function registerWebUi(app: express.Express): boolean {
  const webDistDir = fileURLToPath(new URL('../../web/dist', import.meta.url));
  if (!existsSync(webDistDir)) return false;
  const indexHtmlPath = path.join(webDistDir, 'index.html');
  app.use(express.static(webDistDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      next();
      return;
    }
    res.sendFile(indexHtmlPath);
  });
  return true;
}

function printBanner(opts: {
  apiPort: number;
  proxyPort: number;
  lanIp: string | null;
  fingerprint: string;
  webUiAvailable: boolean;
}): void {
  const proxyHost = opts.lanIp ?? 'localhost';
  const uiLine = opts.webUiAvailable
    ? `  UI           http://localhost:${opts.apiPort}`
    : `  UI           http://localhost:${opts.apiPort} (web build missing — run the web dev server)`;
  console.log(
    [
      '',
      '  Frigg is running',
      '',
      uiLine,
      `  Proxy        ${proxyHost}:${opts.proxyPort}`,
      `  Setup page   http://${proxyHost}:${opts.apiPort}/setup`,
      `  CA SHA-256   ${opts.fingerprint}`,
      '',
    ].join('\n'),
  );
}

async function main(): Promise<void> {
  const proxyPort = portFromEnv('FRIGG_PROXY_PORT', DEFAULT_PROXY_PORT);
  const apiPort = portFromEnv('FRIGG_API_PORT', DEFAULT_API_PORT);

  ensureFriggDirs();
  const ca = await ensureCa();
  const mocks = await MockStore.load(mocksPath);
  const traffic = new TrafficStore();

  const engine = new ProxyEngine({ proxyPort, ca, mocks, traffic });
  await engine.start();

  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use(buildRouter({ traffic, mocks, ca, proxyPort, apiPort }));
  const webUiAvailable = registerWebUi(app);

  const httpServer = http.createServer(app);
  const hub = new WsHub(httpServer, '/ws');
  traffic.on('event', (ev: ServerEvent) => hub.broadcast(ev));
  mocks.on('event', (ev: ServerEvent) => hub.broadcast(ev));

  await new Promise<void>((resolve) => {
    httpServer.listen(apiPort, resolve);
  });

  printBanner({ apiPort, proxyPort, lanIp: getLanIp(), fingerprint: ca.fingerprint, webUiAvailable });

  process.on('SIGINT', () => {
    void Promise.allSettled([engine.stop(), mocks.flush()]).then(() => {
      process.exit(0);
    });
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
