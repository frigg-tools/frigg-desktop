import { existsSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { DEFAULT_API_PORT, DEFAULT_PROXY_PORT } from '@frigg/shared';
import type { ServerEvent, AppLogEvent } from '@frigg/shared';
import { ApiClientStore } from './api-client/store.ts';
import { buildRouter, type ApiDeps } from './api/router.ts';
import { WsHub } from './api/ws.ts';
import { DbInspector } from './db/index.ts';
import { disableMacProxyIfEnabledByFrigg } from './devices/macos-proxy.ts';
import { DeviceWatcher } from './devices/device-watcher.ts';
import { getLanIp } from './lib/net.ts';
import {
  apiClientPath,
  androidProxiesPath,
  ensureFriggDirs,
  logsPath,
  mocksPath,
  automationsPath,
  automationRunsPath,
  automationReferencesPath,
  proxyCertsPath,
  sqlConnectionsPath,
  sqlSecretKeyPath,
  sqlSecretsPath,
} from './lib/paths.ts';
import { LoggerService } from './logging/logger-service.ts';
import { FridaManager } from './frida/index.ts';
import { LogcatManager } from './logcat/index.ts';
import { MockStore } from './mocks/store.ts';
import { BreakpointManager } from './proxy/breakpoint-manager.ts';
import { ensureCa } from './proxy/ca.ts';
import { ProxyEngine } from './proxy/engine.ts';
import { ProxyCertStore } from './proxy/proxy-cert-store.ts';
import { TrafficStore } from './proxy/traffic-store.ts';
import { CertTrustTracker } from './devices/cert-trust-tracker.ts';
import { teardownAndroidProxiesPointingAt } from './devices/android.ts';
import { restoreTrackedAndroidProxies } from './devices/android.ts';
import { AndroidProxyRegistry } from './devices/android-proxy-registry.ts';
import {
  createFileSecretBox,
  SqlConnectionStore,
  SqlManager,
  SqlSecretStore,
  type SecretBox,
} from './sql/index.ts';
import { AutomationStore } from './automation/store.ts';
import { AutomationRunStore } from './automation/run-store.ts';
import { AutomationReferenceStore } from './automation/reference-store.ts';
import { AutomationManager } from './automation/manager.ts';
import { AndroidAutomationDevice } from './automation/adb.ts';

export interface StartFriggOptions {
  proxyPort?: number;
  apiPort?: number;
  webDir?: string;
  uiPort?: number;
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
  loggerService: LoggerService;
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

function listenWithFallback(server: http.Server, preferredPort: number): Promise<number> {
  const tryListen = (port: number): Promise<number> =>
    new Promise((resolve, reject) => {
      const onError = (error: NodeJS.ErrnoException) => {
        server.off('error', onError);
        reject(error);
      };
      server.once('error', onError);
      server.listen(port, () => {
        server.off('error', onError);
        const address = server.address();
        resolve(typeof address === 'object' && address !== null ? address.port : port);
      });
    });
  return tryListen(preferredPort).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'EADDRINUSE') throw error;
    return tryListen(0);
  });
}

