import { useEffect, useMemo, useRef, useState } from 'react';
import type { TrafficExchange } from '@frigg/shared';
import { useAppStore } from '../store';
import { ResizeHandle, useResizable } from '../components/ResizeHandle';
import { useT } from '../i18n';
import TrafficToolbar from '../components/traffic/TrafficToolbar';
import BreakpointsControl from '../components/breakpoints/BreakpointsControl';
import TrafficRow from '../components/traffic/TrafficRow';
import TrafficDetail from '../components/traffic/TrafficDetail';
import TrafficEmptyState from '../components/traffic/TrafficEmptyState';

const RENDER_LIMIT = 500;
const CONNECTIVITY_HOSTS = new Set([
  'connectivitycheck.gstatic.com',
  'clients3.google.com',
  'connectivitycheck.android.com',
  'captive.apple.com',
  'msftconnecttest.com',
  'www.msftconnecttest.com',
  'www.google.com',
  'play.googleapis.com',
]);

function isConnectivityCheck(exchange: TrafficExchange): boolean {
  const host = exchange.request.host.toLowerCase().replace(/:\d+$/, '');
  const path = exchange.request.path.toLowerCase().split('?')[0];
  return CONNECTIVITY_HOSTS.has(host) && (
    path === '/generate_204' || path === '/gen_204' || path === '/hotspot-detect.html' ||
    path === '/connecttest.txt' || path === '/success.txt'
  );
}

function normalizeClientAddress(address: string): string {
  return address.replace(/^::ffff:/i, '').toLowerCase();
}

function ListHeader() {
  const t = useT();
  return (
    <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-zinc-800/80 bg-zinc-950/90 px-3 py-1.5 text-[10px] uppercase tracking-widest text-zinc-400 backdrop-blur">
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
  const devices = useAppStore((s) => s.devices);
  const activeDevice = useAppStore((s) => s.activeDevice);

  const [filter, setFilter] = useState('');
  const [method, setMethod] = useState('ALL');
  const [source, setSource] = useState('');
  const [hideConnectivity, setHideConnectivity] = useState(false);
  const [frozen, setFrozen] = useState<TrafficExchange[] | null>(null);

  const sources = useMemo(() => {
    const distinct = new Set<string>();
    for (const exchange of exchanges) {
      const address = exchange.request.clientAddress;
      if (address) distinct.add(address);
    }
    return Array.from(distinct).sort((a, b) => a.localeCompare(b));
  }, [exchanges]);

  const sourceLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const device of devices?.android ?? []) {
      if (device.ipAddress) {
        const label = device.avdName ?? device.model;
        labels[device.ipAddress] = label;
        labels[normalizeClientAddress(device.ipAddress)] = label;
      }
    }
    return labels;
  }, [devices]);

  const activeSource = useMemo(() => {
    if (activeDevice?.platform !== 'android') return '';
    return devices?.android.find((item) => item.serial === activeDevice.id)?.ipAddress ?? '';
  }, [activeDevice, devices]);

  useEffect(() => {
    setSource(activeSource);
  }, [activeSource]);

  useEffect(() => {
    if (source !== '' && !sources.includes(source) && source !== activeSource) setSource('');
  }, [source, sources, activeSource]);

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
      if (source !== '' && normalizeClientAddress(e.request.clientAddress ?? '') !== normalizeClientAddress(source)) return false;
      if (hideConnectivity && isConnectivityCheck(e)) return false;
      if (query.length > 0) {
        const url = e.request.url.toLowerCase();
        const host = e.request.host.toLowerCase();
        if (!url.includes(query) && !host.includes(query)) return false;
      }
      return true;
    });
    return matched.slice(-RENDER_LIMIT).reverse();
  }, [exchanges, frozen, filter, method, source, hideConnectivity]);

  const hiddenConnectivityCount = useMemo(() => {
    const base = frozen ?? exchanges;
    const query = filter.trim().toLowerCase();
    return base.filter((e) => {
      if (!isConnectivityCheck(e)) return false;
      if (method !== 'ALL' && e.request.method.toUpperCase() !== method) return false;
      if (source !== '' && normalizeClientAddress(e.request.clientAddress ?? '') !== normalizeClientAddress(source)) return false;
      if (query.length > 0 && !e.request.url.toLowerCase().includes(query) && !e.request.host.toLowerCase().includes(query)) return false;
      return true;
    }).length;
  }, [exchanges, frozen, filter, method, source]);

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

  const detail = useResizable('traffic.detail', 480, { axis: 'x', min: 340, max: 1000, invert: true });

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
        source={source}
        sources={sources}
        sourceLabels={sourceLabels}
        hideConnectivity={hideConnectivity}
        hiddenConnectivityCount={hiddenConnectivityCount}
        paused={frozen !== null}
        bufferedCount={bufferedCount}
        totalCount={exchanges.length}
        onFilterChange={setFilter}
        onMethodChange={setMethod}
        onSourceChange={setSource}
        onHideConnectivityChange={setHideConnectivity}
        onTogglePause={togglePause}
        onClear={handleClear}
        trailing={<BreakpointsControl />}
      />
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto">
          {exchanges.length === 0 ? (
            <TrafficEmptyState deviceLabel={activeDevice?.label} />
          ) : visible.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="max-w-lg px-6 text-center text-[13px] leading-relaxed text-zinc-400">
                {source === activeSource && activeDevice
                  ? t('traffic.waitingForDevice', { device: activeDevice.label })
                  : t('traffic.noMatch')}
              </p>
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
          <>
            <ResizeHandle axis="x" onPointerDown={detail.onPointerDown} />
            <div
              style={{ width: detail.size }}
              className="shrink-0 border-l border-zinc-800/80"
            >
              <TrafficDetail
                key={selected.id}
                exchange={selected}
                onClose={() => selectExchange(null)}
                onCreateMock={createMockFromExchange}
              />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
