import { useAppStore } from '../../store';
import { useT } from '../../i18n';
import { PencilIcon, PlusIcon, TrashIcon } from '../client/shared';
import EngineBadge from './EngineBadge';

export default function ConnectionsSidebar() {
  const t = useT();
  const connections = useAppStore((s) => s.sqlConnections);
  const activeId = useAppStore((s) => s.sqlActiveId);
  const busy = useAppStore((s) => s.sqlBusy);
  const selectSqlConnection = useAppStore((s) => s.selectSqlConnection);
  const openSqlDialog = useAppStore((s) => s.openSqlDialog);
  const deleteSqlConnection = useAppStore((s) => s.deleteSqlConnection);

  return (
    <aside className="flex h-full w-full flex-col border-r border-zinc-800/80">
      <div className="flex items-center justify-between border-b border-zinc-800/80 px-3 py-2">
        <span className="text-[10px] uppercase tracking-widest text-zinc-500">
          {t('sql.connections.title')}
        </span>
        <button
          type="button"
          onClick={() => openSqlDialog({ mode: 'create' })}
          className="flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-400 transition hover:bg-emerald-500/15 active:scale-[0.98]"
        >
          <PlusIcon />
          {t('sql.connections.new')}
        </button>
      </div>
      {connections.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-4">
          <p className="font-mono text-[11px] text-zinc-600">{t('sql.connections.empty')}</p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {connections.map((connection) => {
            const active = connection.id === activeId;
            return (
              <div
                key={connection.id}
                className={`group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors ${
                  active ? 'bg-emerald-500/10' : 'hover:bg-zinc-900/60'
                }`}
              >
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void selectSqlConnection(connection.id).catch(() => undefined)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-not-allowed"
                  title={connection.name}
                >
                  <EngineBadge engine={connection.engine} />
                  <span
                    className={`truncate font-mono text-xs ${
                      active ? 'text-emerald-400' : 'text-zinc-300'
                    }`}
                  >
                    {connection.name}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => openSqlDialog({ mode: 'edit', id: connection.id })}
                  aria-label={t('sql.connections.edit')}
                  title={t('sql.connections.edit')}
                  className="shrink-0 rounded p-1 text-zinc-600 opacity-0 transition hover:text-zinc-200 group-hover:opacity-100 active:scale-[0.98]"
                >
                  <PencilIcon />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(t('sql.connections.deleteConfirm'))) {
                      void deleteSqlConnection(connection.id).catch(() => undefined);
                    }
                  }}
                  aria-label={t('sql.connections.delete')}
                  title={t('sql.connections.delete')}
                  className="shrink-0 rounded p-1 text-zinc-600 opacity-0 transition hover:text-rose-400 group-hover:opacity-100 active:scale-[0.98]"
                >
                  <TrashIcon />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
