import type { LogEntry, LogLevel } from '@frigg/shared';

const compactLinePattern =
  /^(\d{2}:\d{2}:\d{2}\.\d+)\s+(\S+)\s+(\S+)\s+(.*)$/;

const levelKeywords: Record<string, LogLevel> = {
  default: 'I',
  info: 'I',
  notice: 'I',
  debug: 'D',
  error: 'E',
  fault: 'F',
};

const compactTypeCodes: Record<string, LogLevel> = {
  Df: 'D',
  I: 'I',
  Default: 'I',
  Error: 'E',
  Err: 'E',
  Fault: 'F',
  Ft: 'F',
};

function levelFromType(typeToken: string): LogLevel {
  if (typeToken in compactTypeCodes) return compactTypeCodes[typeToken];
  const lower = typeToken.toLowerCase();
  return levelKeywords[lower] ?? 'I';
}

function isHeaderLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed === '') return true;
  if (trimmed.startsWith('Filtering the log data')) return true;
  if (trimmed.startsWith('Timestamp')) return true;
  if (trimmed.startsWith('---')) return true;
  return false;
}

function extractTag(remainder: string): string {
  const bracket = /^\[([^\]]+)\]/.exec(remainder);
  if (bracket !== null) return bracket[1].trim();
  const processColon = /^([^\s:]+):/.exec(remainder);
  if (processColon !== null) return processColon[1].trim();
  const firstToken = remainder.split(/\s+/)[0];
  return firstToken ?? '';
}

function messageAfterTag(remainder: string, tag: string): string {
  if (remainder.startsWith(`[${tag}]`)) return remainder.slice(tag.length + 2).trim();
  if (remainder.startsWith(`${tag}:`)) return remainder.slice(tag.length + 1).trim();
  return remainder;
}

export function parseIosLogLine(line: string): Omit<LogEntry, 'id'> | null {
  if (isHeaderLine(line)) return null;
  const match = compactLinePattern.exec(line);
  if (match === null) {
    return {
      timestamp: Date.now(),
      level: 'I',
      tag: 'log',
      message: line.trim(),
      raw: line,
    };
  }
  const typeToken = match[3];
  const remainder = match[4];
  const tag = extractTag(remainder);
  return {
    timestamp: Date.now(),
    level: levelFromType(typeToken),
    tag: tag === '' ? 'log' : tag,
    message: messageAfterTag(remainder, tag),
    raw: line,
  };
}
