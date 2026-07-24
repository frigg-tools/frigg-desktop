import { useEffect, useMemo } from 'react';
import { useAppStore } from '../store';
import { useT } from '../i18n';
import type { AppLogLevel, AppLogSource } from '@frigg/shared';

const LEVEL_COLORS: Record<AppLogLevel, string> = {
  debug: 'text-zinc-500',
  info: 'text-blue-400',
  warn: 'text-amber-400',
  error: 'text-rose-400',
  fatal: 'text-rose-500 font-bold',
};

export default function LogsScreen() {
  const logs = useAppStore((s) => s.appLogs);
  const filters = useAppStore((s) => s.appLogFilters);
  const setFilters = useAppStore((s) => s.setAppLogFilters);
  const loadAppLogs = useAppStore((s) => s.loadAppLogs);
  const t = useT();

  useEffect(() => {
    void loadAppLogs().catch(() => undefined);
  }, [loadAppLogs]);

  const filtered = useMemo(() => {
    const rank: Record<AppLogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3, fatal: 4 };
    const minRank = filters.minLevel === 'ALL' ? 0 : rank[filters.minLevel];
    const text = filters.text.toLowerCase();
    return logs.filter((log) => {
      if (rank[log.level] < minRank) return false;
      if (filters.source !== 'ALL' && log.source !== filters.source) return false;
      if (text) {
        const hay = `${log.message} ${log.context ?? ''} ${log.error?.message ?? ''}`.toLowerCase();
        if (!hay.includes(text)) return false;
      }
      return true;
    });
  }, [logs, filters]);

  return (
    <div className="flex h-full flex-col bg-zinc-950">
      <div className="flex items-center gap-3 border-b border-zinc-800/80 px-4 py-2">
        <select
          value={filters.minLevel}
          onChange={(e) => setFilters({ minLevel: e.target.value as AppLogLevel | 'ALL' })}
          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
        >
          <option value="ALL">{t('logs.level.all')}</option>
          <option value="debug">Debug</option>
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
          <option value="fatal">Fatal</option>
        </select>
        <select
          value={filters.source}
          onChange={(e) => setFilters({ source: e.target.value as AppLogSource | 'ALL' })}
          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
        >
          <option value="ALL">{t('logs.source.all')}</option>
          <option value="server">Server</option>
          <option value="desktop">Desktop</option>
          <option value="web">Web</option>
        </select>
        <input
          type="text"
          placeholder={t('logs.search')}
          value={filters.text}
          onChange={(e) => setFilters({ text: e.target.value })}
          className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
        />
        <span className="text-xs text-zinc-500">{filtered.length} entries</span>
      </div>
      <div className="flex-1 overflow-auto font-mono text-xs">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-zinc-900 text-zinc-400">
            <tr>
              <th className="px-3 py-1">{t('logs.time')}</th>
              <th className="px-3 py-1">{t('logs.level')}</th>
              <th className="px-3 py-1">{t('logs.source')}</th>
              <th className="px-3 py-1">{t('logs.context')}</th>
              <th className="px-3 py-1">{t('logs.message')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((log, i) => (
              <tr key={i} className="border-b border-zinc-900/50 hover:bg-zinc-900/30">
                <td className="px-3 py-1 text-zinc-500">{new Date(log.timestamp).toLocaleTimeString()}</td>
                <td className={`px-3 py-1 ${LEVEL_COLORS[log.level]}`}>{log.level}</td>
                <td className="px-3 py-1 text-zinc-400">{log.source}</td>
                <td className="px-3 py-1 text-zinc-400">{log.context ?? '—'}</td>
                <td className="px-3 py-1 text-zinc-300">
                  {log.message}
                  {log.error && <div className="mt-1 text-rose-400">{log.error.message}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
