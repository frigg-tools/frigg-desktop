import {
  AGENT_RESOURCE,
  AGENT_RESOURCE_STATE,
  type AgentClientId,
  type AgentIntegrationActionResult,
  type AgentIntegrationStatus,
  type AgentResourceId,
  type AgentResourceStatus,
  type AgentSkillStatus,
} from '@frigg/shared';
import { useT } from '../../i18n';

export interface AgentActionFeedback {
  ok: boolean;
  message: string;
}

export function integrationStatusMessage(value: AgentResourceStatus, t: ReturnType<typeof useT>): string | undefined {
  if (value.state === AGENT_RESOURCE_STATE.installed && (value.updateAvailable || value.message?.toLowerCase().includes('update'))) {
    return t('mcp.integrations.updateAvailable');
  }
  if (value.state === AGENT_RESOURCE_STATE.conflict) {
    return t(value.message?.includes('Resolve that shared folder')
      ? 'mcp.integrations.sharedConflict'
      : 'mcp.integrations.conflictDetail');
  }
  if (value.state === AGENT_RESOURCE_STATE.unavailable) return t('mcp.integrations.cliUnavailable');
  if (value.state === AGENT_RESOURCE_STATE.error) {
    if (/registry is invalid/i.test(value.message ?? '')) return t('mcp.integrations.registryInvalid');
    if (/configuration|invalid json|must be a json/i.test(value.message ?? '')) return t('mcp.integrations.invalidConfig');
    if (/bundled Frigg skills are unavailable/i.test(value.message ?? '')) return t('mcp.integrations.bundleUnavailable');
    return t('mcp.integrations.inspectError');
  }
  return undefined;
}

export function integrationActionFeedback(
  result: Pick<AgentIntegrationActionResult, 'ok' | 'resource' | 'status' | 'message'>,
  t: ReturnType<typeof useT>,
): AgentActionFeedback {
  if (result.ok) {
    return {
      ok: true,
      message: t(result.resource === AGENT_RESOURCE.mcp
        ? 'mcp.integrations.mcpSuccess'
        : 'mcp.integrations.skillsSuccess'),
    };
  }
  const failed = result.status[result.resource];
  if (/previous configuration was restored/i.test(result.message)) {
    return { ok: false, message: t('mcp.integrations.updateFailedRestored') };
  }
  if (/existing MCP entry was removed|check the client's MCP configuration/i.test(result.message)) {
    return { ok: false, message: t('mcp.integrations.updateFailedCheckConfig') };
  }
  return { ok: false, message: integrationStatusMessage(failed, t) ?? t('mcp.integrations.actionError') };
}

interface AgentIntegrationCardProps {
  status: AgentIntegrationStatus;
  pending: { resource: AgentResourceId | 'all'; skillName?: string } | null;
  busy: boolean;
  feedback?: Partial<Record<AgentResourceId, AgentActionFeedback>>;
  onInstall: (client: AgentClientId, resource: AgentResourceId, replaceConflict: boolean, skillName?: string) => void;
  onInstallAll: (client: AgentClientId) => void;
}

function needsInstall(state: string, updateAvailable = false, message?: string): boolean {
  return state === AGENT_RESOURCE_STATE.missing
    || (state === AGENT_RESOURCE_STATE.installed && (updateAvailable || Boolean(message?.toLowerCase().includes('update'))));
}

function needsAttention(state: string): boolean {
  return state === AGENT_RESOURCE_STATE.conflict
    || state === AGENT_RESOURCE_STATE.unavailable
    || state === AGENT_RESOURCE_STATE.error;
}

