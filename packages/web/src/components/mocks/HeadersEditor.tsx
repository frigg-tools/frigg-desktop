import { useT } from '../../i18n';

export interface HeaderRow {
  id: string;
  name: string;
  value: string;
}

export const editorInputClass =
  'w-full rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-500/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40';

export function createHeaderRow(name = '', value = ''): HeaderRow {
  return { id: crypto.randomUUID(), name, value };
}

export function headerRowsFromRecord(headers: Record<string, string>): HeaderRow[] {
  return Object.entries(headers).map(([name, value]) => createHeaderRow(name, value));
}

export function headerRowsToRecord(rows: HeaderRow[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (const row of rows) {
    const name = row.name.trim();
    if (name.length > 0) {
      record[name] = row.value;
    }
  }
  return record;
}

interface HeadersEditorProps {
  rows: HeaderRow[];
  onChange: (rows: HeaderRow[]) => void;
}

export default function HeadersEditor({ rows, onChange }: HeadersEditorProps) {
  const t = useT();
  const updateRow = (id: string, patch: Partial<Pick<HeaderRow, 'name' | 'value'>>) => {
    onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const removeRow = (id: string) => {
    onChange(rows.filter((row) => row.id !== id));
  };

  const addRow = () => {
    onChange([...rows, createHeaderRow()]);
  };

  return (
    <div className="space-y-1.5">
      {rows.map((row) => (
        <div key={row.id} className="flex items-center gap-1.5">
          <input
            value={row.name}
            onChange={(e) => updateRow(row.id, { name: e.target.value })}
            placeholder={t('mocks.headers.namePlaceholder')}
            spellCheck={false}
            className={`${editorInputClass} w-2/5 shrink-0`}
          />
          <input
            value={row.value}
            onChange={(e) => updateRow(row.id, { value: e.target.value })}
            placeholder={t('mocks.headers.valuePlaceholder')}
            spellCheck={false}
            className={`${editorInputClass} min-w-0 flex-1`}
          />
          <button
            type="button"
            onClick={() => removeRow(row.id)}
            aria-label={t('mocks.headers.remove')}
            className="shrink-0 rounded p-1 text-zinc-600 transition hover:text-rose-400 active:scale-[0.98]"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="h-3 w-3"
            >
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
      ))}
      {rows.length === 0 ? <p className="text-xs text-zinc-600">{t('mocks.headers.empty')}</p> : null}
      <button
        type="button"
        onClick={addRow}
        className="rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1 text-[11px] font-medium text-zinc-400 transition hover:text-zinc-200 active:scale-[0.98]"
      >
        {t('mocks.headers.add')}
      </button>
    </div>
  );
}