export async function startFrigg(options: StartFriggOptions = {}): Promise<FriggHandles> {
  const proxyPort = options.proxyPort ?? DEFAULT_PROXY_PORT;
  const apiPort = options.apiPort ?? DEFAULT_API_PORT;

  ensureFriggDirs();
  const loggerService = new LoggerService(logsPath());
  const ca = await ensureCa();
  const mocks = await MockStore.load(mocksPath);
  const traffic = new TrafficStore();
  const certTrust = new CertTrustTracker();
  const breakpoints = new BreakpointManager();
  const proxyCerts = await ProxyCertStore.load(proxyCertsPath);
  let automationManagerForGuard: AutomationManager | undefined;
  const automations = await AutomationStore.load(automationsPath, {
    isActive: (automationId) => automationManagerForGuard?.isActive(automationId) ?? false,
  });
  const automationRuns = await AutomationRunStore.load(automationRunsPath);
  const automationReferences = await AutomationReferenceStore.load(automationReferencesPath);
  const automationDevice = new AndroidAutomationDevice();
  const automationManager = new AutomationManager({
    automations,
    runs: automationRuns,
    device: automationDevice,
  });
  automationManagerForGuard = automationManager;
  await automationManager.initialize();

  const engine = new ProxyEngine({ proxyPort, ca, mocks, traffic, breakpoints, proxyCerts });
  await engine.start();
  const actualProxyPort = engine.port;

  const logcat = new LogcatManager();
  const db = new DbInspector();
  const apiClient = await ApiClientStore.load(apiClientPath);
  const androidProxyRegistry = await AndroidProxyRegistry.load(androidProxiesPath);
  const frida = new FridaManager();
  const deviceWatcher = new DeviceWatcher();

  const secretBox = options.secretBox ?? createFileSecretBox(sqlSecretKeyPath);
  const sqlSecrets = await SqlSecretStore.load(sqlSecretsPath, secretBox);
  const sqlConnections = await SqlConnectionStore.load(sqlConnectionsPath);
  sqlConnections.setHasPassword((id) => sqlSecrets.has(id));
  const sql = new SqlManager(sqlConnections, sqlSecrets);

  const deps: ApiDeps = {
    traffic,
    mocks,
    ca,
    proxyPort: actualProxyPort,
    apiPort,
    logcat,
    loggerService,
    db,
    apiClient,
    breakpoints,
    proxyCerts,
    sql,
    sqlConnections,
    frida,
    certTrust,
    androidProxyRegistry,
    reloadProxy: () => engine.reload(),
    automation: {
      automations,
      runs: automationRuns,
      references: automationReferences,
      manager: automationManager,
      device: automationDevice,
      configuredUiPort: options.uiPort ?? 5173,
    },
  };

  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use(buildRouter(deps));
  const webUiAvailable = registerWebUi(app, options.webDir ?? defaultWebDistDir());

  const httpServer = http.createServer(app);
  const hub = new WsHub(httpServer, '/ws');
  traffic.on('event', (ev: ServerEvent) => hub.broadcast(ev));
  traffic.on('event', (ev: ServerEvent) => {
    if (ev.type === 'request' && ev.exchange.request.protocol === 'https') {
      certTrust.recordDecryptedHttps(ev.exchange.request.clientAddress, Date.now());
    }
  });
  mocks.on('event', (ev: ServerEvent) => hub.broadcast(ev));
  logcat.on('event', (ev: ServerEvent) => hub.broadcast(ev));
  breakpoints.on('event', (ev: ServerEvent) => hub.broadcast(ev));
  sqlConnections.on('event', (ev: ServerEvent) => hub.broadcast(ev));
  frida.on('event', (ev: ServerEvent) => hub.broadcast(ev));
  deviceWatcher.on('event', (ev: ServerEvent) => hub.broadcast(ev));
  loggerService.onLog((entry) => {
    const event: AppLogEvent = { type: 'app-log', entry };
    hub.broadcast(event);
  });
  const actualApiPort = await listenWithFallback(httpServer, apiPort);
  deps.apiPort = actualApiPort;
  httpServer.on('error', (error) => {
    loggerService.error('server', 'http-server', 'HTTP server error', error);
  });

  const lanIp = getLanIp();
  const host = lanIp ?? 'localhost';
  const friggProxyAddresses = [lanIp === null ? null : `${lanIp}:${actualProxyPort}`, `10.0.2.2:${actualProxyPort}`]
    .filter((address): address is string => address !== null);

  let proxyCleanupInFlight: Promise<void> | null = null;
  const reconcileAndroidProxies = (includeLegacy = false, includeActive = false): Promise<void> => {
    if (proxyCleanupInFlight !== null) return proxyCleanupInFlight;
    const cleanup = (async () => {
      const tracked = await restoreTrackedAndroidProxies(androidProxyRegistry, { includeActive });
      for (const failure of tracked.failures) {
        loggerService.warn('server', 'android-proxy-cleanup', 'Could not restore the Android proxy setting.', failure);
      }
      if (includeLegacy) {
        const legacyFailures = await teardownAndroidProxiesPointingAt(
          friggProxyAddresses,
          'en',
          new Set(tracked.handledSerials),
        );
        for (const failure of legacyFailures) {
          loggerService.warn('server', 'android-proxy-cleanup', 'Could not remove an untracked Frigg proxy setting.', failure);
        }
      }
    })().catch((error: unknown) => {
      loggerService.warn('server', 'android-proxy-cleanup', 'Android proxy cleanup could not complete.', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
    proxyCleanupInFlight = cleanup.finally(() => {
      proxyCleanupInFlight = null;
    });
    return proxyCleanupInFlight;
  };

  deviceWatcher.on('event', (event: ServerEvent) => {
    if (event.type === 'devices-updated') void reconcileAndroidProxies();
  });
  void reconcileAndroidProxies(true);
  deviceWatcher.start();

  const stop = async (): Promise<void> => {
    await automationManager.shutdown();
    deviceWatcher.dispose();
    await proxyCleanupInFlight;
    await reconcileAndroidProxies(true, true);
    await Promise.allSettled([
      engine.stop(),
      mocks.flush(),
      apiClient.flush(),
      proxyCerts.flush(),
      logcat.stop(),
      db.dispose(),
      sqlConnections.flush(),
      sql.disposeAll(),
      frida.stop(),
      disableMacProxyIfEnabledByFrigg(),
      androidProxyRegistry.flush(),
    ]);
    loggerService.dispose();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  };

  return {
    apiPort: actualApiPort,
    proxyPort: actualProxyPort,
    lanIp,
    fingerprint: ca.fingerprint,
    uiUrl: `http://localhost:${actualApiPort}`,
    setupUrl: `http://${host}:${actualApiPort}/setup`,
    webUiAvailable,
    loggerService,
    stop,
  };
}
