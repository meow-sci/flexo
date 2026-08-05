import { useStore } from '@nanostores/react';
import { StatusChip, StatusDivider } from './StatusChip';
import { $fpsReport } from '../../state/statusStore';
import { $showFpsCounter } from '../../state/settingsStore';

/**
 * Status-bar segment 10 — the **FPS readout** (design:
 * `plans/flexo_v2/design/design-system-services.md` §1.2 #10; foundation §5).
 *
 * A number only. The stats.js graph stays where it was — an imperative DOM overlay pinned
 * inside the 3D workspace (`src/three/Viewport.ts`) — because the graph is a debugging
 * instrument and the bar is a readout; this segment just gives the number a home in the
 * chrome instead of leaving it exclusively in a corner of the canvas.
 *
 * **The render loop is untouched (constitution / foundation §14.5).** The FPS counter is
 * the ONE sanctioned continuous-render opt-in and this component does not widen it: it
 * subscribes to an atom the viewport writes at most every 500ms *while the counter is
 * already on*, and renders nothing at all when it is off. Switching the counter off clears
 * `$fpsReport`, so no stale number survives the return to on-demand rendering.
 *
 * Undo enrollment: NONE. `$showFpsCounter` is a persisted preference (`flexo:showFpsCounter`)
 * owned by `settingsStore`; `$fpsReport` is ephemeral.
 */
export function FpsSegment() {
  const on = useStore($showFpsCounter);
  const fps = useStore($fpsReport);

  if (!on || fps === null) return null;

  return (
    <>
      <StatusDivider />
      {/* Native `title`, not the kit Tooltip: a passive chip is a plain span, and
          react-aria's TooltipTrigger only feeds a focusable child. */}
      <StatusChip
        aria-label={`${fps} frames per second`}
        title="Frames per second — View ▸ FPS Counter"
      >
        {/* Fixed 4ch so a swing from 9 to 120 fps never shifts the bell beside it. */}
        <span className="w-[4ch] text-right font-mono tabular-nums">{fps}</span>
      </StatusChip>
    </>
  );
}
