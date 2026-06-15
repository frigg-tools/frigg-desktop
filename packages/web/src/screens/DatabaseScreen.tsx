import { useAppStore } from '../store';
import { useT } from '../i18n';
import DatabaseToolbar from '../components/database/DatabaseToolbar';
import DatabaseTablesList from '../components/database/DatabaseTablesList';
import DatabaseQueryEditor from '../components/database/DatabaseQueryEditor';
import DatabaseResultsTable from '../components/database/DatabaseResultsTable';
import DatabaseEmptyState from '../components/database/DatabaseEmptyState';
import { ResizeHandle, useResizable } from '../components/ResizeHandle';

export default function DatabaseScreen() {
  const t = useT();
  const dbTarget = useAppStore((s) => s.dbTarget);
  const dbApp = useAppStore((s) => s.dbApp);
  const dbFileRef = useAppStore((s) => s.dbFileRef);
  const dbResult = useAppStore((s) => s.dbResult);
  const dbApps = useAppStore((s) => s.dbApps);
  const tables = useResizable('database.tables', 208, { axis: 'x', min: 150, max: 420 });

  const stage = (() => {
    if (dbTarget === null) return 'noDevice' as const;
    if (dbApp === null) return 'noApp' as const;
    if (dbFileRef === null) return 'noFile' as const;
    return 'ready' as const;
  })();

  return (
    <div className="flex h-full flex-col">
      <DatabaseToolbar />
      {stage === 'noDevice' ? (
        <DatabaseEmptyState kind="noDevice" />
      ) : stage === 'noApp' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {dbApps.length === 0 ? (
            <div className="dot-grid flex flex-1 items-center justify-center p-8">
              <p className="font-mono text-[13px] text-zinc-600">{t('database.empty.apps')}</p>
            </div>
          ) : (
            <DatabaseEmptyState kind="noApp" />
          )}
        </div>
      ) : stage === 'noFile' ? (
        <DatabaseEmptyState kind="noFile" />
      ) : (
        <div className="flex min-h-0 flex-1">
          <div style={{ width: tables.size }} className="shrink-0">
            <DatabaseTablesList />
          </div>
          <ResizeHandle axis="x" onPointerDown={tables.onPointerDown} />
          <div className="flex min-w-0 flex-1 flex-col">
            <DatabaseQueryEditor />
            {dbResult ? (
              <DatabaseResultsTable result={dbResult} />
            ) : (
              <DatabaseEmptyState kind="noTable" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
