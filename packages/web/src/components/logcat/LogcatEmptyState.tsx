import { useAppStore } from '../../store';
import { useT } from '../../i18n';

export type LogcatEmptyKind = 'noTarget' | 'idle' | 'waiting';

function TerminalIcon() {
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
      <path d="m4 8 4 4-4 4" />
      <path d="M12 16h6" />
      <rect x="2" y="3" width="20" height="18" rx="2.5" />
    </svg>
  );
}

interface LogcatEmptyStateProps {
  kind: LogcatEmptyKind;
}

export default function LogcatEmptyState({ kind }: LogcatEmptyStateProps) {
  const t = useT();
  const setScreen = useAppStore((s) => s.setScreen);

  if (kind === 'waiting') {
    return (
      <div className="dot-grid flex h-full flex-col items-center justify-center gap-3 p-8">
        <span className="pulse-dot h-2 w-2 rounded-full bg-emerald-400" />
        <p className="font-mono text-[13px] text-zinc-500">{t('logcat.empty.waiting')}</p>
      </div>
    );
  }

  if (kind === 'idle') {
    return (
      <div className="dot-grid flex h-full flex-col items-center justify-center gap-4 p-8">
        <TerminalIcon />
        <div className="text-center">
          <p className="text-sm text-zinc-400">{t('logcat.empty.idle.title')}</p>
          <p className="mt-1 text-[13px] text-zinc-600">{t('logcat.empty.idle.hint')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dot-grid flex h-full flex-col items-center justify-center gap-4 p-8">
      <TerminalIcon />
      <div className="text-center">
        <p className="text-sm text-zinc-400">{t('logcat.empty.noTarget.title')}</p>
        <p className="mt-1 text-[13px] text-zinc-600">{t('logcat.empty.noTarget.hint')}</p>
      </div>
      <button
        type="button"
        onClick={() => setScreen('devices')}
        className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[13px] font-medium text-emerald-400 transition hover:bg-emerald-500/15 active:scale-[0.98]"
      >
        {t('logcat.empty.noTarget.action')}
      </button>
    </div>
  );
}
