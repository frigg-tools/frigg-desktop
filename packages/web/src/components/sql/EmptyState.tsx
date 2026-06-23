import { useAppStore } from '../../store';
import { useT } from '../../i18n';

export type SqlEmptyKind = 'noConnection' | 'notConnected' | 'noTable';

function SqlIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-8 w-8 text-zinc-700"
    >
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
      <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
    </svg>
  );
}

interface EmptyStateProps {
  kind: SqlEmptyKind;
}

export default function EmptyState({ kind }: EmptyStateProps) {
  const t = useT();
  const openSqlDialog = useAppStore((s) => s.openSqlDialog);

  return (
    <div className="dot-grid flex h-full flex-col items-center justify-center gap-4 p-8">
      <SqlIcon />
      <div className="max-w-md text-center">
        <p className="text-sm text-zinc-400">{t(`sql.empty.${kind}.title`)}</p>
        <p className="mt-1 text-[13px] text-zinc-600">{t(`sql.empty.${kind}.hint`)}</p>
      </div>
      {kind === 'noConnection' ? (
        <button
          type="button"
          onClick={() => openSqlDialog({ mode: 'create' })}
          className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[13px] font-medium text-emerald-400 transition hover:bg-emerald-500/15 active:scale-[0.98]"
        >
          {t('sql.empty.noConnection.action')}
        </button>
      ) : null}
    </div>
  );
}
