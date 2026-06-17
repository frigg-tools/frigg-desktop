import { memo } from 'react';
import type { LogEntry } from '@frigg/shared';
import { LEVEL_BADGE_CLASS, LEVEL_TEXT_CLASS } from './levels';
import { highlightMatches } from '../traffic/find';

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

interface LogcatRowProps {
  entry: LogEntry;
  query?: string;
}

function LogcatRow({ entry, query }: LogcatRowProps) {
  return (
    <div className="flex gap-2 border-b border-zinc-900/70 px-3 py-0.5 font-mono text-[12px] leading-relaxed hover:bg-zinc-900/40">
      <span className="shrink-0 text-zinc-600 tabular-nums">{formatTime(entry.timestamp)}</span>
      <span
        className={`shrink-0 rounded border px-1 text-[10px] font-semibold leading-4 ${LEVEL_BADGE_CLASS[entry.level]}`}
      >
        {entry.level}
      </span>
      <span className="w-32 shrink-0 truncate text-zinc-500" title={entry.tag}>
        {query ? highlightMatches(entry.tag, query) : entry.tag}
      </span>
      {entry.pid !== undefined ? (
        <span className="shrink-0 text-zinc-700 tabular-nums">{entry.pid}</span>
      ) : null}
      <span className={`min-w-0 flex-1 whitespace-pre-wrap break-all ${LEVEL_TEXT_CLASS[entry.level]}`}>
        {query ? highlightMatches(entry.message, query) : entry.message}
      </span>
    </div>
  );
}

export default memo(LogcatRow);
