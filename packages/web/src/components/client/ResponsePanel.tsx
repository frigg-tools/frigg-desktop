import { useMemo, useState } from 'react';
import type { ApiRunResult } from '@frigg/shared';
import { useT } from '../../i18n';
import { formatBytes, formatDuration } from '../traffic/format';

type ResponseTab = 'body' | 'headers' | 'tests' | 'console';

function statusColor(code: number): string {
  if (code >= 500) return 'border-rose-500/30 bg-rose-500/10 text-rose-400';
  if (code >= 400) return 'border-amber-500/30 bg-amber-500/10 text-amber-400';
  if (code >= 300) return 'border-sky-500/30 bg-sky-500/10 text-sky-400';
  if (code >= 200) return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400';
  return 'border-zinc-700 bg-zinc-800/60 text-zinc-400';
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin text-emerald-400" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export default function ResponsePanel({
  result,
  running,
}: {
  result: ApiRunResult | null;
  running: boolean;
}) {
  const t = useT();
  const [tab, setTab] = useState<ResponseTab>('body');
  const [copied, setCopied] = useState(false);

  const prettyBody = useMemo(() => {
    if (!result) return '';
    if (result.bodyText.length === 0) return '';
    try {
      return JSON.stringify(JSON.parse(result.bodyText), null, 2);
    } catch {
      return result.bodyText;
    }
  }, [result]);

  const headerEntries = useMemo(
    () => (result ? Object.entries(result.headers) : []),
    [result],
  );

  const failedTests = result ? result.tests.filter((test) => !test.passed).length : 0;

  if (running && !result) {
    return (
      <div className="dot-grid flex h-full flex-col items-center justify-center gap-3 text-center">
        <Spinner />
        <p className="text-sm text-zinc-500">{t('client.response.running')}</p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="dot-grid flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-7 w-7 text-zinc-700"
        >
          <path d="M22 2 11 13" />
          <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
        </svg>
        <p className="text-sm text-zinc-500">{t('client.response.emptyTitle')}</p>
        <p className="max-w-56 text-xs text-zinc-600">{t('client.response.emptyHint')}</p>
      </div>
    );
  }

  const tabs: Array<{ id: ResponseTab; label: string; badge?: number }> = [
    { id: 'body', label: t('client.response.body') },
    { id: 'headers', label: t('client.response.headers'), badge: headerEntries.length },
    { id: 'tests', label: t('client.response.tests'), badge: result.tests.length },
    { id: 'console', label: t('client.response.console'), badge: result.scriptLogs.length },
  ];

  const copyBody = () => {
    if (!navigator.clipboard) return;
    navigator.clipboard
      .writeText(prettyBody)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => undefined);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-zinc-800/80 px-4 py-2.5">
        {result.error ? (
          <span className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 font-mono text-[11px] font-medium text-rose-400">
            {t('client.response.failed')}
          </span>
        ) : (
          <span
            className={`rounded-md border px-2 py-0.5 font-mono text-[11px] font-medium tabular-nums ${statusColor(result.status)}`}
          >
            {result.status} {result.statusText}
          </span>
        )}
        {!result.error ? (
          <>
            <span className="font-mono text-[11px] tabular-nums text-zinc-400">
              {formatDuration(result.durationMs)}
            </span>
            <span className="font-mono text-[11px] tabular-nums text-zinc-400">
              {formatBytes(result.sizeBytes)}
            </span>
          </>
        ) : null}
        <span className="min-w-0 flex-1 truncate text-right font-mono text-[10px] text-zinc-600">
          {result.effectiveUrl}
        </span>
        {running ? <Spinner /> : null}
      </div>

      {result.error ? (
        <div className="px-4 py-4">
          <div className="rounded-md border border-rose-500/30 bg-rose-500/5 px-3 py-2 font-mono text-xs leading-relaxed text-rose-400">
            {result.error}
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-1 border-b border-zinc-800/80 px-3">
            {tabs.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setTab(entry.id)}
                className={`flex items-center gap-1.5 border-b-2 px-2.5 py-2 text-xs font-medium transition-colors ${
                  tab === entry.id
                    ? 'border-emerald-400 text-emerald-400'
                    : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {entry.label}
                {entry.badge ? (
                  <span
                    className={`font-mono text-[10px] tabular-nums ${
                      entry.id === 'tests' && failedTests > 0 ? 'text-rose-400' : 'text-zinc-600'
                    }`}
                  >
                    {entry.badge}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {tab === 'body' ? (
              prettyBody.length === 0 ? (
                <p className="text-xs text-zinc-600">{t('client.response.noBody')}</p>
              ) : (
                <div className="overflow-hidden rounded-md border border-zinc-800/80">
                  <div className="flex items-center justify-between gap-2 border-b border-zinc-800/80 bg-zinc-900/50 px-2.5 py-1">
                    <span className="min-w-0 truncate font-mono text-[10px] text-zinc-500">
                      {formatBytes(result.sizeBytes)}
                      {result.bodyTruncated ? ` · ${t('client.response.truncated')}` : ''}
                    </span>
                    <button
                      type="button"
                      onClick={copyBody}
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-widest transition active:scale-[0.98] ${
                        copied ? 'text-emerald-400' : 'text-zinc-500 hover:text-zinc-200'
                      }`}
                    >
                      {copied ? t('action.copied') : t('action.copy')}
                    </button>
                  </div>
                  <pre className="overflow-auto whitespace-pre-wrap break-all px-2.5 py-2 font-mono text-xs leading-relaxed text-zinc-300">
                    {prettyBody}
                  </pre>
                </div>
              )
            ) : null}

            {tab === 'headers' ? (
              headerEntries.length === 0 ? (
                <p className="text-xs text-zinc-600">{t('client.response.noHeaders')}</p>
              ) : (
                <div className="overflow-hidden rounded-md border border-zinc-800/80">
                  {headerEntries.map(([name, value]) => (
                    <div
                      key={name}
                      className="flex gap-3 border-b border-zinc-800/40 px-2.5 py-1.5 last:border-b-0"
                    >
                      <span className="w-44 shrink-0 break-all font-mono text-[11px] text-zinc-500">
                        {name}
                      </span>
                      <span className="min-w-0 flex-1 break-all font-mono text-[11px] text-zinc-300">
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
              )
            ) : null}

            {tab === 'tests' ? (
              result.tests.length === 0 ? (
                <p className="text-xs text-zinc-600">{t('client.response.noTests')}</p>
              ) : (
                <div className="space-y-1.5">
                  {result.tests.map((test, index) => (
                    <div
                      key={`${test.name}:${index}`}
                      className={`rounded-md border px-2.5 py-1.5 ${
                        test.passed
                          ? 'border-emerald-500/20 bg-emerald-500/5'
                          : 'border-rose-500/20 bg-rose-500/5'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-mono text-[10px] font-semibold uppercase tracking-widest ${
                            test.passed ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {test.passed ? t('client.response.pass') : t('client.response.fail')}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13px] text-zinc-200">
                          {test.name}
                        </span>
                      </div>
                      {test.error ? (
                        <p className="mt-1 break-all font-mono text-[11px] text-rose-400/90">
                          {test.error}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )
            ) : null}

            {tab === 'console' ? (
              result.scriptLogs.length === 0 ? (
                <p className="text-xs text-zinc-600">{t('client.response.noConsole')}</p>
              ) : (
                <pre className="overflow-auto whitespace-pre-wrap break-all rounded-md border border-zinc-800/80 px-2.5 py-2 font-mono text-xs leading-relaxed text-zinc-300">
                  {result.scriptLogs.join('\n')}
                </pre>
              )
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
