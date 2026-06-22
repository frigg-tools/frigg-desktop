import { memo, useMemo, useState } from 'react';
import type { SqlCell, SqlColumn, SqlQueryResult, SqlRowEdit, SqlTable } from '@frigg/shared';
import { SQL_ROW_LIMIT } from '@frigg/shared';
import { useAppStore } from '../../store';
import { useT } from '../../i18n';
import { CloseIcon, PlusIcon, TrashIcon } from '../client/shared';

interface SqlResultsGridProps {
  result: SqlQueryResult;
}

function parseCellInput(raw: string): SqlCell {
  const trimmed = raw.trim();
  if (trimmed.toUpperCase() === 'NULL') return null;
  if (trimmed === '') return '';
  if (/^-?\d+$/.test(trimmed)) {
    const asNumber = Number(trimmed);
    if (Number.isSafeInteger(asNumber)) return asNumber;
  }
  return raw;
}

function cellText(value: SqlCell): string {
  if (value === null) return '';
  return String(value);
}

function CellDisplay({ value }: { value: SqlCell }) {
  if (value === null) {
    return <span className="italic text-zinc-700">NULL</span>;
  }
  const text = String(value);
  return (
    <span className="block max-w-[28rem] truncate" title={text}>
      {text}
    </span>
  );
}

interface InsertDialogProps {
  columns: string[];
  onCancel: () => void;
  onConfirm: (values: Array<{ column: string; value: SqlCell }>) => void;
}

function InsertRowDialog({ columns, onCancel, onConfirm }: InsertDialogProps) {
  const t = useT();
  const [values, setValues] = useState<Record<string, string>>({});

  const confirm = () => {
    const changes = columns.map((column) => ({
      column,
      value: column in values ? parseCellInput(values[column]) : null,
    }));
    onConfirm(changes);
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
        className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-900 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-zinc-800/80 px-4 py-3">
          <span className="text-[10px] uppercase tracking-widest text-zinc-500">
            {t('sql.grid.insertTitle')}
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
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4">
          {columns.map((column) => (
            <label key={column} className="block">
              <span className="mb-1 block font-mono text-[11px] text-zinc-500">{column}</span>
              <input
                value={values[column] ?? ''}
                onChange={(e) => setValues((prev) => ({ ...prev, [column]: e.target.value }))}
                placeholder={t('sql.grid.insertHint')}
                spellCheck={false}
                className="w-full rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-500/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
            </label>
          ))}
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
            className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 transition hover:bg-emerald-500/15 active:scale-[0.98]"
          >
            {t('sql.action.addRow')}
          </button>
        </div>
      </div>
    </div>
  );
}

