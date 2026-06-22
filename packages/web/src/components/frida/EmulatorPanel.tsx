import { useEffect, useState } from 'react';
import { useAppStore } from '../../store';
import { useT } from '../../i18n';

interface Chip {
  key: string;
  name: string;
  serial: string | null;
  booted: boolean;
}

export default function EmulatorPanel() {
  const t = useT();
  const avds = useAppStore((s) => s.avds);
  const devices = useAppStore((s) => s.devices);
  const deviceId = useAppStore((s) => s.fridaDeviceId);
  const avdBusy = useAppStore((s) => s.avdBusy);
  const loadAvds = useAppStore((s) => s.loadAvds);
  const refreshDevices = useAppStore((s) => s.refreshDevices);
  const bootAvd = useAppStore((s) => s.bootAvd);
  const createAvd = useAppStore((s) => s.createAvd);
  const setDeviceId = useAppStore((s) => s.setFridaDeviceId);

  const [name, setName] = useState('');
  const [apiLevel, setApiLevel] = useState(34);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadAvds().catch(() => undefined);
    const id = setInterval(() => {
      void loadAvds().catch(() => undefined);
      void refreshDevices().catch(() => undefined);
    }, 5000);
    return () => clearInterval(id);
  }, [loadAvds, refreshDevices]);

  const chips: Chip[] = [
    ...avds.map((avd) => ({ key: `avd:${avd.name}`, name: avd.name, serial: avd.serial, booted: avd.booted })),
    ...(devices?.android ?? [])
      .filter((device) => !device.isEmulator)
      .map((device) => ({
        key: `dev:${device.serial}`,
        name: device.model || device.serial,
        serial: device.serial,
        booted: true,
      })),
  ];

  const onCreate = async () => {
    if (name.trim() === '') return;
    setMessage(null);
    const result = await createAvd(name.trim(), apiLevel).catch(() => null);
    if (result) setMessage(result.message);
    if (result?.ok) setName('');
  };

  return (
    <div className="border-b border-zinc-800/80 px-4 py-3">
      <div className="mb-2 text-[10px] uppercase tracking-widest text-zinc-500">{t('frida.emulator.title')}</div>
      <div className="flex flex-wrap items-center gap-2">
        {chips.length === 0 ? (
          <span className="text-[11px] text-zinc-600">{t('frida.avd.empty')}</span>
        ) : (
          chips.map((chip) => {
            const selected = chip.serial !== null && chip.serial === deviceId;
            return (
              <span
                key={chip.key}
                className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[12px] ${
                  selected ? 'border-emerald-500/60 text-emerald-200' : 'border-zinc-800 text-zinc-300'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${chip.booted ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                {chip.booted && chip.serial !== null ? (
                  <button type="button" onClick={() => setDeviceId(chip.serial)} className="hover:text-zinc-100">
                    {chip.name}
                  </button>
                ) : (
                  <span>{chip.name}</span>
                )}
                {selected ? (
                  <span className="text-[10px] text-emerald-400">{t('frida.emulator.selected')}</span>
                ) : chip.booted ? null : (
                  <button
                    type="button"
                    onClick={() => void bootAvd(chip.name).catch(() => undefined)}
                    className="text-[11px] text-emerald-300 hover:text-emerald-200"
                  >
                    {t('frida.avd.boot')}
                  </button>
                )}
              </span>
            );
          })
        )}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('frida.avd.name')}
          className="w-44 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-[12px] text-zinc-200"
        />
        <select
          value={apiLevel}
          onChange={(e) => setApiLevel(Number(e.target.value))}
          className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-[12px] text-zinc-300"
        >
          {[33, 34, 35].map((level) => (
            <option key={level} value={level}>
              API {level}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={avdBusy || name.trim() === ''}
          onClick={() => void onCreate()}
          className="rounded-md border border-zinc-700 px-3 py-1 text-[12px] text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t('frida.avd.create')}
        </button>
        {message ? <span className="text-[11px] text-zinc-500">{message}</span> : null}
      </div>
    </div>
  );
}
