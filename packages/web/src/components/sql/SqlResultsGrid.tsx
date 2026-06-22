import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SqlCell, SqlColumn, SqlRowEdit, SqlTable } from '@frigg/shared';
import { useAppStore } from '../../store';
import { useT } from '../../i18n';
import { CloseIcon, PlusIcon, TrashIcon } from '../client/shared';
import FindBar from '../FindBar';
import { highlightMatches } from '../traffic/find';

const ROW_HEIGHT = 28;
const OVERSCAN = 8;
const LOAD_MORE_PX = 600;

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

function columnWidth(name: string): number {
  return Math.min(360, Math.max(120, name.length * 9 + 44));
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

function SqlResultsGrid() {
  const t = useT();
  const result = useAppStore((s) => s.sqlResult);
  const rows = useAppStore((s) => s.sqlRows);
  const schema = useAppStore((s) => s.sqlSchema);
  const currentTable = useAppStore((s) => s.sqlCurrentTable);
  const busy = useAppStore((s) => s.sqlBusy);
  const hasMore = useAppStore((s) => s.sqlHasMore);
  const totalRows = useAppStore((s) => s.sqlTotalRows);
  const loadingMore = useAppStore((s) => s.sqlLoadingMore);
  const editSqlRow = useAppStore((s) => s.editSqlRow);
  const loadMoreSql = useAppStore((s) => s.loadMoreSql);

  const columns = result?.columns ?? [];

  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [editing, setEditing] = useState<{ row: number; col: number } | null>(null);
  const [draft, setDraft] = useState('');
  const [showInsert, setShowInsert] = useState(false);

  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef(0);

  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [activeMatch, setActiveMatch] = useState(0);
  const findInputRef = useRef<HTMLInputElement | null>(null);

  const tableMeta: SqlTable | null = useMemo(
    () => (currentTable ? schema?.tables.find((tbl) => tbl.name === currentTable) ?? null : null),
    [schema, currentTable],
  );

  const pkColumns: SqlColumn[] = useMemo(
    () => tableMeta?.columns.filter((column) => column.isPrimaryKey) ?? [],
    [tableMeta],
  );

  const editable = currentTable !== null && tableMeta !== null && pkColumns.length > 0;

  const widths = useMemo(() => columns.map((c) => columnWidth(c)), [columns]);
  const gridTemplate = useMemo(
    () => (editable ? '32px ' : '') + widths.map((w) => `${w}px`).join(' '),
    [widths, editable],
  );
  const contentWidth = (editable ? 32 : 0) + widths.reduce((a, b) => a + b, 0);

  const matches = useMemo(() => {
    const needle = findQuery.trim().toLowerCase();
    if (needle === '') return [] as Array<{ row: number; col: number }>;
    const found: Array<{ row: number; col: number }> = [];
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      for (let c = 0; c < columns.length; c++) {
        if (cellText(row[c] ?? null).toLowerCase().includes(needle)) found.push({ row: r, col: c });
      }
    }
    return found;
  }, [rows, columns, findQuery]);

  const activeCell = matches.length > 0 ? matches[activeMatch % matches.length] : null;

  const onScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (frameRef.current === 0) {
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = 0;
        const node = containerRef.current;
        if (!node) return;
        setScrollTop(node.scrollTop);
        setViewportH(node.clientHeight);
        if (
          node.scrollHeight - node.scrollTop - node.clientHeight < LOAD_MORE_PX &&
          hasMore &&
          !loadingMore
        ) {
          void loadMoreSql().catch(() => undefined);
        }
      });
    }
  }, [hasMore, loadingMore, loadMoreSql]);

  useEffect(() => {
    const el = containerRef.current;
    if (el) setViewportH(el.clientHeight);
  }, [result]);

  useEffect(() => {
    if (activeCell === null) return;
    const el = containerRef.current;
    if (!el) return;
    const target = activeCell.row * ROW_HEIGHT - el.clientHeight / 2 + ROW_HEIGHT;
    el.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
  }, [activeCell]);

  useEffect(() => {
    setActiveMatch(0);
  }, [findQuery]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setFindOpen(true);
        requestAnimationFrame(() => findInputRef.current?.focus());
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const nextMatch = () => matches.length > 0 && setActiveMatch((i) => (i + 1) % matches.length);
  const prevMatch = () =>
    matches.length > 0 && setActiveMatch((i) => (i - 1 + matches.length) % matches.length);
  const closeFind = () => {
    setFindOpen(false);
    setFindQuery('');
  };

  const buildPk = (rowIndex: number): Array<{ column: string; value: SqlCell }> =>
    pkColumns.map((column) => {
      const colIndex = columns.indexOf(column.name);
      return {
        column: column.name,
        value: colIndex >= 0 ? rows[rowIndex][colIndex] ?? null : null,
      };
    });

  const commitEdit = () => {
    if (!editing || !currentTable) {
      setEditing(null);
      return;
    }
    const original = rows[editing.row][editing.col] ?? null;
    if (draft === cellText(original)) {
      setEditing(null);
      return;
    }
    const column = columns[editing.col];
    const lowered = draft.trim().toLowerCase();
    const next: SqlCell =
      typeof original === 'boolean' && (lowered === 'true' || lowered === 'false')
        ? lowered === 'true'
        : parseCellInput(draft);
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
    setDraft(cellText(rows[rowIndex][colIndex] ?? null));
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

  if (!result) return null;

  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(
    rows.length,
    Math.ceil((scrollTop + viewportH) / ROW_HEIGHT) + OVERSCAN,
  );
  const visible = rows.slice(startIndex, endIndex);

  const countLabel =
    totalRows !== null && totalRows !== undefined
      ? t('sql.results.ofTotal', { loaded: rows.length, total: totalRows })
      : result.affectedRows !== null
        ? t('sql.results.affected', { count: result.affectedRows })
        : t('sql.results.rowCount', { count: rows.length });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-zinc-800/80 bg-zinc-950/60 px-4 py-1.5">
        <span className="font-mono text-[10px] tabular-nums text-zinc-500">{countLabel}</span>
        <span className="font-mono text-[10px] tabular-nums text-zinc-600">
          {t('sql.results.durationMs', { ms: result.durationMs })}
        </span>
        {findOpen ? (
          <FindBar
            query={findQuery}
            onQuery={setFindQuery}
            total={matches.length}
            active={matches.length === 0 ? 0 : (activeMatch % matches.length) + 1}
            onNext={nextMatch}
            onPrev={prevMatch}
            onClose={closeFind}
            inputRef={findInputRef}
            placeholder={t('sql.find.placeholder')}
            noneLabel={t('sql.find.none')}
            prevLabel={t('sql.find.prev')}
            nextLabel={t('sql.find.next')}
          />
        ) : null}
        <div className="flex-1" />
        {editable ? (
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
        ) : currentTable !== null ? (
          <span className="rounded border border-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
            {t('sql.grid.noPrimaryKey')}
          </span>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="font-mono text-[13px] text-zinc-600">{t('sql.results.empty')}</p>
        </div>
      ) : (
        <div ref={containerRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-auto">
          <div style={{ width: contentWidth }} className="min-w-full font-mono text-[12px]">
            <div
              className="sticky top-0 z-10 grid border-b border-zinc-800 bg-zinc-950"
              style={{ gridTemplateColumns: gridTemplate, height: ROW_HEIGHT }}
            >
              {editable ? <div /> : null}
              {columns.map((column) => (
                <div
                  key={column}
                  className="flex items-center truncate px-3 text-left font-semibold tracking-wide text-zinc-400"
                  title={column}
                >
                  {column}
                </div>
              ))}
            </div>
            <div style={{ height: rows.length * ROW_HEIGHT, position: 'relative' }}>
              <div style={{ transform: `translateY(${startIndex * ROW_HEIGHT}px)` }}>
                {visible.map((row, i) => {
                  const rowIndex = startIndex + i;
                  const selected = selectedRow === rowIndex;
                  return (
                    <div
                      key={rowIndex}
                      className={`grid border-b border-zinc-900/70 ${
                        selected ? 'bg-emerald-500/5' : 'hover:bg-zinc-900/40'
                      }`}
                      style={{ gridTemplateColumns: gridTemplate, height: ROW_HEIGHT }}
                    >
                      {editable ? (
                        <div className="flex items-center justify-center">
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
                        </div>
                      ) : null}
                      {columns.map((column, colIndex) => {
                        const isEditing = editing?.row === rowIndex && editing.col === colIndex;
                        const value = row[colIndex] ?? null;
                        const text = cellText(value);
                        const isActiveMatch =
                          activeCell?.row === rowIndex && activeCell.col === colIndex;
                        return (
                          <div
                            key={column}
                            onDoubleClick={() => startEdit(rowIndex, colIndex)}
                            className={`flex items-center truncate px-3 tabular-nums ${
                              editable ? 'cursor-text' : ''
                            } ${isActiveMatch ? 'bg-amber-500/20 ring-1 ring-amber-400/50' : ''} text-zinc-300`}
                            title={text}
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
                                className="w-full rounded border border-emerald-500/40 bg-zinc-900/80 px-1 py-0.5 font-mono text-[12px] text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                              />
                            ) : value === null ? (
                              <span className="italic text-zinc-700">NULL</span>
                            ) : findQuery.trim() !== '' ? (
                              <span className="truncate">{highlightMatches(text, findQuery)}</span>
                            ) : (
                              <span className="truncate">{text}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
            {hasMore ? (
              <div className="flex items-center justify-center border-t border-zinc-900/70 py-2">
                <button
                  type="button"
                  onClick={() => void loadMoreSql().catch(() => undefined)}
                  disabled={loadingMore}
                  className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-1 font-mono text-[11px] text-zinc-400 transition hover:text-zinc-200 disabled:opacity-50"
                >
                  {loadingMore ? t('sql.results.loadingMore') : t('sql.results.loadMore')}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {showInsert ? (
        <InsertRowDialog
          columns={columns}
          onCancel={() => setShowInsert(false)}
          onConfirm={insertRow}
        />
      ) : null}
    </div>
  );
}

export default memo(SqlResultsGrid);
