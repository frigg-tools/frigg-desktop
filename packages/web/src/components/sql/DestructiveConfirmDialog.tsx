import { useAppStore } from '../../store';
import { useT } from '../../i18n';

export default function DestructiveConfirmDialog() {
  const t = useT();
  const pendingSql = useAppStore((s) => s.pendingDestructiveSql);
  const busy = useAppStore((s) => s.sqlBusy);
  const confirmRunSql = useAppStore((s) => s.confirmRunSql);
  const cancelDestructive = useAppStore((s) => s.cancelDestructive);

  if (pendingSql === null) return null;

  return (
    <div
      role="presentation"
      onClick={cancelDestructive}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-950/70 p-6 backdrop-blur-sm"
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-md flex-col overflow-hidden rounded-xl border border-rose-500/30 bg-zinc-900 shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-zinc-800/80 px-4 py-3">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
          <h2 className="font-display text-sm font-semibold tracking-wide text-zinc-100">
            {t('sql.destructive.title')}
          </h2>
        </div>

        <div className="space-y-3 px-4 py-4">
          <p className="text-[13px] text-zinc-400">{t('sql.destructive.body')}</p>
          <pre className="max-h-40 overflow-auto rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 font-mono text-[12px] leading-relaxed text-rose-300 whitespace-pre-wrap break-words">
            {pendingSql}
          </pre>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-800/80 px-4 py-3">
          <button
            type="button"
            onClick={cancelDestructive}
            className="rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition hover:text-zinc-200 active:scale-[0.98]"
          >
            {t('sql.destructive.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void confirmRunSql().catch(() => undefined)}
            disabled={busy}
            className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-400 transition hover:bg-rose-500/15 active:scale-[0.98] disabled:opacity-50"
          >
            {t('sql.destructive.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
