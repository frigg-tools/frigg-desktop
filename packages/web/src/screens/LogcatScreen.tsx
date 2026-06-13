import { useMemo, useState } from 'react';
import { useAppStore } from '../store';
import { useT } from '../i18n';
import LogcatToolbar from '../components/logcat/LogcatToolbar';
import LogcatStatusBar from '../components/logcat/LogcatStatusBar';
import LogcatList from '../components/logcat/LogcatList';
import LogcatEmptyState from '../components/logcat/LogcatEmptyState';
import { filterLogEntries, LOGCAT_RENDER_LIMIT } from '../components/logcat/filter';

export default function LogcatScreen() {
  const t = useT();
  const logEntries = useAppStore((s) => s.logEntries);
  const logTarget = useAppStore((s) => s.logTarget);
  const streaming = useAppStore((s) => s.logStatus.streaming);
  const minLevel = useAppStore((s) => s.logFilters.minLevel);
  const text = useAppStore((s) => s.logFilters.text);

  const [autoscroll, setAutoscroll] = useState(true);

  const visible = useMemo(
    () => filterLogEntries(logEntries, minLevel, text, LOGCAT_RENDER_LIMIT),
    [logEntries, minLevel, text],
  );

  const body = (() => {
    if (logTarget === null) return <LogcatEmptyState kind="noTarget" />;
    if (logEntries.length === 0) {
      return <LogcatEmptyState kind={streaming ? 'waiting' : 'idle'} />;
    }
    if (visible.length === 0) {
      return (
        <div className="flex h-full items-center justify-center">
          <p className="font-mono text-[13px] text-zinc-600">{t('logcat.empty.filtered')}</p>
        </div>
      );
    }
    return <LogcatList entries={visible} autoscroll={autoscroll} />;
  })();

  return (
    <div className="flex h-full flex-col">
      <LogcatToolbar />
      <LogcatStatusBar
        autoscroll={autoscroll}
        onToggleAutoscroll={() => setAutoscroll((value) => !value)}
        visibleCount={visible.length}
      />
      <div className="flex min-h-0 flex-1 flex-col">{body}</div>
    </div>
  );
}
