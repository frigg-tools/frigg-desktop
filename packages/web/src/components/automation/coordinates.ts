import type { AutomationPoint } from '@frigg/shared';

export interface ScreenshotViewport {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ScreenGeometry {
  width: number;
  height: number;
  rotation: 0 | 1 | 2 | 3;
}

function imageRect(viewport: ScreenshotViewport, screen: ScreenGeometry): ScreenshotViewport | null {
  if (viewport.width <= 0 || viewport.height <= 0 || screen.width <= 0 || screen.height <= 0) return null;
  const scale = Math.min(viewport.width / screen.width, viewport.height / screen.height);
  const width = screen.width * scale;
  const height = screen.height * scale;
  return {
    left: viewport.left + (viewport.width - width) / 2,
    top: viewport.top + (viewport.height - height) / 2,
    width,
    height,
  };
}

export function normalizedPointFromClient(
  clientX: number,
  clientY: number,
  viewport: ScreenshotViewport,
  screen: ScreenGeometry,
): AutomationPoint | null {
  const rect = imageRect(viewport, screen);
  if (!rect || clientX < rect.left || clientX > rect.left + rect.width || clientY < rect.top || clientY > rect.top + rect.height) return null;
  return {
    x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
    referenceWidth: screen.width,
    referenceHeight: screen.height,
    referenceRotation: screen.rotation,
  };
}

export function clientPositionForPoint(
  point: AutomationPoint,
  viewport: ScreenshotViewport,
  screen: ScreenGeometry,
): { x: number; y: number } {
  const rect = imageRect(viewport, screen);
  if (!rect) return { x: viewport.left, y: viewport.top };
  return {
    x: rect.left + point.x * rect.width,
    y: rect.top + point.y * rect.height,
  };
}

export function moveGesturePoint(
  gesture: { start: AutomationPoint; end: AutomationPoint },
  endpoint: 'start' | 'end',
  point: AutomationPoint,
): { start: AutomationPoint; end: AutomationPoint } {
  return endpoint === 'start' ? { start: point, end: gesture.end } : { start: gesture.start, end: point };
}
