import type { AndroidDevice, IosSimulator, LogTarget } from '@frigg/shared';
import { useAppStore } from '../../store';
import { useT } from '../../i18n';

function targetValue(target: LogTarget | null): string {
  if (!target) return '';
  return `${target.platform}:${target.id}`;
}

function buildTarget(
  value: string,
  android: AndroidDevice[],
  iosSimulators: IosSimulator[],
): LogTarget | null {
  if (value.startsWith('android:')) {
    const serial = value.slice('android:'.length);
    const device = android.find((d) => d.serial === serial);
    if (!device) return null;
    return { platform: 'android', id: device.serial, label: device.avdName ?? device.model };
  }
  if (value.startsWith('ios:')) {
    const udid = value.slice('ios:'.length);
    const simulator = iosSimulators.find((s) => s.udid === udid);
    if (!simulator) return null;
    return { platform: 'ios', id: simulator.udid, label: simulator.name };
  }
  return null;
}

export default function DatabaseDevicePicker() {
  const t = useT();
  const devices = useAppStore((s) => s.devices);
  const dbTarget = useAppStore((s) => s.dbTarget);
  const setDbTarget = useAppStore((s) => s.setDbTarget);

  const android = devices?.android ?? [];
  const iosSimulators = devices?.iosSimulators ?? [];

  return (
    <select
      value={targetValue(dbTarget)}
      onChange={(e) => setDbTarget(buildTarget(e.target.value, android, iosSimulators))}
      className="max-w-[15rem] rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1.5 font-mono text-xs text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
    >
      <option value="">{t('database.device.placeholder')}</option>
      {android.length > 0 ? (
        <optgroup label={t('database.device.android')}>
          {android.map((device) => (
            <option key={device.serial} value={`android:${device.serial}`}>
              {device.avdName ?? device.model}
              {device.isEmulator ? ` (${t('database.device.emulator')})` : ''} · {device.serial}
              {device.state !== 'device' ? ` · ${device.state}` : ''}
            </option>
          ))}
        </optgroup>
      ) : null}
      {iosSimulators.length > 0 ? (
        <optgroup label={t('database.device.ios')}>
          {iosSimulators.map((simulator) => (
            <option key={simulator.udid} value={`ios:${simulator.udid}`}>
              {simulator.name} · {simulator.runtime}
            </option>
          ))}
        </optgroup>
      ) : null}
    </select>
  );
}
