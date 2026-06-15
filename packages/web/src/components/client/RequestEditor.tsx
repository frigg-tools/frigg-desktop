import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ApiBody, ApiBodyMode, ApiKeyValue, ApiRequest } from '@frigg/shared';
import { useAppStore } from '../../store';
import { useT } from '../../i18n';
import {
  FieldLabel,
  KeyValueEditor,
  METHOD_OPTIONS,
  fromRows,
  monoInputClass,
  monoTextareaClass,
  selectClass,
  toRows,
  type ApiKeyValueRow,
} from './shared';
import VariableField, { type VariableSuggestion } from './VariableField';
import { highlightJson, jsonError } from './highlightJson';

type EditorTab = 'params' | 'headers' | 'body' | 'pre' | 'tests';

const BODY_MODES: ApiBodyMode[] = ['none', 'json', 'raw', 'form'];

const AUTOSAVE_DELAY_MS = 500;

interface DraftState {
  method: string;
  url: string;
  query: ApiKeyValueRow[];
  headers: ApiKeyValueRow[];
  bodyMode: ApiBodyMode;
  bodyRaw: string;
  bodyForm: ApiKeyValueRow[];
  preScript: string;
  testScript: string;
}

function draftFromRequest(request: ApiRequest): DraftState {
  return {
    method: request.method,
    url: request.url,
    query: toRows(request.query),
    headers: toRows(request.headers),
    bodyMode: request.body.mode,
    bodyRaw: request.body.raw,
    bodyForm: toRows(request.body.form),
    preScript: request.preScript,
    testScript: request.testScript,
  };
}

function draftToBody(draft: DraftState): ApiBody {
  return {
    mode: draft.bodyMode,
    raw: draft.bodyRaw,
    form: fromRows(draft.bodyForm),
  };
}

function draftToPatch(draft: DraftState): Partial<ApiRequest> {
  return {
    method: draft.method,
    url: draft.url,
    query: fromRows(draft.query),
    headers: fromRows(draft.headers),
    body: draftToBody(draft),
    preScript: draft.preScript,
    testScript: draft.testScript,
  };
}

function buildRunRequest(request: ApiRequest, draft: DraftState): ApiRequest {
  const patch = draftToPatch(draft);
  return {
    ...request,
    ...patch,
    query: patch.query as ApiKeyValue[],
    headers: patch.headers as ApiKeyValue[],
    body: patch.body as ApiBody,
  };
}

const PRE_SCRIPT_HINT = "pm.environment.set('accessToken', pm.variables.get('token'))";
const TEST_SCRIPT_HINT =
  "pm.test('ok', () => pm.expect(pm.response.code).toBe(200)); pm.environment.set('accessToken', pm.response.json().accessToken)";

function ScriptHint({ children }: { children: string }) {
  return (
    <p className="mt-1.5 break-all rounded border border-zinc-800/60 bg-zinc-900/40 px-2 py-1 font-mono text-[10px] leading-relaxed text-zinc-600">
      {children}
    </p>
  );
}

