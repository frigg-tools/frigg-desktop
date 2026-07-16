import { useT } from '../i18n';
import { useReveal } from '../useReveal';
import { tools, type Tool } from '../tools';

function Row({ tool, index }: { tool: Tool; index: number }) {
  const { t } = useT();
  const copy = t.tools.items[tool.id];
  const { ref, shown } = useReveal<HTMLDivElement>();
  const flip = index % 2 === 1;

  return (
    <div
      ref={ref}
      className={`reveal ${shown ? 'in' : ''} grid items-center gap-8 lg:grid-cols-2 lg:gap-14`}
    >
      <div className={`min-w-0 ${flip ? 'lg:order-2' : ''}`}>
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30">
            <tool.Icon className="h-5 w-5" />
          </span>
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-500">{copy.name}</span>
        </div>
        <h3 className="mt-4 font-display text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl">
          {copy.tagline}
        </h3>
        <p className="mt-3 max-w-md leading-relaxed text-zinc-400">{copy.desc}</p>
        <ul className="mt-5 flex flex-wrap gap-2">
          {copy.bullets.map((b) => (
            <li
              key={b}
              className="rounded-full border border-zinc-800 bg-zinc-900/50 px-3 py-1 text-[12.5px] text-zinc-300"
            >
              {b}
            </li>
          ))}
        </ul>
      </div>

      <div className={`min-w-0 ${flip ? 'lg:order-1' : ''}`}>
        <tool.Preview />
      </div>
    </div>
  );
}

export default function ToolShowcase() {
  const { t } = useT();
  const { ref, shown } = useReveal<HTMLDivElement>();

  return (
    <section id="tools" className="border-t border-zinc-900 px-5 py-24 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div ref={ref} className={`reveal ${shown ? 'in' : ''} max-w-2xl`}>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-emerald-400">{t.tools.eyebrow}</p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-zinc-50 sm:text-4xl">
            {t.tools.title}
          </h2>
          <p className="mt-4 text-zinc-400">{t.tools.subtitle}</p>
        </div>

        <div className="mt-16 space-y-20 sm:space-y-24">
          {tools.map((tool, i) => (
            <Row key={tool.id} tool={tool} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
