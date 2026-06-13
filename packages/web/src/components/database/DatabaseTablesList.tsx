import { useAppStore } from '../../store';
import { useT } from '../../i18n';

export default function DatabaseTablesList() {
  const t = useT();
  const dbTables = useAppStore((s) => s.dbTables);
  const dbTable = useAppStore((s) => s.dbTable);
  const dbBusy = useAppStore((s) => s.dbBusy);
  const selectDbTable = useAppStore((s) => s.selectDbTable);

  return (
    <aside className="flex w-52 shrink-0 flex-col border-r border-zinc-800/80">
      <div className="border-b border-zinc-800/80 px-3 py-2">
        <span className="text-[10px] uppercase tracking-widest text-zinc-500">
          {t('database.tables.title')}
        </span>
      </div>
      {dbTables.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-4">
          <p className="font-mono text-[11px] text-zinc-600">{t('database.tables.empty')}</p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {dbTables.map((table) => {
            const active = table === dbTable;
            return (
              <button
                key={table}
                type="button"
                disabled={dbBusy}
                onClick={() => void selectDbTable(table).catch(() => undefined)}
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
