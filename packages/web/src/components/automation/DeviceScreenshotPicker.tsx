import { useRef } from 'react';
import type { AutomationPoint } from '@frigg/shared';
import type { AutomationScreenshot } from '../../api/automations';
import type { TranslateFn } from '../../i18n';
import { clientPositionForPoint, moveGesturePoint, normalizedPointFromClient, type ScreenshotViewport } from './coordinates';

export interface AutomationGesture {
  start: AutomationPoint;
  end: AutomationPoint;
}

export interface DeviceCapture extends AutomationScreenshot {
  serial: string;
  capturedAt: number;
}

export default function DeviceScreenshotPicker({
  imageUrl,
  screenshot,
  value,
  mode,
  onChange,
  t,
}: {
  imageUrl: string;
  screenshot: DeviceCapture;
  value: AutomationPoint | AutomationGesture | null;
  mode: 'point' | 'gesture';
  onChange: (value: AutomationPoint | AutomationGesture) => void;
  t: TranslateFn;
}) {
  const imageRef = useRef<HTMLImageElement>(null);
  const gestureRef = useRef(false);
  const draggedRef = useRef<'point' | 'start' | 'end' | null>(null);
  const currentGesture = mode === 'gesture' && value && 'start' in value ? value : null;
  const pointValue = mode === 'point' && value && 'x' in value ? value : null;

  const viewport = (): ScreenshotViewport | null => {
    const rect = imageRef.current?.getBoundingClientRect();
    return rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null;
  };
  const pointAt = (clientX: number, clientY: number): AutomationPoint | null => {
    const rect = viewport();
    return rect ? normalizedPointFromClient(clientX, clientY, rect, screenshot) : null;
  };
  const updateGestureEnd = (point: AutomationPoint) => {
    if (currentGesture) onChange(moveGesturePoint(currentGesture, 'end', point));
  };
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.target !== imageRef.current) return;
    const point = pointAt(event.clientX, event.clientY);
    if (!point) return;
    if (mode === 'gesture') {
      gestureRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      onChange({ start: point, end: point });
    }
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (draggedRef.current) {
      const point = pointAt(event.clientX, event.clientY);
      if (!point) return;
      if (draggedRef.current === 'point') onChange(point);
      else if (currentGesture) onChange(moveGesturePoint(currentGesture, draggedRef.current, point));
      return;
    }
    if (gestureRef.current) {
      const point = pointAt(event.clientX, event.clientY);
      if (point) updateGestureEnd(point);
    }
  };
  const stopPointer = () => {
    gestureRef.current = false;
    draggedRef.current = null;
  };
  const beginMarkerDrag = (event: React.PointerEvent<HTMLButtonElement>, marker: 'point' | 'start' | 'end') => {
    event.preventDefault();
    event.stopPropagation();
    draggedRef.current = marker;
    event.currentTarget.parentElement?.setPointerCapture(event.pointerId);
  };
  const placePoint = (event: React.MouseEvent<HTMLDivElement>) => {
    if (mode !== 'point' || event.target !== imageRef.current) return;
    const point = pointAt(event.clientX, event.clientY);
    if (point) onChange(point);
  };
  const markerPosition = (point: AutomationPoint): { left: string; top: string } => {
    const rect = viewport();
    if (!rect) return { left: `${point.x * 100}%`, top: `${point.y * 100}%` };
    const position = clientPositionForPoint(point, rect, screenshot);
    return { left: `${((position.x - rect.left) / rect.width) * 100}%`, top: `${((position.y - rect.top) / rect.height) * 100}%` };
  };
  const markerClass = 'absolute z-10 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center rounded-full border-2 border-white bg-emerald-400 text-[10px] font-bold text-zinc-950 shadow-lg shadow-black/50 cursor-grab active:cursor-grabbing';
  const stalePoint = (point: AutomationPoint) => point.referenceWidth !== screenshot.width || point.referenceHeight !== screenshot.height || point.referenceRotation !== screenshot.rotation;

  return (
    <section className="space-y-2 rounded-md border border-zinc-800 bg-zinc-950/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-zinc-500">
        <span className="truncate">{t('automation.picker.device')}: <strong className="font-mono font-medium text-zinc-300">{screenshot.serial}</strong></span>
        <span>{screenshot.width} × {screenshot.height} · {t('automation.picker.rotation', { degrees: screenshot.rotation * 90 })} · {new Date(screenshot.capturedAt).toLocaleTimeString()}</span>
      </div>
      <div className="dot-grid flex min-h-[230px] items-center justify-center overflow-hidden rounded border border-zinc-800/80 p-3">
        <div className="relative inline-block max-h-[420px] max-w-full touch-none select-none" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={stopPointer} onPointerCancel={stopPointer} onClick={placePoint}>
          <img ref={imageRef} src={imageUrl} alt={t('automation.editor.screenCapture')} draggable={false} className="block max-h-[420px] max-w-full cursor-crosshair select-none rounded-sm" />
          {pointValue && <button type="button" aria-label={t('automation.picker.point')} title={t('automation.picker.dragPoint')} className={markerClass} style={markerPosition(pointValue)} onPointerDown={(event) => beginMarkerDrag(event, 'point')}><span>●</span></button>}
          {currentGesture && <>
            <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"><line x1={`${currentGesture.start.x * 100}%`} y1={`${currentGesture.start.y * 100}%`} x2={`${currentGesture.end.x * 100}%`} y2={`${currentGesture.end.y * 100}%`} stroke="rgb(196 181 253)" strokeWidth="3" strokeDasharray="6 4" /></svg>
            <button type="button" aria-label={t('automation.picker.start')} title={t('automation.picker.dragStart')} className={`${markerClass} !bg-violet-400`} style={markerPosition(currentGesture.start)} onPointerDown={(event) => beginMarkerDrag(event, 'start')}>A</button>
            <button type="button" aria-label={t('automation.picker.end')} title={t('automation.picker.dragEnd')} className={`${markerClass} !bg-fuchsia-400`} style={markerPosition(currentGesture.end)} onPointerDown={(event) => beginMarkerDrag(event, 'end')}>B</button>
          </>}
        </div>
      </div>
      <p className="text-[10px] leading-relaxed text-zinc-500">{t(mode === 'gesture' ? 'automation.picker.gestureHint' : 'automation.picker.pointHint')}</p>
      {(pointValue && stalePoint(pointValue) || currentGesture && (stalePoint(currentGesture.start) || stalePoint(currentGesture.end))) && <p role="alert" className="text-[10px] text-amber-300">{t('automation.picker.staleGeometry')}</p>}
    </section>
  );
}
