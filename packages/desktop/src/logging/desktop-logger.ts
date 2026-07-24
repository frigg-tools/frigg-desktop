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

export function desktopLog(level: AppLogLevel, context: string, message: string, metadata?: Record<string, unknown>): void {
  sender?.({ level, source: 'desktop', context, message, metadata });
}

export function desktopError(context: string, message: string, error?: unknown, metadata?: Record<string, unknown>): void {
  const err = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : undefined;
  sender?.({ level: 'error', source: 'desktop', context, message, error: err, metadata });
}

export function initDesktopErrorHandlers(): void {
  process.on('uncaughtException', (error) => {
    desktopError('desktop', 'Uncaught exception', error);
  });
  process.on('unhandledRejection', (reason) => {
    desktopError('desktop', 'Unhandled rejection', reason);
  });
}
