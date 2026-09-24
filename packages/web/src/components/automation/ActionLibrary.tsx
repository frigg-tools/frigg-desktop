import { AUTOMATION_NODE_TYPE, type AutomationNodeType } from '@frigg/shared';
import type { TranslateFn } from '../../i18n';

const actions: { type: AutomationNodeType; symbol: string; color: string }[] = [
  { type: AUTOMATION_NODE_TYPE.tap, symbol: '⌖', color: 'text-emerald-300' },
  { type: AUTOMATION_NODE_TYPE.longPress, symbol: '●', color: 'text-emerald-300' },
  { type: AUTOMATION_NODE_TYPE.swipe, symbol: '↗', color: 'text-violet-300' },
  { type: AUTOMATION_NODE_TYPE.text, symbol: 'T', color: 'text-amber-300' },
  { type: AUTOMATION_NODE_TYPE.key, symbol: '⌨', color: 'text-orange-300' },
  { type: AUTOMATION_NODE_TYPE.wait, symbol: '◷', color: 'text-zinc-300' },
  { type: AUTOMATION_NODE_TYPE.screenshot, symbol: '▧', color: 'text-cyan-300' },
  { type: AUTOMATION_NODE_TYPE.launchApp, symbol: '▣', color: 'text-blue-300' },
];

export default function ActionLibrary({ onAdd, t }: { onAdd: (type: AutomationNodeType) => void; t: TranslateFn }) {
  return (
    <aside aria-label={t('automation.canvas.actions')} className="flex shrink-0 flex-col border-b border-zinc-800 bg-zinc-950/60 p-3 xl:w-[150px] xl:border-b-0 xl:border-r">
      <div className="mb-2 px-1">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.13em] text-zinc-300">{t('automation.canvas.actions')}</h3>
        <p className="mt-1 text-[10px] leading-relaxed text-zinc-600">{t('automation.canvas.addHint')}</p>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 xl:flex-col xl:overflow-visible">
        {actions.map(({ type, symbol, color }) => (
          <button key={type} type="button" onClick={() => onAdd(type)} className="flex min-w-max items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/80 px-2.5 py-2 text-left text-[11px] text-zinc-300 transition-colors hover:border-emerald-500/40 hover:bg-zinc-900 hover:text-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300 xl:w-full">
            <span aria-hidden="true" className={`w-4 text-center text-sm ${color}`}>{symbol}</span>
            <span>{t(`automation.node.${type}`)}</span>
            <span aria-hidden="true" className="ml-auto text-zinc-600">＋</span>
          </button>
        ))}
      </div>
      <p className="mt-auto hidden px-1 pt-4 text-[10px] leading-relaxed text-zinc-600 xl:block">{t('automation.canvas.reorderHint')}</p>
    </aside>
  );
}
