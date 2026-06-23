import { useAppStore } from '../store';
import { useT } from '../i18n';
import { ResizeHandle, useResizable } from '../components/ResizeHandle';
import Spinner from '../components/database/Spinner';
import ConnectionsSidebar from '../components/sql/ConnectionsSidebar';
import SqlTablesList from '../components/sql/SqlTablesList';
import SqlQueryEditor from '../components/sql/SqlQueryEditor';
import SqlResultsGrid from '../components/sql/SqlResultsGrid';
import ConnectionDialog from '../components/sql/ConnectionDialog';
import DestructiveConfirmDialog from '../components/sql/DestructiveConfirmDialog';
import EmptyState from '../components/sql/EmptyState';
import EngineBadge from '../components/sql/EngineBadge';

function RunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3">
      <path d="M8 5v14l11-7L8 5Z" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3 w-3"
    >
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

export default function SqlScreen() {
  const t = useT();
  const connections = useAppStore((s) => s.sqlConnections);
  const activeId = useAppStore((s) => s.sqlActiveId);
  const result = useAppStore((s) => s.sqlResult);
  const currentTable = useAppStore((s) => s.sqlCurrentTable);
  const editorSql = useAppStore((s) => s.sqlEditorSql);
  const busy = useAppStore((s) => s.sqlBusy);
  const error = useAppStore((s) => s.sqlError);
  const runSql = useAppStore((s) => s.runSql);
  const refreshSqlSchema = useAppStore((s) => s.refreshSqlSchema);

  const sidebar = useResizable('sql.sidebar', 240, { axis: 'x', min: 180, max: 460 });
  const connectionsPanel = useResizable('sql.connections', 200, { axis: 'y', min: 120, max: 480 });
  const editor = useResizable('sql.editor', 200, { axis: 'y', min: 120, max: 520 });

  const active = activeId ? connections.find((c) => c.id === activeId) ?? null : null;

  const run = () => {
    if (editorSql.trim() === '') return;
    void runSql(editorSql).catch(() => undefined);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800/80 px-4 py-2.5">
        <h1 className="font-display text-base font-semibold tracking-wide text-zinc-100">
          {t('sql.title')}
        </h1>
        {active ? (
          <span className="flex items-center gap-2">
            <EngineBadge engine={active.engine} />
            <span className="font-mono text-xs text-zinc-400">{active.name}</span>
          </span>
        ) : null}
        <div className="flex-1" />
        {busy ? <Spinner /> : null}
        {active ? (
          <>
            <button
              type="button"
              onClick={() => void refreshSqlSchema().catch(() => undefined)}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition hover:text-zinc-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshIcon />
              {t('sql.action.refresh')}
            </button>
            <button
              type="button"
              onClick={run}
              disabled={busy || editorSql.trim() === ''}
              className="flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 transition hover:bg-emerald-500/15 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RunIcon />
              {busy ? t('sql.action.running') : t('sql.action.run')}
            </button>
          </>
        ) : null}
      </div>

      {error ? (
        <div className="border-b border-rose-500/20 bg-rose-500/10 px-4 py-2 font-mono text-[12px] text-rose-300">
          {error}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <div style={{ width: sidebar.size }} className="flex shrink-0 flex-col">
          <div style={{ height: connectionsPanel.size }} className="shrink-0">
            <ConnectionsSidebar />
          </div>
          <ResizeHandle axis="y" onPointerDown={connectionsPanel.onPointerDown} />
          <div className="min-h-0 flex-1">
            <SqlTablesList />
          </div>
        </div>
        <ResizeHandle axis="x" onPointerDown={sidebar.onPointerDown} />
        <div className="flex min-w-0 flex-1 flex-col">
          {active === null ? (
            <EmptyState kind="noConnection" />
          ) : (
            <>
              <div style={{ height: editor.size }} className="shrink-0">
                <SqlQueryEditor />
              </div>
              <ResizeHandle axis="y" onPointerDown={editor.onPointerDown} />
              <div className="flex min-h-0 flex-1 flex-col">
                {result ? (
                  <SqlResultsGrid />
                ) : (
                  <EmptyState kind={currentTable ? 'noTable' : 'notConnected'} />
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <ConnectionDialog />
      <DestructiveConfirmDialog />
    </div>
  );
}
