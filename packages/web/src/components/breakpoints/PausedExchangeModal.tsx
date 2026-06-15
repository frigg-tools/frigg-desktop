import { useEffect, useMemo, useState } from 'react';
import type {
  ApiKeyValue,
  BreakpointResume,
  PausedExchange,
} from '@frigg/shared';
import { useAppStore } from '../../store';
import { useT } from '../../i18n';
import {
  CloseIcon,
  FieldLabel,
  PlusIcon,
  inputClass,
  monoInputClass,
  monoTextareaClass,
} from '../client/shared';

interface HeaderRow extends ApiKeyValue {
  id: string;
}

function headersToRows(headers: Record<string, string>): HeaderRow[] {
  return Object.entries(headers).map(([key, value]) => ({
    id: crypto.randomUUID(),
    key,
    value,
    enabled: true,
  }));
}

function rowsToHeaders(rows: HeaderRow[]): ApiKeyValue[] {
  return rows
    .filter((row) => row.key.trim().length > 0)
    .map(({ key, value, enabled }) => ({ key, value, enabled }));
}

interface HeaderEditorProps {
  rows: HeaderRow[];
  onChange: (rows: HeaderRow[]) => void;
}

function HeaderEditor({ rows, onChange }: HeaderEditorProps) {
  const t = useT();
  const updateRow = (id: string, patch: Partial<HeaderRow>) => {
    onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };
  return (
    <div className="space-y-1.5">
      {rows.map((row) => (
        <div key={row.id} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] items-center gap-1.5">
          <input
            value={row.key}
            onChange={(e) => updateRow(row.id, { key: e.target.value })}
            spellCheck={false}
            className={monoInputClass}
          />
          <input
            value={row.value}
            onChange={(e) => updateRow(row.id, { value: e.target.value })}
            spellCheck={false}
            className={monoInputClass}
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
      <button
        type="button"
        onClick={() => onChange([...rows, { id: crypto.randomUUID(), key: '', value: '', enabled: true }])}
        className="flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1 text-[11px] font-medium text-zinc-400 transition hover:text-zinc-200 active:scale-[0.98]"
      >
        <PlusIcon />
        {t('action.add')}
      </button>
    </div>
  );
}

function ActionButton({
  variant,
  onClick,
  children,
}: {
  variant: 'primary' | 'neutral' | 'danger';
  onClick: () => void;
  children: string;
}) {
  const base =
    'rounded-md px-3 py-1.5 text-xs font-semibold transition active:scale-[0.98]';
  const styles =
    variant === 'primary'
      ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
      : variant === 'danger'
        ? 'border border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-rose-500/30 hover:text-rose-400'
        : 'border border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-zinc-200';
  return (
    <button type="button" onClick={onClick} className={`${base} ${styles}`}>
      {children}
    </button>
  );
}

function RequestEditor({ exchange }: { exchange: PausedExchange }) {
  const t = useT();
  const resumeBreakpoint = useAppStore((s) => s.resumeBreakpoint);

  const [method, setMethod] = useState(exchange.request.method);
  const [url, setUrl] = useState(exchange.request.url);
  const [headerRows, setHeaderRows] = useState<HeaderRow[]>(() => headersToRows(exchange.request.headers));
  const [body, setBody] = useState(exchange.request.body);

  const [responding, setResponding] = useState(false);
  const [statusCode, setStatusCode] = useState(200);
  const [respHeaderRows, setRespHeaderRows] = useState<HeaderRow[]>([]);
  const [respBody, setRespBody] = useState('');

  const resume = (action: BreakpointResume) => {
    void resumeBreakpoint(exchange.id, action).catch(() => undefined);
  };

  const sendRequest = () =>
    resume({
      action: 'send-request',
      edit: { method, url, headers: rowsToHeaders(headerRows), body },
    });

  const respond = () =>
    resume({
      action: 'respond',
      response: { statusCode, headers: rowsToHeaders(respHeaderRows), body: respBody },
    });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-2">
        <div>
          <FieldLabel>{t('breakpoints.modal.method')}</FieldLabel>
          <input
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            spellCheck={false}
            className={monoInputClass}
          />
        </div>
        <div>
          <FieldLabel>{t('breakpoints.modal.url')}</FieldLabel>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            spellCheck={false}
            className={monoInputClass}
          />
        </div>
      </div>
      <div>
        <FieldLabel>{t('breakpoints.modal.headers')}</FieldLabel>
        <HeaderEditor rows={headerRows} onChange={setHeaderRows} />
      </div>
      <div>
        <FieldLabel>{t('breakpoints.modal.body')}</FieldLabel>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          spellCheck={false}
          rows={6}
          className={monoTextareaClass}
        />
      </div>

      {responding ? (
        <div className="space-y-3 rounded-md border border-zinc-800 bg-zinc-900/40 p-3">
          <FieldLabel>{t('breakpoints.modal.respondForm')}</FieldLabel>
          <div>
            <FieldLabel>{t('breakpoints.modal.statusCode')}</FieldLabel>
            <input
              type="number"
              value={statusCode}
              onChange={(e) => setStatusCode(Number(e.target.value) || 0)}
              className={`${inputClass} w-28`}
            />
          </div>
          <div>
            <FieldLabel>{t('breakpoints.modal.headers')}</FieldLabel>
            <HeaderEditor rows={respHeaderRows} onChange={setRespHeaderRows} />
          </div>
          <div>
            <FieldLabel>{t('breakpoints.modal.body')}</FieldLabel>
            <textarea
              value={respBody}
              onChange={(e) => setRespBody(e.target.value)}
              spellCheck={false}
              rows={5}
              className={monoTextareaClass}
            />
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-2 pt-1">
        <ActionButton variant="danger" onClick={() => resume({ action: 'abort' })}>
          {t('breakpoints.action.abort')}
        </ActionButton>
        {responding ? (
          <>
            <ActionButton variant="neutral" onClick={() => setResponding(false)}>
              {t('breakpoints.action.cancel')}
            </ActionButton>
            <ActionButton variant="primary" onClick={respond}>
              {t('breakpoints.action.respond')}
            </ActionButton>
          </>
        ) : (
          <>
            <ActionButton variant="neutral" onClick={() => setResponding(true)}>
              {t('breakpoints.action.respond')}
            </ActionButton>
            <ActionButton variant="primary" onClick={sendRequest}>
              {t('breakpoints.action.continue')}
            </ActionButton>
          </>
        )}
      </div>
    </div>
  );
}

function ResponseEditor({ exchange }: { exchange: PausedExchange }) {
  const t = useT();
  const resumeBreakpoint = useAppStore((s) => s.resumeBreakpoint);
  const response = exchange.response;

  const [statusCode, setStatusCode] = useState(response?.statusCode ?? 200);
  const [headerRows, setHeaderRows] = useState<HeaderRow[]>(() =>
    headersToRows(response?.headers ?? {}),
  );
  const [body, setBody] = useState(response?.body ?? '');

  const resume = (action: BreakpointResume) => {
    void resumeBreakpoint(exchange.id, action).catch(() => undefined);
  };

  const sendResponse = () =>
    resume({
      action: 'send-response',
      edit: { statusCode, headers: rowsToHeaders(headerRows), body },
    });

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-zinc-800 bg-zinc-900/40 px-3 py-2">
        <FieldLabel>{t('breakpoints.modal.requestInfo')}</FieldLabel>
        <p className="font-mono text-xs text-zinc-300">
          <span className="text-emerald-400">{exchange.request.method}</span> {exchange.request.url}
        </p>
      </div>
      <div>
        <FieldLabel>{t('breakpoints.modal.statusCode')}</FieldLabel>
        <input
          type="number"
          value={statusCode}
          onChange={(e) => setStatusCode(Number(e.target.value) || 0)}
          className={`${inputClass} w-28`}
        />
      </div>
      <div>
        <FieldLabel>{t('breakpoints.modal.headers')}</FieldLabel>
        <HeaderEditor rows={headerRows} onChange={setHeaderRows} />
      </div>
      <div>
        <FieldLabel>{t('breakpoints.modal.body')}</FieldLabel>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          spellCheck={false}
          rows={6}
          className={monoTextareaClass}
        />
      </div>
      <div className="flex items-center justify-end gap-2 pt-1">
        <ActionButton variant="danger" onClick={() => resume({ action: 'abort' })}>
          {t('breakpoints.action.abort')}
        </ActionButton>
        <ActionButton variant="primary" onClick={sendResponse}>
          {t('breakpoints.action.continue')}
        </ActionButton>
      </div>
    </div>
  );
}

export default function PausedExchangeModal() {
  const t = useT();
  const paused = useAppStore((s) => s.breakpoints.paused);
  const resumeBreakpoint = useAppStore((s) => s.resumeBreakpoint);
  const current = useMemo(() => paused[0] ?? null, [paused]);

  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        void resumeBreakpoint(current.id, { action: 'abort' }).catch(() => undefined);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, resumeBreakpoint]);

  if (!current) return null;

  const title =
    current.direction === 'request'
      ? t('breakpoints.modal.title.request')
      : t('breakpoints.modal.title.response');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-sm">
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800/80 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-amber-400" />
            <h2 className="font-display text-sm font-semibold tracking-wide text-zinc-100">{title}</h2>
            {paused.length > 1 ? (
              <span className="rounded border border-zinc-800 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-zinc-500">
                {paused.length}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => void resumeBreakpoint(current.id, { action: 'abort' }).catch(() => undefined)}
            aria-label={t('breakpoints.action.abort')}
            className="rounded p-1 text-zinc-600 transition hover:text-zinc-300"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {current.direction === 'request' ? (
            <RequestEditor key={current.id} exchange={current} />
          ) : (
            <ResponseEditor key={current.id} exchange={current} />
          )}
        </div>
      </div>
    </div>
  );
}
