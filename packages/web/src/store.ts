import { create } from 'zustand';
import {
  TRAFFIC_BUFFER_LIMIT,
  type DevicesSnapshot,
  type MockFolder,
  type MockRule,
  type ProxyStatus,
  type ServerEvent,
  type TrafficExchange,
} from '@frigg/shared';
import * as api from './api/client';

export type Screen = 'traffic' | 'mocks' | 'devices';

export interface AppState {
  screen: Screen;
  setScreen: (s: Screen) => void;
  status: ProxyStatus | null;
  wsConnected: boolean;
  exchanges: TrafficExchange[];
  selectedExchangeId: string | null;
  selectExchange: (id: string | null) => void;
  folders: MockFolder[];
  rules: MockRule[];
  selectedFolderId: string | null;
  selectFolder: (id: string | null) => void;
  editingRule: MockRule | 'new' | null;
  draftFromExchange: TrafficExchange | null;
  openRuleEditor: (rule: MockRule | 'new') => void;
  closeRuleEditor: () => void;
  createMockFromExchange: (ex: TrafficExchange) => void;
  devices: DevicesSnapshot | null;
  loadAll: () => Promise<void>;
  refreshMocks: () => Promise<void>;
  refreshDevices: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  clearTraffic: () => Promise<void>;
  applyEvent: (ev: ServerEvent) => void;
}

function upsertExchange(
  exchanges: TrafficExchange[],
  exchange: TrafficExchange,
): TrafficExchange[] {
  const index = exchanges.findIndex((e) => e.id === exchange.id);
  if (index === -1) {
    const appended = [...exchanges, exchange];
    return appended.length > TRAFFIC_BUFFER_LIMIT
      ? appended.slice(appended.length - TRAFFIC_BUFFER_LIMIT)
      : appended;
  }
  const replaced = exchanges.slice();
  replaced[index] = exchange;
  return replaced;
}

export const useAppStore = create<AppState>((set, get) => ({
  screen: 'traffic',
  setScreen: (s) => set({ screen: s }),
  status: null,
  wsConnected: false,
  exchanges: [],
  selectedExchangeId: null,
  selectExchange: (id) => set({ selectedExchangeId: id }),
  folders: [],
  rules: [],
  selectedFolderId: null,
  selectFolder: (id) => set({ selectedFolderId: id }),
  editingRule: null,
  draftFromExchange: null,
  openRuleEditor: (rule) => set({ editingRule: rule }),
  closeRuleEditor: () => set({ editingRule: null, draftFromExchange: null }),
  createMockFromExchange: (ex) =>
    set({ screen: 'mocks', editingRule: 'new', draftFromExchange: ex }),
  devices: null,
  loadAll: async () => {
    const [status, exchanges, mocks, devices] = await Promise.all([
      api.getStatus(),
      api.getTraffic(),
      api.getMocks(),
      api.getDevices(),
    ]);
    set({ status, exchanges, folders: mocks.folders, rules: mocks.rules, devices });
  },
  refreshMocks: async () => {
    const mocks = await api.getMocks();
    set({ folders: mocks.folders, rules: mocks.rules });
  },
  refreshDevices: async () => {
    const devices = await api.getDevices();
    set({ devices });
  },
  refreshStatus: async () => {
    const status = await api.getStatus();
    set({ status });
  },
  clearTraffic: async () => {
    await api.clearTraffic();
    set({ exchanges: [], selectedExchangeId: null });
  },
  applyEvent: (ev) => {
    switch (ev.type) {
      case 'request':
      case 'response':
      case 'abort':
        set({ exchanges: upsertExchange(get().exchanges, ev.exchange) });
        break;
      case 'traffic-cleared':
        set({ exchanges: [], selectedExchangeId: null });
        break;
      case 'mocks-updated':
        void get()
          .refreshMocks()
          .catch(() => undefined);
        break;
      case 'devices-updated':
        void get()
          .refreshDevices()
          .catch(() => undefined);
        break;
    }
  },
}));
