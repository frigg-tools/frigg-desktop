import type { ReactNode } from 'react';

export type Method = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export const methodColor: Record<Method, string> = {
  GET: 'text-emerald-300 bg-emerald-500/10 ring-emerald-500/30',
  POST: 'text-sky-300 bg-sky-500/10 ring-sky-500/30',
  PUT: 'text-amber-300 bg-amber-500/10 ring-amber-500/30',
  PATCH: 'text-violet-300 bg-violet-500/10 ring-violet-500/30',
  DELETE: 'text-rose-300 bg-rose-500/10 ring-rose-500/30',
};

export function statusColor(s: number): string {
  if (s >= 500) return 'text-rose-400';
  if (s >= 400) return 'text-amber-400';
  if (s >= 300) return 'text-zinc-400';
  return 'text-emerald-400';
}

export const prefersReduced =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function MethodChip({ method }: { method: Method }) {
  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 text-center text-[10.5px] font-semibold ring-1 ${methodColor[method]}`}
    >
      {method}
    </span>
  );
}

export function AppWindow({
  title,
  port,
  children,
  className = '',
}: {
  title: ReactNode;
  port?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/70 shadow-2xl shadow-emerald-950/20 backdrop-blur ${className}`}
    >
      <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-950/60 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
        <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
        <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
        <div className="ml-2 flex items-center gap-2 text-[11px] uppercase tracking-widest text-zinc-500">
          {title}
        </div>
        {port && <span className="ml-auto font-mono text-[11px] text-zinc-600">{port}</span>}
      </div>
      {children}
    </div>
  );
}

export function Live({ label }: { label: string }) {
  return (
    <>
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 pulse-dot" />
      {label}
    </>
  );
}
