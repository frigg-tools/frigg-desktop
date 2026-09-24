import { AUTOMATION_KEY, AUTOMATION_NODE_TYPE, type AutomationActionData, type AutomationKey, type AutomationNode, type AutomationPoint, type AutomationReferenceCapture } from '@frigg/shared';
import type { TranslateFn } from '../../i18n';
import DeviceScreenshotPicker, { type DeviceCapture } from './DeviceScreenshotPicker';

const fieldClass = 'w-full rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-xs text-zinc-200 outline-none focus:border-emerald-500/70 disabled:opacity-50';
const labelClass = 'mb-1 block text-[10px] font-medium text-zinc-500';

function hasPoint(node: AutomationNode): boolean {
  if (node.type === AUTOMATION_NODE_TYPE.tap || node.type === AUTOMATION_NODE_TYPE.longPress) return 'point' in node.data && Boolean(node.data.point);
  if (node.type === AUTOMATION_NODE_TYPE.swipe) return 'start' in node.data && Boolean(node.data.start) && Boolean(node.data.end);
  if (node.type === AUTOMATION_NODE_TYPE.launchApp) return 'packageName' in node.data && Boolean(node.data.packageName?.trim());
  if (node.type === AUTOMATION_NODE_TYPE.forceStopApp || node.type === AUTOMATION_NODE_TYPE.clearAppData) return 'packageName' in node.data && Boolean(node.data.packageName?.trim());
  if (node.type === AUTOMATION_NODE_TYPE.adbCommand) return 'command' in node.data && Boolean(node.data.command?.trim());
  if (node.type === AUTOMATION_NODE_TYPE.text) return 'text' in node.data && Boolean(node.data.text?.length);
  return node.type !== AUTOMATION_NODE_TYPE.start && node.type !== AUTOMATION_NODE_TYPE.end;
}

function manualPoint(capture: DeviceCapture | null, current?: AutomationPoint): AutomationPoint | null {
  if (current) return current;
  if (!capture) return null;
  return { x: 0.5, y: 0.5, referenceWidth: capture.width, referenceHeight: capture.height, referenceRotation: capture.rotation };
}

