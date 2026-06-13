import type { LogEntry, LogLevel } from '@frigg/shared';

const threadtimePattern =
  /^(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s+(\d+)\s+(\d+)\s+([VDIWEF])\s+(.*?):\s?(.*)$/;

function levelFromToken(token: string): LogLevel | null {
  switch (token) {
    case 'V':
    case 'D':
    case 'I':
    case 'W':
    case 'E':
    case 'F':
      return token;
    default:
      return null;
  }
}

function timestampFor(month: string, day: string, hour: string, minute: string, second: string, millis: string): number {
  const year = new Date().getFullYear();
  const parsed = new Date(
    year,
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    Number(millis),
  ).getTime();
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

export function parseAndroidLogcatLine(line: string): Omit<LogEntry, 'id'> | null {
  const match = threadtimePattern.exec(line);
  if (match === null) return null;
  const level = levelFromToken(match[9]);
  if (level === null) return null;
  const pid = Number(match[7]);
  return {
    timestamp: timestampFor(match[1], match[2], match[3], match[4], match[5], match[6]),
    level,
    tag: match[10].trim(),
    pid: Number.isFinite(pid) ? pid : undefined,
    message: match[11],
    raw: line,
  };
}
