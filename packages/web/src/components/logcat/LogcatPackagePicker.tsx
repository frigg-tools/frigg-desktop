import type { DeviceApp } from '@frigg/shared';
import { useAppStore } from '../../store';
import { useT } from '../../i18n';

const DISPLAY_LIMIT = 40;

function appDisplay(app: DeviceApp): string {
  return app.label && app.label !== app.id ? `${app.label} (${app.id})` : app.id;
}

function truncateMiddle(value: string, limit: number): string {
  if (value.length <= limit) return value;
  const ellipsis = '…';
  const keep = limit - ellipsis.length;
  const head = Math.ceil(keep / 2);
  const tail = Math.floor(keep / 2);
  return `${value.slice(0, head)}${ellipsis}${value.slice(value.length - tail)}`;
}

interface LogcatPackagePickerProps {
  disabled: boolean;
}

export default function LogcatPackagePicker({ disabled }: LogcatPackagePickerProps) {
  const t = useT();
  const logApps = useAppStore((s) => s.logApps);
  const logPackage = useAppStore((s) => s.logPackage);
  const setLogPackage = useAppStore((s) => s.setLogPackage);

  const userApps = logApps.filter((app) => !app.system);
  const systemApps = logApps.filter((app) => app.system);

  const renderOptions = (apps: DeviceApp[]) =>
    apps.map((app) => {
      const full = appDisplay(app);
      return (
        <option key={app.id} value={app.id} title={full}>
          {truncateMiddle(full, DISPLAY_LIMIT)}
        </option>
      );
    });

  return (
    <select
      value={logPackage}
      disabled={disabled}
      onChange={(e) => setLogPackage(e.target.value)}
      className="max-w-[16rem] rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1.5 font-mono text-xs text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <option value="">{t('logcat.package.allPackages')}</option>
      {userApps.length > 0 ? (
        <optgroup label={t('logcat.package.userApps')}>{renderOptions(userApps)}</optgroup>
      ) : null}
      {systemApps.length > 0 ? (
        <optgroup label={t('logcat.package.systemApps')}>{renderOptions(systemApps)}</optgroup>
      ) : null}
    </select>
  );
}