function ResourceRow({
  client,
  resource,
  value,
  pending,
  busy,
  feedback,
  onInstall,
}: {
  client: AgentClientId;
  resource: AgentResourceId;
  value: AgentResourceStatus;
  pending: boolean;
  busy: boolean;
  feedback?: AgentActionFeedback;
  onInstall: AgentIntegrationCardProps['onInstall'];
}) {
  const t = useT();
  const conflict = value.state === AGENT_RESOURCE_STATE.conflict;
  const replaceBlocked = value.message?.includes('Resolve that shared folder') ?? false;
  const unavailable = value.state === AGENT_RESOURCE_STATE.unavailable;
  const installed = value.state === AGENT_RESOURCE_STATE.installed;
  const updateAvailable = installed && (value.updateAvailable || Boolean(value.message?.toLowerCase().includes('update')));
  const shouldShowAction = !unavailable && !(conflict && replaceBlocked) && (!installed || updateAvailable);
  const actionLabel = conflict
    ? t('mcp.integrations.replace')
    : updateAvailable
      ? t('mcp.integrations.update')
      : t('mcp.integrations.install');
  const statusLabel = updateAvailable
    ? t('mcp.integrations.updateAvailableShort')
    : t(`mcp.integrations.state.${value.state}`);
  const displayMessage = integrationStatusMessage(value, t);
  const actionFeedback = feedback;

  return (
    <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${installed ? 'bg-emerald-400' : conflict ? 'bg-amber-400' : 'bg-zinc-600'}`}
          />
          <span className="text-xs font-medium text-zinc-200">
            {resource === AGENT_RESOURCE.mcp ? t('mcp.integrations.mcp') : t('mcp.integrations.skills')}
          </span>
          <span className="text-[11px] text-zinc-500">{statusLabel}</span>
        </div>
        {shouldShowAction ? (
          <button
            type="button"
            onClick={() => onInstall(client, resource, conflict)}
            disabled={pending || busy}
            className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-50 ${
              conflict
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/15'
                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15'
            }`}
          >
            {pending ? t('mcp.integrations.working') : actionLabel}
          </button>
        ) : null}
      </div>
      {displayMessage ? <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">{displayMessage}</p> : null}
      {actionFeedback ? (
        <p className={`mt-2 text-[11px] leading-relaxed ${actionFeedback.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
          {actionFeedback.message}
        </p>
      ) : null}
      {value.paths.length > 0 ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-[10px] text-zinc-600">{t('mcp.integrations.paths')}</summary>
          <ul className="mt-1 space-y-0.5 break-all font-mono text-[10px] text-zinc-600">
            {value.paths.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function SkillRow({
  client,
  value,
  pending,
  busy,
  onInstall,
}: {
  client: AgentClientId;
  value: AgentSkillStatus;
  pending: boolean;
  busy: boolean;
  onInstall: AgentIntegrationCardProps['onInstall'];
}) {
  const t = useT();
  const conflict = value.state === AGENT_RESOURCE_STATE.conflict;
  const replaceBlocked = value.message?.includes('Resolve that shared folder') ?? false;
  const installed = value.state === AGENT_RESOURCE_STATE.installed;
  const shouldShowAction = !(conflict && replaceBlocked) && (!installed || value.updateAvailable);
  const actionLabel = conflict
    ? t('mcp.integrations.replace')
    : value.updateAvailable
      ? t('mcp.integrations.update')
      : t('mcp.integrations.install');
  const statusLabel = value.updateAvailable
    ? t('mcp.integrations.updateAvailableShort')
    : t(`mcp.integrations.state.${value.state}`);
  const displayMessage = integrationStatusMessage(value, t);

  return (
    <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${installed ? 'bg-emerald-400' : conflict ? 'bg-amber-400' : 'bg-zinc-600'}`}
          />
          <span className="text-xs font-medium text-zinc-200">{value.name}</span>
          <span className="text-[11px] text-zinc-500">{statusLabel}</span>
        </div>
        {shouldShowAction ? (
          <button
            type="button"
            onClick={() => onInstall(client, AGENT_RESOURCE.skills, conflict, value.name)}
            disabled={pending || busy}
            className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-50 ${
              conflict
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/15'
                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15'
            }`}
          >
            {pending ? t('mcp.integrations.working') : actionLabel}
          </button>
        ) : null}
      </div>
      <p className="mt-1 text-[11px] text-zinc-500">
        {t('mcp.integrations.skillVersion', {
          installed: value.installedVersion ?? t('mcp.integrations.versionUnknown'),
          available: value.availableVersion ?? t('mcp.integrations.versionUnknown'),
        })}
      </p>
      {displayMessage ? <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">{displayMessage}</p> : null}
      {value.paths.length > 0 ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-[10px] text-zinc-600">{t('mcp.integrations.paths')}</summary>
          <ul className="mt-1 space-y-0.5 break-all font-mono text-[10px] text-zinc-600">
            {value.paths.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

export default function AgentIntegrationCard({ status, pending, busy, feedback, onInstall, onInstallAll }: AgentIntegrationCardProps) {
  const t = useT();
  const installableSkillCount = status.skillDetails.filter((skill) => needsInstall(skill.state, skill.updateAvailable, skill.message)).length;
  const mcpNeedsInstall = needsInstall(status.mcp.state, status.mcp.updateAvailable, status.mcp.message);
  const installableCount = installableSkillCount + Number(mcpNeedsInstall);
  const attentionNeeded = needsAttention(status.mcp.state)
    || needsAttention(status.skills.state)
    || status.skillDetails.some((skill) => needsAttention(skill.state));
  const installAllLabel = pending?.resource === 'all'
    ? t('mcp.integrations.installingAll')
    : installableCount > 0
      ? t('mcp.integrations.installAll')
      : attentionNeeded
        ? t('mcp.integrations.needsAttention')
        : t('mcp.integrations.allInstalled');

  return (
    <details className="group rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-zinc-200">{t(`mcp.integrations.client.${status.client}`)}</span>
          <span className="mt-0.5 block text-[11px] text-zinc-600">{t('mcp.integrations.skillCount', { count: status.skillDetails.length })}</span>
        </span>
        <svg className="h-4 w-4 shrink-0 text-zinc-500 transition-transform group-open:rotate-180" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.09 1.032l-4.25 4.51a.75.75 0 0 1-1.09 0l-4.25-4.51a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
        </svg>
      </summary>
      <div className="mt-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] text-zinc-600">{t('mcp.integrations.global')}</p>
          <button
            type="button"
            onClick={() => onInstallAll(status.client)}
            disabled={busy || installableCount === 0}
            className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-medium text-emerald-400 transition hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:bg-zinc-950/40 disabled:text-zinc-500"
          >
            {installAllLabel}
          </button>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        <ResourceRow
          client={status.client}
          resource={AGENT_RESOURCE.mcp}
          value={status.mcp}
          pending={pending?.resource === AGENT_RESOURCE.mcp}
          busy={busy}
          feedback={feedback?.[AGENT_RESOURCE.mcp]}
          onInstall={onInstall}
        />
        <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/50 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-zinc-200">{t('mcp.integrations.skills')}</span>
            <span className="text-[11px] text-zinc-500">{t('mcp.integrations.skillCount', { count: status.skillDetails.length })}</span>
          </div>
          <div className="mt-2 space-y-2">
            {status.skillDetails.map((skill) => (
              <SkillRow
                key={skill.name}
                client={status.client}
                value={skill}
                pending={pending?.resource === AGENT_RESOURCE.skills && pending.skillName === skill.name}
                busy={busy}
                onInstall={onInstall}
              />
            ))}
          </div>
          {status.skillDetails.length === 0 && status.skills.message ? (
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">{integrationStatusMessage(status.skills, t) ?? status.skills.message}</p>
          ) : null}
          {feedback?.[AGENT_RESOURCE.skills] ? (
            <p className={`mt-2 text-[11px] leading-relaxed ${feedback[AGENT_RESOURCE.skills]?.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
              {feedback[AGENT_RESOURCE.skills]?.message}
            </p>
          ) : null}
        </div>
      </div>
    </details>
  );
}
