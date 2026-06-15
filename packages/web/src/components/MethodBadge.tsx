const METHOD_STYLES: Record<string, string> = {
  GET: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  POST: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
  PUT: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  PATCH: 'border-violet-500/30 bg-violet-500/10 text-violet-400',
  DELETE: 'border-rose-500/30 bg-rose-500/10 text-rose-400',
};

const FALLBACK_STYLE = 'border-zinc-700 bg-zinc-800/60 text-zinc-400';

const METHOD_TEXT: Record<string, string> = {
  GET: 'text-emerald-400',
  POST: 'text-sky-400',
  PUT: 'text-amber-400',
  PATCH: 'text-violet-400',
  DELETE: 'text-rose-400',
};

export function methodTextColor(method: string): string {
  return METHOD_TEXT[method.toUpperCase()] ?? 'text-zinc-400';
}

export default function MethodBadge({ method }: { method: string }) {
  const upper = method.toUpperCase();
  return (
    <span
      className={`inline-flex w-14 shrink-0 items-center justify-center rounded border px-1 py-0.5 font-mono text-[10px] font-medium tracking-wider ${
        METHOD_STYLES[upper] ?? FALLBACK_STYLE
      }`}
    >
      {upper}
    </span>
  );
}
