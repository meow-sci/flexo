import { useRef, useState } from 'react';
import { usePointerDrag } from './kit';

/**
 * Internal: shared split with a draggable divider. `direction` is the axis the
 * panes flow along — `'vertical'` stacks top→bottom (horizontal divider),
 * `'horizontal'` flows left→right (vertical divider). The split percentage is
 * local state and resets to `initialSplit` whenever the component remounts —
 * which is what the Add SubPart / Add Part modals rely on to snap back to 50/50
 * each time they open.
 */
function Split({
  direction,
  first,
  second,
  initialSplit,
  minPct,
  maxPct,
}: {
  direction: 'vertical' | 'horizontal';
  first: React.ReactNode;
  second: React.ReactNode;
  initialSplit: number;
  minPct: number;
  maxPct: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Container box + pointer position at the moment the drag started; the hook
  // reports deltas from that origin, so the pct is recomputed against it.
  const originRef = useRef<{ rect: DOMRect; clientX: number; clientY: number } | null>(null);
  const [splitPct, setSplitPct] = useState(initialSplit);
  const isVertical = direction === 'vertical';

  const { onPointerDown } = usePointerDrag({
    cursor: isVertical ? 'row-resize' : 'col-resize',
    onStart(e) {
      const c = containerRef.current;
      if (!c) return false;
      originRef.current = {
        rect: c.getBoundingClientRect(),
        clientX: e.clientX,
        clientY: e.clientY,
      };
    },
    onMove(dx, dy) {
      const origin = originRef.current;
      if (!origin) return;
      const { rect } = origin;
      const pct = isVertical
        ? ((origin.clientY + dy - rect.top) / rect.height) * 100
        : ((origin.clientX + dx - rect.left) / rect.width) * 100;
      setSplitPct(Math.max(minPct, Math.min(maxPct, pct)));
    },
  });

  return (
    <div
      ref={containerRef}
      className={`flex h-full w-full ${isVertical ? 'min-h-0 flex-col' : 'min-w-0 flex-row'}`}
    >
      <div
        className={isVertical ? 'min-h-0 overflow-hidden' : 'min-w-0 overflow-hidden'}
        style={isVertical ? { height: `${splitPct}%` } : { width: `${splitPct}%` }}
      >
        {first}
      </div>
      <div
        role="separator"
        aria-orientation={isVertical ? 'horizontal' : 'vertical'}
        aria-label="Resize panels"
        onPointerDown={onPointerDown}
        className={`group relative shrink-0 touch-none bg-border transition-colors hover:bg-accent ${
          isVertical ? 'h-1 cursor-row-resize' : 'w-1 cursor-col-resize'
        }`}
      >
        {/* Wider invisible hit-area so the divider is easy to grab. */}
        <span
          className={`absolute ${isVertical ? 'inset-x-0 -inset-y-1.5' : 'inset-y-0 -inset-x-1.5'}`}
        />
      </div>
      <div
        className={isVertical ? 'min-h-0 flex-1 overflow-hidden' : 'min-w-0 flex-1 overflow-hidden'}
      >
        {second}
      </div>
    </div>
  );
}

/** Stacks two panes top/bottom with a draggable horizontal divider. */
export function VerticalSplit({
  top,
  bottom,
  initialSplit = 50,
  minPct = 15,
  maxPct = 85,
}: {
  top: React.ReactNode;
  bottom: React.ReactNode;
  initialSplit?: number;
  minPct?: number;
  maxPct?: number;
}) {
  return (
    <Split
      direction="vertical"
      first={top}
      second={bottom}
      initialSplit={initialSplit}
      minPct={minPct}
      maxPct={maxPct}
    />
  );
}

/** Lays two panes left/right with a draggable vertical divider. */
export function HorizontalSplit({
  left,
  right,
  initialSplit = 50,
  minPct = 15,
  maxPct = 85,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
  initialSplit?: number;
  minPct?: number;
  maxPct?: number;
}) {
  return (
    <Split
      direction="horizontal"
      first={left}
      second={right}
      initialSplit={initialSplit}
      minPct={minPct}
      maxPct={maxPct}
    />
  );
}
