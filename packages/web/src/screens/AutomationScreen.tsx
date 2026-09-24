import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AUTOMATION_NODE_TYPE,
  AUTOMATION_RUN_STATUS,
  type AndroidDevice,
  type Automation,
  type AutomationDefinition,
  type AutomationActionData,
  type AutomationNode,
  type AutomationRun,
  type AutomationRunStatus,
} from '@frigg/shared';
import { useT } from '../i18n';
import {
  cancelAutomationRun,
  captureAutomationScreenshot,
  createAutomation,
  deleteAutomation,
  duplicateAutomation,
  getAutomationRun,
  getAutomationCatalog,
  isAutomationRunActive,
  listAutomationRuns,
  listAutomations,
  startAutomationRun,
  testAutomationAction,
  updateAutomation,
} from '../api/automations';
import AutomationCanvas from '../components/automation/AutomationCanvas';
import NodeProperties from '../components/automation/NodeProperties';
import RunInspector from '../components/automation/RunInspector';
import type { DeviceCapture } from '../components/automation/DeviceScreenshotPicker';

const primaryButton = 'inline-flex items-center justify-center gap-2 rounded-md bg-emerald-400 px-3.5 py-2 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:opacity-40';
const secondaryButton = 'inline-flex items-center justify-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:bg-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:opacity-40';
const smallButton = 'inline-flex items-center justify-center rounded px-2.5 py-1.5 text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300';

function blankAutomation(name: string): AutomationDefinition {
  return {
    name,
    description: '',
    schemaVersion: 1,
    nodes: [
      { id: 'start', type: AUTOMATION_NODE_TYPE.start, data: {}, position: { x: 70, y: 22 } },
      { id: 'end', type: AUTOMATION_NODE_TYPE.end, data: {}, position: { x: 70, y: 105 } },
    ],
    edges: [{ id: 'edge-start-end', source: 'start', target: 'end' }],
  };
}

function asDefinition(automation: Automation): AutomationDefinition {
  return {
    name: automation.name,
    description: automation.description,
    schemaVersion: automation.schemaVersion,
    nodes: automation.nodes,
    edges: automation.edges,
  };
}

function friendlyError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message !== '' ? error.message : fallback;
}

function statusTone(status: AutomationRunStatus): string {
  if (status === AUTOMATION_RUN_STATUS.completed) return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  if (status === AUTOMATION_RUN_STATUS.failed || status === AUTOMATION_RUN_STATUS.interrupted) return 'border-rose-500/30 bg-rose-500/10 text-rose-300';
  if (status === AUTOMATION_RUN_STATUS.cancelled) return 'border-zinc-700 bg-zinc-800 text-zinc-300';
  return 'border-sky-500/30 bg-sky-500/10 text-sky-300';
}

function AutomationMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <rect x="3" y="4" width="6" height="6" rx="1.5" />
      <rect x="15" y="14" width="6" height="6" rx="1.5" />
      <path d="M9 7h3a3 3 0 0 1 3 3v4" />
      <path d="m13 12 2 2 2-2" />
    </svg>
  );
}

type ScreenCapture = DeviceCapture & { objectUrl: string };

function geometryMatches(point: { referenceWidth: number; referenceHeight: number; referenceRotation: number }, capture: ScreenCapture): boolean {
  return point.referenceWidth === capture.width && point.referenceHeight === capture.height && point.referenceRotation === capture.rotation;
}

function invalidateStaleCoordinates(nodes: AutomationNode[], capture: ScreenCapture): { nodes: AutomationNode[]; changed: boolean } {
  let changed = false;
  const updated = nodes.map((node): AutomationNode => {
    if ((node.type === AUTOMATION_NODE_TYPE.tap || node.type === AUTOMATION_NODE_TYPE.longPress) && 'point' in node.data && !geometryMatches(node.data.point, capture)) {
      changed = true;
      return { ...node, data: node.type === AUTOMATION_NODE_TYPE.longPress ? { durationMs: 'durationMs' in node.data ? node.data.durationMs : 500 } : {} };
    }
    if (node.type === AUTOMATION_NODE_TYPE.swipe && 'start' in node.data && (!geometryMatches(node.data.start, capture) || !geometryMatches(node.data.end, capture))) {
      changed = true;
      return { ...node, data: { durationMs: 'durationMs' in node.data ? node.data.durationMs : 350 } };
    }
    return node;
  });
  return { nodes: updated, changed };
}

