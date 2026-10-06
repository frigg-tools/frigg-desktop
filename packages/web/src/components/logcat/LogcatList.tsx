import { useLayoutEffect, useRef, useState } from 'react';
import type { LogEntry } from '@frigg/shared';
import LogcatRow from './LogcatRow';

const LATEST_LOG_THRESHOLD = 32;

interface LogcatListProps {
  entries: LogEntry[];
  query?: string;
}

export default function LogcatList({ entries, query }: LogcatListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousScrollTopRef = useRef(0);
  const [followLatest, setFollowLatest] = useState(true);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !followLatest) return;
    container.scrollTop = container.scrollHeight;
    previousScrollTopRef.current = container.scrollTop;
  }, [entries, followLatest]);

  const handleScroll = () => {
    const container = containerRef.current;
    if (!container) return;

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    const movedUp = container.scrollTop < previousScrollTopRef.current;
    previousScrollTopRef.current = container.scrollTop;

    if (movedUp && distanceFromBottom > 0) {
      setFollowLatest(false);
    } else if (distanceFromBottom <= LATEST_LOG_THRESHOLD) {
      setFollowLatest(true);
    }
  };

  return (
    <div ref={containerRef} onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto">
      {entries.map((entry) => (
        <LogcatRow key={entry.id} entry={entry} query={query} />
      ))}
    </div>
  );
}
