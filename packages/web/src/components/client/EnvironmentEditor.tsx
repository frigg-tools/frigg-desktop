import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ApiEnvironment, ApiKeyValue } from '@frigg/shared';
import { useAppStore } from '../../store';
import { useT } from '../../i18n';
import AddVariableDialog from './AddVariableDialog';
import {
  CloseIcon,
  KeyValueEditor,
  PlusIcon,
  TrashIcon,
  fromRows,
  toRows,
  type ApiKeyValueRow,
} from './shared';

function mergeRows(rows: ApiKeyValueRow[], key: string, value: string): ApiKeyValueRow[] {
  const idx = rows.findIndex((r) => r.key === key);
  if (idx >= 0) {
    const next = rows.slice();
    next[idx] = { ...next[idx], value, enabled: true };
    return next;
  }
  return [...rows, { id: crypto.randomUUID(), key, value, enabled: true }];
}

function mergeVars(vars: ApiKeyValue[], key: string, value: string): ApiKeyValue[] {
  const idx = vars.findIndex((v) => v.key === key);
  if (idx >= 0) {
    const next = vars.slice();
    next[idx] = { ...next[idx], value, enabled: true };
    return next;
  }
  return [...vars, { key, value, enabled: true }];
}

interface EnvironmentEditorProps {
  environment: ApiEnvironment;
  onClose: () => void;
}

export default function EnvironmentEditor({ environment, onClose }: EnvironmentEditorProps) {
  const t = useT();
  const updateEnvironment = useAppStore((s) => s.updateEnvironment);
  const deleteEnvironment = useAppStore((s) => s.deleteEnvironment);
  const apiEnvironments = useAppStore((s) => s.apiEnvironments);

  const [name, setName] = useState(environment.name);
  const [rows, setRows] = useState<ApiKeyValueRow[]>(() => toRows(environment.variables));
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [addingVar, setAddingVar] = useState(false);
  const confirmTimer = useRef<number | null>(null);

  const workspaceEnvironments = useMemo(
    () => apiEnvironments.filter((e) => e.workspaceId === environment.workspaceId),
    [apiEnvironments, environment.workspaceId],
  );

  const envOptions = useMemo(
    () => workspaceEnvironments.map((e) => ({ id: e.id, name: e.name })),
    [workspaceEnvironments],
  );

  const existingValue = useCallback(
    (envId: string, key: string) => {
      if (envId === environment.id) return rows.find((r) => r.key === key)?.value ?? '';
      const env = workspaceEnvironments.find((e) => e.id === envId);
      return env?.variables.find((v) => v.key === key)?.value ?? '';
    },
    [rows, workspaceEnvironments, environment.id],
  );

  const confirmAddVar = (key: string, valuesByEnv: Record<string, string>) => {
    for (const env of workspaceEnvironments) {
      if (env.id === environment.id) continue;
      const merged = mergeVars(env.variables, key, valuesByEnv[env.id] ?? '');
      void updateEnvironment(env.id, { variables: merged }).catch(() => undefined);
    }
    setRows((prev) => mergeRows(prev, key, valuesByEnv[environment.id] ?? ''));
    setAddingVar(false);
  };

  useEffect(() => {
    return () => {
      if (confirmTimer.current !== null) window.clearTimeout(confirmTimer.current);
    };
  }, []);

  const save = () => {
    setSaving(true);
    void updateEnvironment(environment.id, {
      name: name.trim() || environment.name,
      variables: fromRows(rows),
    })
      .then(() => onClose())
      .catch(() => setSaving(false));
  };

  const handleDelete = () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      if (confirmTimer.current !== null) window.clearTimeout(confirmTimer.current);
      confirmTimer.current = window.setTimeout(() => setConfirmingDelete(false), 2500);
      return;
    }
    void deleteEnvironment(environment.id)
      .then(() => onClose())
      .catch(() => setConfirmingDelete(false));
  };

  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 p-6 backdrop-blur-sm"
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-900 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-zinc-800/80 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500">
              {t('client.env.editTitle')}
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              spellCheck={false}
              className="min-w-0 rounded border border-zinc-800 bg-zinc-900/60 px-2 py-1 text-[13px] font-medium text-zinc-200 focus:border-emerald-500/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('action.close')}
            className="rounded p-1 text-zinc-500 transition hover:text-zinc-200"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-xs text-zinc-500">{t('client.env.editHint')}</p>
            <button
              type="button"
              onClick={() => setAddingVar(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1 text-[11px] font-medium text-zinc-400 transition hover:border-emerald-500/30 hover:text-emerald-400 active:scale-[0.98]"
            >
              <PlusIcon />
              {t('client.env.addVarAll')}
            </button>
          </div>
          <KeyValueEditor rows={rows} onChange={setRows} />
        </div>

        <div className="flex items-center gap-2 border-t border-zinc-800/80 px-4 py-3">
          <button
            type="button"
            onClick={handleDelete}
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition active:scale-[0.98] ${
              confirmingDelete
                ? 'border-rose-500/40 bg-rose-500/10 text-rose-400'
                : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-rose-500/30 hover:text-rose-400'
            }`}
          >
            <TrashIcon />
            {confirmingDelete ? t('action.confirm') : t('action.delete')}
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition hover:text-zinc-200 active:scale-[0.98]"
          >
            {t('action.cancel')}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 transition hover:bg-emerald-500/15 active:scale-[0.98] disabled:opacity-50"
          >
            {saving ? t('action.saving') : t('action.save')}
          </button>
        </div>
      </div>

      {addingVar ? (
        <AddVariableDialog
          environments={envOptions}
          currentEnvId={environment.id}
          existingValue={existingValue}
          onConfirm={confirmAddVar}
          onCancel={() => setAddingVar(false)}
        />
      ) : null}
    </div>
  );
}
