import { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import { CloseIcon, inputClass } from './shared';

export interface AddVariableEnvOption {
  id: string;
  name: string;
}

interface AddVariableDialogProps {
  environments: AddVariableEnvOption[];
  currentEnvId: string;
  existingValue: (envId: string, key: string) => string;
  onConfirm: (key: string, valuesByEnv: Record<string, string>) => void;
  onCancel: () => void;
}

type Mode = 'all' | 'individual';

export default function AddVariableDialog({
  environments,
  currentEnvId,
  existingValue,
  onConfirm,
  onCancel,
}: AddVariableDialogProps) {
  const t = useT();
  const [key, setKey] = useState('');
  const [mode, setMode] = useState<Mode>('all');
  const [allValue, setAllValue] = useState('');
  const [perEnv, setPerEnv] = useState<Record<string, string>>({});

  useEffect(() => {
    const trimmed = key.trim();
    if (trimmed === '') return;
    setPerEnv((prev) => {
      const next: Record<string, string> = {};
      for (const env of environments) {
        next[env.id] = prev[env.id] ?? existingValue(env.id, trimmed);
      }
      return next;
    });
  }, [key, environments, existingValue]);

  const trimmedKey = key.trim();
  const canConfirm = trimmedKey !== '';

  const confirm = () => {
    if (!canConfirm) return;
    const valuesByEnv: Record<string, string> = {};
    for (const env of environments) {
      valuesByEnv[env.id] = mode === 'all' ? allValue : perEnv[env.id] ?? '';
    }
    onConfirm(trimmedKey, valuesByEnv);
  };

  return (
    <div
      role="presentation"
      onClick={(e) => {
        e.stopPropagation();
        onCancel();
      }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-950/70 p-6 backdrop-blur-sm"
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-900 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-zinc-800/80 px-4 py-3">
          <span className="text-[10px] uppercase tracking-widest text-zinc-500">
            {t('client.env.addVarTitle')}
          </span>
          <button
            type="button"
            onClick={onCancel}
            aria-label={t('action.close')}
            className="rounded p-1 text-zinc-500 transition hover:text-zinc-200"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
          <label className="block">
            <span className="mb-1 block text-[11px] text-zinc-500">{t('client.env.varName')}</span>
            <input
              autoFocus
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={t('client.kv.keyPlaceholder')}
              spellCheck={false}
              className={`${inputClass} font-mono`}
            />
          </label>

          <div className="space-y-2">
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-zinc-300">
              <input
                type="radio"
                name="add-var-mode"
                checked={mode === 'all'}
                onChange={() => setMode('all')}
                className="accent-emerald-500"
              />
              {t('client.env.sameValue')}
            </label>
            {mode === 'all' ? (
              <input
                value={allValue}
                onChange={(e) => setAllValue(e.target.value)}
                placeholder={t('client.kv.valuePlaceholder')}
                spellCheck={false}
                className={`${inputClass} ml-6 font-mono`}
                style={{ width: 'calc(100% - 1.5rem)' }}
              />
            ) : null}

            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-zinc-300">
              <input
                type="radio"
                name="add-var-mode"
                checked={mode === 'individual'}
                onChange={() => setMode('individual')}
                className="accent-emerald-500"
              />
              {t('client.env.individualValue')}
            </label>
            {mode === 'individual' ? (
              <div className="ml-6 space-y-1.5">
                {environments.map((env) => (
                  <div key={env.id} className="flex items-center gap-2">
                    <span className="w-24 shrink-0 truncate text-[11px] text-zinc-500" title={env.name}>
                      {env.name}
                      {env.id === currentEnvId ? ` ${t('client.env.currentTag')}` : ''}
                    </span>
                    <input
                      value={perEnv[env.id] ?? ''}
                      onChange={(e) =>
                        setPerEnv((prev) => ({ ...prev, [env.id]: e.target.value }))
                      }
                      placeholder={t('client.kv.valuePlaceholder')}
                      spellCheck={false}
                      className={`${inputClass} min-w-0 flex-1 font-mono`}
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-800/80 px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition hover:text-zinc-200 active:scale-[0.98]"
          >
            {t('action.cancel')}
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!canConfirm}
            className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 transition hover:bg-emerald-500/15 active:scale-[0.98] disabled:opacity-50"
          >
            {t('action.add')}
          </button>
        </div>
      </div>
    </div>
  );
}
