import { describe, expect, it } from 'vitest';
import type { AutomationPoint } from '@frigg/shared';
import {
  clientPositionForPoint,
  moveGesturePoint,
  normalizedPointFromClient,
  type ScreenshotViewport,
} from './coordinates';

const screen = { width: 400, height: 800, rotation: 1 as const };
const viewport: ScreenshotViewport = { left: 100, top: 50, width: 200, height: 400 };

describe('screenshot coordinate transform', () => {
  it('maps the displayed image corners to normalized screen corners', () => {
    expect(normalizedPointFromClient(100, 50, viewport, screen)).toEqual({
      x: 0, y: 0, referenceWidth: 400, referenceHeight: 800, referenceRotation: 1,
    });
    expect(normalizedPointFromClient(300, 450, viewport, screen)).toEqual({
      x: 1, y: 1, referenceWidth: 400, referenceHeight: 800, referenceRotation: 1,
    });
  });

  it('accounts for contain letterboxing and ignores clicks in the bars', () => {
    const wideViewport: ScreenshotViewport = { left: 30, top: 80, width: 300, height: 200 };
    expect(normalizedPointFromClient(129, 180, wideViewport, screen)).toBeNull();
    expect(normalizedPointFromClient(180, 180, wideViewport, screen)).toMatchObject({ x: 0.5, y: 0.5 });
    expect(normalizedPointFromClient(231, 180, wideViewport, screen)).toBeNull();
  });

  it('uses CSS client pixels so browser zoom does not change the selected screen point', () => {
    const zoomed: ScreenshotViewport = { left: 50, top: 75, width: 100, height: 200 };
    expect(normalizedPointFromClient(100, 175, zoomed, screen)).toMatchObject({ x: 0.5, y: 0.5 });
  });

  it('maps a saved point back to its displayed location and moves one gesture endpoint at a time', () => {
    const start: AutomationPoint = { x: 0.2, y: 0.3, referenceWidth: 400, referenceHeight: 800, referenceRotation: 1 };
    const end: AutomationPoint = { x: 0.8, y: 0.7, referenceWidth: 400, referenceHeight: 800, referenceRotation: 1 };
    expect(clientPositionForPoint(start, viewport, screen)).toEqual({ x: 140, y: 170 });
    const moved = normalizedPointFromClient(250, 350, viewport, screen)!;
    expect(moveGesturePoint({ start, end }, 'start', moved)).toEqual({ start: moved, end });
    expect(moveGesturePoint({ start, end }, 'end', moved)).toEqual({ start, end: moved });
  });

  it('returns no point for an empty screenshot or viewport', () => {
    expect(normalizedPointFromClient(100, 100, { ...viewport, width: 0 }, screen)).toBeNull();
  });
});
