import type { LogEntry, LogLevel } from '@frigg/shared';
import { meetsThreshold } from './levels';

export const LOGCAT_RENDER_LIMIT = 500;

export function filterLogEntries(
  entries: LogEntry[],
  minLevel: LogLevel,
  text: string,
  limit: number,
): LogEntry[] {
  const query = text.trim().toLowerCase();
  const matched: LogEntry[] = [];
  for (let i = entries.length - 1; i >= 0 && matched.length < limit; i -= 1) {
    const entry = entries[i];
    if (!meetsThreshold(entry.level, minLevel)) continue;
    if (
      query.length > 0 &&
      !entry.tag.toLowerCase().includes(query) &&
      !entry.message.toLowerCase().includes(query)
    ) {
      continue;
    }
    matched.push(entry);
  }
  matched.reverse();
  return matched;
}
