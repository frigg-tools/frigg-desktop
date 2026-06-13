import { useState } from 'react';
import type { ToolingStatus } from '@frigg/shared';
import { setMacosProxy } from '../../api/client';
import { useAppStore } from '../../store';
import { useT } from '../../i18n';
import Spinner from './Spinner';

export default function MacProxyCard({ macosProxy }: { macosProxy: ToolingStatus['macosProxy'] }) {
  const t = useT();
  const refreshDevices = useAppStore((s) => s.refreshDevices);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const toggle = async () => {
    setPending(true);
    setFeedback(null);
    try {
      setFeedback(await setMacosProxy(!macosProxy.enabled));
    } catch (err) {
      setFeedback({
        ok: false,
        message: err instanceof Error ? err.message : t('devices.mac.toggleFailed'),
      });
    } finally {
      setPending(false);
      void refreshDevices().catch(() => undefined);
    }
  };

  return (
    <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/60">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[13px] font-medium text-zinc-200">{t('devices.mac.title')}</p>
            {macosProxy.service !== null ? (
              <span className="font-mono text-[11px] text-zinc-500">{macosProxy.service}</span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
            {t('devices.mac.explanation')}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-amber-400">{t('devices.mac.warning')}</p>
        </div>
        <div className="flex items-center gap-2">
          {pending ? <Spinner className="h-3 w-3 text-zinc-400" /> : null}
          <span className="text-[10px] uppercase tracking-widest text-zinc-500">
            {macosProxy.enabled ? t('devices.mac.on') : t('devices.mac.off')}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={macosProxy.enabled}
            aria-label={t('devices.mac.toggleLabel')}
            onClick={() => void toggle()}
            disabled={pending}
            className={`relative h-5 w-9 shrink-0 rounded-full border transition disabled:cursor-not-allowed disabled:opacity-50 ${
              macosProxy.enabled
                ? 'border-emerald-500/40 bg-emerald-500/20'
                : 'border-zinc-700 bg-zinc-800/80'
            }`}
          >
            <span
              className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all ${
                macosProxy.enabled ? 'left-[1.1rem] bg-emerald-400' : 'left-0.5 bg-zinc-500'
              }`}
            />
          </button>
        </div>
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
