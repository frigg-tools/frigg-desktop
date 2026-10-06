import type { LogEntry, LogLevel } from '@frigg/shared';

const compactLinePattern =
  /^(\d{2}:\d{2}:\d{2}\.\d+)\s+(\S+)\s+(\S+)\s+(.*)$/;
const ideviceTimestampPattern =
  /^([A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s+(.*)$/;
const ideviceProcessPattern =
  /^(.+?)(?:\([^)]*\))?\[(\d+)\]\s+<([^>]+)>:\s?(.*)$/;

const monthNumbers: Record<string, number> = {
  Jan: 1,
  Feb: 2,
  Mar: 3,
  Apr: 4,
  May: 5,
  Jun: 6,
  Jul: 7,
  Aug: 8,
  Sep: 9,
  Oct: 10,
  Nov: 11,
  Dec: 12,
};

const levelKeywords: Record<string, LogLevel> = {
  default: 'I',
  info: 'I',
  notice: 'I',
  debug: 'D',
  error: 'E',
  fault: 'F',
  warning: 'W',
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

function ideviceTimestampToEpoch(value: string): number | null {
  const match = /^(\w{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/.exec(value);
  if (match === null) return null;
  const month = monthNumbers[match[1]];
  if (month === undefined) return null;

  const now = new Date();
  const day = Number(match[2]);
  const hour = Number(match[3]);
  const minute = Number(match[4]);
  const second = Number(match[5]);
  const millisecond = Number(`${match[6] ?? ''}000`.slice(0, 3));
  let timestamp = new Date(now.getFullYear(), month - 1, day, hour, minute, second, millisecond).getTime();
  const halfYearMs = 183 * 24 * 60 * 60 * 1000;
  if (timestamp > now.getTime() + halfYearMs) {
    timestamp = new Date(now.getFullYear() - 1, month - 1, day, hour, minute, second, millisecond).getTime();
  } else if (timestamp < now.getTime() - halfYearMs) {
    timestamp = new Date(now.getFullYear() + 1, month - 1, day, hour, minute, second, millisecond).getTime();
  }
  return timestamp;
}

function parseIdeviceSyslogLine(line: string): Omit<LogEntry, 'id'> | null | undefined {
  if (/^\[(?:connected|disconnected):[^\]]+\]$/i.test(line.trim())) return null;
  const timestampMatch = ideviceTimestampPattern.exec(line);
  if (timestampMatch === null) return undefined;
  const processMatch = ideviceProcessPattern.exec(timestampMatch[2]);
  if (processMatch === null) return undefined;
  const timestamp = ideviceTimestampToEpoch(timestampMatch[1]);
  if (timestamp === null) return undefined;
  const pid = Number(processMatch[2]);
  const level = levelKeywords[processMatch[3].toLowerCase()] ?? 'I';
  return {
    timestamp,
    level,
    tag: processMatch[1].trim(),
    pid: Number.isSafeInteger(pid) && pid > 0 ? pid : undefined,
    message: processMatch[4],
    raw: line,
  };
}

export function parseIosLogLine(line: string): Omit<LogEntry, 'id'> | null {
  if (isHeaderLine(line)) return null;
  const ideviceParsed = parseIdeviceSyslogLine(line);
  if (ideviceParsed !== undefined) return ideviceParsed;
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
