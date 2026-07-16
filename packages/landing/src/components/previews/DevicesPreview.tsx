import { useT } from '../../i18n';
import { AppWindow } from './shared';
import { IconDevices } from '../../icons';

interface Device {
  name: string;
  kind: string;
  state: 'on' | 'off';
}

const devices: Device[] = [
  { name: 'Pixel 7 · emulator', kind: 'android', state: 'on' },
  { name: 'iPhone 15 · simulator', kind: 'ios', state: 'on' },
  { name: 'Galaxy S22 · USB', kind: 'android', state: 'off' },
];

export default function DevicesPreview() {
  const { t } = useT();
  return (
    <AppWindow title={<span className="normal-case tracking-normal text-zinc-400">{t.previews.devices.title}</span>}>
      <div className="space-y-2 p-3.5">
        {devices.map((d) => (
          <div
            key={d.name}
            className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2.5"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-800/80 text-zinc-400">
              <IconDevices className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] text-zinc-200">{d.name}</div>
              <div className="font-mono text-[10.5px] text-zinc-600">
                {d.state === 'on' ? t.previews.devices.caOk : t.previews.devices.notSet}
              </div>
            </div>
            {d.state === 'on' ? (
              <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300 ring-1 ring-emerald-500/25">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {t.previews.devices.intercepting}
              </span>
            ) : (
              <span className="shrink-0 rounded-md bg-emerald-500 px-2.5 py-1 text-[11px] font-medium text-emerald-950">
                {t.previews.devices.setup}
              </span>
            )}
          </div>
        ))}
        <p className="px-1 pt-1 font-mono text-[10.5px] text-zinc-600">{t.previews.devices.hint}</p>
      </div>
    </AppWindow>
  );
}
