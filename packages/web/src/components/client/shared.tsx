import { useState, type ReactNode } from 'react';
import type { ApiKeyValue } from '@frigg/shared';
import { useT } from '../../i18n';
import VariableField, { type VariableSuggestion } from './VariableField';

export const inputClass =
  'w-full rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 text-[13px] text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-500/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40';

export const monoInputClass =
  'w-full rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-500/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40';

export const selectClass =
  'rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1.5 text-xs text-zinc-200 focus:border-emerald-500/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40';

export const monoTextareaClass =
  'w-full resize-y rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-2 font-mono text-xs leading-relaxed text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-500/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40';

export const METHOD_OPTIONS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

export function FieldLabel({ children }: { children: ReactNode }) {
  return <p className="mb-1 text-[10px] uppercase tracking-widest text-zinc-500">{children}</p>;
}

export function PlusIcon({ className = 'h-3 w-3' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={className}
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function CloseIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={className}
    >
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

export function PencilIcon({ className = 'h-3 w-3' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M17 3.5 20.5 7 8 19.5l-4.5 1 1-4.5L17 3.5Z" />
    </svg>
  );
}

export function TrashIcon({ className = 'h-3 w-3' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4 7h16M9 7V4.5h6V7m-9.5 0 1 13.5h9l1-13.5" />
    </svg>
  );
}

export function FolderIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4 5.5h5l2 2.5h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-11.5a1 1 0 0 1 1-1Z" />
    </svg>
  );
}

export function newKeyValue(key = '', value = ''): ApiKeyValueRow {
  return { id: crypto.randomUUID(), key, value, enabled: true };
}

export interface ApiKeyValueRow extends ApiKeyValue {
  id: string;
}

export function toRows(items: ApiKeyValue[]): ApiKeyValueRow[] {
  return items.map((item) => ({ ...item, id: crypto.randomUUID() }));
}

export function fromRows(rows: ApiKeyValueRow[]): ApiKeyValue[] {
  return rows.map(({ key, value, enabled }) => ({ key, value, enabled }));
}

interface KeyValueEditorProps {
  rows: ApiKeyValueRow[];
  onChange: (rows: ApiKeyValueRow[]) => void;
  mono?: boolean;
  variables?: VariableSuggestion[];
}

export function KeyValueEditor({ rows, onChange, mono = true, variables = [] }: KeyValueEditorProps) {
  const t = useT();
  const cellClass = mono ? monoInputClass : inputClass;

  const updateRow = (id: string, patch: Partial<ApiKeyValueRow>) => {
    onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  return (
    <div className="space-y-1.5">
      {rows.map((row) => (
        <div
          key={row.id}
          className="grid grid-cols-[auto_minmax(0,2fr)_minmax(0,3fr)_auto] items-center gap-1.5"
        >
          <button
            type="button"
            role="checkbox"
            aria-checked={row.enabled}
            aria-label={t('client.kv.enabled')}
            onClick={() => updateRow(row.id, { enabled: !row.enabled })}
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
              row.enabled
                ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-400'
                : 'border-zinc-700 bg-zinc-800/60 text-transparent'
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-2.5 w-2.5"
            >
              <path d="m5 12 5 5 9-11" />
            </svg>
          </button>
          <input
            value={row.key}
            onChange={(e) => updateRow(row.id, { key: e.target.value })}
            placeholder={t('client.kv.keyPlaceholder')}
            spellCheck={false}
            className={`${cellClass} ${row.enabled ? '' : 'opacity-50'}`}
          />
          <VariableField
            value={row.value}
            onChange={(value) => updateRow(row.id, { value })}
            variables={variables}
            placeholder={t('client.kv.valuePlaceholder')}
            ariaLabel={t('client.kv.valuePlaceholder')}
            className={`${cellClass} ${row.enabled ? '' : 'opacity-50'}`}
            wrapperClassName="min-w-0"
          />
          <button
            type="button"
            onClick={() => onChange(rows.filter((r) => r.id !== row.id))}
            aria-label={t('action.remove')}
            className="shrink-0 rounded p-1 text-zinc-600 transition hover:text-rose-400 active:scale-[0.98]"
          >
            <CloseIcon className="h-3 w-3" />
          </button>
        </div>
      ))}
      {rows.length === 0 ? <p className="text-xs text-zinc-600">{t('client.kv.empty')}</p> : null}
      <button
        type="button"
        onClick={() => onChange([...rows, newKeyValue()])}
        className="flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1 text-[11px] font-medium text-zinc-400 transition hover:text-zinc-200 active:scale-[0.98]"
      >
        <PlusIcon />
        {t('action.add')}
      </button>
    </div>
  );
}

interface InlineNameInputProps {
  defaultValue: string;
  placeholder: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
  className?: string;
}

export function InlineNameInput({
  defaultValue,
  placeholder,
  onCommit,
  onCancel,
  className,
}: InlineNameInputProps) {
  const [value, setValue] = useState(defaultValue);

  const commit = () => {
    const name = value.trim();
    if (name.length > 0) {
      onCommit(name);
    } else {
      onCancel();
    }
  };

  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') onCancel();
      }}
      placeholder={placeholder}
      spellCheck={false}
      className={
        className ??
        'min-w-0 flex-1 rounded border border-emerald-500/40 bg-zinc-900/80 px-1.5 py-0.5 text-[13px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40'
      }
    />
  );
}
