import { useState } from 'react';
import { deriveProxyState, type AndroidCertMode, type AndroidDevice, type AndroidSetupResult, type ProxyState } from '@frigg/shared';
import { installCertAndroid, openTrustedCreds, setupAndroid, teardownAndroid } from '../../api/client';
import { useAppStore } from '../../store';
import { useT, type TranslateFn } from '../../i18n';
import CopyButton from './CopyButton';
import Spinner from './Spinner';

const WARN_HINTS = ['fail', 'error', 'unable', 'cannot', 'could not', 'manual', 'denied', 'fallback', 'not set', 'only trust'];

function isWarnMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return WARN_HINTS.some((hint) => lower.includes(hint));
}

const CERT_MODE_STYLES: Record<AndroidCertMode, string> = {
  system: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  'user-manual': 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  none: 'border-zinc-700 bg-zinc-800/60 text-zinc-400',
};

const CERT_MODE_LABEL_KEYS: Record<AndroidCertMode, string> = {
  system: 'devices.android.certSystem',
  'user-manual': 'devices.android.certUserManual',
  none: 'devices.android.certNone',
};

const PROXY_PILL_STYLES: Record<ProxyState, string> = {
  frigg: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  other: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  off: 'border-zinc-700 bg-zinc-800/60 text-zinc-500',
};

function decryptedAgo(t: TranslateFn, at: number | undefined): string | null {
  if (at === undefined) return null;
  const mins = Math.max(0, Math.floor((Date.now() - at) / 60_000));
  return mins < 1 ? t('devices.android.justNow') : `${mins} ${t('devices.android.minutesAgo')}`;
}

function OkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400">
      <path d="m4.5 12.5 5 5 10-11" />
    </svg>
  );
}

function WarnIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-3 w-3 shrink-0 text-amber-400">
      <path d="M12 3 1.8 20.2h20.4L12 3Z" />
      <path d="M12 10v4.5M12 17.5v.01" />
    </svg>
  );
}

