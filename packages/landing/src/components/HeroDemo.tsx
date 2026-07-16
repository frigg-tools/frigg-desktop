import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { tools } from '../tools';
import { prefersReduced } from './previews/shared';

const CYCLE_MS = 4800;

export default function HeroDemo() {
  const { t } = useT();
  const [active, setActive] = useState(0);
  const paused = useRef(false);

  useEffect(() => {
    if (prefersReduced) return;
    const id = window.setInterval(() => {
      if (!paused.current) setActive((a) => (a + 1) % tools.length);
    }, CYCLE_MS);
    return () => window.clearInterval(id);
  }, []);

  const Active = tools[active].Preview;

  return (
    <div
      className="relative"
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
    >
      <div className="pointer-events-none absolute -inset-8 rounded-[2rem] bg-emerald-500/5 blur-3xl" />

      <div
        className="relative -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
      >
        {tools.map((tool, i) => {
          const on = i === active;
          return (
            <button
              key={tool.id}
              role="tab"
              aria-selected={on}
              onClick={() => setActive(i)}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                on
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                  : 'border-zinc-800 bg-zinc-900/40 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <tool.Icon className="h-3.5 w-3.5" />
              {t.tools.items[tool.id].name}
            </button>
          );
        })}
      </div>

      <div className="relative flex min-h-[332px] items-start">
        <div key={active} className="reveal in w-full" style={{ animationDuration: '0.45s' }}>
          <Active />
        </div>
      </div>

      <p className="mt-3 text-center font-mono text-[11px] text-zinc-600">{t.hero.cycleHint}</p>
    </div>
  );
}
