import { useState } from 'react';
import { useAppStore } from '../store';
import { useT } from '../i18n';
import ProxyStatusStrip from '../components/devices/ProxyStatusStrip';
import AndroidSection from '../components/devices/AndroidSection';
import IosSection from '../components/devices/IosSection';
import ManualSection from '../components/devices/ManualSection';
import ProxyCertsEditor from '../components/devices/ProxyCertsEditor';
import Spinner from '../components/devices/Spinner';

function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3 w-3"
    >
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3 w-3"
    >
      <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
    </svg>
  );
}

export default function DevicesScreen() {
  const t = useT();
  const devices = useAppStore((s) => s.devices);
  const refreshDevices = useAppStore((s) => s.refreshDevices);
  const proxyCerts = useAppStore((s) => s.proxyCerts);
  const [refreshing, setRefreshing] = useState(false);
  const [certsOpen, setCertsOpen] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await refreshDevices();
    } catch {
      return;
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-zinc-800/80 px-4 py-2.5">
        <h1 className="font-display text-base font-semibold tracking-wide text-zinc-100">
          {t('devices.screen.title')}
        </h1>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setCertsOpen(true)}
          className="flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition hover:text-zinc-200 active:scale-[0.98]"
        >
          <LockIcon />
          {t('devices.mtls.button')}
          {proxyCerts.length > 0 ? (
            <span className="rounded-full bg-emerald-500/15 px-1.5 text-[10px] font-semibold text-emerald-400">
              {proxyCerts.length}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition hover:text-zinc-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {refreshing ? <Spinner /> : <RefreshIcon />}
          {t('action.refresh')}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl space-y-8 px-4 py-4">
          <ProxyStatusStrip />
          {devices === null ? (
            <div className="flex items-center justify-center gap-2 py-16">
              <Spinner className="h-4 w-4 text-zinc-500" />
              <p className="text-[13px] text-zinc-500">{t('devices.screen.scanning')}</p>
            </div>
          ) : (
            <>
              <AndroidSection devices={devices.android} adb={devices.tooling.adb} />
              <IosSection
                simulators={devices.iosSimulators}
                physicalDevices={devices.iosDevices}
                tooling={devices.tooling}
              />
              <ManualSection />
            </>
          )}
        </div>
      </div>
      {certsOpen ? <ProxyCertsEditor onClose={() => setCertsOpen(false)} /> : null}
    </div>
  );
}
