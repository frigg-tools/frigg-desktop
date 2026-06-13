import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type {
  BodyMatchMode,
  MockRule,
  MockRuleInput,
  TrafficExchange,
} from '@frigg/shared';
import { useAppStore } from '../../store';
import { useT } from '../../i18n';
import * as api from '../../api/client';
import HeadersEditor, {
  createHeaderRow,
  editorInputClass,
  headerRowsFromRecord,
  headerRowsToRecord,
  type HeaderRow,
} from './HeadersEditor';
import { flattenFolderTree } from './FolderTree';

const METHOD_OPTIONS = ['ANY', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const BODY_MATCH_MODES: BodyMatchMode[] = ['none', 'contains', 'exact'];
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'content-length',
  'content-encoding',
]);

interface RuleForm {
  name: string;
  method: string;
  hostPattern: string;
  pathPattern: string;
  queryContains: string;
  bodyMatchMode: BodyMatchMode;
  bodyMatchValue: string;
  statusCode: string;
  headers: HeaderRow[];
  body: string;
  delayMs: string;
  folderId: string;
  priority: string;
}

function isHopByHopHeader(name: string): boolean {
  const lower = name.toLowerCase();
  return HOP_BY_HOP_HEADERS.has(lower) || lower.startsWith('proxy-');
}

function mockableHeaderRows(headers: Record<string, string | string[]>): HeaderRow[] {
  return Object.entries(headers)
    .filter(([name]) => !isHopByHopHeader(name))
    .map(([name, value]) =>
      createHeaderRow(name, Array.isArray(value) ? value.join(', ') : value),
    );
}

function blankForm(folderId: string | null): RuleForm {
  return {
    name: '',
    method: 'ANY',
    hostPattern: '',
    pathPattern: '',
    queryContains: '',
    bodyMatchMode: 'none',
    bodyMatchValue: '',
    statusCode: '200',
    headers: [createHeaderRow('content-type', 'application/json')],
    body: '',
    delayMs: '',
    folderId: folderId ?? '',
    priority: '0',
  };
}

function formFromRule(rule: MockRule): RuleForm {
  return {
    name: rule.name,
    method: rule.matcher.method?.toUpperCase() ?? 'ANY',
    hostPattern: rule.matcher.hostPattern ?? '',
    pathPattern: rule.matcher.pathPattern,
    queryContains: rule.matcher.queryContains ?? '',
    bodyMatchMode: rule.matcher.bodyMatch?.mode ?? 'none',
    bodyMatchValue: rule.matcher.bodyMatch?.value ?? '',
    statusCode: String(rule.response.statusCode),
    headers: headerRowsFromRecord(rule.response.headers),
    body: rule.response.body,
    delayMs: rule.response.delayMs === undefined ? '' : String(rule.response.delayMs),
    folderId: rule.folderId ?? '',
    priority: String(rule.priority),
  };
}

function formFromExchange(exchange: TrafficExchange, folderId: string | null): RuleForm {
  const { request, response } = exchange;
  const method = request.method.toUpperCase();
  return {
    name: `${method} ${request.path}`,
    method,
    hostPattern: request.host,
    pathPattern: request.path,
    queryContains: '',
    bodyMatchMode: 'none',
    bodyMatchValue: '',
    statusCode: String(response?.statusCode ?? 200),
    headers: response
      ? mockableHeaderRows(response.headers)
      : [createHeaderRow('content-type', 'application/json')],
    body: response && response.body.encoding === 'utf8' ? response.body.data : '',
    delayMs: '',
    folderId: folderId ?? '',
    priority: '0',
  };
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-1 text-[10px] uppercase tracking-widest text-zinc-500">{children}</p>
  );
}

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <p className="border-b border-zinc-800/60 pb-1.5 text-[10px] uppercase tracking-widest text-zinc-400">
      {children}
    </p>
  );
}

interface RuleEditorProps {
  rule: MockRule | 'new';
}

