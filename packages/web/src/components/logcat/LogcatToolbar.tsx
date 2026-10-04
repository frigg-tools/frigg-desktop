import { useAppStore, type LogLevelFilter } from '../../store';
import { useT } from '../../i18n';
import { LOG_LEVEL_FILTERS } from './levels';
import LogcatDevicePicker from './LogcatDevicePicker';
import LogcatPackagePicker from './LogcatPackagePicker';

export default function LogcatToolbar({ onClose }: { onClose?: () => void }) {
  const t = useT();
  const minLevel = useAppStore((s) => s.logFilters.minLevel);
  const text = useAppStore((s) => s.logFilters.text);
  const setLogFilters = useAppStore((s) => s.setLogFilters);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800/80 px-4 py-2.5">
      <h1 className="font-display text-base font-semibold tracking-wide text-zinc-100">
        {t('logcat.title')}
      </h1>
      <div className="flex-1" />
      <LogcatDevicePicker />
      <LogcatPackagePicker />
      <select
        value={minLevel}
        onChange={(e) => setLogFilters({ minLevel: e.target.value as LogLevelFilter })}
        className="rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1.5 font-mono text-xs text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
      >
        {LOG_LEVEL_FILTERS.map((level) => (
          <option key={level} value={level}>
            {level === 'ALL' ? t('logcat.level.ALL') : `${level} · ${t(`logcat.level.${level}`)}`}
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
        onClick={() => void useAppStore.getState().clearLogs().catch(() => undefined)}
        className="rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition hover:border-rose-500/30 hover:text-rose-400 active:scale-[0.98]"
      >
        {t('logcat.clear')}
      </button>
      {onClose ? (
        <button
          type="button"
          aria-label={t('action.close')}
          title={t('action.close')}
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900/60 text-zinc-400 transition hover:text-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