export default function RequestEditor({ request }: { request: ApiRequest }) {
  const t = useT();
  const updateApiRequest = useAppStore((s) => s.updateApiRequest);
  const runApiRequest = useAppStore((s) => s.runApiRequest);
  const apiRunning = useAppStore((s) => s.apiRunning);
  const workspaces = useAppStore((s) => s.apiWorkspaces);
  const environments = useAppStore((s) => s.apiEnvironments);
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);

  const variables = useMemo<VariableSuggestion[]>(() => {
    const workspace = workspaces.find((w) => w.id === activeWorkspaceId);
    if (!workspace) return [];
    const environment = environments.find((e) => e.id === workspace.activeEnvironmentId);
    const merged = new Map<string, string>();
    for (const variable of workspace.variables) {
      if (variable.enabled && variable.key) merged.set(variable.key, variable.value);
    }
    for (const variable of environment?.variables ?? []) {
      if (variable.enabled && variable.key) merged.set(variable.key, variable.value);
    }
    return [...merged].map(([name, value]) => ({ name, value }));
  }, [workspaces, environments, activeWorkspaceId]);

  const [draft, setDraft] = useState<DraftState>(() => draftFromRequest(request));
  const [tab, setTab] = useState<EditorTab>('params');
  const draftRef = useRef(draft);
  const saveTimer = useRef<number | null>(null);
  const dirty = useRef(false);

  draftRef.current = draft;

  const bodyJsonError = useMemo(
    () => (draft.bodyMode === 'json' ? jsonError(draft.bodyRaw) : null),
    [draft.bodyMode, draft.bodyRaw],
  );

  const flushSave = useCallback(() => {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (!dirty.current) return;
    dirty.current = false;
    void updateApiRequest(request.id, draftToPatch(draftRef.current)).catch(() => undefined);
  }, [request.id, updateApiRequest]);

  useEffect(() => {
    return () => {
      flushSave();
    };
  }, [flushSave]);

  const scheduleSave = useCallback(() => {
    dirty.current = true;
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      flushSave();
    }, AUTOSAVE_DELAY_MS);
  }, [flushSave]);

  const patchDraft = useCallback(
    (patch: Partial<DraftState>) => {
      setDraft((current) => ({ ...current, ...patch }));
      scheduleSave();
    },
    [scheduleSave],
  );

  const formatJson = () => {
    try {
      patchDraft({ bodyRaw: JSON.stringify(JSON.parse(draftRef.current.bodyRaw), null, 2) });
    } catch {
      return;
    }
  };

  const send = () => {
    if (apiRunning) return;
    flushSave();
    void runApiRequest(buildRunRequest(request, draftRef.current)).catch(() => undefined);
  };

  const methodOptions = useMemo(
    () => (METHOD_OPTIONS.includes(draft.method) ? METHOD_OPTIONS : [...METHOD_OPTIONS, draft.method]),
    [draft.method],
  );

  const tabs: Array<{ id: EditorTab; label: string; badge?: number }> = [
    { id: 'params', label: t('client.editor.params'), badge: draft.query.length },
    { id: 'headers', label: t('client.editor.headers'), badge: draft.headers.length },
    { id: 'body', label: t('client.editor.body') },
    { id: 'pre', label: t('client.editor.preRequest') },
    { id: 'tests', label: t('client.editor.tests') },
  ];

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex items-center gap-2 border-b border-zinc-800/80 px-4 py-3">
        <select
          value={draft.method}
          onChange={(e) => patchDraft({ method: e.target.value })}
          aria-label={t('client.editor.method')}
          className={`${selectClass} w-28 shrink-0 font-mono`}
        >
          {methodOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <VariableField
          value={draft.url}
          onChange={(url) => patchDraft({ url })}
          onBlur={flushSave}
          variables={variables}
          placeholder={t('client.editor.urlPlaceholder')}
          ariaLabel="URL"
          className={`${monoInputClass}`}
          wrapperClassName="min-w-0 flex-1"
        />
        <button
          type="button"
          onClick={send}
          disabled={apiRunning}
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-medium text-emerald-400 transition hover:bg-emerald-500/15 active:scale-[0.98] disabled:opacity-50"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5"
          >
            <path d="M22 2 11 13" />
            <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
          </svg>
          {apiRunning ? t('client.editor.sending') : t('client.editor.send')}
        </button>
      </div>

      <p className="border-b border-zinc-800/60 px-4 py-1.5 font-mono text-[10px] text-zinc-600">
        {t('client.editor.varHint')}
      </p>

      <div className="flex items-center gap-1 border-b border-zinc-800/80 px-3">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            className={`flex items-center gap-1.5 border-b-2 px-2.5 py-2 text-xs font-medium transition-colors ${
              tab === entry.id
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {entry.label}
            {entry.badge ? (
              <span className="font-mono text-[10px] tabular-nums text-zinc-600">{entry.badge}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {tab === 'params' ? (
          <KeyValueEditor
            rows={draft.query}
            onChange={(rows) => patchDraft({ query: rows })}
            variables={variables}
          />
        ) : null}

        {tab === 'headers' ? (
          <KeyValueEditor
            rows={draft.headers}
            onChange={(rows) => patchDraft({ headers: rows })}
            variables={variables}
          />
        ) : null}

        {tab === 'body' ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {BODY_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => patchDraft({ bodyMode: mode })}
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium transition active:scale-[0.98] ${
                    draft.bodyMode === mode
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                      : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {t(`client.editor.bodyMode.${mode}`)}
                </button>
              ))}
              {draft.bodyMode === 'json' ? (
                <button
                  type="button"
                  onClick={formatJson}
                  className="ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-widest text-zinc-500 transition hover:text-emerald-400 active:scale-[0.98]"
                >
                  {t('client.editor.formatJson')}
                </button>
              ) : null}
            </div>

            {draft.bodyMode === 'none' ? (
              <p className="text-xs text-zinc-600">{t('client.editor.bodyNone')}</p>
            ) : null}

            {draft.bodyMode === 'json' ? (
              <div>
                <VariableField
                  value={draft.bodyRaw}
                  onChange={(bodyRaw) => patchDraft({ bodyRaw })}
                  onBlur={flushSave}
                  variables={variables}
                  multiline
                  codeAssist
                  highlight={highlightJson}
                  rows={12}
                  placeholder={t('client.editor.bodyJsonPlaceholder')}
                  ariaLabel={t('client.editor.body')}
                  className={monoTextareaClass}
                />
                {bodyJsonError ? (
                  <p className="mt-1.5 flex items-start gap-1.5 font-mono text-[11px] text-rose-400">
                    <span className="select-none">⨯</span>
                    {bodyJsonError.message}
                  </p>
                ) : draft.bodyRaw.trim() !== '' ? (
                  <p className="mt-1.5 font-mono text-[11px] text-emerald-500/70">
                    {t('client.editor.jsonValid')}
                  </p>
                ) : null}
              </div>
            ) : null}

            {draft.bodyMode === 'raw' ? (
              <VariableField
                value={draft.bodyRaw}
                onChange={(bodyRaw) => patchDraft({ bodyRaw })}
                onBlur={flushSave}
                variables={variables}
                multiline
                codeAssist
                rows={12}
                placeholder={t('client.editor.bodyRawPlaceholder')}
                ariaLabel={t('client.editor.body')}
                className={monoTextareaClass}
              />
            ) : null}

            {draft.bodyMode === 'form' ? (
              <KeyValueEditor
                rows={draft.bodyForm}
                onChange={(rows) => patchDraft({ bodyForm: rows })}
                variables={variables}
              />
            ) : null}
          </div>
        ) : null}

        {tab === 'pre' ? (
          <div>
            <FieldLabel>{t('client.editor.preRequest')}</FieldLabel>
            <VariableField
              value={draft.preScript}
              onChange={(preScript) => patchDraft({ preScript })}
              onBlur={flushSave}
              variables={[]}
              multiline
              codeAssist
              rows={12}
              placeholder={t('client.editor.preScriptPlaceholder')}
              ariaLabel={t('client.editor.preRequest')}
              className={monoTextareaClass}
            />
            <ScriptHint>{PRE_SCRIPT_HINT}</ScriptHint>
          </div>
        ) : null}

        {tab === 'tests' ? (
          <div>
            <FieldLabel>{t('client.editor.tests')}</FieldLabel>
            <VariableField
              value={draft.testScript}
              onChange={(testScript) => patchDraft({ testScript })}
              onBlur={flushSave}
              variables={[]}
              multiline
              codeAssist
              rows={12}
              placeholder={t('client.editor.testScriptPlaceholder')}
              ariaLabel={t('client.editor.tests')}
              className={monoTextareaClass}
            />
            <ScriptHint>{TEST_SCRIPT_HINT}</ScriptHint>
          </div>
        ) : null}
      </div>
    </div>
  );
}
