import { useRef } from 'react';
import { cn, focusRing } from './styles';
import { usePointerDrag } from './usePointerDrag';
import { z } from './zIndex';

/** Arrow-key adjustment step, in px (design-system-services.md §7.4). */
const KEY_STEP = 8;

export interface ResizeHandleProps {
  /** 'vertical' = a vertical strip that resizes a WIDTH; 'horizontal' resizes a HEIGHT. */
  orientation: 'vertical' | 'horizontal';
  /** Current size in px. */
  value: number;
  min: number;
  max: number;
  /** true when dragging toward positive x/y should SHRINK value (right sidebar, timeline top edge). */
  invert?: boolean;
  /** Called with the already-clamped px value. */
  onChange(px: number): void;
  /** Invisible hit strip thickness, px. */
  hitSize?: number;
  /** Visible centered line thickness, px. */
  visualSize?: number;
  ariaLabel: string;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * THE edge-strip resize primitive (foundation §1.1; design-system-services.md §7.4):
 * left/right sidebar inner edges, the timeline dock's top edge, a `FloatingWindow`'s
 * optional right edge. Built on {@link usePointerDrag}, so it inherits pointer capture,
 * rAF-batched deltas and cursor management.
 *
 * **Positioning is the consumer's job** — this renders the strip only; wrap it in
 * `absolute -left-1 inset-y-0` (or the horizontal equivalent) at the call site.
 *
 * Keyboard (the a11y upgrade over the v1 hand-rolled handles): the strip is a focusable
 * `role="separator"`; ←/→ (vertical) or ↑/↓ (horizontal) adjust by 8px, honouring
 * `invert` and the clamps.
 */
export function ResizeHandle({
  orientation,
  value,
  min,
  max,
  invert = false,
  onChange,
  hitSize = 8,
  visualSize = 2,
  ariaLabel,
}: ResizeHandleProps) {
  const vertical = orientation === 'vertical';
  // The value the drag started from: `onMove` receives deltas from the pointerdown
  // origin, so applying them to the live `value` would compound.
  const startRef = useRef(value);

  const { onPointerDown } = usePointerDrag({
    onStart: () => {
      startRef.current = value;
    },
    onMove: (dx, dy) => {
      const delta = vertical ? dx : dy;
      onChange(clamp(startRef.current + (invert ? -delta : delta), min, max));
    },
    cursor: vertical ? 'col-resize' : 'row-resize',
  });

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const decrease = vertical ? 'ArrowLeft' : 'ArrowUp';
    const increase = vertical ? 'ArrowRight' : 'ArrowDown';
    if (e.key !== decrease && e.key !== increase) return;
    e.preventDefault();
    const delta = e.key === increase ? KEY_STEP : -KEY_STEP;
    onChange(clamp(value + (invert ? -delta : delta), min, max));
  };

  return (
    <div
      role="separator"
      aria-orientation={orientation}
      aria-label={ariaLabel}
      aria-valuenow={Math.round(value)}
      aria-valuemin={Math.round(min)}
      aria-valuemax={Math.round(max)}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      className={cn(
        'group flex touch-none items-center justify-center',
        focusRing({ isFocusVisible: false }),
        'focus-visible:outline focus-visible:outline-2',
        vertical ? 'h-full cursor-col-resize' : 'w-full cursor-row-resize',
      )}
      style={{ zIndex: z.dock, ...(vertical ? { width: hitSize } : { height: hitSize }) }}
    >
      <div
        className={cn(
          'bg-transparent transition-colors group-hover:bg-border-strong',
          vertical ? 'h-full' : 'w-full',
        )}
        style={vertical ? { width: visualSize } : { height: visualSize }}
      />
    </div>
  );
}
