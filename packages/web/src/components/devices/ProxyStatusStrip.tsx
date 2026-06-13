import type { ReactNode } from 'react';
import { useAppStore } from '../../store';
import { useT } from '../../i18n';
import CopyButton from './CopyButton';

function truncateFingerprint(fingerprint: string): string {
  return fingerprint.length > 23 ? `${fingerprint.slice(0, 23)}…` : fingerprint;
}

function StripItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 text-[10px] uppercase tracking-widest text-zinc-500">{label}</span>
      {children}
    </div>
  );
}

export default function ProxyStatusStrip() {
  const t = useT();
  const status = useAppStore((s) => s.status);

  const host = status === null ? null : (status.lanIp ?? window.location.hostname);
  const proxyAddress = status === null || host === null ? null : `${host}:${status.proxyPort}`;
  const setupUrl = status === null || host === null ? null : `http://${host}:${status.apiPort}/setup`;

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-4 py-3">
      <StripItem label={t('devices.strip.proxy')}>
        {proxyAddress !== null ? (
          <>
            <span className="font-mono text-[13px] tabular-nums text-zinc-200">{proxyAddress}</span>
            <CopyButton value={proxyAddress} label={t('devices.strip.copyProxyAddress')} />
          </>
        ) : (
          <span className="font-mono text-[13px] text-zinc-600">—</span>
        )}
      </StripItem>
      <StripItem label={t('devices.strip.caFingerprint')}>
        {status !== null && status.certFingerprint.length > 0 ? (
          <>
            <span className="truncate font-mono text-[13px] text-zinc-400">
              {truncateFingerprint(status.certFingerprint)}
            </span>
            <CopyButton value={status.certFingerprint} label={t('devices.strip.copyFullFingerprint')} />
          </>
        ) : (
          <span className="font-mono text-[13px] text-zinc-600">—</span>
        )}
      </StripItem>
      <div className="flex-1" />
      {setupUrl !== null ? (
        <a
          href={setupUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-emerald-500/30 hover:text-emerald-400 active:scale-[0.98]"
        >
          {t('devices.strip.setupPage')}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3 w-3"
          >
            <path d="M7 17 17 7M9 7h8v8" />
          </svg>
        </a>
      ) : null}
    </div>
  );
}
