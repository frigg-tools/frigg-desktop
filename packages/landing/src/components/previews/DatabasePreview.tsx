import { useT } from '../../i18n';
import { AppWindow } from './shared';

const cols = ['id', 'email', 'plan', 'synced'];
const rows = [
  ['1', 'ana@acme.dev', 'pro', 'true'],
  ['2', 'beto@acme.dev', 'free', 'true'],
  ['3', 'cris@acme.dev', 'pro', 'false'],
  ['4', 'dan@acme.dev', 'team', 'true'],
  ['5', 'eva@acme.dev', 'free', 'false'],
];

function cell(col: string, v: string) {
  if (col === 'id') return <span className="text-zinc-600">{v}</span>;
  if (col === 'plan')
    return (
      <span className={v === 'free' ? 'text-zinc-400' : 'text-emerald-300'}>{v}</span>
    );
  if (col === 'synced')
    return <span className={v === 'true' ? 'text-emerald-400' : 'text-rose-400'}>{v}</span>;
  return <span className="text-zinc-300">{v}</span>;
}

export default function DatabasePreview() {
  const { t } = useT();
  return (
    <AppWindow title={<span className="normal-case tracking-normal text-zinc-400">{t.previews.database.title}</span>}>
      <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2.5 font-mono text-[12px]">
        <span className="text-emerald-500">SQL</span>
        <span className="min-w-0 flex-1 truncate text-zinc-300">
          <span className="text-violet-300">SELECT</span> * <span className="text-violet-300">FROM</span> users{' '}
          <span className="text-violet-300">WHERE</span> plan != <span className="text-emerald-300">'free'</span>;
        </span>
        <span className="shrink-0 rounded bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">⌘↵ run</span>
      </div>
      <div className="overflow-hidden font-mono text-[11.5px]">
        <div className="flex border-b border-zinc-800 bg-zinc-950/50 text-[10px] uppercase tracking-wider text-zinc-500">
          {cols.map((c) => (
            <span key={c} className="flex-1 px-3 py-1.5">
              {c}
            </span>
          ))}
        </div>
        {rows.map((r, i) => (
          <div key={i} className="flex border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/30">
            {r.map((v, j) => (
              <span key={j} className="flex-1 truncate px-3 py-1.5">
                {cell(cols[j], v)}
              </span>
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 border-t border-zinc-800 px-3 py-2 font-mono text-[10.5px] text-zinc-600">
        <span>users · Room</span>
        <span className="ml-auto">{t.previews.database.rows}</span>
      </div>
    </AppWindow>
  );
}
