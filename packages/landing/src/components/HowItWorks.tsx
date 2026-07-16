import { useT } from '../i18n';
import { useReveal } from '../useReveal';
import { IconChip, IconDevices, IconGlobe } from '../icons';

function Node({
  icon,
  title,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`flex w-full max-w-[220px] flex-col items-center rounded-xl border px-5 py-5 text-center ${
        accent
          ? 'border-emerald-500/40 bg-emerald-500/10 shadow-lg shadow-emerald-500/10'
          : 'border-zinc-800 bg-zinc-900/60'
      }`}
    >
      <span
        className={`flex h-11 w-11 items-center justify-center rounded-lg ${
          accent ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-800/80 text-zinc-400'
        }`}
      >
        {icon}
      </span>
      <span className="mt-3 font-display text-sm font-semibold text-zinc-100">{title}</span>
      <span className="mt-1 font-mono text-[11px] text-zinc-500">{sub}</span>
    </div>
  );
}

function Arrow({ vertical }: { vertical?: boolean }) {
  if (vertical) {
    return (
      <svg width="20" height="44" viewBox="0 0 20 44" className="text-emerald-500/50">
        <line x1="10" y1="2" x2="10" y2="34" stroke="currentColor" strokeWidth="1.5" className="flow-dash" />
        <path d="M5 30l5 6 5-6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width="64" height="20" viewBox="0 0 64 20" className="shrink-0 text-emerald-500/50">
      <line x1="2" y1="10" x2="54" y2="10" stroke="currentColor" strokeWidth="1.5" className="flow-dash" />
      <path d="M50 5l6 5-6 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function HowItWorks() {
  const { t } = useT();
  const { ref, shown } = useReveal<HTMLDivElement>();

  return (
    <section id="how" className="px-5 py-24 sm:px-8">
      <div ref={ref} className={`reveal ${shown ? 'in' : ''} mx-auto max-w-6xl`}>
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-emerald-400">{t.how.eyebrow}</p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-zinc-50 sm:text-4xl">
            {t.how.title}
          </h2>
          <p className="mt-4 text-zinc-400">{t.how.subtitle}</p>
        </div>

        <div className="mt-14 flex flex-col items-center">
          <div className="flex flex-col items-center gap-1 sm:flex-row sm:gap-0">
            <Node icon={<IconDevices className="h-6 w-6" />} title={t.how.device} sub={t.how.deviceSub} />
            <div className="rotate-90 sm:rotate-0">
              <Arrow />
            </div>
            <Node icon={<IconChip className="h-6 w-6" />} title={t.how.proxy} sub={t.how.proxySub} accent />
            <div className="rotate-90 sm:rotate-0">
              <Arrow />
            </div>
            <Node icon={<IconGlobe className="h-6 w-6" />} title={t.how.internet} sub={t.how.internetSub} />
          </div>

          <Arrow vertical />

          <div className="flex w-full max-w-md flex-col items-center rounded-xl border border-teal-500/30 bg-teal-500/5 px-6 py-5 text-center">
            <span className="font-display text-sm font-semibold text-teal-200">{t.how.ui}</span>
            <span className="mt-1 font-mono text-[11px] text-zinc-500">{t.how.uiSub}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
