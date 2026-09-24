import { useEffect, useState } from 'react';
import { AUTOMATION_STEP_STATUS, type AutomationArtifact, type AutomationRun } from '@frigg/shared';
import { getAutomationArtifact } from '../../api/automations';
import type { TranslateFn } from '../../i18n';

interface ArtifactPreview {
  artifact: AutomationArtifact;
  url: string;
}

function stepTone(status: string): string {
  if (status === AUTOMATION_STEP_STATUS.completed) return 'text-emerald-300';
  if (status === AUTOMATION_STEP_STATUS.failed) return 'text-rose-300';
  if (status === AUTOMATION_STEP_STATUS.running) return 'text-sky-300';
  if (status === AUTOMATION_STEP_STATUS.cancelled) return 'text-zinc-400';
  return 'text-zinc-600';
}

export default function RunInspector({ run, onCancel, t }: { run: AutomationRun | null; onCancel: () => void; t: TranslateFn }) {
  const [previews, setPreviews] = useState<ArtifactPreview[]>([]);
  const artifactIds = run?.artifacts.map((artifact) => artifact.id).join(',') ?? '';
  useEffect(() => {
    if (!run || run.artifacts.length === 0) {
      setPreviews([]);
      return;
    }
    let alive = true;
    const createdUrls: string[] = [];
    void Promise.all(run.artifacts.slice(-3).map(async (artifact) => {
      try {
        const result = await getAutomationArtifact(run.id, artifact.id);
        const url = URL.createObjectURL(result.blob);
        createdUrls.push(url);
        return { artifact, url };
      } catch {
        return null;
      }
    })).then((items) => {
      if (alive) setPreviews(items.filter((item): item is ArtifactPreview => item !== null));
      else createdUrls.forEach(URL.revokeObjectURL);
    });
    return () => {
      alive = false;
      createdUrls.forEach(URL.revokeObjectURL);
    };
  }, [run?.id, artifactIds]);

  if (!run) return <p className="text-[11px] text-zinc-500">{t('automation.editor.noRun')}</p>;
  const active = run.status === 'starting' || run.status === 'running' || run.status === 'cancelling';
  const completedCount = run.steps.filter((step) => step.status === AUTOMATION_STEP_STATUS.completed).length;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-zinc-500">
        <span className="truncate font-mono">{run.deviceSerial}</span>
        <span>{new Date(run.createdAt).toLocaleTimeString()}</span>
      </div>
      <p className="text-[11px] text-zinc-400">{t('automation.editor.stepCount', { completed: completedCount, total: run.steps.length || run.automation.nodes.length - 2 })}</p>
      {run.errorMessage && <p role="alert" className="rounded-md bg-rose-500/10 p-2 text-[10px] leading-relaxed text-rose-200">{run.errorMessage}</p>}
      {run.steps.length > 0 && <ol className="max-h-56 space-y-2 overflow-y-auto pr-1">
        {run.steps.map((step) => (
          <li key={step.nodeId} className="flex gap-2 rounded-md border border-zinc-800/80 bg-zinc-950/40 px-2.5 py-2">
            <span aria-hidden="true" className={`mt-0.5 text-[10px] ${stepTone(step.status)}`}>{step.status === AUTOMATION_STEP_STATUS.completed ? '✓' : step.status === AUTOMATION_STEP_STATUS.failed ? '!' : step.status === AUTOMATION_STEP_STATUS.running ? '●' : '○'}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-[10px] font-medium text-zinc-300">{t(`automation.node.${step.nodeType}`)}</p>
                <span className={`shrink-0 text-[9px] ${stepTone(step.status)}`}>{t(`automation.step.${step.status}`)}</span>
              </div>
              {step.message && <p className="mt-1 break-words text-[10px] leading-relaxed text-zinc-500">{step.message}</p>}
              {step.durationMs !== undefined && <p className="mt-1 text-[9px] text-zinc-600">{step.durationMs} ms</p>}
            </div>
          </li>
        ))}
      </ol>}
      {previews.length > 0 && <div className="grid grid-cols-3 gap-2">
        {previews.map(({ artifact, url }) => <a key={artifact.id} href={url} target="_blank" rel="noreferrer" title={t('automation.inspector.openScreenshot')} className="overflow-hidden rounded border border-zinc-800 bg-zinc-950"><img src={url} alt={t('automation.inspector.screenshotAlt')} className="h-20 w-full object-cover" /><span className="block truncate px-1.5 py-1 text-[9px] text-zinc-500">{artifact.width}×{artifact.height}</span></a>)}
      </div>}
      {active && <button type="button" onClick={onCancel} className="w-full rounded-md border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:bg-zinc-900">{t('automation.editor.cancelRun')}</button>}
    </div>
  );
}
