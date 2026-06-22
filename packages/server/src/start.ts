import { existsSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { DEFAULT_API_PORT, DEFAULT_PROXY_PORT } from '@frigg/shared';
import type { ServerEvent } from '@frigg/shared';
import { ApiClientStore } from './api-client/store.ts';
import { buildRouter } from './api/router.ts';
import { WsHub } from './api/ws.ts';
import { DbInspector } from './db/index.ts';
import { disableMacProxyIfEnabledByFrigg } from './devices/macos-proxy.ts';
import { getLanIp } from './lib/net.ts';
import {
  apiClientPath,
  ensureFriggDirs,
  mocksPath,
  proxyCertsPath,
  sqlConnectionsPath,
  sqlSecretKeyPath,
  sqlSecretsPath,
} from './lib/paths.ts';
import { LogcatManager } from './logcat/index.ts';
import { MockStore } from './mocks/store.ts';
import { BreakpointManager } from './proxy/breakpoint-manager.ts';
import { ensureCa } from './proxy/ca.ts';
import { ProxyEngine } from './proxy/engine.ts';
import { ProxyCertStore } from './proxy/proxy-cert-store.ts';
import { TrafficStore } from './proxy/traffic-store.ts';
import {
  createFileSecretBox,
  SqlConnectionStore,
  SqlManager,
  SqlSecretStore,
  type SecretBox,
} from './sql/index.ts';

export interface StartFriggOptions {
  proxyPort?: number;
  apiPort?: number;
  webDir?: string;
  secretBox?: SecretBox;
}

export interface FriggHandles {
  apiPort: number;
  proxyPort: number;
  lanIp: string | null;
  fingerprint: string;
  uiUrl: string;
  setupUrl: string;
  webUiAvailable: boolean;
  stop: () => Promise<void>;
}

function defaultWebDistDir(): string {
  return fileURLToPath(new URL('../../web/dist', import.meta.url));
}

function registerWebUi(app: express.Express, webDir: string): boolean {
  const webDistDir = webDir;
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

export async function startFrigg(options: StartFriggOptions = {}): Promise<FriggHandles> {
  const proxyPort = options.proxyPort ?? DEFAULT_PROXY_PORT;
  const apiPort = options.apiPort ?? DEFAULT_API_PORT;

  ensureFriggDirs();
  const ca = await ensureCa();
  const mocks = await MockStore.load(mocksPath);
  const traffic = new TrafficStore();
  const breakpoints = new BreakpointManager();
  const proxyCerts = await ProxyCertStore.load(proxyCertsPath);

  const engine = new ProxyEngine({ proxyPort, ca, mocks, traffic, breakpoints, proxyCerts });
  await engine.start();

  const logcat = new LogcatManager();
  const db = new DbInspector();
  const apiClient = await ApiClientStore.load(apiClientPath);

  const secretBox = options.secretBox ?? createFileSecretBox(sqlSecretKeyPath);
  const sqlSecrets = await SqlSecretStore.load(sqlSecretsPath, secretBox);
  const sqlConnections = await SqlConnectionStore.load(sqlConnectionsPath);
  sqlConnections.setHasPassword((id) => sqlSecrets.has(id));
  const sql = new SqlManager(sqlConnections, sqlSecrets);

  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use(
    buildRouter({
      traffic,
      mocks,
      ca,
      proxyPort,
      apiPort,
      logcat,
      db,
      apiClient,
      breakpoints,
      proxyCerts,
      sql,
      sqlConnections,
      reloadProxy: () => engine.reload(),
    }),
  );
  const webUiAvailable = registerWebUi(app, options.webDir ?? defaultWebDistDir());

  const httpServer = http.createServer(app);
  const hub = new WsHub(httpServer, '/ws');
  traffic.on('event', (ev: ServerEvent) => hub.broadcast(ev));
  mocks.on('event', (ev: ServerEvent) => hub.broadcast(ev));
  logcat.on('event', (ev: ServerEvent) => hub.broadcast(ev));
  breakpoints.on('event', (ev: ServerEvent) => hub.broadcast(ev));
  sqlConnections.on('event', (ev: ServerEvent) => hub.broadcast(ev));

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(apiPort, () => {
      httpServer.off('error', reject);
      httpServer.on('error', (error) => console.error(`HTTP server error: ${error.message}`));
      resolve();
    });
  });

  const lanIp = getLanIp();
  const host = lanIp ?? 'localhost';

  const stop = async (): Promise<void> => {
    await Promise.allSettled([
      engine.stop(),
      mocks.flush(),
      apiClient.flush(),
      proxyCerts.flush(),
      logcat.stop(),
      db.dispose(),
      sqlConnections.flush(),
      sql.disposeAll(),
      disableMacProxyIfEnabledByFrigg(),
    ]);
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  };

  return {
    apiPort,
    proxyPort,
    lanIp,
    fingerprint: ca.fingerprint,
    uiUrl: `http://localhost:${apiPort}`,
    setupUrl: `http://${host}:${apiPort}/setup`,
    webUiAvailable,
    stop,
  };
}
