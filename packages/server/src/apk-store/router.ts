import { Router, type Request, type Response } from 'express';
import { APK_STORE_MAX_FILE_BYTES } from '@frigg/shared';
import { localUiAccessMiddleware } from '../lib/local-ui-access.ts';
import { ApkStore, ApkStoreError } from './store.ts';
import { createApkInstaller } from './install.ts';

interface ApkStoreRouterOptions {
  store: ApkStore;
  apiPort: () => number;
  configuredUiPort: number;
}

function queryString(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === 'string' ? value : undefined;
}

function sendError(res: Response, error: unknown): void {
  const statusCode = error instanceof ApkStoreError ? error.statusCode : 500;
  const message = error instanceof Error && error.message !== '' ? error.message : 'APK Store request failed.';
  res.status(statusCode).json({ error: message });
}

function discardUnreadBody(req: Request): void {
  if (!req.destroyed && !req.readableEnded) req.resume();
}

export function buildApkStoreRouter(options: ApkStoreRouterOptions) {
  const router = Router();
  const requireLocalUi = localUiAccessMiddleware(
    { apiPort: options.apiPort, configuredUiPort: options.configuredUiPort },
    'APK Store routes are available only to the local Frigg UI and loopback tools.',
  );
  const install = createApkInstaller(options.store);

  router.get('/api/apk-store', requireLocalUi, (_req, res) => {
    res.json(options.store.list());
  });

  router.post('/api/apk-store', requireLocalUi, async (req, res) => {
    if (!req.is('application/octet-stream')) {
      res.status(415).json({ error: 'APK upload must use application/octet-stream.' });
      discardUnreadBody(req);
      return;
    }
    const contentLength = req.header('content-length');
    if (contentLength !== undefined && Number(contentLength) > APK_STORE_MAX_FILE_BYTES) {
      res.status(413).json({ error: 'APK files must be 1 GiB or smaller.' });
      req.resume();
      return;
    }
    try {
      const entry = await options.store.import(req, {
        fileName: queryString(req, 'fileName') ?? '',
        name: queryString(req, 'name'),
        description: queryString(req, 'description'),
      });
      res.status(201).json(entry);
    } catch (error) {
      sendError(res, error);
      discardUnreadBody(req);
    }
  });

  router.delete('/api/apk-store/:id', requireLocalUi, async (req, res) => {
    try {
      await options.store.delete(req.params.id);
      res.json({ ok: true });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/api/apk-store/:id/install', requireLocalUi, async (req, res) => {
    const serial = typeof req.body?.serial === 'string' ? req.body.serial : '';
    if (!serial.trim()) {
      res.status(400).json({ error: 'A connected Android device serial is required.' });
      return;
    }
    try {
      res.json(await install(req.params.id, serial));
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}
