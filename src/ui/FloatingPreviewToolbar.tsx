import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { GripVertical } from 'lucide-react';
import { PreviewScrubber } from './PreviewScrubber';
import { cn, panelChrome, useIsPhone } from './kit';
import { $activeAnimation } from '../state/animationStore';
import { $inspectorMode, $animPreviewFloatPos, setAnimPreviewFloatPos } from '../state/uiStore';

/**
 * A floating toolbar holding the animation preview scrubber + play button, hovering over
 * the workspace whenever the Animation editor has a clip open. Lets you scrub/play while
 * watching the 3D view instead of reaching into the inspector.
 *
 * Desktop: free-floating + draggable, defaulting to top-center just below the main editor
 * toolbar (matching how the other toolbars sit in that area); dragging the grip moves it
 * freely and the position is persisted ({@link $animPreviewFloatPos}, cleared by the
 * global data reset).
 *
 * Phone: a static bar pinned in the top toolbar stack (placed by {@link App}), under the
 * mobile top bar — same idea, but no drag grip (touch-dragging a hover bar is fiddly and
 * the desktop-tuned saved position wouldn't map onto a phone viewport). Without it the
 * only scrub/replay control is the bottom sheet, which covers the 3D view.
 */

/** Keep at least this much of the toolbar on-screen when dragging / after a resize. */
const KEEP_VISIBLE_X = 140;
const KEEP_VISIBLE_Y = 28;

export function FloatingPreviewToolbar() {
  const isPhone = useIsPhone();
  const mode = useStore($inspectorMode);
  const anim = useStore($activeAnimation);
  const stored = useStore($animPreviewFloatPos);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);

  // Only while the Animation editor has a clip open (its atoms persist across mode switches).
  if (mode !== 'anim' || !anim) return null;

  // Phone: in-flow bar in the centered top stack — no absolute positioning or drag.
  if (isPhone) {
    return (
      <div
        className={cn(
          'pointer-events-auto flex w-80 max-w-[calc(100vw-1rem)] items-center gap-1.5 px-2 py-1.5',
          panelChrome,
        )}
      >
        <PreviewScrubber anim={anim} />
      </div>
    );
  }

  const onGripPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const win = e.currentTarget.parentElement as HTMLElement;
    const rect = win.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const baseLeft = rect.left;
    const baseTop = rect.top;
    e.currentTarget.setPointerCapture(e.pointerId);

    const compute = (ev: PointerEvent) => {
      const maxX = window.innerWidth - KEEP_VISIBLE_X;
      const maxY = window.innerHeight - KEEP_VISIBLE_Y;
      return {
        x: Math.max(0, Math.min(maxX, baseLeft + (ev.clientX - startX))),
        y: Math.max(0, Math.min(maxY, baseTop + (ev.clientY - startY))),
      };
    };
    const onMove = (ev: PointerEvent) => setDrag(compute(ev));
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setAnimPreviewFloatPos(compute(ev));
      setDrag(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const pos = drag ?? stored;
  // null → default top-center anchor (0.5rem below the main toolbar); otherwise clamp the
  // stored top-left into view (covers a viewport that shrank since the position was saved).
  const style: React.CSSProperties = pos
    ? {
        left: Math.max(0, Math.min(pos.x, window.innerWidth - KEEP_VISIBLE_X)),
        top: Math.max(0, Math.min(pos.y, window.innerHeight - KEEP_VISIBLE_Y)),
      }
    : { left: '50%', top: '4rem', transform: 'translateX(-50%)' };

  return (
    <div
      className={cn(
        'pointer-events-auto absolute z-30 flex w-80 max-w-[calc(100vw-1rem)] items-center gap-1.5 px-2 py-1.5',
        panelChrome,
      )}
      style={style}
    >
      <button
        type="button"
        onPointerDown={onGripPointerDown}
        aria-label="Move preview toolbar"
        title="Drag to move"
        className="-ml-0.5 flex shrink-0 cursor-grab touch-none select-none items-center text-fg-subtle hover:text-fg active:cursor-grabbing"
      >
        <GripVertical size={14} />
      </button>
      <PreviewScrubber anim={anim} />
    </div>
  );
}
