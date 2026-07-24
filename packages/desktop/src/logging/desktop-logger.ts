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

function logToConsole(entry: Omit<AppLogEntry, 'timestamp'>): void {
  const consoleMethod = entry.level === 'debug' || entry.level === 'info' ? console.log : console.error;
  consoleMethod(`[${entry.level.toUpperCase()}] ${entry.context}: ${entry.message}`, entry);
}

export function desktopLog(level: AppLogLevel, context: string, message: string, metadata?: Record<string, unknown>): void {
  const entry: Omit<AppLogEntry, 'timestamp'> = { level, source: 'desktop', context, message, metadata };
  if (sender) {
    sender(entry);
  } else {
    logToConsole(entry);
  }
}

export function desktopError(context: string, message: string, error?: unknown, metadata?: Record<string, unknown>): void {
  const err = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : undefined;
  const entry: Omit<AppLogEntry, 'timestamp'> = { level: 'error', source: 'desktop', context, message, error: err, metadata };
  if (sender) {
    sender(entry);
  } else {
    logToConsole(entry);
  }
}

export function initDesktopErrorHandlers(): void {
  process.on('uncaughtException', (error) => {
    desktopError('desktop', 'Uncaught exception', error);
  });
  process.on('unhandledRejection', (reason) => {
    desktopError('desktop', 'Unhandled rejection', reason);
  });
}
