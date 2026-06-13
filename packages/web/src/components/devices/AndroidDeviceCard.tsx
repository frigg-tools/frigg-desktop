import { useState } from 'react';
import type { AndroidCertMode, AndroidDevice, AndroidSetupResult } from '@frigg/shared';
import { setupAndroid, teardownAndroid } from '../../api/client';
import { useAppStore } from '../../store';
import { useT, type TranslateFn } from '../../i18n';
import Spinner from './Spinner';

const WARN_HINTS = [
  'fail',
  'error',
  'unable',
  'cannot',
  'could not',
  'manual',
  'denied',
  'fallback',
  'not set',
  'only trust',
];

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

function OkIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400"
    >
      <path d="m4.5 12.5 5 5 10-11" />
    </svg>
  );
}

function WarnIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-0.5 h-3 w-3 shrink-0 text-amber-400"
    >
      <path d="M12 3 1.8 20.2h20.4L12 3Z" />
      <path d="M12 10v4.5M12 17.5v.01" />
    </svg>
  );
}

function SetupResultBlock({ result, t }: { result: AndroidSetupResult; t: TranslateFn }) {
  return (
    <div className="space-y-2 border-t border-zinc-800/80 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-widest text-zinc-500">
          {t('devices.android.setupResult')}
        </span>
        <span
          className={`rounded-full border px-2 py-px text-[9px] font-medium uppercase tracking-widest ${CERT_MODE_STYLES[result.certMode]}`}
        >
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

export default function AndroidDeviceCard({ device }: { device: AndroidDevice }) {
  const t = useT();
  const refreshDevices = useAppStore((s) => s.refreshDevices);
  const [pending, setPending] = useState<'setup' | 'teardown' | null>(null);
  const [result, setResult] = useState<AndroidSetupResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ready = device.state === 'device';

  const runSetup = async () => {
    setPending('setup');
    setError(null);
    setResult(null);
    try {
      setResult(await setupAndroid(device.serial));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('devices.android.setupFailed'));
    } finally {
      setPending(null);
      void refreshDevices().catch(() => undefined);
    }
  };

  const runTeardown = async () => {
    setPending('teardown');
    setError(null);
    try {
      await teardownAndroid(device.serial);
      setResult(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('devices.android.teardownFailed'));
    } finally {
      setPending(null);
      void refreshDevices().catch(() => undefined);
    }
  };

  return (
    <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/60">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
            device.proxyConfigured ? 'pulse-dot bg-emerald-400' : 'bg-zinc-600'
          }`}
          title={
            device.proxyConfigured
              ? t('devices.android.proxyConfigured')
              : t('devices.android.proxyNotConfigured')
          }
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-[13px] font-medium text-zinc-200">{device.model}</p>
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
          <p className="font-mono text-[11px] text-zinc-500">{device.serial}</p>
        </div>
        <div className="flex-1" />
        <span className="text-[10px] uppercase tracking-widest text-zinc-600">
          {device.proxyConfigured ? t('devices.android.proxyOn') : t('devices.android.proxyOff')}
        </span>
        <button
          type="button"
          onClick={() => void runSetup()}
          disabled={pending !== null || !ready}
          className="flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-400 transition hover:bg-emerald-500/15 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending === 'setup' ? <Spinner /> : null}
          {t('devices.android.setUpInterception')}
        </button>
        <button
          type="button"
          onClick={() => void runTeardown()}
          disabled={pending !== null || !ready}
          className="flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition hover:border-rose-500/30 hover:text-rose-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending === 'teardown' ? <Spinner /> : null}
          {t('action.remove')}
        </button>
      </div>
      {error !== null ? (
        <p className="border-t border-zinc-800/80 px-4 py-2.5 text-xs text-rose-400">{error}</p>
      ) : null}
      {result !== null ? <SetupResultBlock result={result} t={t} /> : null}
    </div>
  );
}
