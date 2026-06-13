import type { LogLevel } from '@frigg/shared';
import { useAppStore } from '../../store';
import { useT } from '../../i18n';
import { LOG_LEVELS } from './levels';
import LogcatDevicePicker from './LogcatDevicePicker';

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3">
      <path d="M8 5.5v13l11-6.5-11-6.5Z" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3">
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
    </svg>
  );
}

export default function LogcatToolbar() {
  const t = useT();
  const logStatus = useAppStore((s) => s.logStatus);
  const logTarget = useAppStore((s) => s.logTarget);
  const logPackage = useAppStore((s) => s.logPackage);
  const minLevel = useAppStore((s) => s.logFilters.minLevel);
  const text = useAppStore((s) => s.logFilters.text);
  const setLogPackage = useAppStore((s) => s.setLogPackage);
  const setLogFilters = useAppStore((s) => s.setLogFilters);
  const startLogs = useAppStore((s) => s.startLogs);
  const stopLogs = useAppStore((s) => s.stopLogs);

  const streaming = logStatus.streaming;
  const noTarget = logTarget === null;

  const toggle = () => {
    if (streaming) {
      void stopLogs().catch(() => undefined);
    } else {
      void startLogs().catch(() => undefined);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800/80 px-4 py-2.5">
      <h1 className="font-display text-base font-semibold tracking-wide text-zinc-100">
        {t('logcat.title')}
      </h1>
      <div className="flex-1" />
      <LogcatDevicePicker disabled={streaming} />
      <input
        value={logPackage}
        onChange={(e) => setLogPackage(e.target.value)}
        placeholder={t('logcat.package.placeholder')}
        spellCheck={false}
        disabled={streaming}
        className="w-44 rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-500/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-50"
      />
      <select
        value={minLevel}
        onChange={(e) => setLogFilters({ minLevel: e.target.value as LogLevel })}
        className="rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1.5 font-mono text-xs text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
      >
        {LOG_LEVELS.map((level) => (
          <option key={level} value={level}>
            {level} · {t(`logcat.level.${level}`)}
          </option>
        ))}
      </select>
      <input
        value={text}
        onChange={(e) => setLogFilters({ text: e.target.value })}
        placeholder={t('logcat.filter.placeholder')}
        spellCheck={false}
        className="w-48 rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-500/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
      />
      <button
        type="button"
        onClick={toggle}
        disabled={noTarget}
        className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${
          streaming
            ? 'border-rose-500/30 bg-rose-500/10 text-rose-400'
            : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
        }`}
      >
        {streaming ? <StopIcon /> : <PlayIcon />}
        {streaming ? t('logcat.stop') : t('logcat.start')}
      </button>
      <button
        type="button"
        onClick={() => void useAppStore.getState().clearLogs().catch(() => undefined)}
        className="rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition hover:border-rose-500/30 hover:text-rose-400 active:scale-[0.98]"
      >
        {t('logcat.clear')}
      </button>
    </div>
  );
}
