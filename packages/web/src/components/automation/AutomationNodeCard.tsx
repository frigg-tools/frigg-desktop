import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { AUTOMATION_NODE_TYPE, type AutomationNode, type AutomationNodeType, type AutomationRunStatus } from '@frigg/shared';

export interface AutomationCanvasNodeData extends Record<string, unknown> {
  action?: AutomationNode;
  title: string;
  detail: string;
  removeLabel: string;
  moveLabel: string;
  hasReferenceCapture: boolean;
  referenceCaptureLabel: string;
  pendingMessage?: string;
  cancelPendingLabel?: string;
  onCancelPending?: () => void;
  runStatus?: AutomationRunStatus | 'step-completed' | 'step-failed';
  onRemove?: (id: string) => void;
}

const toneByType: Record<AutomationNodeType, string> = {
  [AUTOMATION_NODE_TYPE.start]: 'border-sky-500/40 bg-sky-500/10 text-sky-200',
  [AUTOMATION_NODE_TYPE.end]: 'border-zinc-600 bg-zinc-800/70 text-zinc-300',
  [AUTOMATION_NODE_TYPE.tap]: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
  [AUTOMATION_NODE_TYPE.longPress]: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
  [AUTOMATION_NODE_TYPE.swipe]: 'border-violet-500/40 bg-violet-500/10 text-violet-200',
  [AUTOMATION_NODE_TYPE.launchApp]: 'border-blue-500/40 bg-blue-500/10 text-blue-200',
  [AUTOMATION_NODE_TYPE.forceStopApp]: 'border-orange-500/40 bg-orange-500/10 text-orange-200',
  [AUTOMATION_NODE_TYPE.clearAppData]: 'border-rose-500/40 bg-rose-500/10 text-rose-200',
  [AUTOMATION_NODE_TYPE.adbCommand]: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200',
  [AUTOMATION_NODE_TYPE.text]: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
  [AUTOMATION_NODE_TYPE.key]: 'border-orange-500/40 bg-orange-500/10 text-orange-200',
  [AUTOMATION_NODE_TYPE.wait]: 'border-zinc-600 bg-zinc-800/70 text-zinc-300',
  [AUTOMATION_NODE_TYPE.screenshot]: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200',
};

const badgeByType: Record<AutomationNodeType, string> = {
  [AUTOMATION_NODE_TYPE.start]: '▶',
  [AUTOMATION_NODE_TYPE.end]: '■',
  [AUTOMATION_NODE_TYPE.tap]: '⌖',
  [AUTOMATION_NODE_TYPE.longPress]: '●',
  [AUTOMATION_NODE_TYPE.swipe]: '↗',
  [AUTOMATION_NODE_TYPE.launchApp]: '▣',
  [AUTOMATION_NODE_TYPE.forceStopApp]: '■',
  [AUTOMATION_NODE_TYPE.clearAppData]: '⌫',
  [AUTOMATION_NODE_TYPE.adbCommand]: '>_',
  [AUTOMATION_NODE_TYPE.text]: 'T',
  [AUTOMATION_NODE_TYPE.key]: '⌨',
  [AUTOMATION_NODE_TYPE.wait]: '◷',
  [AUTOMATION_NODE_TYPE.screenshot]: '▧',
};

function runTone(status: AutomationCanvasNodeData['runStatus']): string {
  if (status === 'completed' || status === 'step-completed') return 'ring-2 ring-emerald-400/80';
  if (status === 'failed' || status === 'step-failed') return 'ring-2 ring-rose-400/90';
  if (status === 'running' || status === 'starting') return 'ring-2 ring-sky-300/80 shadow-[0_0_24px_rgba(56,189,248,0.2)]';
  if (status === 'cancelled' || status === 'interrupted') return 'ring-2 ring-zinc-500/70';
  return '';
}

export default function AutomationNodeCard({ data, selected }: NodeProps<Node<AutomationCanvasNodeData>>) {
  if (!data.action) {
    return (
      <div title={data.moveLabel} className="relative flex min-h-[68px] w-[208px] items-center gap-3 rounded-lg border border-dashed border-emerald-400/60 bg-emerald-950/60 px-3 py-3 text-emerald-100 shadow-xl">
        <Handle type="target" position={Position.Top} className="!h-2.5 !w-2.5 !border-2 !border-zinc-950 !bg-emerald-400" />
        <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-emerald-400/20 bg-emerald-400/10 text-lg">＋</span>
        <p className="min-w-0 flex-1 text-[11px] font-medium leading-relaxed">{data.pendingMessage}</p>
        <button type="button" aria-label={data.cancelPendingLabel} title={data.cancelPendingLabel} className="nodrag rounded p-1 text-emerald-100/60 hover:bg-zinc-900 hover:text-white" onClick={(event) => { event.stopPropagation(); data.onCancelPending?.(); }}>×</button>
      </div>
    );
  }
  const action = data.action;
  const terminal = action.type === AUTOMATION_NODE_TYPE.start || action.type === AUTOMATION_NODE_TYPE.end;
  const badge = badgeByType[action.type];
  return (
    <div title={data.moveLabel} className={`relative w-[208px] cursor-grab rounded-lg border bg-zinc-950/95 shadow-xl transition-shadow active:cursor-grabbing ${toneByType[action.type]} ${selected ? 'ring-2 ring-emerald-300/70' : ''} ${runTone(data.runStatus)}`}>
      {action.type !== AUTOMATION_NODE_TYPE.start && <Handle type="target" position={Position.Top} className="!h-2.5 !w-2.5 !border-2 !border-zinc-950 !bg-zinc-500" />}
      <div className="flex items-start gap-3 px-3 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-current/20 bg-black/20 text-sm font-semibold">{badge}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-xs font-semibold text-zinc-100">{data.title}</p>
            <span className="ml-auto text-[9px] font-medium uppercase tracking-wider opacity-60">{action.type}</span>
            <span aria-hidden="true" className="select-none text-sm leading-none text-zinc-500">⠿</span>
            {data.hasReferenceCapture && <span title={data.referenceCaptureLabel} aria-label={data.referenceCaptureLabel} className="ml-auto rounded border border-emerald-500/20 bg-emerald-500/10 px-1 text-[9px] text-emerald-300">▧</span>}
          </div>
          <p className="mt-1 truncate text-[11px] text-zinc-400">{data.detail}</p>
        </div>
        {!terminal && <button type="button" aria-label={data.removeLabel} title={data.removeLabel} className="nodrag rounded p-1 text-zinc-500 hover:bg-rose-500/10 hover:text-rose-300" onClick={(event) => { event.stopPropagation(); data.onRemove?.(action.id); }}>×</button>}
      </div>
      {action.type !== AUTOMATION_NODE_TYPE.end && <Handle type="source" position={Position.Bottom} className="!h-2.5 !w-2.5 !border-2 !border-zinc-950 !bg-emerald-400" />}
      {data.runStatus && <span className="absolute -right-2 -top-2 h-3 w-3 rounded-full border-2 border-zinc-950 bg-emerald-400" />}
    </div>
  );
}
