import type { ReactNode } from 'react';
import { useT } from '../../i18n';

const METHOD_OPTIONS = ['ALL', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

const LOCALHOST_ADDRESSES = new Set(['::1', '127.0.0.1']);

interface TrafficToolbarProps {
  filter: string;
  method: string;
  source: string;
  sources: string[];
  paused: boolean;
  bufferedCount: number;
  totalCount: number;
  onFilterChange: (value: string) => void;
  onMethodChange: (value: string) => void;
  onSourceChange: (value: string) => void;
  onTogglePause: () => void;
  onClear: () => void;
  trailing?: ReactNode;
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3">
      <path d="M8 5.5v13l11-6.5-11-6.5Z" />
    </svg>
  );
}

export default function TrafficToolbar({
  filter,
  method,
  source,
  sources,
  paused,
  bufferedCount,
  totalCount,
  onFilterChange,
  onMethodChange,
  onSourceChange,
  onTogglePause,
  onClear,
  trailing,
}: TrafficToolbarProps) {
  const t = useT();
  const sourceLabel = (address: string) =>
    LOCALHOST_ADDRESSES.has(address) ? t('traffic.source.localhost') : address;
  return (
    <div className="flex items-center gap-2 border-b border-zinc-800/80 px-4 py-2.5">
      <h1 className="font-display text-base font-semibold tracking-wide text-zinc-100">{t('traffic.title')}</h1>
      <span className="rounded border border-zinc-800 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-zinc-500">
        {totalCount}
      </span>
      <div className="flex-1" />
      <input
        value={filter}
        onChange={(e) => onFilterChange(e.target.value)}
        placeholder={t('traffic.filterPlaceholder')}
        spellCheck={false}
        className="w-64 rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-500/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
      />
      <select
        value={method}
        onChange={(e) => onMethodChange(e.target.value)}
        className="rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1.5 font-mono text-xs text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
      >
        {METHOD_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option === 'ALL' ? t('method.any') : option}
          </option>
        ))}
      </select>
      <select
        value={source}
        onChange={(e) => onSourceChange(e.target.value)}
        aria-label={t('traffic.source.label')}
        className="rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1.5 font-mono text-xs text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
      >
        <option value="">{t('traffic.source.all')}</option>
        {sources.map((address) => (
          <option key={address} value={address}>
            {sourceLabel(address)}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onTogglePause}
        className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition active:scale-[0.98] ${
          paused
            ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
            : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-zinc-200'
        }`}
      >
        {paused ? <PlayIcon /> : <PauseIcon />}
        {paused ? t('traffic.resume') : t('traffic.pause')}
        {paused && bufferedCount > 0 ? (
          <span className="font-mono text-[10px] tabular-nums text-amber-400/80">
            +{bufferedCount}
          </span>
        ) : null}
      </button>
      <button
        type="button"
        onClick={onClear}
        className="rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition hover:border-rose-500/30 hover:text-rose-400 active:scale-[0.98]"
      >
        {t('traffic.clear')}
      </button>
      {trailing}
    </div>
  );
}
