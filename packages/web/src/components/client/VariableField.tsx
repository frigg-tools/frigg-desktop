import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';

export interface VariableSuggestion {
  name: string;
  value: string;
}

const LAYER_CLASS =
  'm-0 w-full whitespace-pre-wrap break-words px-2.5 py-2 font-mono text-xs leading-relaxed';

interface VariableFieldProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  variables: VariableSuggestion[];
  className: string;
  wrapperClassName?: string;
  placeholder?: string;
  ariaLabel?: string;
  multiline?: boolean;
  rows?: number;
  codeAssist?: boolean;
  highlight?: (value: string) => ReactNode;
}

interface OpenToken {
  start: number;
  partial: string;
}

const OPEN_PAIRS: Record<string, string> = { '{': '}', '[': ']', '(': ')' };
const CLOSERS = new Set(['}', ']', ')']);
const INDENT = '  ';

function findOpenToken(value: string, caret: number): OpenToken | null {
  const upto = value.slice(0, caret);
  const open = upto.lastIndexOf('{{');
  if (open === -1) return null;
  const between = upto.slice(open + 2);
  if (between.includes('}}')) return null;
  if (!/^[\w.-]*$/.test(between)) return null;
  return { start: open, partial: between };
}

function lineIndent(value: string, caret: number): string {
  const lineStart = value.lastIndexOf('\n', caret - 1) + 1;
  const match = value.slice(lineStart, caret).match(/^[ \t]*/);
  return match ? match[0] : '';
}

