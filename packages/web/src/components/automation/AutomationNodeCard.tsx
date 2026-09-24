import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { AutomationNode, AutomationRunStatus } from '@frigg/shared';

export interface AutomationCanvasNodeData extends Record<string, unknown> {
  action: AutomationNode;
  title: string;
  detail: string;
  removeLabel: string;
  runStatus?: AutomationRunStatus | 'step-completed' | 'step-failed';
  onRemove?: (id: string) => void;
}

const toneByType: Record<string, string> = {
  start: 'border-sky-500/40 bg-sky-500/10 text-sky-200',
  end: 'border-zinc-600 bg-zinc-800/70 text-zinc-300',
  tap: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
  longPress: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
  swipe: 'border-violet-500/40 bg-violet-500/10 text-violet-200',
  launchApp: 'border-blue-500/40 bg-blue-500/10 text-blue-200',
  text: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
  key: 'border-orange-500/40 bg-orange-500/10 text-orange-200',
  wait: 'border-zinc-600 bg-zinc-800/70 text-zinc-300',
  screenshot: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200',
};

function runTone(status: AutomationCanvasNodeData['runStatus']): string {
  if (status === 'completed' || status === 'step-completed') return 'ring-2 ring-emerald-400/80';
  if (status === 'failed' || status === 'step-failed') return 'ring-2 ring-rose-400/90';
  if (status === 'running' || status === 'starting') return 'ring-2 ring-sky-300/80 shadow-[0_0_24px_rgba(56,189,248,0.2)]';
  if (status === 'cancelled' || status === 'interrupted') return 'ring-2 ring-zinc-500/70';
  return '';
}

export default function AutomationNodeCard({ data, selected }: NodeProps<Node<AutomationCanvasNodeData>>) {
  const fixed = data.action.type === 'start' || data.action.type === 'end';
  const badge = data.action.type === 'start' ? '▶' : data.action.type === 'end' ? '■' : data.action.type === 'swipe' ? '↗' : data.action.type === 'tap' || data.action.type === 'longPress' ? '⌖' : data.action.type === 'wait' ? '◷' : data.action.type === 'screenshot' ? '▧' : data.action.type === 'text' ? 'T' : data.action.type === 'key' ? '⌨' : '▣';
  return (
    <div className={`relative w-[208px] rounded-lg border bg-zinc-950/95 shadow-xl transition-shadow ${toneByType[data.action.type] ?? toneByType.wait} ${selected ? 'ring-2 ring-emerald-300/70' : ''} ${runTone(data.runStatus)}`}>
      {data.action.type !== 'start' && <Handle type="target" position={Position.Top} className="!h-2.5 !w-2.5 !border-2 !border-zinc-950 !bg-zinc-500" />}
      <div className="flex items-start gap-3 px-3 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-current/20 bg-black/20 text-sm font-semibold">{badge}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-xs font-semibold text-zinc-100">{data.title}</p>
            <span className="ml-auto text-[9px] font-medium uppercase tracking-wider opacity-60">{data.action.type}</span>
          </div>
          <p className="mt-1 truncate text-[11px] text-zinc-400">{data.detail}</p>
        </div>
        {!fixed && <button type="button" aria-label={data.removeLabel} title={data.removeLabel} className="nodrag rounded p-1 text-zinc-500 hover:bg-rose-500/10 hover:text-rose-300" onClick={(event) => { event.stopPropagation(); data.onRemove?.(data.action.id); }}>×</button>}
      </div>
      {data.action.type !== 'end' && <Handle type="source" position={Position.Bottom} className="!h-2.5 !w-2.5 !border-2 !border-zinc-950 !bg-emerald-400" />}
      {data.runStatus && <span className="absolute -right-2 -top-2 h-3 w-3 rounded-full border-2 border-zinc-950 bg-emerald-400" />}
    </div>
  );
}
