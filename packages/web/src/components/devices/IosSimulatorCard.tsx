import { useState } from 'react';
import type { IosSimulator } from '@frigg/shared';
import { installIosCert } from '../../api/client';
import Spinner from './Spinner';

export default function IosSimulatorCard({ simulator }: { simulator: IosSimulator }) {
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const install = async () => {
    setPending(true);
    setFeedback(null);
    try {
      setFeedback(await installIosCert(simulator.udid));
    } catch (err) {
      setFeedback({
        ok: false,
        message: err instanceof Error ? err.message : 'Certificate install failed',
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/60">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <span className="pulse-dot h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" title="Booted" />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-zinc-200">{simulator.name}</p>
          <p className="font-mono text-[11px] text-zinc-500">{simulator.runtime}</p>
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => void install()}
          disabled={pending}
          className="flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-400 transition hover:bg-emerald-500/15 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? <Spinner /> : null}
          Install CA cert
        </button>
      </div>
      {feedback !== null ? (
        <p
          className={`border-t border-zinc-800/80 px-4 py-2.5 text-xs ${
            feedback.ok ? 'text-emerald-400' : 'text-rose-400'
          }`}
        >
          {feedback.message}
        </p>
      ) : null}
    </div>
  );
}
