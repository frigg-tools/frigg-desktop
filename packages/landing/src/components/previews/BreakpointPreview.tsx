import { useT } from '../../i18n';
import { AppWindow, MethodChip } from './shared';

function Field({ label, value, edited }: { label: string; value: string; edited?: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950/60 px-2.5 py-1.5">
      <span className="w-16 shrink-0 font-mono text-[10px] uppercase tracking-wider text-zinc-600">{label}</span>
      <span className={`min-w-0 flex-1 truncate font-mono text-[12px] ${edited ? 'text-amber-300' : 'text-zinc-300'}`}>
        {value}
      </span>
      {edited && <span className="shrink-0 text-[9px] font-semibold uppercase text-amber-400">edited</span>}
    </div>
  );
}

export default function BreakpointPreview() {
  const { t } = useT();
  return (
    <AppWindow
      title={
        <>
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 pulse-dot" />
          <span className="text-amber-300">{t.previews.breakpoints.paused}</span>
        </>
      }
    >
      <div className="space-y-2.5 p-3.5">
        <div className="flex items-center gap-2">
          <MethodChip method="POST" />
          <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-zinc-300">
            auth.acme.dev/oauth/token
          </span>
          <span className="shrink-0 rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300 ring-1 ring-amber-400/30">
            ⏸ request
          </span>
        </div>

        <Field label="status" value="200 → 503" edited />
        <Field label="header" value="x-debug: forced-fail" edited />
        <Field label="body" value='{ "error": "rate_limited" }' edited />

        <div className="grid grid-cols-3 gap-2 pt-1">
          <span className="rounded-md bg-emerald-500 py-2 text-center text-[12px] font-medium text-emerald-950">
            {t.previews.breakpoints.respond}
          </span>
          <span className="rounded-md border border-zinc-700 bg-zinc-800/60 py-2 text-center text-[12px] text-zinc-200">
            {t.previews.breakpoints.continue}
          </span>
          <span className="rounded-md border border-rose-500/30 bg-rose-500/10 py-2 text-center text-[12px] text-rose-300">
            {t.previews.breakpoints.abort}
          </span>
        </div>
      </div>
    </AppWindow>
  );
}