function SqlResultsGrid({ result }: SqlResultsGridProps) {
  const t = useT();
  const schema = useAppStore((s) => s.sqlSchema);
  const currentTable = useAppStore((s) => s.sqlCurrentTable);
  const busy = useAppStore((s) => s.sqlBusy);
  const editSqlRow = useAppStore((s) => s.editSqlRow);

  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [editing, setEditing] = useState<{ row: number; col: number } | null>(null);
  const [draft, setDraft] = useState('');
  const [showInsert, setShowInsert] = useState(false);

  const tableMeta: SqlTable | null = useMemo(
    () => (currentTable ? schema?.tables.find((tbl) => tbl.name === currentTable) ?? null : null),
    [schema, currentTable],
  );

  const pkColumns: SqlColumn[] = useMemo(
    () => tableMeta?.columns.filter((column) => column.isPrimaryKey) ?? [],
    [tableMeta],
  );

  const editable = currentTable !== null && tableMeta !== null && pkColumns.length > 0;

  const buildPk = (rowIndex: number): Array<{ column: string; value: SqlCell }> => {
    return pkColumns.map((column) => {
      const colIndex = result.columns.indexOf(column.name);
      return { column: column.name, value: colIndex >= 0 ? result.rows[rowIndex][colIndex] ?? null : null };
    });
  };

  const commitEdit = () => {
    if (!editing || !currentTable) {
      setEditing(null);
      return;
    }
    const column = result.columns[editing.col];
    const original = result.rows[editing.row][editing.col] ?? null;
    const next = parseCellInput(draft);
    if (next === original) {
      setEditing(null);
      return;
    }
    const edit: SqlRowEdit = {
      op: 'update',
      table: currentTable,
      schema: tableMeta?.schema,
      pk: buildPk(editing.row),
      changes: [{ column, value: next }],
    };
    setEditing(null);
    void editSqlRow(edit).catch(() => undefined);
  };

  const startEdit = (rowIndex: number, colIndex: number) => {
    if (!editable) return;
    setEditing({ row: rowIndex, col: colIndex });
    setDraft(cellText(result.rows[rowIndex][colIndex] ?? null));
  };

  const deleteSelected = () => {
    if (!editable || selectedRow === null || !currentTable) return;
    const edit: SqlRowEdit = {
      op: 'delete',
      table: currentTable,
      schema: tableMeta?.schema,
      pk: buildPk(selectedRow),
    };
    setSelectedRow(null);
    void editSqlRow(edit).catch(() => undefined);
  };

  const insertRow = (changes: Array<{ column: string; value: SqlCell }>) => {
    if (!currentTable) return;
    const edit: SqlRowEdit = {
      op: 'insert',
      table: currentTable,
      schema: tableMeta?.schema,
      pk: [],
      changes,
    };
    setShowInsert(false);
    void editSqlRow(edit).catch(() => undefined);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-zinc-800/80 bg-zinc-950/60 px-4 py-1.5">
        <span className="font-mono text-[10px] tabular-nums text-zinc-500">
          {result.affectedRows !== null
            ? t('sql.results.affected', { count: result.affectedRows })
            : t('sql.results.rowCount', { count: result.rowCount })}
        </span>
        <span className="font-mono text-[10px] tabular-nums text-zinc-600">
          {t('sql.results.durationMs', { ms: result.durationMs })}
        </span>
        {result.truncated ? (
          <span className="rounded border border-amber-500/30 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-amber-400">
            {t('sql.results.truncated', { limit: SQL_ROW_LIMIT })}
          </span>
        ) : null}
        <div className="flex-1" />
        {currentTable !== null ? (
          editable ? (
            <>
              <button
                type="button"
                onClick={() => setShowInsert(true)}
                disabled={busy}
                className="flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-0.5 font-mono text-[11px] font-medium text-zinc-400 transition hover:text-zinc-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <PlusIcon />
                {t('sql.action.addRow')}
              </button>
              <button
                type="button"
                onClick={deleteSelected}
                disabled={busy || selectedRow === null}
                className="flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-0.5 font-mono text-[11px] font-medium text-zinc-400 transition hover:text-rose-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <TrashIcon />
                {t('sql.action.deleteRow')}
              </button>
            </>
          ) : (
            <span className="rounded border border-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
              {t('sql.grid.noPrimaryKey')}
            </span>
          )
        ) : null}
      </div>

      {result.rows.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="font-mono text-[13px] text-zinc-600">{t('sql.results.empty')}</p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse font-mono text-[12px]">
            <thead className="sticky top-0 z-10 bg-zinc-950">
              <tr>
                {editable ? <th className="w-8 border-b border-zinc-800 px-2 py-1.5" /> : null}
                {result.columns.map((column) => (
                  <th
                    key={column}
                    className="border-b border-zinc-800 px-3 py-1.5 text-left font-semibold tracking-wide text-zinc-400 whitespace-nowrap"
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, rowIndex) => {
                const selected = selectedRow === rowIndex;
                return (
                  <tr
                    key={rowIndex}
                    className={`border-b border-zinc-900/70 ${
                      selected ? 'bg-emerald-500/5' : 'hover:bg-zinc-900/40'
                    }`}
                  >
                    {editable ? (
                      <td className="px-2 py-1 align-top">
                        <button
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          aria-label={t('sql.action.deleteRow')}
                          onClick={() => setSelectedRow(selected ? null : rowIndex)}
                          className={`h-3 w-3 rounded-full border transition-colors ${
                            selected
                              ? 'border-emerald-500/50 bg-emerald-500/30'
                              : 'border-zinc-700 bg-zinc-800/60'
                          }`}
                        />
                      </td>
                    ) : null}
                    {result.columns.map((column, colIndex) => {
                      const isEditing = editing?.row === rowIndex && editing.col === colIndex;
                      return (
                        <td
                          key={column}
                          onDoubleClick={() => startEdit(rowIndex, colIndex)}
                          className={`px-3 py-1 align-top tabular-nums ${
                            editable ? 'cursor-text text-zinc-300' : 'text-zinc-300'
                          }`}
                        >
                          {isEditing ? (
                            <input
                              autoFocus
                              value={draft}
                              onChange={(e) => setDraft(e.target.value)}
                              onBlur={commitEdit}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') commitEdit();
                                if (e.key === 'Escape') setEditing(null);
                              }}
                              spellCheck={false}
                              className="w-full min-w-[6rem] rounded border border-emerald-500/40 bg-zinc-900/80 px-1.5 py-0.5 font-mono text-[12px] text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                            />
                          ) : (
                            <CellDisplay value={row[colIndex] ?? null} />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showInsert ? (
        <InsertRowDialog
          columns={result.columns}
          onCancel={() => setShowInsert(false)}
          onConfirm={insertRow}
        />
      ) : null}
    </div>
  );
}

export default memo(SqlResultsGrid);
