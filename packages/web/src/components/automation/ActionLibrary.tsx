import { useState } from 'react';
import { AUTOMATION_NODE_TYPE, type AutomationNodeType } from '@frigg/shared';
import type { TranslateFn } from '../../i18n';

const groups: { title: string; actions: { type: AutomationNodeType; symbol: string; color: string }[] }[] = [
  {
    title: 'automation.canvas.group.touch',
    actions: [
      { type: AUTOMATION_NODE_TYPE.tap, symbol: '⌖', color: 'text-emerald-300' },
      { type: AUTOMATION_NODE_TYPE.longPress, symbol: '●', color: 'text-emerald-300' },
      { type: AUTOMATION_NODE_TYPE.swipe, symbol: '↗', color: 'text-violet-300' },
    ],
  },
  {
    title: 'automation.canvas.group.flow',
    actions: [
      { type: AUTOMATION_NODE_TYPE.text, symbol: 'T', color: 'text-amber-300' },
      { type: AUTOMATION_NODE_TYPE.key, symbol: '⌨', color: 'text-orange-300' },
      { type: AUTOMATION_NODE_TYPE.wait, symbol: '◷', color: 'text-zinc-300' },
      { type: AUTOMATION_NODE_TYPE.screenshot, symbol: '▧', color: 'text-cyan-300' },
    ],
  },
  {
    title: 'automation.canvas.group.apps',
    actions: [
      { type: AUTOMATION_NODE_TYPE.launchApp, symbol: '▣', color: 'text-blue-300' },
      { type: AUTOMATION_NODE_TYPE.forceStopApp, symbol: '■', color: 'text-orange-300' },
      { type: AUTOMATION_NODE_TYPE.clearAppData, symbol: '⌫', color: 'text-rose-300' },
    ],
  },
  {
    title: 'automation.canvas.group.adb',
    actions: [
      { type: AUTOMATION_NODE_TYPE.adbCommand, symbol: '>_', color: 'text-cyan-300' },
    ],
  },
];

export default function ActionLibrary({ onAdd, t, pending = false }: { onAdd: (type: AutomationNodeType) => void; t: TranslateFn; pending?: boolean }) {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleGroups = groups.map((group) => ({
    ...group,
    actions: group.actions.filter(({ type }) => t(`automation.node.${type}`).toLocaleLowerCase().includes(normalizedQuery)),
  })).filter((group) => group.actions.length > 0);

  return (
    <aside aria-label={t('automation.canvas.actions')} className="flex max-h-[210px] shrink-0 flex-col overflow-hidden border-b border-zinc-800 bg-zinc-950/60 p-3 xl:max-h-none xl:w-[232px] xl:border-b-0 xl:border-r">
      <div className="mb-2 flex items-start justify-between gap-2 px-1">
        <div className="min-w-0">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.13em] text-zinc-300">{t('automation.canvas.actions')}</h3>
          <p className="mt-1 text-[10px] leading-relaxed text-zinc-600">{pending ? t('automation.canvas.pendingAction') : t('automation.canvas.addHint')}</p>
        </div>
        {pending && <span aria-hidden="true" className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.6)]" />}
      </div>
      <label className="mb-2 block">
        <span className="sr-only">{t('automation.canvas.search')}</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('automation.canvas.search')} className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-[10px] text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-emerald-500/60" />
      </label>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-0.5">
        {visibleGroups.length === 0 && <p className="px-1 py-2 text-[10px] text-zinc-500">{t('automation.canvas.noActionMatch')}</p>}
        {visibleGroups.map((group) => (
          <section key={group.title}>
            <h4 className="mb-1 px-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-600">{t(group.title)}</h4>
            <div className="grid grid-cols-2 gap-1 xl:grid-cols-1">
              {group.actions.map(({ type, symbol, color }) => (
                <button key={type} type="button" title={t(`automation.node.${type}`)} onClick={() => onAdd(type)} className={`flex min-w-0 w-full items-center gap-2 rounded-md border px-2 py-2 text-left text-[11px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300 ${pending ? 'border-emerald-500/25 bg-emerald-500/[0.06] text-zinc-200 hover:border-emerald-400/60 hover:bg-emerald-500/10' : 'border-zinc-800 bg-zinc-900/80 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-900 hover:text-zinc-100'}`}>
                  <span aria-hidden="true" className={`flex h-5 w-5 shrink-0 items-center justify-center text-sm font-semibold ${color}`}>{symbol}</span>
                  <span className="min-w-0 flex-1 truncate">{t(`automation.node.${type}`)}</span>
                  <span aria-hidden="true" className="shrink-0 text-zinc-600">＋</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
      <p className="hidden px-1 pt-3 text-[10px] leading-relaxed text-zinc-600 xl:block">{t('automation.canvas.reorderHint')}</p>
    </aside>
  );
}
