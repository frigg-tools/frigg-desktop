function statusColor(code: number): string {
  if (code >= 500) return 'text-rose-400';
  if (code >= 400) return 'text-amber-400';
  if (code >= 300) return 'text-sky-400';
  if (code >= 200) return 'text-emerald-400';
  return 'text-zinc-400';
}

export default function StatusCode({ code }: { code: number }) {
  return (
    <span className={`font-mono text-[13px] font-medium tabular-nums ${statusColor(code)}`}>
      {code}
    </span>
  );
}
