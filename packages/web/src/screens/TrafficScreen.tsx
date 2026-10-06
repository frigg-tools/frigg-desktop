import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ANDROID_DEVICE_STATE,
  IOS_SIMULATOR_PROXY_GROUP_ID,
  IOS_SIMULATOR_STATE,
  androidDeviceProxyId,
  iosPhysicalDeviceProxyId,
} from '@frigg/shared';
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
const DEVICE_SOURCE_PREFIX = 'device:';
const ADDRESS_SOURCE_PREFIX = 'address:';
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

interface TrafficDeviceOption {
  id: string;
  label: string;
  available: boolean;
}

function matchesSource(exchange: TrafficExchange, deviceId: string | null, address: string | null): boolean {
  if (deviceId !== null) return exchange.request.clientDeviceId === deviceId;
  if (address !== null) {
    return exchange.request.clientDeviceId === undefined &&
      normalizeClientAddress(exchange.request.clientAddress ?? '') === address;
  }
  return true;
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

  const addresses = useMemo(() => {
    const distinct = new Set<string>();
    for (const exchange of exchanges) {
      if (exchange.request.clientDeviceId !== undefined) continue;
      const address = exchange.request.clientAddress;
      if (address) distinct.add(normalizeClientAddress(address));
    }
    return Array.from(distinct).sort((a, b) => a.localeCompare(b));
  }, [exchanges]);

  const deviceOptions = useMemo<TrafficDeviceOption[]>(() => {
    if (devices === null) return [];
    const hasBootedSimulators = devices.iosSimulators.some(
      (simulator) => simulator.state.toLowerCase() === IOS_SIMULATOR_STATE.booted.toLowerCase(),
    );
    const macProxyUsesGroup = devices.tooling.macosProxy.enabled &&
      devices.tooling.macosProxy.host === '127.0.0.1' &&
      typeof devices.tooling.macosProxy.port === 'number' &&
      devices.tooling.macosProxy.port === devices.tooling.macosProxy.proxy?.port;
    const hasSharedMacProxyTraffic = exchanges.some(
      (exchange) => exchange.request.clientDeviceId === IOS_SIMULATOR_PROXY_GROUP_ID,
    );
    return [
      ...devices.android
        .filter((device) => device.state === ANDROID_DEVICE_STATE.connected)
        .map((device) => ({
          id: androidDeviceProxyId(device.serial),
          label: `${device.avdName ?? device.model} · ${device.serial}`,
          available: device.proxy?.ready === true && device.proxy.host !== null && device.proxy.port !== null,
        })),
      ...(hasBootedSimulators || macProxyUsesGroup || hasSharedMacProxyTraffic
        ? [{
            id: IOS_SIMULATOR_PROXY_GROUP_ID,
            label: t(hasBootedSimulators
              ? 'traffic.device.iosSimulatorGroup'
              : 'traffic.device.macSystemProxy'),
            available: devices.tooling.macosProxy.proxy?.ready === true,
          }]
        : []),
      ...devices.iosDevices
        .filter((device) => device.paired)
        .map((device) => ({
          id: iosPhysicalDeviceProxyId(device.udid),
          label: `${device.model} · ${device.name}`,
          available: device.proxy?.ready === true && device.proxy.host !== null && device.proxy.port !== null,
        })),
    ];
  }, [devices, exchanges, t]);

  const activeDeviceSource = useMemo(() => {
    if (activeDevice?.platform !== 'android') return '';
    const id = androidDeviceProxyId(activeDevice.id);
    return deviceOptions.some((option) => option.id === id) ? `${DEVICE_SOURCE_PREFIX}${id}` : '';
  }, [activeDevice, deviceOptions]);

  useEffect(() => {
    setSource(activeDeviceSource);
  }, [activeDeviceSource]);

  useEffect(() => {
    if (source.startsWith(DEVICE_SOURCE_PREFIX)) {
      const id = source.slice(DEVICE_SOURCE_PREFIX.length);
      if (!deviceOptions.some((option) => option.id === id)) setSource('');
    } else if (source.startsWith(ADDRESS_SOURCE_PREFIX)) {
      const address = source.slice(ADDRESS_SOURCE_PREFIX.length);
      if (!addresses.includes(address)) setSource('');
    }
  }, [source, deviceOptions, addresses]);

  const selectedDeviceId = source.startsWith(DEVICE_SOURCE_PREFIX)
    ? source.slice(DEVICE_SOURCE_PREFIX.length)
    : null;
  const selectedAddress = source.startsWith(ADDRESS_SOURCE_PREFIX)
    ? source.slice(ADDRESS_SOURCE_PREFIX.length)
    : null;
  const selectedDevice = selectedDeviceId === null
    ? undefined
    : deviceOptions.find((option) => option.id === selectedDeviceId);

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
      if (!matchesSource(e, selectedDeviceId, selectedAddress)) return false;
      if (hideConnectivity && isConnectivityCheck(e)) return false;
      if (query.length > 0) {
        const url = e.request.url.toLowerCase();
        const host = e.request.host.toLowerCase();
        if (!url.includes(query) && !host.includes(query)) return false;
      }
      return true;
    });
    return matched.slice(-RENDER_LIMIT).reverse();
  }, [exchanges, frozen, filter, method, selectedDeviceId, selectedAddress, hideConnectivity]);

  const hiddenConnectivityCount = useMemo(() => {
    const base = frozen ?? exchanges;
    const query = filter.trim().toLowerCase();
    return base.filter((e) => {
      if (!isConnectivityCheck(e)) return false;
      if (method !== 'ALL' && e.request.method.toUpperCase() !== method) return false;
      if (!matchesSource(e, selectedDeviceId, selectedAddress)) return false;
      if (query.length > 0 && !e.request.url.toLowerCase().includes(query) && !e.request.host.toLowerCase().includes(query)) return false;
      return true;
    }).length;
  }, [exchanges, frozen, filter, method, selectedDeviceId, selectedAddress]);

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
        deviceOptions={deviceOptions}
        addresses={addresses}
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
            <TrafficEmptyState
              deviceLabel={selectedDevice?.label ?? activeDevice?.label}
              sharedMacProxy={selectedDeviceId === IOS_SIMULATOR_PROXY_GROUP_ID}
            />
          ) : visible.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="max-w-lg px-6 text-center text-[13px] leading-relaxed text-zinc-400">
                {selectedDevice?.id === IOS_SIMULATOR_PROXY_GROUP_ID
                  ? t('traffic.waitingForSharedMacProxy')
                  : selectedDevice !== undefined
                    ? t('traffic.waitingForDevice', { device: selectedDevice.label })
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