export default function VariableField({
  value,
  onChange,
  onBlur,
  variables,
  className,
  wrapperClassName,
  placeholder,
  ariaLabel,
  multiline = false,
  rows,
  codeAssist = false,
  highlight,
}: VariableFieldProps) {
  const fieldRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [token, setToken] = useState<OpenToken | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const pendingCaret = useRef<number | null>(null);

  const syncScroll = () => {
    if (overlayRef.current && fieldRef.current) {
      overlayRef.current.scrollLeft = fieldRef.current.scrollLeft;
    }
  };

  const matches = token
    ? variables.filter((v) => v.name.toLowerCase().includes(token.partial.toLowerCase())).slice(0, 8)
    : [];
  const open = token !== null && matches.length > 0;

  useEffect(() => {
    setActiveIndex(0);
  }, [token?.partial]);

  useLayoutEffect(() => {
    if (pendingCaret.current !== null && fieldRef.current) {
      const pos = pendingCaret.current;
      pendingCaret.current = null;
      fieldRef.current.focus();
      fieldRef.current.setSelectionRange(pos, pos);
    }
  }, [value]);

  const syncToken = () => {
    const el = fieldRef.current;
    if (!el) return;
    setToken(findOpenToken(el.value, el.selectionStart ?? el.value.length));
  };

  const applyEdit = (next: string, caret: number) => {
    pendingCaret.current = caret;
    setToken(null);
    onChange(next);
  };

  const accept = (suggestion: VariableSuggestion) => {
    if (!token) return;
    const caret = fieldRef.current?.selectionStart ?? value.length;
    const inserted = `{{${suggestion.name}}}`;
    applyEdit(`${value.slice(0, token.start)}${inserted}${value.slice(caret)}`, token.start + inserted.length);
  };

  const handleCodeAssist = (event: ReactKeyboardEvent) => {
    const el = fieldRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const key = event.key;

    if (CLOSERS.has(key) && start === end && value[start] === key) {
      event.preventDefault();
      el.setSelectionRange(start + 1, start + 1);
      return;
    }
    if (OPEN_PAIRS[key] && start === end) {
      const close = OPEN_PAIRS[key];
      event.preventDefault();
      applyEdit(`${value.slice(0, start)}${key}${close}${value.slice(end)}`, start + 1);
      return;
    }
    if (key === 'Enter' && start === end) {
      const indent = lineIndent(value, start);
      const before = value[start - 1];
      const after = value[start];
      if ((before === '{' && after === '}') || (before === '[' && after === ']')) {
        event.preventDefault();
        const insert = `\n${indent}${INDENT}\n${indent}`;
        applyEdit(`${value.slice(0, start)}${insert}${value.slice(end)}`, start + 1 + indent.length + INDENT.length);
      } else if (indent.length > 0) {
        event.preventDefault();
        applyEdit(`${value.slice(0, start)}\n${indent}${value.slice(end)}`, start + 1 + indent.length);
      }
      return;
    }
    if (key === 'Tab') {
      event.preventDefault();
      applyEdit(`${value.slice(0, start)}${INDENT}${value.slice(end)}`, start + INDENT.length);
      return;
    }
    if (key === 'Backspace' && start === end && start > 0 && OPEN_PAIRS[value[start - 1]] === value[start]) {
      event.preventDefault();
      applyEdit(`${value.slice(0, start - 1)}${value.slice(start + 1)}`, start - 1);
    }
  };

  const handleKeyDown = (event: ReactKeyboardEvent) => {
    if (event.nativeEvent.isComposing || event.key === 'Dead') return;
    if (open) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((h) => (h + 1) % matches.length);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((h) => (h - 1 + matches.length) % matches.length);
      } else if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        accept(matches[activeIndex]);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        setToken(null);
      }
      return;
    }
    if (codeAssist) handleCodeAssist(event);
  };

  const shared = {
    ref: fieldRef,
    value,
    placeholder,
    spellCheck: false,
    'aria-label': ariaLabel,
    onChange: (e: { target: { value: string } }) => {
      onChange(e.target.value);
      requestAnimationFrame(syncToken);
    },
    onKeyUp: syncToken,
    onClick: syncToken,
    onKeyDown: handleKeyDown,
    onScroll: syncScroll,
    onBlur: () => {
      window.setTimeout(() => setToken(null), 120);
      onBlur?.();
    },
    className,
  };

  const highlightMode = highlight !== undefined && multiline;
  const highlightInputMode = highlight !== undefined && !multiline;

  return (
    <div className={`relative ${wrapperClassName ?? ''}`}>
      {highlightMode ? (
        <div className="relative rounded-md border border-zinc-800 bg-zinc-900/60 focus-within:border-emerald-500/40 focus-within:ring-2 focus-within:ring-emerald-500/40">
          <pre
            aria-hidden
            className={`${LAYER_CLASS} pointer-events-none text-zinc-300`}
            style={{ minHeight: `${(rows ?? 8) * 1.4}rem` }}
          >
            {highlight(value)}
            {'\n'}
          </pre>
          <textarea
            {...shared}
            className={`${LAYER_CLASS} absolute inset-0 resize-none overflow-hidden bg-transparent text-transparent caret-emerald-400 outline-none`}
          />
        </div>
      ) : highlightInputMode ? (
        <div className="relative overflow-hidden rounded-md border border-zinc-800 bg-zinc-900/60 focus-within:border-emerald-500/40 focus-within:ring-2 focus-within:ring-emerald-500/40">
          <div
            ref={overlayRef}
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre px-2.5 py-1.5 font-mono text-xs text-zinc-200"
          >
            {highlight(value)}
          </div>
          <input
            {...shared}
            className="relative block w-full bg-transparent px-2.5 py-1.5 font-mono text-xs text-transparent caret-emerald-400 outline-none placeholder:text-zinc-600"
          />
        </div>
      ) : multiline ? (
        <textarea {...shared} rows={rows} />
      ) : (
        <input {...shared} />
      )}
      {open ? (
        <div className="absolute left-0 top-full z-30 mt-1 max-h-56 w-full min-w-[12rem] max-w-sm overflow-y-auto rounded-md border border-zinc-700/80 bg-zinc-900 py-1 shadow-2xl">
          {matches.map((match, index) => (
            <button
              key={match.name}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                accept(match);
              }}
              onMouseEnter={() => setActiveIndex(index)}
              className={`flex w-full items-center gap-2 px-2.5 py-1 text-left font-mono text-[11px] ${
                index === activeIndex ? 'bg-emerald-500/10' : ''
              }`}
            >
              <span className="shrink-0 text-emerald-400">{`{{${match.name}}}`}</span>
              {match.value ? (
                <span className="min-w-0 flex-1 truncate text-zinc-600">{match.value}</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
