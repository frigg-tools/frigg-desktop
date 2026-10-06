import { useState } from 'react';
import { ANDROID_DEVICE_STATE, deriveProxyState, type AndroidCertMode, type AndroidDevice, type AndroidSetupResult } from '@frigg/shared';
import { installCertAndroid, openTrustedCreds, setupAndroid, teardownAndroid } from '../../api/client';
import { useAppStore } from '../../store';
import { useT, type TranslateFn } from '../../i18n';
import Spinner from './Spinner';
import CopyButton from './CopyButton';

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
  const activeDevice = useAppStore((s) => s.activeDevice);
  const setActiveDevice = useAppStore((s) => s.setActiveDevice);
  const setScreen = useAppStore((s) => s.setScreen);
  const refreshDevices = useAppStore((s) => s.refreshDevices);
  const [pending, setPending] = useState<'setup' | 'teardown' | 'install' | null>(null);
  const [result, setResult] = useState<AndroidSetupResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ready = device.state === ANDROID_DEVICE_STATE.connected;
  const friggAddr = device.proxy !== undefined
    ? device.proxy.host === null || device.proxy.port === null
      ? null
      : `${device.proxy.host}:${device.proxy.port}`
    : status === null
      ? null
      : device.isEmulator
        ? `10.0.2.2:${status.proxyPort}`
        : status.lanIp === null
          ? null
          : `${status.lanIp}:${status.proxyPort}`;
  const proxyUnavailable = device.proxy !== undefined && (
    !device.proxy.ready || device.proxy.host === null || device.proxy.port === null
  );
  const assignedProxyAddress = device.proxy && device.proxy.host !== null && device.proxy.port !== null
    ? `${device.proxy.host}:${device.proxy.port}`
    : null;
  const proxyState = deriveProxyState(device.proxyValue, friggAddr);
  const ago = decryptedAgo(t, device.lastDecryptedAt);
  const selectedForTools = activeDevice?.platform === 'android' && activeDevice.id === device.serial;
  const httpsObserved = ago !== null;
  const currentStep = !ready ? 'device' : proxyUnavailable || proxyState !== 'frigg' ? 'proxy' : !httpsObserved ? 'https' : null;
  const certStatusKey = device.isEmulator
    ? 'certUnknown'
    : device.certTrusted
      ? 'certTrusted'
      : 'certUnverified';
  const nextStep = !ready
    ? 'nextDevice'
    : proxyUnavailable
      ? 'nextProxyUnavailable'
    : proxyState === 'other'
      ? 'nextOtherProxy'
      : proxyState === 'off'
        ? 'nextProxy'
        : httpsObserved
          ? 'nextVerified'
          : 'nextHttps';
  const steps = [
    {
      id: 'device',
      label: t('devices.setup.step.device'),
      status: t(ready ? 'devices.setup.deviceReady' : 'devices.setup.deviceUnavailable'),
      done: ready,
    },
    {
      id: 'proxy',
      label: t('devices.setup.step.proxy'),
      status: t(proxyUnavailable ? 'devices.setup.proxyUnavailable' : proxyState === 'frigg' ? 'devices.setup.proxyReady' : proxyState === 'other' ? 'devices.setup.proxyOther' : 'devices.setup.proxyPending'),
      done: proxyState === 'frigg' && !proxyUnavailable,
    },
    {
      id: 'https',
      label: t('devices.setup.step.https'),
      status: t(httpsObserved ? 'devices.setup.httpsObserved' : 'devices.setup.httpsPending'),
      done: httpsObserved,
    },
  ];

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

  const dotClass = proxyUnavailable ? 'bg-rose-400' : proxyState === 'frigg' ? 'pulse-dot bg-emerald-400' : proxyState === 'other' ? 'bg-amber-400' : 'bg-zinc-600';
  const configure = () => void run('setup', () => setupAndroid(device.serial), 'devices.android.setupFailed');
  const openTraffic = () => {
    setActiveDevice({ platform: 'android', id: device.serial, label: device.avdName ?? device.model });
    setScreen('traffic');
  };

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
        <div className="flex-1" />
        {selectedForTools ? (
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-300">
            {t('devices.setup.activeForTools')}
          </span>
        ) : ready ? (
          <button
            type="button"
            onClick={() => setActiveDevice({ platform: 'android', id: device.serial, label: device.avdName ?? device.model })}
            className="min-h-9 rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-emerald-500/30 hover:text-emerald-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300"
          >
            {t('devices.setup.selectForTools')}
          </button>
        ) : null}
      </div>

      <ol className="grid grid-cols-3 gap-4 border-t border-zinc-800/80 px-4 py-3" aria-label={t('devices.setup.readiness')}>
        {steps.map((step, index) => {
          const active = currentStep === step.id;
          return (
            <li key={step.id} aria-current={active ? 'step' : undefined} className="min-w-0 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold ${step.done ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : active ? 'border-amber-500/50 bg-amber-500/10 text-amber-300' : 'border-zinc-700 bg-zinc-900 text-zinc-500'}`}>
                  {step.done ? '✓' : index + 1}
                </span>
                <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">{step.label}</span>
              </div>
              <p className={`pl-7 text-xs leading-relaxed ${step.done ? 'text-emerald-300' : active ? 'text-amber-200' : 'text-zinc-500'}`}>
                {step.status}
              </p>
            </li>
          );
        })}
      </ol>
      {proxyUnavailable ? (
        <p role="status" className="border-t border-rose-500/20 bg-rose-500/5 px-4 py-2 text-xs text-rose-300">
          {device.proxy?.error ?? t('devices.proxy.unavailable')}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-zinc-800/80 bg-zinc-950/30 px-4 py-4">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">{t('devices.setup.nextStep')}</p>
          <p className="mt-1 text-[13px] font-medium text-zinc-200">{t(`devices.android.${nextStep}Title`)}</p>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-zinc-400">{t(`devices.android.${nextStep}Hint`, { device: device.avdName ?? device.model, ago: ago ?? '' })}</p>
        </div>
        {ready && (proxyState !== 'frigg' || proxyUnavailable) ? (
          <button
            type="button"
            onClick={configure}
            disabled={pending !== null}
            className="flex min-h-10 shrink-0 items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending === 'setup' ? <Spinner /> : null}
            {t(proxyUnavailable ? 'devices.android.retryProxyListener' : proxyState === 'other' ? 'devices.android.switchToFrigg' : 'devices.android.connectProxyToFrigg')}
          </button>
        ) : proxyState === 'frigg' && !proxyUnavailable ? (
          <button
            type="button"
            onClick={openTraffic}
            className="min-h-10 shrink-0 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300"
          >
            {t('devices.android.openTraffic')}
          </button>
        ) : null}
      </div>

      <details className="border-t border-zinc-800/80 px-4">
        <summary className="min-h-11 cursor-pointer py-3 text-xs font-medium text-zinc-400 outline-none hover:text-zinc-200 focus-visible:ring-2 focus-visible:ring-emerald-400">
          {t('devices.android.advancedOptions')}
        </summary>
        <div className="space-y-4 border-t border-zinc-800/80 pb-4 pt-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-zinc-300">{t('devices.android.caLabel')} · {t(`devices.android.${certStatusKey}`)}</p>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-zinc-500">
                {t(device.isEmulator ? 'devices.android.certUnknownHint' : device.certTrusted ? 'devices.android.certTrustedHint' : 'devices.android.certUnverifiedHint')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void runInstall()}
              disabled={pending !== null || !ready}
              className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-emerald-500/30 hover:text-emerald-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending === 'install' ? <Spinner /> : null}
              {t(device.certTrusted ? 'devices.android.reinstallCa' : 'devices.android.installCa')}
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800/80 pt-3">
            <div>
              <p className="text-xs font-medium text-zinc-300">{t('devices.android.proxyLabel')}</p>
              <p className="mt-1 font-mono text-[11px] text-zinc-500">
                {device.proxyValue ?? t(proxyState === 'off' ? 'devices.android.proxyOff' : 'devices.android.proxyPointsOther')}
              </p>
              {device.proxy !== undefined ? (
                <p className="mt-1 flex items-center gap-1 font-mono text-[11px] text-zinc-500">
                  <span>{t('devices.proxy.endpoint')}:</span>
                  {assignedProxyAddress ?? t('devices.proxy.unavailable')}
                  {assignedProxyAddress !== null ? (
                    <CopyButton value={assignedProxyAddress} label={t('devices.strip.copyProxyAddress')} />
                  ) : null}
                </p>
              ) : null}
            </div>
            {proxyState !== 'off' ? (
              <button
                type="button"
                onClick={() => void run('teardown', async () => { await teardownAndroid(device.serial); }, 'devices.android.teardownFailed')}
                disabled={pending !== null || !ready}
                className="min-h-9 rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition hover:border-rose-500/30 hover:text-rose-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending === 'teardown' ? <Spinner /> : null}
                {t('devices.android.disableProxy')}
              </button>
            ) : null}
          </div>
          <details className="border-t border-zinc-800/80 pt-3">
            <summary className="cursor-pointer text-xs font-medium text-zinc-500 outline-none hover:text-zinc-300 focus-visible:ring-2 focus-visible:ring-emerald-400">
              {t('devices.android.howToRemove')}
            </summary>
            <RemoveSteps serial={device.serial} t={t} />
          </details>
        </div>
      </details>

      {error !== null ? <p className="border-t border-zinc-800/80 px-4 py-2.5 text-xs text-rose-400">{error}</p> : null}
      {result !== null ? <SetupResultBlock result={result} t={t} /> : null}
    </div>
  );
}
