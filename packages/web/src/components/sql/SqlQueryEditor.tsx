import { memo, useEffect, useRef } from 'react';
import { EditorView, keymap } from '@codemirror/view';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { sql, type SQLNamespace } from '@codemirror/lang-sql';
import { defaultKeymap } from '@codemirror/commands';
import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';
import type { SqlSchema } from '@frigg/shared';
import { useAppStore } from '../../store';
import { useT } from '../../i18n';
import { getSqlHistory } from './history';

function buildSchema(schema: SqlSchema | null): SQLNamespace {
  const result: Record<string, string[]> = {};
  if (!schema) return result;
  for (const table of schema.tables) {
    const columns = table.columns.map((column) => column.name);
    result[table.name] = columns;
    if (table.schema) {
      result[`${table.schema}.${table.name}`] = columns;
    }
  }
  return result;
}

function historyCompletions(context: CompletionContext): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos);
  const before = line.text.slice(0, context.pos - line.from);
  const trimmed = before.replace(/^\s*/, '');
  const indent = before.length - trimmed.length;
  const prefix = trimmed.toLowerCase();
  if (!context.explicit && prefix.length < 2) return null;
  const matches = getSqlHistory().filter(
    (statement) => statement.toLowerCase().startsWith(prefix) && statement.toLowerCase() !== prefix,
  );
  if (matches.length === 0) return null;
  return {
    from: line.from + indent,
    to: context.pos,
    filter: false,
    options: matches.slice(0, 6).map((statement) => ({
      label: statement.length > 70 ? `${statement.slice(0, 70)}…` : statement,
      detail: 'recent',
      type: 'text',
      apply: statement,
      boost: -50,
    })),
  };
}

function sqlLanguage(schema: SqlSchema | null): Extension {
  const support = sql({ schema: buildSchema(schema), upperCaseKeywords: true });
  return [support, support.language.data.of({ autocomplete: historyCompletions })];
}

const editorTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'transparent',
      color: '#e4e4e7',
      fontSize: '13px',
      height: '100%',
    },
    '.cm-scroller': {
      fontFamily:
        'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
      lineHeight: '1.6',
      overflow: 'auto',
    },
    '.cm-content': {
      caretColor: '#34d399',
      padding: '8px 0',
    },
    '&.cm-focused': {
      outline: 'none',
    },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: '#52525b',
      border: 'none',
    },
    '.cm-activeLine': {
      backgroundColor: 'rgba(52, 211, 153, 0.06)',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'transparent',
      color: '#a1a1aa',
    },
    '.cm-cursor': {
      borderLeftColor: '#34d399',
    },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
      backgroundColor: 'rgba(52, 211, 153, 0.22)',
    },
    '.cm-tooltip': {
      backgroundColor: '#18181b',
      border: '1px solid #27272a',
      color: '#e4e4e7',
    },
    '.cm-tooltip-autocomplete ul li[aria-selected]': {
      backgroundColor: 'rgba(52, 211, 153, 0.18)',
      color: '#34d399',
    },
  },
  { dark: true },
);

function SqlQueryEditor() {
  const t = useT();
  const sqlSchema = useAppStore((s) => s.sqlSchema);
  const setSqlEditorSql = useAppStore((s) => s.setSqlEditorSql);

  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const languageCompartment = useRef(new Compartment());

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const store = useAppStore.getState();

    const runStatement = (view: EditorView): boolean => {
      void useAppStore
        .getState()
        .runSql(view.state.doc.toString())
        .catch(() => undefined);
      return true;
    };

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        setSqlEditorSql(update.state.doc.toString());
      }
    });

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: store.sqlEditorSql,
        extensions: [
          languageCompartment.current.of(sqlLanguage(store.sqlSchema)),
          autocompletion({ activateOnTyping: true, maxRenderedOptions: 30 }),
          keymap.of([{ key: 'Mod-Enter', run: runStatement }, ...defaultKeymap]),
          editorTheme,
          EditorView.lineWrapping,
          updateListener,
        ],
      }),
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [setSqlEditorSql]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: languageCompartment.current.reconfigure(sqlLanguage(sqlSchema)),
    });
  }, [sqlSchema]);

  return (
    <div className="flex flex-col border-b border-zinc-800/80">
      <div className="flex items-center gap-2 px-4 pt-3">
        <span className="text-[10px] uppercase tracking-widest text-zinc-500">{t('sql.title')}</span>
        <span className="font-mono text-[10px] text-zinc-600">{t('sql.editor.hint')}</span>
      </div>
      <div ref={hostRef} className="max-h-64 min-h-[88px] overflow-auto px-4 py-2" />
    </div>
  );
}

export default memo(SqlQueryEditor);
