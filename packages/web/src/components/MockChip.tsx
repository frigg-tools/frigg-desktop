import { useT } from '../i18n';

export default function MockChip() {
  const t = useT();
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/5 px-1.5 py-px text-[9px] font-medium uppercase tracking-widest text-emerald-400">
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-2 w-2">
        <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" />
      </svg>
      {t('traffic.mockChip')}
    </span>
  );
}
