import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

const STORAGE_KEY = 'frigg-panel-sizes';

function loadSize(key: string, fallback: number): number {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, number>;
    return typeof all[key] === 'number' ? all[key] : fallback;
  } catch {
    return fallback;
  }
}

function saveSize(key: string, size: number): void {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, number>;
    all[key] = size;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    return;
  }
}

interface ResizableOptions {
  axis: 'x' | 'y';
  min: number;
  max: number;
  invert?: boolean;
}

export function useResizable(key: string, defaultSize: number, options: ResizableOptions) {
  const [size, setSize] = useState(() => loadSize(key, defaultSize));
  const sizeRef = useRef(size);
  sizeRef.current = size;

  useEffect(() => {
    saveSize(key, size);
  }, [key, size]);

  const onPointerDown = (event: ReactPointerEvent) => {
    event.preventDefault();
    const startPos = options.axis === 'x' ? event.clientX : event.clientY;
    const startSize = sizeRef.current;

    const move = (moveEvent: globalThis.PointerEvent) => {
      const pos = options.axis === 'x' ? moveEvent.clientX : moveEvent.clientY;
      const delta = (pos - startPos) * (options.invert ? -1 : 1);
      const next = Math.min(options.max, Math.max(options.min, startSize + delta));
      setSize(next);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = options.axis === 'x' ? 'col-resize' : 'row-resize';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return { size, onPointerDown };
}

export function ResizeHandle({
  axis,
  onPointerDown,
}: {
  axis: 'x' | 'y';
  onPointerDown: (event: ReactPointerEvent) => void;
}) {
  const base =
    'group relative z-10 shrink-0 bg-zinc-800/40 transition-colors hover:bg-emerald-500/30';
  const dims =
    axis === 'x' ? 'w-px cursor-col-resize hover:w-0.5' : 'h-px cursor-row-resize hover:h-0.5';
  const hit =
    axis === 'x'
      ? 'absolute inset-y-0 -left-1 -right-1'
      : 'absolute inset-x-0 -top-1 -bottom-1';
  return (
    <div onPointerDown={onPointerDown} className={`${base} ${dims}`}>
      <div className={hit} />
    </div>
  );
}
