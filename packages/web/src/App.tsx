import { useEffect, type ReactNode } from 'react';
import { connectWs } from './api/ws';
import { useAppStore, type Screen } from './store';
import { useT, useLocale } from './i18n';
import TrafficScreen from './screens/TrafficScreen';
import MocksScreen from './screens/MocksScreen';
import DevicesScreen from './screens/DevicesScreen';
import LogcatScreen from './screens/LogcatScreen';
import DatabaseScreen from './screens/DatabaseScreen';
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

function TerminalIcon() {
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
      <path d="m4 8 4 4-4 4" />
      <path d="M12 16h6" />
      <rect x="2" y="3" width="20" height="18" rx="2.5" />
    </svg>
  );
}

function DatabaseIcon() {
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
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
      <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
    </svg>
  );
}

interface NavItem {
  screen: Screen;
  labelKey: string;
  icon: ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { screen: 'traffic', labelKey: 'nav.traffic', icon: <ActivityIcon /> },
  { screen: 'mocks', labelKey: 'nav.mocks', icon: <BoltIcon /> },
  { screen: 'logcat', labelKey: 'nav.logcat', icon: <TerminalIcon /> },
  { screen: 'database', labelKey: 'nav.database', icon: <DatabaseIcon /> },
  { screen: 'devices', labelKey: 'nav.devices', icon: <SmartphoneIcon /> },
];

function LanguageToggle() {
  const [locale, setLocale] = useLocale();
  return (
    <div className="flex items-center gap-1 rounded-md border border-zinc-800 p-0.5">
      {(['en', 'pt'] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => setLocale(option)}
          className={`flex-1 rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-widest transition-colors ${
            locale === option
              ? 'bg-emerald-500/10 text-emerald-400'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

export default function App() {
  const screen = useAppStore((s) => s.screen);
  const setScreen = useAppStore((s) => s.setScreen);
  const wsConnected = useAppStore((s) => s.wsConnected);
  const status = useAppStore((s) => s.status);
  const t = useT();

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
                {t(item.labelKey)}
              </button>
            );
          })}
        </nav>
        <div className="space-y-2.5 border-t border-zinc-800/80 px-4 py-3">
          <LanguageToggle />
          <div className="flex items-center gap-2">
            <span
              className={`pulse-dot h-1.5 w-1.5 rounded-full ${
                wsConnected ? 'bg-emerald-400' : 'bg-rose-400'
              }`}
            />
            <span className="text-[10px] uppercase tracking-widest text-zinc-500">
              {wsConnected ? t('status.connected') : t('status.disconnected')}
            </span>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-zinc-600">{t('sidebar.proxy')}</p>
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
        ) : screen === 'logcat' ? (
          <LogcatScreen />
        ) : screen === 'database' ? (
          <DatabaseScreen />
        ) : (
          <DevicesScreen />
        )}
      </main>
      <OnboardingOverlay />
    </div>
  );
}
