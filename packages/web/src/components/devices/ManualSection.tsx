import type { ReactNode } from 'react';
import { useAppStore } from '../../store';
import { useT } from '../../i18n';
import Section from './Section';

function StepRow({ number, children }: { number: number; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-zinc-700 font-mono text-[10px] tabular-nums text-zinc-400">
        {number}
      </span>
      <div className="min-w-0 text-[13px] leading-relaxed text-zinc-400">{children}</div>
    </li>
  );
}

export default function ManualSection() {
  const t = useT();
  const status = useAppStore((s) => s.status);

  const host = status === null ? null : (status.lanIp ?? window.location.hostname);
  const proxyAddress = status === null || host === null ? '—' : `${host}:${status.proxyPort}`;
  const setupUrl = status === null || host === null ? null : `http://${host}:${status.apiPort}/setup`;

  return (
    <Section title={t('devices.manual.title')} subtitle={t('devices.manual.subtitle')}>
      <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-4 py-4">
        <ol className="space-y-3">
          <StepRow number={1}>
            {t('devices.manual.step1.prefix')}{' '}
            <span className="text-zinc-200">{t('devices.manual.step1.emphasis')}</span>{' '}
            {t('devices.manual.step1.suffix')}
          </StepRow>
          <StepRow number={2}>
            {t('devices.manual.step2.prefix')}{' '}
            <code className="rounded border border-zinc-800 bg-zinc-950/60 px-1.5 py-0.5 font-mono text-xs text-emerald-400">
              {proxyAddress}
            </code>
            .
          </StepRow>
          <StepRow number={3}>{t('devices.manual.step3')}</StepRow>
        </ol>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-zinc-800/80 pt-3">
          <p className="text-xs text-zinc-500">{t('devices.manual.setupHint')}</p>
          {setupUrl !== null ? (
            <a
              href={setupUrl}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-xs text-emerald-400 underline decoration-emerald-500/40 underline-offset-2 transition hover:decoration-emerald-400"
            >
              {setupUrl}
            </a>
          ) : (
            <span className="font-mono text-xs text-zinc-600">—</span>
          )}
        </div>
      </div>
    </Section>
  );
}
