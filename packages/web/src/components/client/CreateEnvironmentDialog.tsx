import { useMemo, useState } from 'react';
import type { ApiKeyValue } from '@frigg/shared';
import { useT } from '../../i18n';
import { CloseIcon, inputClass, selectClass } from './shared';

export interface CreateEnvSource {
  id: string;
  name: string;
  variables: ApiKeyValue[];
}

interface CreateEnvironmentDialogProps {
  environments: CreateEnvSource[];
  onConfirm: (name: string, variables: ApiKeyValue[]) => void;
  onCancel: () => void;
}

type SeedMode = 'copy' | 'keys' | 'blank';

function unionKeys(environments: CreateEnvSource[]): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const env of environments) {
    for (const variable of env.variables) {
      if (variable.key.trim() !== '' && !seen.has(variable.key)) {
        seen.add(variable.key);
        keys.push(variable.key);
      }
    }
  }
  return keys;
}

export default function CreateEnvironmentDialog({
  environments,
  onConfirm,
  onCancel,
}: CreateEnvironmentDialogProps) {
  const t = useT();
  const hasSources = environments.length > 0;
  const [name, setName] = useState('');
  const [mode, setMode] = useState<SeedMode>(hasSources ? 'copy' : 'blank');
  const [copyFromId, setCopyFromId] = useState(environments[0]?.id ?? '');

  const keyCount = useMemo(() => unionKeys(environments).length, [environments]);

  const trimmedName = name.trim();
  const canConfirm = trimmedName !== '';

  const confirm = () => {
    if (!canConfirm) return;
    let variables: ApiKeyValue[] = [];
    if (mode === 'copy') {
      const source = environments.find((e) => e.id === copyFromId);
      variables = source ? source.variables.map((v) => ({ ...v })) : [];
    } else if (mode === 'keys') {
      variables = unionKeys(environments).map((key) => ({ key, value: '', enabled: true }));
    }
    onConfirm(trimmedName, variables);
  };

  return (
    <div
      role="presentation"
      onClick={onCancel}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-950/70 p-6 backdrop-blur-sm"
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-md flex-col overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-900 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-zinc-800/80 px-4 py-3">
          <span className="text-[10px] uppercase tracking-widest text-zinc-500">
            {t('client.env.createTitle')}
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

        <div className="space-y-3 px-4 py-4">
          <label className="block">
            <span className="mb-1 block text-[11px] text-zinc-500">{t('client.env.name')}</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirm();
              }}
              placeholder={t('client.env.namePlaceholder')}
              spellCheck={false}
              className={inputClass}
            />
          </label>

          {hasSources ? (
            <div className="space-y-2">
              <span className="block text-[11px] text-zinc-500">
                {t('client.env.seedTitle', { count: keyCount })}
              </span>
              <label className="flex cursor-pointer items-center gap-2 text-[13px] text-zinc-300">
                <input
                  type="radio"
                  name="seed-mode"
                  checked={mode === 'copy'}
                  onChange={() => setMode('copy')}
                  className="accent-emerald-500"
                />
                {t('client.env.seedCopy')}
                <select
                  value={copyFromId}
                  onChange={(e) => {
                    setCopyFromId(e.target.value);
                    setMode('copy');
                  }}
                  className={`${selectClass} ml-1`}
                >
                  {environments.map((env) => (
                    <option key={env.id} value={env.id}>
                      {env.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-[13px] text-zinc-300">
                <input
                  type="radio"
                  name="seed-mode"
                  checked={mode === 'keys'}
                  onChange={() => setMode('keys')}
                  className="accent-emerald-500"
                />
                {t('client.env.seedKeysOnly')}
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-[13px] text-zinc-300">
                <input
                  type="radio"
                  name="seed-mode"
                  checked={mode === 'blank'}
                  onChange={() => setMode('blank')}
                  className="accent-emerald-500"
                />
                {t('client.env.seedBlank')}
              </label>
            </div>
          ) : null}
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
            {t('action.create')}
          </button>
        </div>
      </div>
    </div>
  );
}
