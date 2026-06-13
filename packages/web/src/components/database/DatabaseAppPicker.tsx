import { useMemo } from 'react';
import type { DeviceApp } from '@frigg/shared';
import { useAppStore } from '../../store';
import { useT } from '../../i18n';

function appLabel(app: DeviceApp): string {
  return app.label && app.label !== app.id ? `${app.label} (${app.id})` : app.id;
}

export default function DatabaseAppPicker() {
  const t = useT();
  const dbApps = useAppStore((s) => s.dbApps);
  const dbApp = useAppStore((s) => s.dbApp);
  const setDbApp = useAppStore((s) => s.setDbApp);

  const { userApps, systemApps } = useMemo(() => {
    return {
      userApps: dbApps.filter((app) => !app.system),
      systemApps: dbApps.filter((app) => app.system),
    };
  }, [dbApps]);

  return (
    <select
      value={dbApp ?? ''}
      onChange={(e) => setDbApp(e.target.value || null)}
      disabled={dbApps.length === 0}
      className="max-w-[16rem] rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1.5 font-mono text-xs text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <option value="">{t('database.app.placeholder')}</option>
      {userApps.length > 0 ? (
        <optgroup label={t('database.app.user')}>
          {userApps.map((app) => (
            <option key={app.id} value={app.id}>
              {appLabel(app)}
            </option>
          ))}
        </optgroup>
      ) : null}
      {systemApps.length > 0 ? (
        <optgroup label={t('database.app.system')}>
          {systemApps.map((app) => (
            <option key={app.id} value={app.id}>
              {appLabel(app)}
            </option>
          ))}
        </optgroup>
      ) : null}
    </select>
  );
}
