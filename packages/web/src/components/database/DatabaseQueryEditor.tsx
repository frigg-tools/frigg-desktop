import { useAppStore } from '../../store';
import { useT } from '../../i18n';

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3">
      <path d="M8 5.5v13l11-6.5-11-6.5Z" />
    </svg>
  );
}

export default function DatabaseQueryEditor() {
  const t = useT();
  const dbSql = useAppStore((s) => s.dbSql);
  const dbBusy = useAppStore((s) => s.dbBusy);
  const dbError = useAppStore((s) => s.dbError);
  const setDbSql = useAppStore((s) => s.setDbSql);
  const runDbQuery = useAppStore((s) => s.runDbQuery);

  const run = () => {
    if (dbSql.trim().length === 0) return;
    void runDbQuery(dbSql).catch(() => undefined);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      run();
    }
  };

  return (
    <div className="flex flex-col gap-2 border-b border-zinc-800/80 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-widest text-zinc-500">
          {t('database.editor.label')}
        </span>
        <span className="font-mono text-[10px] text-zinc-600">{t('database.editor.hint')}</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={run}
          disabled={dbBusy || dbSql.trim().length === 0}
          className="flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-400 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <PlayIcon />
          {dbBusy ? t('database.running') : t('database.run')}
        </button>
      </div>
      <textarea
        value={dbSql}
        onChange={(e) => setDbSql(e.target.value)}
        onKeyDown={onKeyDown}
        spellCheck={false}
        rows={3}
        placeholder={t('database.editor.placeholder')}
        className="resize-y rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 font-mono text-[13px] leading-relaxed text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-500/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
      />
      {dbError ? (
        <p className="font-mono text-[12px] leading-relaxed text-rose-400">{dbError}</p>
      ) : null}
    </div>
  );
}
