import type { AppLogEntry, AppLogSource } from '@frigg/shared';
import { LoggerService } from './logger-service.ts';

export interface Logger {
  debug(message: string, metadata?: Record<string, unknown>): AppLogEntry;
  info(message: string, metadata?: Record<string, unknown>): AppLogEntry;
  warn(message: string, metadata?: Record<string, unknown>): AppLogEntry;
  error(message: string, error?: unknown, metadata?: Record<string, unknown>): AppLogEntry;
  fatal(message: string, error?: unknown, metadata?: Record<string, unknown>): AppLogEntry;
}

export function createLogger(service: LoggerService, source: AppLogSource, context: string): Logger {
  return {
    debug: (message, metadata) => service.debug(source, context, message, metadata),
    info: (message, metadata) => service.info(source, context, message, metadata),
    warn: (message, metadata) => service.warn(source, context, message, metadata),
    error: (message, error, metadata) => service.error(source, context, message, error, metadata),
    fatal: (message, error, metadata) => service.fatal(source, context, message, error, metadata),
  };
}
