import { useState } from 'react';
import { useAppStore } from '../store';
import { useT } from '../i18n';
import ProxyStatusStrip from '../components/devices/ProxyStatusStrip';
import AndroidSection from '../components/devices/AndroidSection';
import IosSection from '../components/devices/IosSection';
import ManualSection from '../components/devices/ManualSection';
import ProxyCertsEditor from '../components/devices/ProxyCertsEditor';
import Spinner from '../components/devices/Spinner';
import CopyButton from '../components/devices/CopyButton';

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
  const setupPlatform = useAppStore((s) => s.deviceSetupPlatform);
  const setSetupPlatform = useAppStore((s) => s.setDeviceSetupPlatform);
  const refreshDevices = useAppStore((s) => s.refreshDevices);
  const proxyCerts = useAppStore((s) => s.proxyCerts);
  const status = useAppStore((s) => s.status);
  const [refreshing, setRefreshing] = useState(false);
  const [certsOpen, setCertsOpen] = useState(false);

  const selectedPlatform = setupPlatform ?? (
    devices?.android.some((device) => device.state === 'device') ? 'android' :
      devices?.iosSimulators.some((simulator) => simulator.state.toLowerCase() === 'booted') ? 'ios' : 'manual'
  );

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
          <ProxyStatusStrip showFingerprint={false} />
          {devices === null ? (
            <div className="flex items-center justify-center gap-2 py-16">
              <Spinner className="h-4 w-4 text-zinc-500" />
              <p className="text-[13px] text-zinc-500">{t('devices.screen.scanning')}</p>
            </div>
          ) : (
            <>
              <section className="space-y-3" aria-labelledby="device-setup-heading">
                <div>
                  <h2 id="device-setup-heading" className="text-sm font-semibold text-zinc-100">
                    {t('devices.setup.heading')}
                  </h2>
                  <p className="mt-1 text-[13px] leading-relaxed text-zinc-400">
                    {t('devices.setup.description')}
                  </p>
                </div>
                <div role="tablist" aria-label={t('devices.setup.heading')} className="flex flex-wrap gap-2">
                  {(['android', 'ios', 'manual'] as const).map((platform) => {
                    const selected = selectedPlatform === platform;
                    return (
                      <button
                        key={platform}
                        id={`device-setup-tab-${platform}`}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        aria-controls="device-setup-panel"
                        onClick={() => setSetupPlatform(platform)}
                        className={`min-h-10 rounded-md border px-3 py-2 text-[13px] font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300 ${selected ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'}`}
                      >
                        {t(`devices.setup.${platform}`)}
                      </button>
                    );
                  })}
                </div>
                <div id="device-setup-panel" role="tabpanel" aria-labelledby={`device-setup-tab-${selectedPlatform}`} className="pt-2">
                  {selectedPlatform === 'android' ? (
                    <AndroidSection devices={devices.android} adb={devices.tooling.adb} />
                  ) : selectedPlatform === 'ios' ? (
                    <IosSection
                      simulators={devices.iosSimulators}
                      physicalDevices={devices.iosDevices}
                      tooling={devices.tooling}
                    />
                  ) : (
                    <ManualSection />
                  )}
                </div>
              </section>
            </>
          )}
          {devices !== null ? (
            <details className="rounded-lg border border-zinc-800/80 bg-zinc-900/30 px-4">
              <summary className="min-h-11 cursor-pointer py-3 text-[13px] font-medium text-zinc-400 outline-none hover:text-zinc-200 focus-visible:ring-2 focus-visible:ring-emerald-400">
                {t('devices.setup.technicalDetails')}
              </summary>
              <div className="space-y-3 border-t border-zinc-800/80 pb-4 pt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-zinc-400">{t('devices.strip.caFingerprint')}</span>
                  {status?.certFingerprint ? (
                    <>
                      <code className="break-all font-mono text-[11px] text-zinc-300">{status.certFingerprint}</code>
                      <CopyButton value={status.certFingerprint} label={t('devices.strip.copyFullFingerprint')} />
                    </>
                  ) : (
                    <span className="text-[11px] text-zinc-500">{t('devices.strip.unavailable')}</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div>
                    <p className="text-[13px] font-medium text-zinc-300">{t('devices.mtls.title')}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">{t('devices.setup.mtlsHint')}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCertsOpen(true)}
                    className="ml-auto flex min-h-9 items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition hover:text-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300"
                  >
                    <LockIcon />
                    {t('devices.mtls.button')}
                    {proxyCerts.length > 0 ? (
                      <span className="rounded-full bg-emerald-500/15 px-1.5 text-[10px] font-semibold text-emerald-400">
                        {proxyCerts.length}
                      </span>
                    ) : null}
                  </button>
                </div>
              </div>
            </details>
          ) : null}
        </div>
      </div>
      {certsOpen ? <ProxyCertsEditor onClose={() => setCertsOpen(false)} /> : null}
    </div>
  );
}
