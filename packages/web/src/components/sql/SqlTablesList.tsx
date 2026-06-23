import { useAppStore } from '../../store';
import { useT } from '../../i18n';

export default function SqlTablesList() {
  const t = useT();
  const tables = useAppStore((s) => s.sqlTables);
  const currentTable = useAppStore((s) => s.sqlCurrentTable);
  const busy = useAppStore((s) => s.sqlBusy);
  const browseSqlTable = useAppStore((s) => s.browseSqlTable);

  return (
    <aside className="flex h-full w-full flex-col border-r border-zinc-800/80">
      <div className="border-b border-zinc-800/80 px-3 py-2">
        <span className="text-[10px] uppercase tracking-widest text-zinc-500">
          {t('sql.tables.title')}
        </span>
      </div>
      {tables.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-4">
          <p className="font-mono text-[11px] text-zinc-600">{t('sql.tables.empty')}</p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {tables.map((table) => {
            const active = table === currentTable;
            return (
              <button
                key={table}
                type="button"
                disabled={busy}
                onClick={() => void browseSqlTable(table).catch(() => undefined)}
                className={`flex w-full items-center gap-2 truncate rounded-md px-2.5 py-1.5 text-left font-mono text-xs transition-colors active:scale-[0.98] disabled:cursor-not-allowed ${
                  active
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'text-zinc-400 hover:bg-zinc-900/60 hover:text-zinc-200'
                }`}
                title={table}
              >
                <span className="truncate">{table}</span>
              </button>
            );
          })}
        </div>
      )}
    </aside>
  );
}
