import { type RefObject } from 'react';
import { useT } from '../i18n';

interface FindBarProps {
  query: string;
  onQuery: (value: string) => void;
  total: number;
  active: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
  placeholder: string;
  noneLabel: string;
  prevLabel: string;
  nextLabel: string;
}

function ChevronButton({
  onClick,
  ariaLabel,
  up,
}: {
  onClick: () => void;
  ariaLabel: string;
  up?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="rounded p-1 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-30"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="h-3.5 w-3.5">
        {up ? <path d="m6 15 6-6 6 6" /> : <path d="m6 9 6 6 6-6" />}
      </svg>
    </button>
  );
}

export default function FindBar({
  query,
  onQuery,
  total,
  active,
  onNext,
  onPrev,
  onClose,
  inputRef,
  placeholder,
  noneLabel,
  prevLabel,
  nextLabel,
}: FindBarProps) {
  const t = useT();
  return (
    <div className="flex items-center gap-1 rounded-md border border-zinc-700/80 bg-zinc-900 px-1.5 py-1">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) onPrev();
            else onNext();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
        placeholder={placeholder}
        spellCheck={false}
        className="w-44 bg-transparent px-1.5 py-0.5 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
      />
      <span className="min-w-[3rem] shrink-0 text-center font-mono text-[10px] tabular-nums text-zinc-500">
        {query.trim() === '' ? '' : total === 0 ? noneLabel : `${active}/${total}`}
      </span>
      <ChevronButton up onClick={onPrev} ariaLabel={prevLabel} />
      <ChevronButton onClick={onNext} ariaLabel={nextLabel} />
      <button
        type="button"
        onClick={onClose}
        aria-label={t('action.close')}
        className="rounded p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-3.5 w-3.5">
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      </button>
    </div>
  );
}