export default function RuleEditor({ rule }: RuleEditorProps) {
  const t = useT();
  const closeRuleEditor = useAppStore((s) => s.closeRuleEditor);
  const refreshMocks = useAppStore((s) => s.refreshMocks);
  const folders = useAppStore((s) => s.folders);

  const [form, setForm] = useState<RuleForm>(() => {
    if (rule !== 'new') return formFromRule(rule);
    const { draftFromExchange, selectedFolderId } = useAppStore.getState();
    return draftFromExchange
      ? formFromExchange(draftFromExchange, selectedFolderId)
      : blankForm(selectedFolderId);
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const confirmTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (confirmTimer.current !== null) window.clearTimeout(confirmTimer.current);
    };
  }, []);

  const folderOptions = useMemo(() => flattenFolderTree(folders), [folders]);

  const methodOptions = METHOD_OPTIONS.includes(form.method)
    ? METHOD_OPTIONS
    : [...METHOD_OPTIONS, form.method];

  const update = <K extends keyof RuleForm>(key: K, value: RuleForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const formatJsonBody = () => {
    try {
      const parsed: unknown = JSON.parse(form.body);
      update('body', JSON.stringify(parsed, null, 2));
    } catch {
      return;
    }
  };

  const save = () => {
    const pathPattern = form.pathPattern.trim();
    if (pathPattern.length === 0) {
      setError(t('mocks.validation.pathRequired'));
      return;
    }
    const statusCode = Number.parseInt(form.statusCode, 10);
    if (!Number.isInteger(statusCode) || statusCode < 100 || statusCode > 599) {
      setError(t('mocks.validation.statusRange'));
      return;
    }
    const priority = form.priority.trim().length === 0 ? 0 : Number.parseInt(form.priority, 10);
    if (Number.isNaN(priority)) {
      setError(t('mocks.validation.priorityNumber'));
      return;
    }
    const delayRaw = form.delayMs.trim();
    const delayMs = delayRaw.length === 0 ? 0 : Number.parseInt(delayRaw, 10);
    if (Number.isNaN(delayMs) || delayMs < 0) {
      setError(t('mocks.validation.delayNonNegative'));
      return;
    }

    const hostPattern = form.hostPattern.trim();
    const queryContains = form.queryContains.trim();
    const input: MockRuleInput = {
      folderId: form.folderId === '' ? null : form.folderId,
      name: form.name.trim() || `${form.method} ${pathPattern}`,
      enabled: rule === 'new' ? true : rule.enabled,
      priority,
      matcher: {
        pathPattern,
        ...(form.method !== 'ANY' ? { method: form.method } : {}),
        ...(hostPattern.length > 0 ? { hostPattern } : {}),
        ...(queryContains.length > 0 ? { queryContains } : {}),
        ...(form.bodyMatchMode !== 'none'
          ? { bodyMatch: { mode: form.bodyMatchMode, value: form.bodyMatchValue } }
          : {}),
      },
      response: {
        statusCode,
        headers: headerRowsToRecord(form.headers),
        body: form.body,
        ...(delayMs > 0 ? { delayMs } : {}),
      },
    };

    setSaving(true);
    setError(null);
    const action = rule === 'new' ? api.createRule(input) : api.updateRule(rule.id, input);
    void action
      .then(async () => {
        await refreshMocks();
        closeRuleEditor();
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : t('mocks.error.saveFailed'));
        setSaving(false);
      });
  };

  const handleDelete = () => {
    if (rule === 'new') return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      if (confirmTimer.current !== null) window.clearTimeout(confirmTimer.current);
      confirmTimer.current = window.setTimeout(() => setConfirmingDelete(false), 2500);
      return;
    }
    void api
      .deleteRule(rule.id)
      .then(async () => {
        await refreshMocks();
        closeRuleEditor();
      })
      .catch((err: unknown) => {
        setConfirmingDelete(false);
        setError(err instanceof Error ? err.message : t('mocks.error.deleteFailed'));
      });
  };

  const selectClass = editorInputClass;

  return (
    <div className="flex h-full min-w-0 flex-col bg-zinc-900/40">
      <div className="flex items-center justify-between border-b border-zinc-800/80 px-4 py-3">
        <span className="text-[10px] uppercase tracking-widest text-zinc-500">
          {rule === 'new' ? t('mocks.editor.new') : t('mocks.editor.edit')}
        </span>
        <button
          type="button"
          onClick={closeRuleEditor}
          aria-label={t('mocks.editor.close')}
          className="rounded p-1 text-zinc-500 transition hover:text-zinc-200"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="h-3.5 w-3.5"
          >
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <div>
          <FieldLabel>{t('mocks.editor.name')}</FieldLabel>
          <input
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            placeholder={t('mocks.editor.namePlaceholder')}
            spellCheck={false}
            className="w-full rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 text-[13px] text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-500/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
        </div>

        <div className="space-y-3">
          <SectionHeading>{t('mocks.editor.matcher')}</SectionHeading>
          <div className="flex gap-2">
            <div className="w-28 shrink-0">
              <FieldLabel>{t('mocks.editor.method')}</FieldLabel>
              <select
                value={form.method}
                onChange={(e) => update('method', e.target.value)}
                className={selectClass}
              >
                {methodOptions.map((option) => (
                  <option key={option} value={option}>
                    {option === 'ANY' ? t('method.any') : option}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0 flex-1">
              <FieldLabel>{t('mocks.editor.hostPattern')}</FieldLabel>
              <input
                value={form.hostPattern}
                onChange={(e) => update('hostPattern', e.target.value)}
                placeholder={t('mocks.editor.hostPatternPlaceholder')}
                spellCheck={false}
                className={editorInputClass}
              />
            </div>
          </div>
          <div>
            <FieldLabel>{t('mocks.editor.pathPattern')}</FieldLabel>
            <input
              value={form.pathPattern}
              onChange={(e) => update('pathPattern', e.target.value)}
              placeholder={t('mocks.editor.pathPatternPlaceholder')}
              spellCheck={false}
              className={editorInputClass}
            />
          </div>
          <div>
            <FieldLabel>{t('mocks.editor.queryContains')}</FieldLabel>
            <input
              value={form.queryContains}
              onChange={(e) => update('queryContains', e.target.value)}
              placeholder={t('mocks.editor.queryContainsPlaceholder')}
              spellCheck={false}
              className={editorInputClass}
            />
          </div>
          <div className="flex gap-2">
            <div className="w-28 shrink-0">
              <FieldLabel>{t('mocks.editor.bodyMatch')}</FieldLabel>
              <select
                value={form.bodyMatchMode}
                onChange={(e) => update('bodyMatchMode', e.target.value as BodyMatchMode)}
                className={selectClass}
              >
                {BODY_MATCH_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {t(`mocks.editor.bodyMatchMode.${mode}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0 flex-1">
              <FieldLabel>{t('mocks.editor.bodyValue')}</FieldLabel>
              <input
                value={form.bodyMatchValue}
                onChange={(e) => update('bodyMatchValue', e.target.value)}
                placeholder={
                  form.bodyMatchMode === 'none'
                    ? t('mocks.editor.bodyValueDisabled')
                    : t('mocks.editor.bodyValuePlaceholder')
                }
                disabled={form.bodyMatchMode === 'none'}
                spellCheck={false}
                className={`${editorInputClass} disabled:opacity-40`}
              />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <SectionHeading>{t('mocks.editor.response')}</SectionHeading>
          <div className="flex gap-2">
            <div className="w-28 shrink-0">
              <FieldLabel>{t('mocks.editor.statusCode')}</FieldLabel>
              <input
                value={form.statusCode}
                onChange={(e) => update('statusCode', e.target.value)}
                inputMode="numeric"
                placeholder={t('mocks.editor.statusCodePlaceholder')}
                spellCheck={false}
                className={`${editorInputClass} tabular-nums`}
              />
            </div>
            <div className="w-32 shrink-0">
              <FieldLabel>{t('mocks.editor.delayMs')}</FieldLabel>
              <input
                value={form.delayMs}
                onChange={(e) => update('delayMs', e.target.value)}
                inputMode="numeric"
                placeholder={t('mocks.editor.delayMsPlaceholder')}
                spellCheck={false}
                className={`${editorInputClass} tabular-nums`}
              />
            </div>
          </div>
          <div>
            <FieldLabel>{t('mocks.editor.headers')}</FieldLabel>
            <HeadersEditor rows={form.headers} onChange={(rows) => update('headers', rows)} />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <FieldLabel>{t('mocks.editor.body')}</FieldLabel>
              <button
                type="button"
                onClick={formatJsonBody}
                className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-widest text-zinc-500 transition hover:text-emerald-400 active:scale-[0.98]"
              >
                {t('mocks.editor.formatJson')}
              </button>
            </div>
            <textarea
              value={form.body}
              onChange={(e) => update('body', e.target.value)}
              rows={9}
              placeholder={t('mocks.editor.bodyPlaceholder')}
              spellCheck={false}
              className={`${editorInputClass} resize-y leading-relaxed`}
            />
          </div>
        </div>

        <div className="space-y-3">
          <SectionHeading>{t('mocks.editor.placement')}</SectionHeading>
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <FieldLabel>{t('mocks.editor.folder')}</FieldLabel>
              <select
                value={form.folderId}
                onChange={(e) => update('folderId', e.target.value)}
                className={selectClass}
              >
                <option value="">{t('mocks.editor.noFolder')}</option>
                {folderOptions.map(({ folder, depth }) => (
                  <option key={folder.id} value={folder.id}>
                    {`${'  '.repeat(depth)}${folder.name}`}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-28 shrink-0">
              <FieldLabel>{t('mocks.editor.priority')}</FieldLabel>
              <input
                value={form.priority}
                onChange={(e) => update('priority', e.target.value)}
                inputMode="numeric"
                placeholder={t('mocks.editor.priorityPlaceholder')}
                spellCheck={false}
                className={`${editorInputClass} tabular-nums`}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-zinc-800/80 px-4 py-3">
        {rule !== 'new' ? (
          <button
            type="button"
            onClick={handleDelete}
            className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition active:scale-[0.98] ${
              confirmingDelete
                ? 'border-rose-500/40 bg-rose-500/10 text-rose-400'
                : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-rose-500/30 hover:text-rose-400'
            }`}
          >
            {confirmingDelete ? t('action.confirm') : t('action.delete')}
          </button>
        ) : null}
        <p className="min-w-0 flex-1 truncate text-right text-xs text-rose-400">{error ?? ''}</p>
        <button
          type="button"
          onClick={closeRuleEditor}
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
  );
}