export default function NodeProperties({
  node,
  capture,
  imageUrl,
  capturing,
  captureHistory,
  onCapture,
  onSelectCapture,
  onChange,
  onTest,
  testStatus,
  t,
}: {
  node: AutomationNode | null;
  capture: DeviceCapture | null;
  imageUrl?: string;
  capturing: boolean;
  captureHistory: AutomationReferenceCapture[];
  onCapture: () => void;
  onSelectCapture: (capture: AutomationReferenceCapture) => void;
  onChange: (data: AutomationActionData) => void;
  onTest: (node: AutomationNode) => void;
  testStatus?: string;
  t: TranslateFn;
}) {
  if (!node) {
    return (
      <aside className="space-y-3 border-t border-zinc-800 bg-zinc-950/50 p-4 xl:w-[300px] xl:shrink-0 xl:border-l xl:border-t-0">
        <div>
          <h3 className="text-xs font-semibold text-zinc-200">{t('automation.properties.title')}</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{t('automation.properties.empty')}</p>
        </div>
        <button type="button" onClick={onCapture} disabled={capturing} className="w-full rounded-md border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:bg-zinc-900 disabled:opacity-50">
          {capturing ? t('automation.editor.capturing') : t('automation.editor.capture')}
        </button>
        {imageUrl && capture && <p className="text-[10px] text-zinc-500">{capture.width} × {capture.height} · {capture.serial}</p>}
      </aside>
    );
  }

  const isPoint = node.type === AUTOMATION_NODE_TYPE.tap || node.type === AUTOMATION_NODE_TYPE.longPress;
  const isGesture = node.type === AUTOMATION_NODE_TYPE.swipe;
  const point = isPoint && 'point' in node.data ? node.data.point : undefined;
  const swipe = isGesture && 'start' in node.data ? node.data : undefined;
  const pickerValue: AutomationPoint | { start: AutomationPoint; end: AutomationPoint } | null = isGesture
    ? (swipe as { start: AutomationPoint; end: AutomationPoint } | undefined) ?? null
    : point ?? null;
  const setPointValue = (next: AutomationPoint) => {
    onChange(node.type === AUTOMATION_NODE_TYPE.longPress
      ? { point: next, durationMs: 'durationMs' in node.data ? node.data.durationMs : 500, ...(capture?.captureId ? { referenceCaptureId: capture.captureId } : {}) }
      : { point: next, ...(capture?.captureId ? { referenceCaptureId: capture.captureId } : {}) });
  };
  const setSwipeValue = (next: { start: AutomationPoint; end: AutomationPoint }) => {
    onChange({ ...next, durationMs: swipe && 'durationMs' in swipe ? swipe.durationMs : 350, ...(capture?.captureId ? { referenceCaptureId: capture.captureId } : {}) });
  };
  const setNormalized = (endpoint: 'point' | 'start' | 'end', axis: 'x' | 'y', raw: string) => {
    const value = Math.max(0, Math.min(100, Number(raw) || 0)) / 100;
    if (endpoint === 'point') {
      const base = manualPoint(capture, point);
      if (base) setPointValue({ ...base, [axis]: value });
      return;
    }
    const baseStart = manualPoint(capture, swipe?.start);
    const baseEnd = manualPoint(capture, swipe?.end);
    if (!baseStart || !baseEnd) return;
    setSwipeValue({ start: endpoint === 'start' ? { ...baseStart, [axis]: value } : baseStart, end: endpoint === 'end' ? { ...baseEnd, [axis]: value } : baseEnd });
  };
  const coordinateField = (endpoint: 'point' | 'start' | 'end', axis: 'x' | 'y', value: number | undefined) => (
    <label className="min-w-0 flex-1">
      <span className={labelClass}>{axis.toUpperCase()} (%)</span>
      <input type="number" min="0" max="100" step="1" value={value === undefined ? '' : Math.round(value * 100)} placeholder="50" disabled={!capture} onChange={(event) => setNormalized(endpoint, axis, event.target.value)} className={fieldClass} aria-label={`${endpoint} ${axis}`} />
    </label>
  );
  const duration = 'durationMs' in node.data ? node.data.durationMs : undefined;

  return (
    <aside className="space-y-4 border-t border-zinc-800 bg-zinc-950/50 p-4 xl:w-[300px] xl:shrink-0 xl:overflow-y-auto xl:border-l xl:border-t-0">
      <div>
        <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-emerald-400">{t('automation.properties.selected')}</p>
        <h3 className="mt-1 text-sm font-semibold text-zinc-100">{t(`automation.node.${node.type}`)}</h3>
        <p className="mt-1 text-[10px] text-zinc-600">{node.id}</p>
      </div>

      {(node.type === AUTOMATION_NODE_TYPE.launchApp || node.type === AUTOMATION_NODE_TYPE.forceStopApp || node.type === AUTOMATION_NODE_TYPE.clearAppData) && <>
        <label className="block"><span className={labelClass}>{t('automation.properties.packageName')}</span><input value={'packageName' in node.data ? node.data.packageName : ''} placeholder="com.example.app" onChange={(event) => onChange({ packageName: event.target.value })} className={fieldClass} /></label>
        {node.type === AUTOMATION_NODE_TYPE.clearAppData && <p className="rounded-md border border-rose-500/20 bg-rose-500/[0.06] px-2.5 py-2 text-[10px] leading-relaxed text-rose-200/80">{t('automation.properties.clearAppDataWarning')}</p>}
      </>}
      {node.type === AUTOMATION_NODE_TYPE.adbCommand && <label className="block"><span className={labelClass}>{t('automation.properties.adbCommand')}</span><textarea rows={3} maxLength={300} value={'command' in node.data ? node.data.command : ''} placeholder={t('automation.properties.adbCommandPlaceholder')} onChange={(event) => onChange({ command: event.target.value })} className={`${fieldClass} font-mono`} /><span className="mt-1 block text-[9px] leading-relaxed text-zinc-600">{t('automation.properties.adbCommandHint')}</span></label>}
      {node.type === AUTOMATION_NODE_TYPE.text && <label className="block"><span className={labelClass}>{t('automation.properties.text')}</span><textarea rows={3} maxLength={500} value={'text' in node.data ? node.data.text : ''} onChange={(event) => onChange({ text: event.target.value })} className={fieldClass} /></label>}
      {node.type === AUTOMATION_NODE_TYPE.key && <label className="block"><span className={labelClass}>{t('automation.properties.key')}</span><select value={'key' in node.data ? node.data.key : AUTOMATION_KEY.back} onChange={(event) => onChange({ key: event.target.value as AutomationKey })} className={fieldClass}>{Object.values(AUTOMATION_KEY).map((key) => <option key={key}>{key}</option>)}</select></label>}
      {node.type === AUTOMATION_NODE_TYPE.wait && <label className="block"><span className={labelClass}>{t('automation.properties.durationMs')}</span><input type="number" min="0" max="30000" value={duration ?? 500} onChange={(event) => onChange({ durationMs: Number(event.target.value) })} className={fieldClass} /></label>}
      {node.type === AUTOMATION_NODE_TYPE.longPress && <label className="block"><span className={labelClass}>{t('automation.properties.durationMs')}</span><input type="number" min="100" max="30000" value={duration ?? 500} disabled={!point && !capture} onChange={(event) => { const base = point ?? manualPoint(capture); if (base) onChange({ point: base, durationMs: Number(event.target.value), ...('referenceCaptureId' in node.data && node.data.referenceCaptureId ? { referenceCaptureId: node.data.referenceCaptureId } : capture?.captureId ? { referenceCaptureId: capture.captureId } : {}) }); }} className={fieldClass} /></label>}
      {node.type === AUTOMATION_NODE_TYPE.swipe && <label className="block"><span className={labelClass}>{t('automation.properties.durationMs')}</span><input type="number" min="100" max="30000" value={duration ?? 350} disabled={!swipe && !capture} onChange={(event) => { const start = manualPoint(capture, swipe?.start); const end = manualPoint(capture, swipe?.end); if (start && end) onChange({ start, end, durationMs: Number(event.target.value), ...('referenceCaptureId' in node.data && node.data.referenceCaptureId ? { referenceCaptureId: node.data.referenceCaptureId } : capture?.captureId ? { referenceCaptureId: capture.captureId } : {}) }); }} className={fieldClass} /></label>}
      {node.type === AUTOMATION_NODE_TYPE.screenshot && <label className="block"><span className={labelClass}>{t('automation.properties.label')}</span><input maxLength={80} value={'label' in node.data ? node.data.label ?? '' : ''} onChange={(event) => onChange({ label: event.target.value })} className={fieldClass} /></label>}

      {(isPoint || isGesture) && <section className="space-y-2 rounded-md border border-zinc-800 bg-zinc-950/60 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-medium text-zinc-400">{t('automation.properties.referenceHistory')}</p>
          <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-[9px] text-zinc-400">{captureHistory.length}</span>
        </div>
        {captureHistory.length === 0 ? <p className="text-[10px] leading-relaxed text-zinc-600">{t('automation.properties.noReferenceHistory')}</p> : <div className="max-h-32 space-y-1 overflow-y-auto">
          {captureHistory.map((item) => <button key={item.id} type="button" onClick={() => onSelectCapture(item)} className={`flex w-full items-start justify-between gap-2 rounded border px-2 py-1.5 text-left transition-colors ${capture?.captureId === item.id ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-zinc-800 hover:border-zinc-600 hover:bg-zinc-900'}`}>
            <span className="min-w-0"><span className="block truncate text-[10px] text-zinc-200">{new Date(item.createdAt).toLocaleString()}</span><span className="mt-0.5 block truncate font-mono text-[9px] text-zinc-500">{item.serial}</span></span>
            <span className="shrink-0 text-[9px] text-zinc-500">{item.width}×{item.height}</span>
          </button>)}
        </div>}
        <button type="button" onClick={onCapture} disabled={capturing} className="w-full rounded-md border border-zinc-700 px-2.5 py-1.5 text-[10px] font-medium text-zinc-300 hover:border-zinc-500 hover:bg-zinc-900 disabled:opacity-50">{capturing ? t('automation.editor.capturing') : t('automation.properties.captureReference')}</button>
      </section>}

      {(isPoint || isGesture) && imageUrl && capture && (
        <DeviceScreenshotPicker
          imageUrl={imageUrl}
          screenshot={capture}
          value={pickerValue}
          mode={isGesture ? 'gesture' : 'point'}
          onChange={(value) => isGesture ? setSwipeValue(value as { start: AutomationPoint; end: AutomationPoint }) : setPointValue(value as AutomationPoint)}
          t={t}
        />
      )}
      {(isPoint || isGesture) && <div className="space-y-2">
        <p className={labelClass}>{t('automation.properties.manualCoordinates')}</p>
        {!capture && <p className="text-[10px] text-zinc-600">{t('automation.properties.captureFirst')}</p>}
        {isPoint && <div className="flex gap-2">{coordinateField('point', 'x', point?.x)}{coordinateField('point', 'y', point?.y)}</div>}
        {isGesture && <>
          <p className="text-[10px] text-zinc-500">{t('automation.picker.start')}</p><div className="flex gap-2">{coordinateField('start', 'x', swipe?.start.x)}{coordinateField('start', 'y', swipe?.start.y)}</div>
          <p className="pt-1 text-[10px] text-zinc-500">{t('automation.picker.end')}</p><div className="flex gap-2">{coordinateField('end', 'x', swipe?.end.x)}{coordinateField('end', 'y', swipe?.end.y)}</div>
        </>}
      </div>}

      <button type="button" disabled={!hasPoint(node)} onClick={() => onTest(node)} className="w-full rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-200 hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-40">{t('automation.properties.testAction')}</button>
      {testStatus && <p role="status" className="text-[10px] leading-relaxed text-emerald-300">{testStatus}</p>}
    </aside>
  );
}
