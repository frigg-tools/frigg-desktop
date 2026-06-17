import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../store';
import { useT } from '../i18n';
import LogcatToolbar from '../components/logcat/LogcatToolbar';
import LogcatStatusBar from '../components/logcat/LogcatStatusBar';
import LogcatList from '../components/logcat/LogcatList';
import LogcatEmptyState from '../components/logcat/LogcatEmptyState';
import FindBar from '../components/FindBar';
import { filterLogEntries, LOGCAT_RENDER_LIMIT } from '../components/logcat/filter';

export default function LogcatScreen() {
  const t = useT();
  const logEntries = useAppStore((s) => s.logEntries);
  const logTarget = useAppStore((s) => s.logTarget);
  const streaming = useAppStore((s) => s.logStatus.streaming);
  const minLevel = useAppStore((s) => s.logFilters.minLevel);
  const text = useAppStore((s) => s.logFilters.text);

  const [autoscroll, setAutoscroll] = useState(true);
  const [findOpen, setFindOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeMatch, setActiveMatch] = useState(0);
  const [totalMatches, setTotalMatches] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const lastScrolled = useRef(-1);

  const effectiveQuery = findOpen ? query : '';

  const visible = useMemo(
    () => filterLogEntries(logEntries, minLevel, text, LOGCAT_RENDER_LIMIT),
    [logEntries, minLevel, text],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setFindOpen(true);
        requestAnimationFrame(() => {
          findInputRef.current?.focus();
          findInputRef.current?.select();
        });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    setActiveMatch(0);
    lastScrolled.current = -1;
  }, [effectiveQuery]);

  useEffect(() => {
    const marks = bodyRef.current?.querySelectorAll('mark.find-match');
    if (!marks) return;
    setTotalMatches(marks.length);
    marks.forEach((m) => m.classList.remove('find-active'));
    if (marks.length === 0) return;
    const index = Math.min(activeMatch, marks.length - 1);
    const target = marks[index];
    target.classList.add('find-active');
    if (lastScrolled.current !== activeMatch) {
      target.scrollIntoView({ block: 'center' });
      lastScrolled.current = activeMatch;
    }
  }, [effectiveQuery, visible, activeMatch]);

  const closeFind = () => setFindOpen(false);
  const nextMatch = () => {
    if (totalMatches > 0) setActiveMatch((i) => (i + 1) % totalMatches);
  };
  const prevMatch = () => {
    if (totalMatches > 0) setActiveMatch((i) => (i - 1 + totalMatches) % totalMatches);
  };

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
    return <LogcatList entries={visible} autoscroll={autoscroll && !findOpen} query={effectiveQuery} />;
  })();

  return (
    <div className="flex h-full flex-col">
      <LogcatToolbar />
      <LogcatStatusBar
        autoscroll={autoscroll}
        onToggleAutoscroll={() => setAutoscroll((value) => !value)}
        visibleCount={visible.length}
      />
      {findOpen ? (
        <div className="flex justify-end border-b border-zinc-800/80 bg-zinc-900/60 px-3 py-1.5">
          <FindBar
            query={query}
            onQuery={setQuery}
            total={totalMatches}
            active={totalMatches === 0 ? 0 : activeMatch + 1}
            onNext={nextMatch}
            onPrev={prevMatch}
            onClose={closeFind}
            inputRef={findInputRef}
            placeholder={t('logcat.find.placeholder')}
            noneLabel={t('logcat.find.none')}
            prevLabel={t('logcat.find.prev')}
            nextLabel={t('logcat.find.next')}
          />
        </div>
      ) : null}
      <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col">{body}</div>
    </div>
  );
}
