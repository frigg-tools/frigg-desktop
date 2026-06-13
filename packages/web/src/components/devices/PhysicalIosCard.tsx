import type { IosPhysicalDevice } from '@frigg/shared';
import { useAppStore } from '../../store';
import { useT } from '../../i18n';
import CopyButton from './CopyButton';

export default function PhysicalIosCard({ device }: { device: IosPhysicalDevice }) {
  const t = useT();
  const status = useAppStore((s) => s.status);
  const host = status?.lanIp ?? null;
  const proxyAddress = host ? `${host}:${status?.proxyPort}` : null;
  const setupUrl = host ? `http://${host}:${status?.apiPort}/setup` : null;

  return (
    <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-3">
      <div className="flex items-center gap-2">
        <span className="rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-widest text-sky-400">
          {t('devices.iosPhysical.usb')}
        </span>
        <span className="text-[13px] font-medium text-zinc-200">{device.model}</span>
        {device.osVersion ? (
          <span className="font-mono text-[11px] text-zinc-500">iOS {device.osVersion}</span>
        ) : null}
      </div>
      <p className="mt-0.5 font-mono text-[11px] text-zinc-500">{device.name}</p>

      <p className="mt-2 text-[11px] leading-relaxed text-amber-300/80">
        {t('devices.iosPhysical.cableNote')}
      </p>

      <ol className="mt-2 space-y-1.5 text-[12px] text-zinc-400">
        <li>{t('devices.iosPhysical.step1')}</li>
        <li className="flex flex-wrap items-center gap-1.5">
          <span>{t('devices.iosPhysical.step2')}</span>
          {proxyAddress ? (
            <span className="inline-flex items-center gap-1 rounded border border-zinc-800 bg-zinc-950 px-1.5 py-0.5 font-mono text-emerald-400">
              {proxyAddress}
              <CopyButton value={proxyAddress} label={t('devices.strip.copyProxyAddress')} />
            </span>
          ) : (
            <span className="font-mono text-zinc-600">{t('devices.iosPhysical.noLan')}</span>
          )}
        </li>
        <li>{t('devices.iosPhysical.step3')}</li>
      </ol>

      {setupUrl ? (
        <a
          href={setupUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 font-mono text-[11px] text-emerald-400 hover:underline"
        >
          {setupUrl}
        </a>
      ) : null}
    </div>
  );
}
