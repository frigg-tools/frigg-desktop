import { useAppStore } from '../../store';
import { useT } from '../../i18n';

interface LogcatStatusBarProps {
  visibleCount: number;
}

function displayLogError(error: string, translate: (key: string) => string): string {
  const match = /^ios-device:([^|]+)(?:\|([\s\S]*))?$/.exec(error);
  if (match === null) return error;
  const key = `logcat.status.iosDevice.${match[1]}`;
  const message = translate(key);
  if (message === key) return error;
  if (match[1] === 'stream-failed' && match[2]?.trim()) return `${message}: ${match[2].trim()}`;
  return message;
}

export default function LogcatStatusBar({ visibleCount }: LogcatStatusBarProps) {
  const t = useT();
  const logStatus = useAppStore((s) => s.logStatus);
  const logTarget = useAppStore((s) => s.logTarget);
  const retryLogSession = useAppStore((s) => s.retryLogSession);

  const streaming = logStatus.streaming;
  const label = logStatus.target?.label ?? logTarget?.label ?? null;
  const failed = !streaming && logStatus.error !== null;

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-zinc-800/80 bg-zinc-950/60 px-4 py-1.5">
      <span className="flex items-center gap-1.5">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            streaming ? 'pulse-dot bg-emerald-400' : failed ? 'bg-rose-400' : 'bg-zinc-600'
          }`}
        />
        <span className="text-[10px] uppercase tracking-widest text-zinc-500">
          {streaming
            ? t('logcat.status.streaming')
            : failed
              ? t('logcat.status.error')
              : t('logcat.status.idle')}
        </span>
      </span>
      {label ? <span className="font-mono text-[11px] text-zinc-400">{label}</span> : null}
      <span className="font-mono text-[10px] tabular-nums text-zinc-600">
        {t('logcat.status.count', { count: visibleCount })}
      </span>
      {logStatus.error ? (
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-rose-400">
          {displayLogError(logStatus.error, t)}
        </span>
      ) : (
        <div className="flex-1" />
      )}
      {failed && logTarget !== null ? (
        <button
          type="button"
          onClick={retryLogSession}
          className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-rose-300 transition hover:bg-rose-500/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300"
        >
          {t('logcat.retry')}
        </button>
      ) : null}
    </div>
  );
}