function DeleteDialog({ automation, deleting, onCancel, onConfirm, t }: {
  automation: Automation;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  t: ReturnType<typeof useT>;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <section role="alertdialog" aria-modal="true" aria-labelledby="automation-delete-title" className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
        <h2 id="automation-delete-title" className="font-display text-lg font-semibold text-zinc-100">{t('automation.delete.title')}</h2>
        <p className="mt-2 text-sm text-zinc-400">{t('automation.delete.body')}</p>
        <p className="mt-2 truncate text-sm font-medium text-zinc-200">{automation.name}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className={secondaryButton}>{t('automation.delete.cancel')}</button>
          <button type="button" onClick={onConfirm} disabled={deleting} className="rounded-md bg-rose-500 px-3.5 py-2 text-sm font-semibold text-white hover:bg-rose-400 disabled:opacity-50">{deleting ? t('automation.deleting') : t('automation.delete.confirm')}</button>
        </div>
      </section>
    </div>
  );
}

export default function AutomationScreen() {
  const t = useT();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [devices, setDevices] = useState<AndroidDevice[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Automation | null>(null);
  const [selectedSerial, setSelectedSerial] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [capture, setCapture] = useState<ScreenCapture | null>(null);
  const [activeRun, setActiveRun] = useState<AutomationRun | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Automation | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [testStatus, setTestStatus] = useState('');

  const selected = useMemo(() => automations.find((automation) => automation.id === selectedId) ?? null, [automations, selectedId]);
  const onlineDevices = useMemo(() => devices.filter((device) => device.state === 'device'), [devices]);
  const filteredAutomations = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return automations;
    return automations.filter((automation) => `${automation.name} ${automation.description}`.toLowerCase().includes(query));
  }, [automations, search]);
  const actionCount = draft?.nodes.filter((node) => node.type !== AUTOMATION_NODE_TYPE.start && node.type !== AUTOMATION_NODE_TYPE.end).length ?? 0;
  const selectedNode = draft?.nodes.find((node) => node.id === selectedNodeId) ?? null;

  const loadScreen = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [items, catalog] = await Promise.all([listAutomations(), getAutomationCatalog()]);
      setAutomations(items);
      setDevices(catalog.devices);
      setSelectedSerial((current) => current || catalog.devices.find((device) => device.state === 'device')?.serial || '');
    } catch (cause) {
      setError(friendlyError(cause, t('automation.error.load')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadScreen();
  }, [loadScreen]);

  useEffect(() => {
    if (!capture) return;
    return () => URL.revokeObjectURL(capture.objectUrl);
  }, [capture?.objectUrl]);

  useEffect(() => {
    if (!selectedId) {
      setActiveRun(null);
      return;
    }
    let current = true;
    void listAutomationRuns(selectedId)
      .then((items) => {
        if (!current) return;
        const latest = items[0] ?? null;
        setActiveRun(latest);
        if (latest && isAutomationRunActive(latest.status)) {
          void getAutomationRun(latest.id).then((fresh) => current && setActiveRun(fresh)).catch(() => undefined);
        }
      })
      .catch(() => undefined);
    return () => { current = false; };
  }, [selectedId]);

  useEffect(() => {
    if (!activeRun || !isAutomationRunActive(activeRun.status)) return;
    let polling = false;
    const timer = window.setInterval(() => {
      if (polling) return;
      polling = true;
      void getAutomationRun(activeRun.id)
        .then(setActiveRun)
        .catch((cause) => setError(friendlyError(cause, t('automation.error.run'))))
        .finally(() => { polling = false; });
    }, 700);
    return () => window.clearInterval(timer);
  }, [activeRun?.id, activeRun?.status, t]);

  const openAutomation = (automation: Automation) => {
    setSelectedId(automation.id);
    setDraft(automation);
    setActiveRun(null);
    setCapture(null);
    setSelectedNodeId(null);
    setTestStatus('');
    setError('');
  };

  const createNew = async () => {
    setCreating(true);
    setError('');
    const baseName = t('automation.new');
    const existing = new Set(automations.map((item) => item.name.trim().toLowerCase()));
    let name = baseName;
    let suffix = 2;
    while (existing.has(name.toLowerCase())) {
      name = `${baseName} ${suffix}`;
      suffix += 1;
    }
    try {
      const created = await createAutomation(blankAutomation(name));
      setAutomations((items) => [created, ...items]);
      openAutomation(created);
    } catch (cause) {
      setError(friendlyError(cause, t('automation.error.create')));
    } finally {
      setCreating(false);
    }
  };

  const saveChanges = async () => {
    if (!draft) return;
    if (!draft.name.trim()) {
      setError(t('automation.error.nameRequired'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const saved = await updateAutomation(draft.id, asDefinition(draft), draft.revision);
      setAutomations((items) => items.map((item) => item.id === saved.id ? saved : item));
      setDraft(saved);
    } catch (cause) {
      const message = friendlyError(cause, t('automation.error.save'));
      if (message.toLowerCase().includes('revision')) {
        setError(t('automation.error.stale'));
        try {
          const latest = await listAutomations();
          setAutomations(latest);
          const fresh = latest.find((item) => item.id === draft.id);
          if (fresh) setDraft(fresh);
        } catch {
          // Keep the revision conflict message visible if the refresh also fails.
        }
      } else {
        setError(message);
      }
    } finally {
      setSaving(false);
    }
  };

  const duplicate = async (automation: Automation) => {
    setError('');
    try {
      const copy = await duplicateAutomation(automation.id);
      setAutomations((items) => [copy, ...items]);
      openAutomation(copy);
    } catch (cause) {
      setError(friendlyError(cause, t('automation.error.duplicate')));
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError('');
    try {
      await deleteAutomation(deleteTarget.id);
      setAutomations((items) => items.filter((item) => item.id !== deleteTarget.id));
      if (selectedId === deleteTarget.id) {
        setSelectedId(null);
        setDraft(null);
        setActiveRun(null);
      }
      setDeleteTarget(null);
    } catch (cause) {
      setError(friendlyError(cause, t('automation.error.delete')));
    } finally {
      setDeleting(false);
    }
  };

  const captureScreen = async () => {
    if (!selectedSerial) {
      setError(t('automation.error.deviceRequired'));
      return;
    }
    setCapturing(true);
    setError('');
    try {
      const screenshot = await captureAutomationScreenshot(selectedSerial);
      const nextCapture: ScreenCapture = { ...screenshot, serial: selectedSerial, capturedAt: Date.now(), objectUrl: URL.createObjectURL(screenshot.blob) };
      if (draft && invalidateStaleCoordinates(draft.nodes, nextCapture).changed) setError(t('automation.picker.geometryChanged'));
      setDraft((current) => current ? { ...current, nodes: invalidateStaleCoordinates(current.nodes, nextCapture).nodes } : current);
      setCapture(nextCapture);
    } catch (cause) {
      setError(friendlyError(cause, t('automation.error.capture')));
    } finally {
      setCapturing(false);
    }
  };

  const updateGraph = useCallback((nodes: AutomationNode[], edges: AutomationDefinition['edges']) => {
    setDraft((current) => current ? { ...current, nodes, edges } : current);
  }, []);

  const selectNode = useCallback((id: string | null) => {
    setSelectedNodeId(id);
    setTestStatus('');
  }, []);

  const updateNodeData = useCallback((nodeId: string, data: AutomationActionData) => {
    setDraft((current) => current ? { ...current, nodes: current.nodes.map((node) => node.id === nodeId ? { ...node, data } : node) } : current);
    setTestStatus('');
  }, []);

  const runTestAction = async (node: AutomationNode) => {
    if (!selectedSerial) {
      setError(t('automation.error.deviceRequired'));
      return;
    }
    setTestStatus('');
    setError('');
    try {
      await testAutomationAction(selectedSerial, node, globalThis.crypto?.randomUUID?.() ?? `test-${Date.now()}`);
      setTestStatus(t('automation.properties.testDone'));
    } catch (cause) {
      setError(friendlyError(cause, t('automation.error.testAction')));
    }
  };

  const runAutomation = async () => {
    if (!draft) return;
    if (!selectedSerial) {
      setError(t('automation.error.deviceRequired'));
      return;
    }
    if (actionCount === 0) {
      setError(t('automation.editor.noActions'));
      return;
    }
    setRunning(true);
    setError('');
    let automationToRun = draft;
    try {
      if (selected && JSON.stringify(asDefinition(draft)) !== JSON.stringify(asDefinition(selected))) {
        setSaving(true);
        automationToRun = await updateAutomation(draft.id, asDefinition(draft), draft.revision);
        setAutomations((items) => items.map((item) => item.id === automationToRun.id ? automationToRun : item));
        setDraft(automationToRun);
      }
      const run = await startAutomationRun({
        automationId: automationToRun.id,
        expectedRevision: automationToRun.revision,
        serial: selectedSerial,
        requestId: globalThis.crypto?.randomUUID?.() ?? `automation-${Date.now()}`,
      });
      setActiveRun(run);
    } catch (cause) {
      const message = friendlyError(cause, t('automation.error.run'));
      setError(message.toLowerCase().includes('busy')
        ? t('automation.error.runBusy')
        : message.toLowerCase().includes('revision')
          ? t('automation.error.stale')
          : message);
    } finally {
      setSaving(false);
      setRunning(false);
    }
  };

  const stopRun = async () => {
    if (!activeRun) return;
    setError('');
    try {
      setActiveRun(await cancelAutomationRun(activeRun.id));
    } catch (cause) {
      setError(friendlyError(cause, t('automation.error.cancel')));
    }
  };

  const returnToList = () => {
    setSelectedId(null);
    setDraft(null);
    setActiveRun(null);
    setCapture(null);
    setError('');
    void loadScreen();
  };

  if (draft && selected) {
    const dirty = JSON.stringify(asDefinition(draft)) !== JSON.stringify(asDefinition(selected));
    const onlineSelected = onlineDevices.some((device) => device.serial === selectedSerial);
    const active = Boolean(activeRun && isAutomationRunActive(activeRun.status));
    const captureUrl = capture?.objectUrl;
    return (
      <div className="flex h-full min-h-0 flex-col bg-zinc-950">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-zinc-800/80 px-5 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={returnToList} className={smallButton}>{t('automation.editor.back')}</button>
            <span className="h-5 w-px bg-zinc-800" />
            <div className="min-w-0">
              <h1 className="truncate font-display text-lg font-semibold text-zinc-100">{draft.name}</h1>
              <p className="text-xs text-zinc-500">{t('automation.editor.revision', { revision: draft.revision })}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={() => void duplicate(draft)} className={secondaryButton}>{t('automation.editor.duplicate')}</button>
            <button type="button" onClick={() => setDeleteTarget(draft)} className={smallButton}>{t('automation.editor.delete')}</button>
            <button type="button" onClick={() => void saveChanges()} disabled={!dirty || saving} className={primaryButton}>
              {saving ? t('automation.editor.saving') : t('automation.editor.save')}
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid min-h-full grid-cols-1 xl:grid-cols-[minmax(0,1fr)_310px]">
            <main className="flex min-w-0 flex-col gap-3 p-3 lg:p-4 xl:overflow-y-auto">
              {error && <p role="alert" className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</p>}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-[10px] font-medium text-zinc-500">{t('automation.editor.name')}</span>
                  <input value={draft.name} maxLength={80} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder={t('automation.editor.namePlaceholder')} className="w-full rounded-md border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-emerald-500/70" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-[10px] font-medium text-zinc-500">{t('automation.editor.description')}</span>
                  <input value={draft.description} maxLength={500} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder={t('automation.editor.descriptionPlaceholder')} className="w-full rounded-md border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-emerald-500/70" />
                </label>
              </div>

              <AutomationCanvas definition={draft} selectedNodeId={selectedNodeId} run={activeRun} t={t} onChange={updateGraph} onSelectNode={selectNode} />
            </main>

            <aside className="flex flex-col gap-4 border-t border-zinc-800/80 bg-zinc-900/20 p-4 xl:min-h-0 xl:overflow-y-auto xl:border-l xl:border-t-0">
              <section className="space-y-2">
                <div>
                  <h2 className="text-xs font-semibold text-zinc-100">{t('automation.editor.device')}</h2>
                  <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">{t('automation.editor.deviceHint')}</p>
                </div>
                <select value={selectedSerial} onChange={(event) => {
                  const serial = event.target.value;
                  if (serial !== selectedSerial) {
                    setCapture(null);
                    setTestStatus('');
                    setDraft((current) => current ? { ...current, nodes: current.nodes.map((node) => {
                      if (node.type === AUTOMATION_NODE_TYPE.tap) return { ...node, data: {} };
                      if (node.type === AUTOMATION_NODE_TYPE.longPress) return { ...node, data: { durationMs: 'durationMs' in node.data ? node.data.durationMs : 500 } };
                      if (node.type === AUTOMATION_NODE_TYPE.swipe) return { ...node, data: { durationMs: 'durationMs' in node.data ? node.data.durationMs : 350 } };
                      return node;
                    }) } : current);
                  }
                  setSelectedSerial(serial);
                }} disabled={active} aria-label={t('automation.editor.device')} className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 outline-none focus:border-emerald-500/70 disabled:opacity-50">
                  <option value="">{t('automation.editor.devicePlaceholder')}</option>
                  {onlineDevices.map((device) => <option key={device.serial} value={device.serial}>{device.model} · {device.serial}</option>)}
                </select>
                {onlineDevices.length === 0 && <p className="text-[10px] text-amber-300/90">{t('automation.editor.noDevices')}</p>}
                {devices.some((device) => device.state === 'unauthorized') && <p className="text-[10px] text-amber-300/90">{t('automation.editor.unauthorized')}</p>}
                <button type="button" onClick={() => void captureScreen()} disabled={!onlineSelected || capturing || active} className={`${secondaryButton} w-full py-2 text-xs`}>
                  {capturing ? t('automation.editor.capturing') : t('automation.editor.capture')}
                </button>
              </section>

              <NodeProperties node={selectedNode} capture={capture} imageUrl={captureUrl} capturing={capturing} onCapture={() => void captureScreen()} onChange={(data) => selectedNode && updateNodeData(selectedNode.id, data)} onTest={(node) => void runTestAction(node)} testStatus={testStatus} t={t} />

              <section className="space-y-3 border-t border-zinc-800 pt-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-xs font-semibold text-zinc-100">{t('automation.editor.runHistory')}</h2>
                  {activeRun && <span className={`rounded-full border px-2 py-0.5 text-[9px] ${statusTone(activeRun.status)}`}>{t(`automation.status.${activeRun.status}`)}</span>}
                </div>
                <RunInspector run={activeRun} onCancel={() => void stopRun()} t={t} />
                {actionCount === 0 && <p className="text-[10px] leading-relaxed text-zinc-500">{t('automation.editor.noActions')}</p>}
                <button type="button" onClick={() => void runAutomation()} disabled={!draft || !selectedSerial || active || running || actionCount === 0} className={`${primaryButton} w-full py-2 text-xs`}>
                  {running || active ? t('automation.editor.running') : t('automation.editor.run')}
                </button>
              </section>
            </aside>
          </div>
        </div>

        {deleteTarget && <DeleteDialog automation={deleteTarget} deleting={deleting} onCancel={() => setDeleteTarget(null)} onConfirm={() => void confirmDelete()} t={t} />}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-6 py-8 lg:px-10">
        <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-zinc-100">{t('automation.title')}</h1>
            <p className="mt-2 max-w-xl text-sm text-zinc-400">{t('automation.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void loadScreen()} className={secondaryButton}>{t('automation.refresh')}</button>
            <button type="button" onClick={() => void createNew()} disabled={creating} className={primaryButton}>
              <span aria-hidden="true">＋</span>{creating ? t('automation.creating') : t('automation.new')}
            </button>
          </div>
        </header>

        {error && <p role="alert" className="mb-5 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}

        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-xs font-medium text-zinc-500">{automations.length} {t('automation.list.count')}</p>
          {automations.length > 0 && <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('automation.search')} className="w-64 max-w-full rounded-md border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-emerald-500/70" />}
        </div>

        {loading ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 px-5 py-8 text-sm text-zinc-500">{t('automation.loading')}</div>
        ) : filteredAutomations.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-900/20 px-6 py-14 text-center">
            <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-300"><AutomationMark /></span>
            <h2 className="font-display text-xl font-semibold text-zinc-100">{search ? t('automation.list.noMatch') : t('automation.list.emptyTitle')}</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-zinc-400">{search ? t('automation.list.noMatchHint') : t('automation.list.emptyHint')}</p>
            {!search && <button type="button" onClick={() => void createNew()} disabled={creating} className={`${primaryButton} mt-5`}>{t('automation.new')}</button>}
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/80 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/30">
            {filteredAutomations.map((automation) => {
              const actions = automation.nodes.filter((node) => node.type !== AUTOMATION_NODE_TYPE.start && node.type !== AUTOMATION_NODE_TYPE.end).length;
              return (
                <article key={automation.id} className="group flex flex-wrap items-center justify-between gap-4 px-4 py-4 transition-colors hover:bg-zinc-900/80 sm:px-5">
                  <button type="button" onClick={() => openAutomation(automation)} aria-label={t('automation.list.open', { name: automation.name })} className="flex min-w-0 flex-1 items-center gap-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-emerald-300"><AutomationMark /></span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-zinc-100">{automation.name}</span>
                      <span className="mt-1 block truncate text-xs text-zinc-500">{automation.description || t('automation.list.noDescription')}</span>
                    </span>
                  </button>
                  <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-end">
                    <div className="flex items-center gap-4 text-xs text-zinc-500">
                      <span>{actions} {t('automation.editor.actions')}</span>
                      <span>{t('automation.list.revision', { revision: automation.revision })}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => void duplicate(automation)} className={smallButton}>{t('automation.editor.duplicate')}</button>
                      <button type="button" onClick={() => setDeleteTarget(automation)} className={`${smallButton} hover:text-rose-300`}>{t('automation.list.delete')}</button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
      {deleteTarget && <DeleteDialog automation={deleteTarget} deleting={deleting} onCancel={() => setDeleteTarget(null)} onConfirm={() => void confirmDelete()} t={t} />}
    </div>
  );
}
