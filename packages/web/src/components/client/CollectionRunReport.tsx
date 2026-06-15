import type { CollectionRunStep } from '@frigg/shared';
import { useAppStore } from '../../store';
import { useT } from '../../i18n';
import MethodBadge from '../MethodBadge';
import { formatDuration } from '../traffic/format';
import { CloseIcon } from './shared';

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin text-emerald-400" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`h-2 w-2 shrink-0 rounded-full ${ok ? 'bg-emerald-400' : 'bg-rose-400'}`}
      aria-hidden
    />
  );
}

function StepRow({ step }: { step: CollectionRunStep }) {
  const t = useT();
  const failedTests = step.tests.filter((test) => !test.passed);
  return (
    <div className={`px-4 py-2.5 ${step.skipped ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-2.5">
        {step.skipped ? (
          <span className="h-2 w-2 shrink-0 rounded-full bg-zinc-600" aria-hidden />
        ) : (
          <StatusDot ok={step.ok} />
        )}
        <MethodBadge method={step.method} />
        <span className="min-w-0 flex-1 truncate text-[13px] text-zinc-200">{step.name}</span>
        {step.skipped ? (
          <span className="shrink-0 text-[10px] font-medium uppercase tracking-widest text-zinc-500">
            {t('client.run.skipped')}
          </span>
        ) : (
          <>
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-zinc-400">
              {step.status > 0 ? step.status : '—'}
            </span>
            <span className="w-14 shrink-0 text-right font-mono text-[11px] tabular-nums text-zinc-500">
              {formatDuration(step.durationMs)}
            </span>
          </>
        )}
      </div>
      {step.error ? (
        <p className="mt-1.5 break-all pl-[18px] font-mono text-[11px] text-rose-400/90">
          {step.error}
        </p>
      ) : null}
      {failedTests.length > 0 ? (
        <div className="mt-1.5 space-y-1 pl-[18px]">
          {failedTests.map((test, index) => (
            <div key={`${test.name}:${index}`} className="flex items-start gap-2">
              <span className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-widest text-rose-400">
                {t('client.response.fail')}
              </span>
              <span className="min-w-0 flex-1 text-[12px] text-zinc-300">
                {test.name}
                {test.error ? (
                  <span className="ml-1.5 break-all font-mono text-[11px] text-rose-400/80">
                    {test.error}
                  </span>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function CollectionRunReport() {
  const t = useT();
  const run = useAppStore((s) => s.collectionRun);
  const running = useAppStore((s) => s.collectionRunning);
  const clearCollectionRun = useAppStore((s) => s.clearCollectionRun);

  if (!run && !running) return null;

  const totalDuration = run ? run.finishedAt - run.startedAt : 0;
  const allOk = run ? run.failed === 0 : false;

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-zinc-950/95 backdrop-blur-sm">
      <div className="flex items-center gap-3 border-b border-zinc-800/80 px-4 py-2.5">
        {running ? <Spinner /> : <StatusDot ok={allOk} />}
        <span className="font-display text-sm font-semibold tracking-wide text-zinc-100">
          {t('client.run.title')}
        </span>
        {run ? (
          <span className="font-mono text-[11px] tabular-nums text-zinc-400">
            {t('client.run.summary', {
              passed: run.passed,
              failed: run.failed,
              duration: formatDuration(totalDuration),
            })}
          </span>
        ) : (
          <span className="text-[11px] text-zinc-500">{t('client.run.running')}</span>
        )}
        <button
          type="button"
          aria-label={t('client.run.close')}
          onClick={clearCollectionRun}
          className="ml-auto rounded p-1 text-zinc-500 transition hover:text-zinc-200 active:scale-[0.98]"
        >
          <CloseIcon />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {running && !run ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <Spinner />
            <p className="text-sm text-zinc-500">{t('client.run.running')}</p>
          </div>
        ) : run && run.steps.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-zinc-600">{t('client.run.empty')}</p>
        ) : run ? (
          <div className="divide-y divide-zinc-800/60">
            {run.steps.map((step) => (
              <StepRow key={step.requestId} step={step} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
