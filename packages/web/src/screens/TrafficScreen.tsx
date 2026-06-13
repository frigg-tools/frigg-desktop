import { useMemo, useRef, useState } from 'react';
import type { TrafficExchange } from '@frigg/shared';
import { useAppStore } from '../store';
import { useT } from '../i18n';
import TrafficToolbar from '../components/traffic/TrafficToolbar';
import TrafficRow from '../components/traffic/TrafficRow';
import TrafficDetail from '../components/traffic/TrafficDetail';
import TrafficEmptyState from '../components/traffic/TrafficEmptyState';

const RENDER_LIMIT = 500;

function ListHeader() {
  const t = useT();
  return (
    <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-zinc-800/80 bg-zinc-950/90 px-3 py-1.5 text-[10px] uppercase tracking-widest text-zinc-600 backdrop-blur">
      <span className="w-14 shrink-0 text-center">{t('traffic.column.method')}</span>
      <span className="w-14 shrink-0 text-center">{t('traffic.column.status')}</span>
      <span className="min-w-0 flex-1">{t('traffic.column.url')}</span>
      <span className="w-16 shrink-0 text-right">{t('traffic.column.duration')}</span>
      <span className="w-[4.5rem] shrink-0 text-right">{t('traffic.column.time')}</span>
    </div>
  );
}

export default function TrafficScreen() {
  const t = useT();
  const exchanges = useAppStore((s) => s.exchanges);
  const selectedExchangeId = useAppStore((s) => s.selectedExchangeId);
  const selectExchange = useAppStore((s) => s.selectExchange);
  const clearTraffic = useAppStore((s) => s.clearTraffic);
  const createMockFromExchange = useAppStore((s) => s.createMockFromExchange);

  const [filter, setFilter] = useState('');
  const [method, setMethod] = useState('ALL');
  const [frozen, setFrozen] = useState<TrafficExchange[] | null>(null);

  const initialIdsRef = useRef<ReadonlySet<string> | null>(null);
  if (initialIdsRef.current === null) {
    initialIdsRef.current = new Set(exchanges.map((e) => e.id));
  }
  const initialIds = initialIdsRef.current;

  const visible = useMemo(() => {
    const base = frozen ?? exchanges;
    const query = filter.trim().toLowerCase();
    const matched = base.filter((e) => {
      if (method !== 'ALL' && e.request.method.toUpperCase() !== method) return false;
      if (query.length > 0) {
        const url = e.request.url.toLowerCase();
        const host = e.request.host.toLowerCase();
        if (!url.includes(query) && !host.includes(query)) return false;
      }
      return true;
    });
    return matched.slice(-RENDER_LIMIT).reverse();
  }, [exchanges, frozen, filter, method]);

  const bufferedCount = useMemo(() => {
    if (frozen === null) return 0;
    const frozenIds = new Set(frozen.map((e) => e.id));
    return exchanges.reduce((count, e) => (frozenIds.has(e.id) ? count : count + 1), 0);
  }, [exchanges, frozen]);

  const selected = useMemo(() => {
    if (selectedExchangeId === null) return null;
    if (frozen !== null) {
      const inFrozen = frozen.find((e) => e.id === selectedExchangeId);
      if (inFrozen) return inFrozen;
    }
    return exchanges.find((e) => e.id === selectedExchangeId) ?? null;
  }, [selectedExchangeId, frozen, exchanges]);

  const togglePause = () => {
    setFrozen((current) => (current === null ? exchanges.slice() : null));
  };

  const handleClear = () => {
    setFrozen((current) => (current === null ? null : []));
    void clearTraffic().catch(() => undefined);
  };

  return (
    <div className="flex h-full flex-col">
      <TrafficToolbar
        filter={filter}
        method={method}
        paused={frozen !== null}
        bufferedCount={bufferedCount}
        totalCount={exchanges.length}
        onFilterChange={setFilter}
        onMethodChange={setMethod}
        onTogglePause={togglePause}
        onClear={handleClear}
      />
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto">
          {exchanges.length === 0 ? (
            <TrafficEmptyState />
          ) : visible.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-[13px] text-zinc-600">{t('traffic.noMatch')}</p>
            </div>
          ) : (
            <>
              <ListHeader />
              {visible.map((exchange) => (
                <TrafficRow
                  key={exchange.id}
                  exchange={exchange}
                  isSelected={exchange.id === selectedExchangeId}
                  isNew={!initialIds.has(exchange.id)}
                  onSelect={selectExchange}
                />
              ))}
            </>
          )}
        </div>
        {selected ? (
          <div className="w-[45%] min-w-[380px] shrink-0 border-l border-zinc-800/80">
            <TrafficDetail
              key={selected.id}
              exchange={selected}
              onClose={() => selectExchange(null)}
              onCreateMock={createMockFromExchange}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
