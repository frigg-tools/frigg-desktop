import type { ReactNode } from 'react';

interface SectionProps {
  title: string;
  subtitle: string;
  count?: number;
  children: ReactNode;
}

export default function Section({ title, subtitle, count, children }: SectionProps) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-2.5">
        <h2 className="text-sm font-semibold text-zinc-200">{title}</h2>
        {count !== undefined ? (
          <span className="rounded border border-zinc-800 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-zinc-500">
            {count}
          </span>
        ) : null}
        <span className="text-[10px] uppercase tracking-widest text-zinc-600">{subtitle}</span>
      </div>
      {children}
    </section>
  );
}
