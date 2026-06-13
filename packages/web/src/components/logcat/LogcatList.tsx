import { useLayoutEffect, useRef } from 'react';
import type { LogEntry } from '@frigg/shared';
import LogcatRow from './LogcatRow';

const NEAR_BOTTOM_THRESHOLD = 120;

interface LogcatListProps {
  entries: LogEntry[];
  autoscroll: boolean;
}

export default function LogcatList({ entries, autoscroll }: LogcatListProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !autoscroll) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom <= container.clientHeight + NEAR_BOTTOM_THRESHOLD) {
      container.scrollTop = container.scrollHeight;
    }
  }, [entries, autoscroll]);

  return (
    <div ref={containerRef} className="min-h-0 flex-1 overflow-y-auto">
      {entries.map((entry) => (
        <LogcatRow key={entry.id} entry={entry} />
      ))}
    </div>
  );
}
