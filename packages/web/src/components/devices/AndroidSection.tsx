import type { AndroidDevice, ToolingStatus } from '@frigg/shared';
import { useT } from '../../i18n';
import Section from './Section';
import EmptyHint from './EmptyHint';
import AndroidDeviceCard from './AndroidDeviceCard';

interface AndroidSectionProps {
  devices: AndroidDevice[];
  adb: ToolingStatus['adb'];
}

function AdbMissingBanner() {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3.5 w-3.5 shrink-0 text-rose-400"
      >
        <path d="M12 3 1.8 20.2h20.4L12 3Z" />
        <path d="M12 10v4.5M12 17.5v.01" />
      </svg>
      <p className="text-[13px] text-rose-300">{t('devices.android.adbMissing')}</p>
      <code className="rounded border border-rose-500/30 bg-zinc-950/40 px-2 py-0.5 font-mono text-xs text-rose-200">
        {t('devices.android.adbInstallHint')}
      </code>
    </div>
  );
}

export default function AndroidSection({ devices, adb }: AndroidSectionProps) {
  const t = useT();
  return (
    <Section
      title={t('devices.android.title')}
      subtitle={t('devices.android.subtitle')}
      count={devices.length}
    >
      {!adb.available ? <AdbMissingBanner /> : null}
      {adb.available && adb.version !== undefined ? (
        <p className="font-mono text-[11px] text-zinc-600">{adb.version}</p>
      ) : null}
      {devices.length === 0 ? (
        <EmptyHint
          message={t('devices.android.emptyMessage')}
          command={t('devices.android.emptyCommand')}
        />
      ) : (
        <div className="space-y-2">
          {devices.map((device) => (
            <AndroidDeviceCard key={device.serial} device={device} />
          ))}
        </div>
      )}
    </Section>
  );
}
