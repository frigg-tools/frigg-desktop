import { useT } from '../../i18n';
import { AppWindow } from './shared';

const rows = [
  ['ch_1042', 'paid', '49.00'],
  ['ch_1044', 'paid', '72.00'],
  ['ch_1045', 'paid', '88.00'],
];

export default function SqlPreview() {
  const { t } = useT();

  return (
    <AppWindow
      title={<span className="normal-case tracking-normal text-zinc-400">{t.previews.sql.title}</span>}
      port="postgres"
    >
      <div className="grid min-h-[245px] grid-cols-[125px_1fr] font-mono text-[11px]">
        <div className="border-r border-zinc-800 bg-zinc-950/40 px-3 py-3">
          <p className="mb-2 text-[9px] uppercase tracking-wider text-zinc-600">{t.previews.sql.schema}</p>
          <p className="rounded bg-emerald-500/10 px-2 py-1 text-emerald-300">payments</p>
          <p className="px-2 py-1 text-zinc-500">customers</p>
          <p className="px-2 py-1 text-zinc-500">subscriptions</p>
        </div>
        <div className="min-w-0">
          <div className="border-b border-zinc-800 px-3 py-3 leading-relaxed text-zinc-300">
            <span className="text-violet-300">SELECT</span> id, status, amount
            <br />
            <span className="text-violet-300">FROM</span> payments
            <br />
            <span className="text-violet-300">WHERE</span> status = <span className="text-emerald-300">'paid'</span>;
          </div>
          <div className="grid grid-cols-3 border-b border-zinc-800 bg-zinc-950/50 text-[9px] uppercase tracking-wider text-zinc-500">
            {['id', 'status', 'amount'].map((column) => (
              <span key={column} className="truncate px-2 py-1.5">
                {column}
              </span>
            ))}
          </div>
          {rows.map((row) => (
            <div key={row[0]} className="grid grid-cols-3 border-b border-zinc-800/50 last:border-0">
              {row.map((value, index) => (
                <span key={index} className={`truncate px-2 py-1.5 ${index === 1 ? 'text-amber-300' : 'text-zinc-400'}`}>
                  {value}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3 border-t border-zinc-800 px-3 py-2 font-mono text-[10px] text-zinc-600">
        <span>{t.previews.sql.engines}</span>
        <span className="ml-auto text-emerald-400">{t.previews.sql.rows}</span>
      </div>
    </AppWindow>
  );
}
