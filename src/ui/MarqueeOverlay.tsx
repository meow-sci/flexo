import { useStore } from '@nanostores/react';
import { $marqueeRect } from '../state/modeStore';
import { z } from './kit';

/**
 * The marquee's drag rectangle, drawn as a DOM overlay inside the viewport cell (design:
 * design-build-mode.md §1.4; foundation §1 canvas-overlays list).
 *
 * **DOM, not three.js, on purpose**: a rectangle that followed the pointer through the
 * scene graph would force a render every pointermove and break the on-demand loop
 * (foundation §14.5). This element re-renders instead, and the canvas never wakes.
 *
 * `EditorScene` publishes the rect in CANVAS pixels, so this must be positioned against the
 * same box the canvas fills — the viewport cell.
 */
export function MarqueeOverlay() {
  const rect = useStore($marqueeRect);
  if (!rect) return null;

  const left = Math.min(rect.x0, rect.x1);
  const top = Math.min(rect.y0, rect.y1);
  const width = Math.abs(rect.x1 - rect.x0);
  const height = Math.abs(rect.y1 - rect.y0);

  // The chip rides the MOVING corner (the one under the cursor), flipped inside the rect
  // when the drag runs up/left so it never sits off-canvas.
  const chipRight = rect.x1 < rect.x0;
  const chipBelow = rect.y1 > rect.y0;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{ zIndex: z.canvasOverlay }}
    >
      <div
        className="absolute border border-accent bg-accent/8"
        style={{ left, top, width, height }}
      >
        {width + height > 8 && (
          <span
            className="absolute rounded bg-accent px-1 font-mono text-[10px] tabular-nums text-canvas"
            style={{
              [chipRight ? 'right' : 'left']: 0,
              [chipBelow ? 'bottom' : 'top']: 0,
              transform: `translate(${chipRight ? '-' : ''}0.25rem, ${chipBelow ? '' : '-'}0.25rem)`,
            }}
          >
            {rect.count}
          </span>
        )}
      </div>
    </div>
  );
}
