import { memo } from 'react';
import type { TrafficExchange } from '@frigg/shared';
import MethodBadge from '../MethodBadge';
import StatusCode from '../StatusCode';
import MockChip from '../MockChip';
import { formatClock, formatDuration } from './format';

interface TrafficRowProps {
  exchange: TrafficExchange;
  isSelected: boolean;
  isNew: boolean;
  onSelect: (id: string | null) => void;
}

function StatusCell({ exchange }: { exchange: TrafficExchange }) {
  if (exchange.state === 'aborted') {
    return (
      <span className="text-[9px] font-medium uppercase tracking-wider text-rose-400">
        Aborted
      </span>
    );
  }
  if (exchange.response) {
    return <StatusCode code={exchange.response.statusCode} />;
  }
  return <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-zinc-500" />;
}

const TrafficRow = memo(function TrafficRow({
  exchange,
  isSelected,
  isNew,
  onSelect,
}: TrafficRowProps) {
  const { request, response } = exchange;
  return (
    <button
      type="button"
      onClick={() => onSelect(exchange.id)}
      className={`flex w-full items-center gap-3 border-b border-zinc-800/50 px-3 py-1.5 text-left transition-colors ${
        isSelected ? 'bg-emerald-500/[0.07]' : 'hover:bg-zinc-900/60'
      } ${isNew ? 'row-arrive' : ''}`}
    >
      <MethodBadge method={request.method} />
      <span className="flex w-14 shrink-0 items-center justify-center">
        <StatusCell exchange={exchange} />
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-[13px]">
        <span className="text-zinc-500">{request.host}</span>
        <span className="text-zinc-200">{request.path}</span>
        {request.query ? <span className="text-zinc-500">?{request.query}</span> : null}
      </span>
      {response?.mockRuleId ? <MockChip /> : null}
      <span className="w-16 shrink-0 text-right font-mono text-xs tabular-nums text-zinc-400">
        {response ? formatDuration(response.durationMs) : ''}
      </span>
      <span className="w-[4.5rem] shrink-0 text-right font-mono text-xs tabular-nums text-zinc-500">
        {formatClock(request.timestamp)}
      </span>
    </button>
  );
});

export default TrafficRow;
