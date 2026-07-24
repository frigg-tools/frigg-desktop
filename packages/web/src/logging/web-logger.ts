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
