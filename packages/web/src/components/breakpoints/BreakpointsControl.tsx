import { useEffect, useRef, useState } from 'react';
import type { BreakpointDirection } from '@frigg/shared';
import { useAppStore } from '../../store';
import { useT } from '../../i18n';
import { CloseIcon, PlusIcon, selectClass } from '../client/shared';

const DIRECTION_OPTIONS: BreakpointDirection[] = ['both', 'request', 'response'];

function PauseCircleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M10 9v6M14 9v6" />
    </svg>
  );
}

export default function BreakpointsControl() {
  const t = useT();
  const breakpoints = useAppStore((s) => s.breakpoints);
  const toggleBreakpoints = useAppStore((s) => s.toggleBreakpoints);
  const createBreakpointRule = useAppStore((s) => s.createBreakpointRule);
  const updateBreakpointRule = useAppStore((s) => s.updateBreakpointRule);
  const deleteBreakpointRule = useAppStore((s) => s.deleteBreakpointRule);

  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState('');
  const [urlPattern, setUrlPattern] = useState('');
  const [direction, setDirection] = useState<BreakpointDirection>('both');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  const enabled = breakpoints.enabled;
  const pausedCount = breakpoints.paused.length;

  const addRule = () => {
    void createBreakpointRule({
      enabled: true,
      direction,
      matcher: { method: method.trim() || undefined, urlPattern: urlPattern.trim() },
    }).catch(() => undefined);
    setMethod('');
    setUrlPattern('');
    setDirection('both');
  };

  return (
    <div ref={containerRef} className="relative flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => void toggleBreakpoints(!enabled).catch(() => undefined)}
        aria-label={t('breakpoints.control.toggleAria')}
        className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition active:scale-[0.98] ${
          enabled
            ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
            : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-zinc-200'
        }`}
      >
        <PauseCircleIcon />
        {t('breakpoints.control.label')}
        {pausedCount > 0 ? (
          <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-amber-300">
            {pausedCount}
          </span>
        ) : null}
      </button>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t('breakpoints.rules.title')}
        className={`rounded-md border px-2 py-1.5 text-xs transition active:scale-[0.98] ${
          open
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
            : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-zinc-200'
        }`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-3.5 w-3.5">
          <path d="M3 6h18M7 12h10M11 18h2" />
        </svg>
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-40 mt-2 w-80 rounded-lg border border-zinc-800 bg-zinc-950 p-3 shadow-2xl">
          <p className="mb-2 text-[10px] uppercase tracking-widest text-zinc-500">
            {t('breakpoints.rules.title')}
          </p>
          <div className="space-y-1.5">
            {breakpoints.rules.length === 0 ? (
              <p className="text-xs text-zinc-600">{t('breakpoints.rules.empty')}</p>
            ) : (
              breakpoints.rules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/40 px-2 py-1.5"
                >
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={rule.enabled}
                    onClick={() =>
                      void updateBreakpointRule(rule.id, { enabled: !rule.enabled }).catch(
                        () => undefined,
                      )
                    }
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                      rule.enabled
                        ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-400'
                        : 'border-zinc-700 bg-zinc-800/60 text-transparent'
                    }`}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-2.5">
                      <path d="m5 12 5 5 9-11" />
                    </svg>
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-[11px] text-zinc-300">
                      {rule.matcher.method ? `${rule.matcher.method} ` : ''}
                      {rule.matcher.urlPattern || '*'}
                    </p>
                    <p className="text-[10px] uppercase tracking-widest text-zinc-600">
                      {t(`breakpoints.rules.direction.${rule.direction}`)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void deleteBreakpointRule(rule.id).catch(() => undefined)}
                    aria-label={t('breakpoints.rules.delete')}
                    className="shrink-0 rounded p-1 text-zinc-600 transition hover:text-rose-400"
                  >
                    <CloseIcon className="h-3 w-3" />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="mt-3 space-y-1.5 border-t border-zinc-800/80 pt-3">
            <div className="flex gap-1.5">
              <input
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                placeholder={t('method.any')}
                spellCheck={false}
                className="w-20 rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1.5 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-500/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
              <input
                value={urlPattern}
                onChange={(e) => setUrlPattern(e.target.value)}
                placeholder={t('breakpoints.rules.urlPlaceholder')}
                spellCheck={false}
                className="min-w-0 flex-1 rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1.5 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-500/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
            </div>
            <div className="flex gap-1.5">
              <select
                value={direction}
                onChange={(e) => setDirection(e.target.value as BreakpointDirection)}
                className={`${selectClass} flex-1`}
              >
                {DIRECTION_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {t(`breakpoints.rules.direction.${option}`)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={addRule}
                className="flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 text-[11px] font-medium text-zinc-400 transition hover:text-zinc-200 active:scale-[0.98]"
              >
                <PlusIcon />
                {t('breakpoints.rules.add')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
