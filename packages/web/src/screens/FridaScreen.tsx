import { useEffect, useRef } from 'react';
import { useAppStore } from '../store';
import { useT } from '../i18n';
import EmulatorPanel from '../components/frida/EmulatorPanel';

const btn =
  'rounded-md border border-zinc-700 px-3 py-1.5 text-[12px] font-medium text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40';
const btnGo =
  'rounded-md bg-emerald-500/15 px-3 py-1.5 text-[12px] font-medium text-emerald-300 hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40';
const btnStop =
  'rounded-md bg-rose-500/15 px-3 py-1.5 text-[12px] font-medium text-rose-300 hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-40';

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
        ok ? 'bg-emerald-500/15 text-emerald-300' : 'bg-zinc-800 text-zinc-400'
      }`}
    >
      {label}
    </span>
  );
}

export default function FridaScreen() {
  const t = useT();
  const avds = useAppStore((s) => s.avds);
  const devices = useAppStore((s) => s.devices);
  const deviceId = useAppStore((s) => s.fridaDeviceId);
  const serverStatus = useAppStore((s) => s.fridaServerStatus);
  const sessionStatus = useAppStore((s) => s.fridaSessionStatus);
  const messages = useAppStore((s) => s.fridaMessages);
  const scripts = useAppStore((s) => s.fridaScripts);
  const target = useAppStore((s) => s.fridaTarget);
  const source = useAppStore((s) => s.fridaSource);
  const scriptId = useAppStore((s) => s.fridaScriptId);
  const spawnMode = useAppStore((s) => s.fridaSpawnMode);
  const recentTargets = useAppStore((s) => s.fridaRecentTargets);
  const hostVersion = useAppStore((s) => s.hostFridaVersion);
  const busy = useAppStore((s) => s.fridaBusy);

  const setTarget = useAppStore((s) => s.setFridaTarget);
  const setSource = useAppStore((s) => s.setFridaSource);
  const selectExample = useAppStore((s) => s.selectFridaExample);
  const setSpawnMode = useAppStore((s) => s.setFridaSpawnMode);
  const install = useAppStore((s) => s.installFrida);
  const startServer = useAppStore((s) => s.startFridaServer);
  const stopServer = useAppStore((s) => s.stopFridaServer);
  const runScript = useAppStore((s) => s.runFridaScript);
  const stopScript = useAppStore((s) => s.stopFridaScript);
  const clearMessages = useAppStore((s) => s.clearFridaMessages);

  const consoleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = consoleRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const selectedName = (() => {
    if (!deviceId) return null;
    const avd = avds.find((item) => item.serial === deviceId);
    if (avd) return avd.name;
    const device = devices?.android.find((item) => item.serial === deviceId);
    return device ? device.model || device.serial : deviceId;
  })();

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-zinc-800/80 px-4 py-3">
        <h1 className="font-display text-lg font-semibold text-zinc-100">{t('frida.title')}</h1>
        <span className="text-[11px] text-zinc-500">{t('frida.subtitle')}</span>
        {hostVersion ? (
          <span className="ml-auto font-mono text-[11px] text-zinc-600">frida {hostVersion}</span>
        ) : null}
      </header>

      {hostVersion === null ? (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-[12px] text-amber-300">
          {t('frida.host.missing')}
        </div>
      ) : null}

      <EmulatorPanel />

      <div className="flex flex-wrap items-center gap-3 border-b border-zinc-800/80 px-4 py-3">
        <span className="text-[10px] uppercase tracking-widest text-zinc-500">
          frida-server
          {selectedName ? (
            <>
              {' '}
              <span className="text-zinc-600">{t('frida.server.on')}</span>{' '}
              <span className="font-mono text-zinc-300">{selectedName}</span>
            </>
          ) : null}
        </span>
        {deviceId ? (
          <>
            <StatusPill
              ok={serverStatus.installed}
              label={serverStatus.installed ? t('frida.server.installed') : t('frida.server.notInstalled')}
            />
            <StatusPill
              ok={serverStatus.running}
              label={serverStatus.running ? t('frida.server.running') : t('frida.server.stopped')}
            />
            <span className="flex-1" />
            <button type="button" disabled={busy} onClick={() => void install().catch(() => undefined)} className={btn}>
              {t('frida.server.install')}
            </button>
            {serverStatus.running ? (
              <button type="button" onClick={() => void stopServer().catch(() => undefined)} className={btnStop}>
                {t('frida.server.stop')}
              </button>
            ) : (
              <button type="button" disabled={busy} onClick={() => void startServer().catch(() => undefined)} className={btnGo}>
                {t('frida.server.start')}
              </button>
            )}
          </>
        ) : (
          <span className="text-[11px] text-zinc-600">{t('frida.server.pickDevice')}</span>
        )}
      </div>

      {serverStatus.error ? (
        <div className="border-b border-rose-500/30 bg-rose-500/10 px-4 py-2 text-[12px] text-rose-300">
          {serverStatus.error}
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-2">
        <div className="flex min-h-0 flex-col border-r border-zinc-800/80">
          <div className="flex items-center gap-2 border-b border-zinc-800/80 px-3 py-2">
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder={t('frida.target.placeholder')}
              disabled={sessionStatus.running}
              list="frida-target-list"
              className="flex-1 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 font-mono text-[12px] text-zinc-200 disabled:opacity-50"
            />
            <datalist id="frida-target-list">
              {recentTargets.map((recent) => (
                <option key={recent} value={recent} />
              ))}
            </datalist>
            <select
              value={scriptId}
              onChange={(e) => selectExample(e.target.value)}
              className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-[12px] text-zinc-300"
            >
              <option value="custom">{t('frida.script.examples')}</option>
              {scripts.map((script) => (
                <option key={script.id} value={script.id}>
                  {script.name}
                </option>
              ))}
            </select>
          </div>
          <textarea
            value={source}
            onChange={(e) => setSource(e.target.value)}
            spellCheck={false}
            className="min-h-0 flex-1 resize-none bg-zinc-950 px-3 py-2 font-mono text-[12px] leading-relaxed text-zinc-200 outline-none"
          />
          <div className="flex items-center gap-3 border-t border-zinc-800/80 px-3 py-2">
            {sessionStatus.running ? (
              <button type="button" onClick={() => void stopScript().catch(() => undefined)} className={btnStop}>
                {t('frida.script.stop')}
              </button>
            ) : (
              <button
                type="button"
                disabled={!serverStatus.running || target.trim() === ''}
                onClick={() => void runScript().catch(() => undefined)}
                className={btnGo}
              >
                {t('frida.script.run')}
              </button>
            )}
            <label className="flex items-center gap-1.5 text-[11px] text-zinc-400">
              <input
                type="checkbox"
                checked={spawnMode}
                onChange={(e) => setSpawnMode(e.target.checked)}
                disabled={sessionStatus.running}
              />
              {t('frida.script.spawn')}
            </label>
            <span className="ml-auto text-[11px] text-zinc-500">
              {sessionStatus.running
                ? t('frida.session.running', { target: sessionStatus.target ?? '' })
                : t('frida.session.idle')}
            </span>
          </div>
        </div>

        <div className="flex min-h-0 flex-col">
          <div className="flex items-center gap-2 border-b border-zinc-800/80 px-3 py-2">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500">
              {t('frida.console.title')}
            </span>
            <button
              type="button"
              onClick={() => clearMessages()}
              className="ml-auto text-[11px] text-zinc-500 hover:text-zinc-300"
            >
              {t('frida.console.clear')}
            </button>
          </div>
          <div
            ref={consoleRef}
            className="min-h-0 flex-1 overflow-auto bg-zinc-950 px-3 py-2 font-mono text-[12px] leading-relaxed"
          >
            {messages.length === 0 ? (
              <p className="text-zinc-600">{t('frida.console.empty')}</p>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={
                    message.kind === 'error'
                      ? 'whitespace-pre-wrap text-rose-400'
                      : message.kind === 'send'
                        ? 'whitespace-pre-wrap text-emerald-300'
                        : 'whitespace-pre-wrap text-zinc-300'
                  }
                >
                  {message.text}
                </div>
              ))
            )}
          </div>
          {sessionStatus.error ? (
            <div className="border-t border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
              {sessionStatus.error}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
