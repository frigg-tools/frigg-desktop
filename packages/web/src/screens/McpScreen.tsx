import { useEffect, useState } from 'react';
import {
  AGENT_CLIENT,
  AGENT_RESOURCE,
  AGENT_RESOURCE_STATE,
  type AgentClientId,
  type AgentIntegrationActionResult,
  type AgentIntegrationSnapshot,
  type AgentResourceId,
  type McpServerInfo,
} from '@frigg/shared';
import { useT } from '../i18n';
import * as api from '../api/client';
import CopyButton from '../components/devices/CopyButton';
import AgentIntegrationCard, {
  integrationActionFeedback,
  type AgentActionFeedback,
} from '../components/mcp/AgentIntegrationCard';

const CLIENT_ORDER: AgentClientId[] = [AGENT_CLIENT.codex, AGENT_CLIENT.claudeCode, AGENT_CLIENT.cursor];

function claudeCodeCommand(info: McpServerInfo): string {
  const envFlags = Object.entries(info.env).flatMap(([key, value]) => ['--env', `${key}=${value}`]);
  return ['claude mcp add', ...envFlags, '--transport', 'stdio', '--scope', 'user', 'frigg', '--', info.command, ...info.args].join(' ');
}

function needsInstall(state: string, updateAvailable = false, message?: string): boolean {
  return state === AGENT_RESOURCE_STATE.missing
    || (state === AGENT_RESOURCE_STATE.installed && (updateAvailable || Boolean(message?.toLowerCase().includes('update'))));
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
  const [integrations, setIntegrations] = useState<AgentIntegrationSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ client: AgentClientId; resource: AgentResourceId | 'all'; skillName?: string } | null>(null);
  const [feedback, setFeedback] = useState<Partial<Record<AgentClientId, Partial<Record<AgentResourceId, AgentActionFeedback>>>>>({});

  const refreshIntegrations = async () => {
    try {
      setIntegrations(await api.getAgentIntegrations());
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : t('mcp.integrations.loadError'));
    }
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    void Promise.allSettled([api.getMcpInfo(), api.getAgentIntegrations()]).then(([mcpResult, integrationResult]) => {
      if (!active) return;
      if (mcpResult.status === 'fulfilled') setInfo(mcpResult.value);
      else setLoadError(mcpResult.reason instanceof Error ? mcpResult.reason.message : t('mcp.integrations.loadError'));
      if (integrationResult.status === 'fulfilled') setIntegrations(integrationResult.value);
      else setLoadError(integrationResult.reason instanceof Error ? integrationResult.reason.message : t('mcp.integrations.loadError'));
      setLoading(false);
    });
    return () => { active = false; };
  }, [t]);

  const install = async (
    client: AgentClientId,
    resource: AgentResourceId,
    replaceConflict: boolean,
    skillName?: string,
  ) => {
    setPending({ client, resource, ...(skillName ? { skillName } : {}) });
    setFeedback((previous) => ({
      ...previous,
      [client]: { ...previous[client], [resource]: undefined },
    }));
    try {
      const result = resource === AGENT_RESOURCE.mcp
        ? await api.installAgentMcp(client, replaceConflict)
        : skillName
          ? await api.installAgentSkill(client, skillName, replaceConflict)
          : await api.installAgentSkills(client, replaceConflict);
      setFeedback((previous) => ({
        ...previous,
        [client]: { ...previous[client], [resource]: integrationActionFeedback(result, t) },
      }));
      await refreshIntegrations();
    } catch {
      setFeedback((previous) => ({
        ...previous,
        [client]: {
          ...previous[client],
          [resource]: { ok: false, message: t('mcp.integrations.actionError') },
        },
      }));
      await refreshIntegrations();
    } finally {
      setPending(null);
    }
  };

  const installAll = async (client: AgentClientId) => {
    const clientStatus = integrations?.clients.find((item) => item.client === client);
    if (!clientStatus) return;

    const installMcp = needsInstall(clientStatus.mcp.state, clientStatus.mcp.updateAvailable, clientStatus.mcp.message);
    const skillsToInstall = clientStatus.skillDetails.filter((skill) => needsInstall(skill.state, skill.updateAvailable, skill.message));
    if (!installMcp && skillsToInstall.length === 0) return;

    setPending({ client, resource: 'all' });
    setFeedback((previous) => ({
      ...previous,
      [client]: { ...previous[client], [AGENT_RESOURCE.mcp]: undefined, [AGENT_RESOURCE.skills]: undefined },
    }));

    let mcpFeedback: AgentActionFeedback | undefined;
    let successfulSkills = 0;
    let failedSkills = 0;
    let firstSkillFailure: AgentIntegrationActionResult | null = null;
    let skillRequestFailed = false;

    if (installMcp) {
      try {
        const result = await api.installAgentMcp(client, false);
        mcpFeedback = integrationActionFeedback(result, t);
      } catch {
        mcpFeedback = { ok: false, message: t('mcp.integrations.actionError') };
      }
    }

    for (const skill of skillsToInstall) {
      try {
        const result = await api.installAgentSkill(client, skill.name, false);
        if (result.ok) successfulSkills += 1;
        else {
          failedSkills += 1;
          firstSkillFailure ??= result;
        }
      } catch {
        failedSkills += 1;
        skillRequestFailed = true;
      }
    }

    let skillsFeedback: AgentActionFeedback | undefined;
    if (skillsToInstall.length > 0) {
      if (failedSkills === 0) {
        skillsFeedback = { ok: true, message: t('mcp.integrations.skillsSuccess') };
      } else if (successfulSkills > 0 || failedSkills > 1) {
        skillsFeedback = {
          ok: false,
          message: t('mcp.integrations.bulkPartial', { installed: successfulSkills, failed: failedSkills }),
        };
      } else if (firstSkillFailure) {
        skillsFeedback = integrationActionFeedback(firstSkillFailure, t);
      } else if (skillRequestFailed) {
        skillsFeedback = { ok: false, message: t('mcp.integrations.actionError') };
      }
    }

    setFeedback((previous) => ({
      ...previous,
      [client]: {
        ...previous[client],
        ...(mcpFeedback ? { [AGENT_RESOURCE.mcp]: mcpFeedback } : {}),
        ...(skillsFeedback ? { [AGENT_RESOURCE.skills]: skillsFeedback } : {}),
      },
    }));

    try {
      await refreshIntegrations();
    } finally {
      setPending(null);
    }
  };

  const orderedIntegrations = CLIENT_ORDER.flatMap((client) => {
    const clientStatus = integrations?.clients.find((item) => item.client === client);
    return clientStatus ? [clientStatus] : [];
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-zinc-800/80 px-4 py-2.5">
        <h1 className="font-display text-base font-semibold tracking-wide text-zinc-100">
          {t('mcp.title')}
        </h1>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-5">
          {loading ? <p className="text-[13px] text-zinc-500">{t('mcp.loading')}</p> : null}
          {loadError ? (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-300">
              {loadError}
            </p>
          ) : null}

          {info ? (
            <>
              <p className="text-[13px] leading-relaxed text-zinc-400">{t('mcp.intro')}</p>

              <Card title={t('mcp.capabilitiesTitle')}>
                <ul className="mt-2 space-y-1.5">
                  <CapabilityRow>{t('mcp.cap.traffic')}</CapabilityRow>
                  <CapabilityRow>{t('mcp.cap.mocks')}</CapabilityRow>
                  <CapabilityRow>{t('mcp.cap.devices')}</CapabilityRow>
                  <CapabilityRow>{t('mcp.cap.client')}</CapabilityRow>
                  <CapabilityRow>{t('mcp.cap.skills')}</CapabilityRow>
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
              ) : null}
            </>
          ) : null}

          {orderedIntegrations.length > 0 ? (
            <>
              <div>
                <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                  {t('mcp.integrations.title')}
                </h2>
                <div className="space-y-3">
                  {orderedIntegrations.map((clientStatus) => (
                    <AgentIntegrationCard
                      key={clientStatus.client}
                      status={clientStatus}
                      pending={pending?.client === clientStatus.client ? pending : null}
                      busy={pending !== null}
                      feedback={feedback[clientStatus.client]}
                      onInstall={install}
                      onInstallAll={installAll}
                    />
                  ))}
                </div>
              </div>
              <p className="text-[11px] leading-relaxed text-zinc-600">{t('mcp.integrations.reloadHint')}</p>
            </>
          ) : null}

          {info ? (
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
                  <span className="text-zinc-400">{t('mcp.path.codex')}:</span> ~/.codex/config.toml
                </li>
                <li>
                  <span className="text-zinc-400">{t('mcp.path.windsurf')}:</span>{' '}
                  ~/.codeium/windsurf/mcp_config.json
                </li>
              </ul>
              <p className="mt-3 text-[11px] text-zinc-600">{t('mcp.claudeCode.command')}</p>
              <div className="mt-1.5"><CodeBlock value={claudeCodeCommand(info)} /></div>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
