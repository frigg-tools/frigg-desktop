import { useEffect, type ReactNode } from 'react';
import { connectWs } from './api/ws';
import { useAppStore, type Screen } from './store';
import TrafficScreen from './screens/TrafficScreen';
import MocksScreen from './screens/MocksScreen';
import DevicesScreen from './screens/DevicesScreen';
import OnboardingOverlay from './components/onboarding/OnboardingOverlay';

function ActivityIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" />
    </svg>
  );
}

function SmartphoneIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <path d="M11 17.5h2" />
    </svg>
  );
}

interface NavItem {
  screen: Screen;
  label: string;
  icon: ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { screen: 'traffic', label: 'Traffic', icon: <ActivityIcon /> },
  { screen: 'mocks', label: 'Mocks', icon: <BoltIcon /> },
  { screen: 'devices', label: 'Devices', icon: <SmartphoneIcon /> },
];

export default function App() {
  const screen = useAppStore((s) => s.screen);
  const setScreen = useAppStore((s) => s.setScreen);
  const wsConnected = useAppStore((s) => s.wsConnected);
  const status = useAppStore((s) => s.status);

  useEffect(() => {
    void useAppStore
      .getState()
      .loadAll()
      .catch(() => undefined);
    let dropped = false;
    return connectWs(
      (ev) => useAppStore.getState().applyEvent(ev),
      (connected) => {
        useAppStore.setState({ wsConnected: connected });
        if (!connected) {
          dropped = true;
          return;
        }
        if (dropped) {
          dropped = false;
          void useAppStore
            .getState()
            .loadAll()
            .catch(() => undefined);
        }
      },
    );
  }, []);

  return (
    <div className="flex h-full">
      <aside className="flex w-56 shrink-0 flex-col border-r border-zinc-800/80">
        <div className="flex h-14 items-center gap-2.5 border-b border-zinc-800/80 px-4">
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 text-emerald-400">
            <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" />
          </svg>
          <span className="font-display text-lg font-bold tracking-[0.25em] text-zinc-100">
            FRIGG
          </span>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV_ITEMS.map((item) => {
            const active = item.screen === screen;
            return (
              <button
                key={item.screen}
                type="button"
                onClick={() => setScreen(item.screen)}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium transition-colors active:scale-[0.98] ${
                  active
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'text-zinc-400 hover:bg-zinc-900/60 hover:text-zinc-200'
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="space-y-2.5 border-t border-zinc-800/80 px-4 py-3">
          <div className="flex items-center gap-2">
            <span
              className={`pulse-dot h-1.5 w-1.5 rounded-full ${
                wsConnected ? 'bg-emerald-400' : 'bg-rose-400'
              }`}
            />
            <span className="text-[10px] uppercase tracking-widest text-zinc-500">
              {wsConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-zinc-600">Proxy</p>
            <p className="font-mono text-[11px] text-zinc-400">
              {status ? `${status.lanIp ?? '127.0.0.1'}:${status.proxyPort}` : '—'}
            </p>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-hidden">
        {screen === 'traffic' ? (
          <TrafficScreen />
        ) : screen === 'mocks' ? (
          <MocksScreen />
        ) : (
          <DevicesScreen />
        )}
      </main>
      <OnboardingOverlay />
    </div>
  );
}