function SetupResultBlock({ result, t }: { result: AndroidSetupResult; t: TranslateFn }) {
  return (
    <div className="space-y-2 border-t border-zinc-800/80 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-widest text-zinc-500">{t('devices.android.setupResult')}</span>
        <span className={`rounded-full border px-2 py-px text-[9px] font-medium uppercase tracking-widest ${CERT_MODE_STYLES[result.certMode]}`}>
          {t(CERT_MODE_LABEL_KEYS[result.certMode])}
        </span>
      </div>
      <ul className="space-y-1.5">
        {result.messages.map((message, index) => (
          <li key={index} className="flex items-start gap-2">
            {isWarnMessage(message) ? <WarnIcon /> : <OkIcon />}
            <span className="text-xs leading-relaxed text-zinc-400">{message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RemoveSteps({ serial, t }: { serial: string; t: TranslateFn }) {
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    try {
      await openTrustedCreds(serial);
    } catch {
      /* best-effort */
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-2 space-y-1.5 rounded-md border border-zinc-800/80 bg-zinc-950/40 px-3 py-2.5">
      <p className="text-[11px] leading-relaxed text-zinc-500">{t('devices.android.removeIntro')}</p>
      <ol className="ml-3 list-decimal space-y-0.5 text-[11px] text-zinc-400">
        <li>{t('devices.android.removeStep1')}</li>
        <li>{t('devices.android.removeStep2')}</li>
        <li>{t('devices.android.removeStep3')}</li>
      </ol>
      <button
        type="button"
        onClick={() => void open()}
        disabled={busy}
        className="mt-1 flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1 text-[11px] font-medium text-zinc-300 transition hover:border-zinc-700 disabled:opacity-50"
      >
        {busy ? <Spinner /> : null}
        {t('devices.android.openTrustedCreds')}
      </button>
    </div>
  );
}

export default function AndroidDeviceCard({ device }: { device: AndroidDevice }) {
  const t = useT();
  const status = useAppStore((s) => s.status);
  const refreshDevices = useAppStore((s) => s.refreshDevices);
  const [pending, setPending] = useState<'setup' | 'teardown' | 'install' | null>(null);
  const [result, setResult] = useState<AndroidSetupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRemove, setShowRemove] = useState(false);

  const ready = device.state === 'device';
  const friggAddr = status !== null && status.lanIp !== null ? `${status.lanIp}:${status.proxyPort}` : null;
  const proxyState = deriveProxyState(device.proxyValue, friggAddr);
  const fingerprint = status?.certFingerprint ?? '';
  const ago = decryptedAgo(t, device.lastDecryptedAt);

  const run = async (kind: 'setup' | 'teardown' | 'install', fn: () => Promise<AndroidSetupResult | void>, failKey: string) => {
    setPending(kind);
    setError(null);
    if (kind !== 'install') setResult(null);
    try {
      const r = await fn();
      setResult(r ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t(failKey));
    } finally {
      setPending(null);
      void refreshDevices().catch(() => undefined);
    }
  };

  const runInstall = () =>
    run(
      'install',
      async () => {
        const r = await installCertAndroid(device.serial);
        return { proxySet: device.proxyConfigured, certMode: r.certMode, messages: r.messages };
      },
      'devices.android.installCertFailed',
    );

  const dotClass = proxyState === 'frigg' ? 'pulse-dot bg-emerald-400' : proxyState === 'other' ? 'bg-amber-400' : 'bg-zinc-600';

  return (
    <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/60">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-[13px] font-medium text-zinc-200">{device.avdName ?? device.model}</p>
            {device.isEmulator ? (
              <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-1.5 py-px text-[9px] font-medium uppercase tracking-widest text-sky-400">
                {t('devices.android.emulator')}
              </span>
            ) : null}
            {!ready ? (
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-px text-[9px] font-medium uppercase tracking-widest text-amber-400">
                {device.state}
              </span>
            ) : null}
          </div>
          <p className="font-mono text-[11px] text-zinc-500">
            {device.avdName ? `${device.serial} · ${device.model}` : device.serial}
            {device.ipAddress ? ` · ${device.ipAddress}` : ''}
          </p>
        </div>
      </div>

      <div className="space-y-2.5 border-t border-zinc-800/80 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-12 shrink-0 text-[10px] uppercase tracking-widest text-zinc-500">{t('devices.android.proxyLabel')}</span>
          <span className={`rounded-full border px-2 py-px text-[9px] font-medium uppercase tracking-widest ${PROXY_PILL_STYLES[proxyState]}`}>
            {proxyState === 'off' ? t('devices.android.proxyOff') : proxyState === 'frigg' ? t('devices.android.proxyPointsFrigg') : t('devices.android.proxyPointsOther')}
          </span>
          {device.proxyValue && proxyState !== 'off' ? <span className="font-mono text-[11px] text-zinc-400">{device.proxyValue}</span> : null}
          <div className="flex-1" />
          {proxyState === 'off' ? (
            <button
              type="button"
              onClick={() => void run('setup', () => setupAndroid(device.serial), 'devices.android.setupFailed')}
              disabled={pending !== null || !ready}
              className="flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-400 transition hover:bg-emerald-500/15 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending === 'setup' ? <Spinner /> : null}
              {t('devices.android.setUpInterception')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() =>
                void run(
                  'teardown',
                  async () => {
                    await teardownAndroid(device.serial);
                  },
                  'devices.android.teardownFailed',
                )
              }
              disabled={pending !== null || !ready}
              className="flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition hover:border-rose-500/30 hover:text-rose-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending === 'teardown' ? <Spinner /> : null}
              {t('devices.android.disableProxy')}
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="w-12 shrink-0 text-[10px] uppercase tracking-widest text-zinc-500">{t('devices.android.caLabel')}</span>
          {device.isEmulator ? (
            <span className="text-[11px] text-zinc-500">—</span>
          ) : device.certTrusted ? (
            <>
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-px text-[9px] font-medium uppercase tracking-widest text-emerald-400">
                {t('devices.android.certTrusted')}
              </span>
              {ago ? <span className="text-[11px] text-zinc-500">{t('devices.android.decrypted')} · {ago}</span> : null}
            </>
          ) : (
            <>
              <span className="rounded-full border border-zinc-700 bg-zinc-800/60 px-2 py-px text-[9px] font-medium uppercase tracking-widest text-zinc-400">
                {t('devices.android.certUnverified')}
              </span>
              <span className="text-[11px] text-zinc-500">{t('devices.android.certUnverifiedHint')}</span>
            </>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => void runInstall()}
            disabled={pending !== null || !ready}
            className="flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-emerald-500/30 hover:text-emerald-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending === 'install' ? <Spinner /> : null}
            {device.certTrusted ? t('devices.android.reinstallCa') : t('devices.android.installCa')}
          </button>
        </div>

        {fingerprint.length > 0 ? (
          <div className="flex items-center gap-2 pl-14">
            <span className="text-[10px] uppercase tracking-widest text-zinc-600">{t('devices.android.caFingerprint')}</span>
            <span className="font-mono text-[11px] text-zinc-500">{fingerprint.slice(0, 20)}…</span>
            <CopyButton value={fingerprint} label={t('devices.strip.copyFullFingerprint')} />
          </div>
        ) : null}

        <div className="pl-14">
          <button type="button" onClick={() => setShowRemove((v) => !v)} className="text-[11px] font-medium text-zinc-500 transition hover:text-zinc-300">
            {t('devices.android.howToRemove')} {showRemove ? '▾' : '▸'}
          </button>
          {showRemove ? <RemoveSteps serial={device.serial} t={t} /> : null}
        </div>
      </div>

      {error !== null ? <p className="border-t border-zinc-800/80 px-4 py-2.5 text-xs text-rose-400">{error}</p> : null}
      {result !== null ? <SetupResultBlock result={result} t={t} /> : null}
    </div>
  );
}
