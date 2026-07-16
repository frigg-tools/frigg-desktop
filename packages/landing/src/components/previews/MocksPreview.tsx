import { useT } from '../../i18n';
import { AppWindow, MethodChip, type Method } from './shared';

interface Rule {
  method: Method;
  glob: string;
  status: number;
  on: boolean;
  delay?: string;
}

const folders: { name: string; rules: Rule[] }[] = [
  {
    name: 'feature-flags',
    rules: [
      { method: 'GET', glob: '/v2/flags', status: 200, on: true },
      { method: 'GET', glob: '/v2/flags/*', status: 200, on: true },
    ],
  },
  {
    name: 'error-states',
    rules: [
      { method: 'POST', glob: '/v2/orders', status: 500, on: true, delay: '2s' },
      { method: 'GET', glob: '/v2/profile/me', status: 401, on: false },
    ],
  },
];

export default function MocksPreview() {
  const { t } = useT();
  return (
    <AppWindow title={<span className="normal-case tracking-normal text-zinc-400">{t.previews.mocks.title}</span>}>
      <div className="p-3 text-[12px]">
        {folders.map((f) => (
          <div key={f.name} className="mb-1.5 last:mb-0">
            <div className="flex items-center gap-1.5 px-1 py-1 font-mono text-[11px] text-zinc-500">
              <span className="text-amber-400/70">▾</span> {f.name}
            </div>
            <div className="ml-2 space-y-1 border-l border-zinc-800 pl-3">
              {f.rules.map((r, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2.5 rounded-md border px-2.5 py-2 ${
                    r.on ? 'border-zinc-800 bg-zinc-900/60' : 'border-zinc-800/60 bg-zinc-950/40 opacity-50'
                  }`}
                >
                  <span className="w-12">
                    <MethodChip method={r.method} />
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-zinc-300">{r.glob}</span>
                  {r.delay && (
                    <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                      +{r.delay}
                    </span>
                  )}
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10.5px] font-semibold ${
                      r.status >= 400 ? 'bg-rose-500/10 text-rose-300' : 'bg-emerald-500/10 text-emerald-300'
                    }`}
                  >
                    {r.status}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold uppercase ${
                      r.on ? 'bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/30' : 'text-zinc-600'
                    }`}
                  >
                    {r.on ? '⚡ on' : 'off'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
        <p className="mt-2 px-1 font-mono text-[10.5px] text-zinc-600">{t.previews.mocks.hint}</p>
      </div>
    </AppWindow>
  );
}
