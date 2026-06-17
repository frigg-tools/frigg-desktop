import { useState } from 'react';
import { useT } from '../../i18n';

interface CopyButtonProps {
  text: string;
  label: string;
  className?: string;
  icon?: boolean;
}

const DEFAULT_CLASS =
  'flex shrink-0 items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200 active:scale-[0.98]';

export default function CopyButton({ text, label, className, icon }: CopyButtonProps) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  const copy = () => {
    if (!navigator.clipboard) return;
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => undefined);
  };

  return (
    <button
      type="button"
      onClick={copy}
      className={`${className ?? DEFAULT_CLASS} ${copied ? 'text-emerald-400' : ''}`}
    >
      {icon ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      ) : null}
      {copied ? t('action.copied') : label}
    </button>
  );
}
