import { useEffect, useState } from 'react';
import type { McpServerInfo } from '@frigg/shared';
import { useT } from '../i18n';
import * as api from '../api/client';
import CopyButton from '../components/devices/CopyButton';

function claudeCodeCommand(info: McpServerInfo): string {
  const envFlags = Object.entries(info.env).flatMap(([key, value]) => ['-e', `${key}=${value}`]);
  return ['claude mcp add frigg', ...envFlags, '--', info.command, ...info.args].join(' ');
}

function jsonConfig(info: McpServerInfo): string {
  return JSON.stringify(
    { mcpServers: { frigg: { command: info.command, args: info.args, env: info.env } } },
    null,
    2,
  );
}

function CapabilityRow({ children }: { children: string }) {
  return (
    <li className="flex items-start gap-2 text-[13px] text-zinc-400">
      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-emerald-400" />
      {children}
    </li>
  );
}

function CodeBlock({ value }: { value: string }) {
  return (
    <div className="relative rounded-md border border-zinc-800 bg-zinc-950">
      <div className="absolute right-1.5 top-1.5">
        <CopyButton value={value} label="copy" />
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all px-3 py-2.5 pr-9 font-mono text-[11px] leading-relaxed text-zinc-300">
        {value}
      </pre>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
      <h2 className="text-sm font-semibold text-zinc-200">{title}</h2>
      {children}
    </section>
  );
}

export default function McpScreen() {
  const t = useT();
  const [info, setInfo] = useState<McpServerInfo | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installResult, setInstallResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    void api
      .getMcpInfo()
      .then(setInfo)
      .catch(() => setInfo(null));
  }, []);

  const install = () => {
    setInstalling(true);
    setInstallResult(null);
    void api
      .installMcpClaudeCode()
      .then(setInstallResult)
      .catch((error: unknown) =>
        setInstallResult({ ok: false, message: error instanceof Error ? error.message : 'Failed' }),
      )
      .finally(() => setInstalling(false));
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-zinc-800/80 px-4 py-2.5">
        <h1 className="font-display text-base font-semibold tracking-wide text-zinc-100">
          {t('mcp.title')}
        </h1>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-5">
          {info === null ? (
            <p className="text-[13px] text-zinc-500">{t('mcp.loading')}</p>
          ) : (
            <>
              <p className="text-[13px] leading-relaxed text-zinc-400">{t('mcp.intro')}</p>

              <Card title={t('mcp.capabilitiesTitle')}>
                <ul className="mt-2 space-y-1.5">
                  <CapabilityRow>{t('mcp.cap.traffic')}</CapabilityRow>
                  <CapabilityRow>{t('mcp.cap.mocks')}</CapabilityRow>
                  <CapabilityRow>{t('mcp.cap.devices')}</CapabilityRow>
                  <CapabilityRow>{t('mcp.cap.client')}</CapabilityRow>
                </ul>
                <p className="mt-3 text-[11px] text-zinc-600">
                  {t('mcp.requirement')}{' '}
                  <span className="font-mono text-zinc-500">{info.env.FRIGG_API_URL}</span>) ·{' '}
                  {t('mcp.toolsCount', { count: info.toolCount })}
                </p>
              </Card>

              {!info.available ? (
                <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-300">
                  {t('mcp.unavailable')}
                </p>
              ) : (
                <>
                  <Card title={t('mcp.claudeCode.title')}>
                    <p className="mt-1 text-[12px] text-zinc-500">{t('mcp.claudeCode.desc')}</p>
                    <div className="mt-3 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={install}
                        disabled={installing}
                        className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 transition hover:bg-emerald-500/15 active:scale-[0.98] disabled:opacity-50"
                      >
                        {installing ? t('mcp.claudeCode.installing') : t('mcp.claudeCode.install')}
                      </button>
                      {installResult ? (
                        <span
                          className={`text-[12px] ${installResult.ok ? 'text-emerald-400' : 'text-rose-400'}`}
                        >
                          {installResult.message}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-3 text-[11px] text-zinc-600">{t('mcp.claudeCode.command')}</p>
                    <div className="mt-1.5">
                      <CodeBlock value={claudeCodeCommand(info)} />
                    </div>
                  </Card>

                  <Card title={t('mcp.manual.title')}>
                    <p className="mt-1 text-[12px] text-zinc-500">{t('mcp.manual.desc')}</p>
                    <div className="mt-3">
                      <CodeBlock value={jsonConfig(info)} />
                    </div>
                    <p className="mt-3 text-[11px] uppercase tracking-widest text-zinc-600">
                      {t('mcp.manual.paths')}
                    </p>
                    <ul className="mt-1.5 space-y-1 font-mono text-[11px] text-zinc-500">
                      <li>
                        <span className="text-zinc-400">{t('mcp.path.claudeDesktop')}:</span>{' '}
                        ~/Library/Application Support/Claude/claude_desktop_config.json
                      </li>
                      <li>
                        <span className="text-zinc-400">{t('mcp.path.cursor')}:</span> ~/.cursor/mcp.json
                      </li>
                      <li>
                        <span className="text-zinc-400">{t('mcp.path.windsurf')}:</span>{' '}
                        ~/.codeium/windsurf/mcp_config.json
                      </li>
                    </ul>
                  </Card>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
