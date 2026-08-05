import { useStore } from '@nanostores/react';
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { Button, ResizeHandle, cn } from '../kit';
import {
  $layout,
  SIDEBAR_CLAMPS,
  setSidebarCollapsed,
  setSidebarWidth,
} from '../../state/layoutStore';

/**
 * THE docked sidebar frame both sides share (foundation.md §1, §1.1 region rules).
 * A real flex sibling of the viewport cell — never an overlay — so the canvas gets
 * exactly the remaining space and the orbit center is the visible center by
 * construction.
 *
 * - **Width** is per SIDE, never per mode (§1.1): switching modes must never move the
 *   canvas edge, so nothing in here is ever mode-aware.
 * - **Resize** drags the INNER edge (the one facing the viewport) via the kit
 *   {@link ResizeHandle}; clamps come from {@link SIDEBAR_CLAMPS}. The right sidebar
 *   inverts the delta so dragging left WIDENS it (the v1 behavior).
 * - **Collapse** is width 0 plus a `--rail-reopen-w` reopen tab hugging the viewport
 *   edge. Both are instant: no transition classes anywhere (§1.1 "no animation > 120ms").
 * - **Undo enrollment: NONE** — layout is view state, persisted to `flexo:layout`
 *   (foundation §13).
 *
 * NOTE: no key handling lives here. The `⌥[` / `⌥]` toggles and the Window-menu items
 * register against {@link setSidebarCollapsed} in the hotkey / menubar phases.
 */
export function Sidebar({ side, children }: { side: 'left' | 'right'; children: React.ReactNode }) {
  const layout = useStore($layout);
  const { width, collapsed } = layout[side];
  const OpenIcon = side === 'left' ? PanelLeftOpen : PanelRightOpen;
  const CloseIcon = side === 'left' ? PanelLeftClose : PanelRightClose;
  const edge = side === 'left' ? 'border-r' : 'border-l';

  if (collapsed) {
    return (
      <div
        className={cn(
          'flex w-(--rail-reopen-w) flex-none flex-col items-center border-border bg-panel py-(--bar-py)',
          edge,
        )}
      >
        <Button
          size="xs"
          iconOnly
          variant="ghost"
          className="w-full"
          aria-label={`Show ${side} sidebar`}
          onPress={() => setSidebarCollapsed(side, false)}
        >
          <OpenIcon size={14} />
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn('relative flex flex-none flex-col border-border bg-panel', edge)}
      style={{ width }}
    >
      <div className="flex flex-none items-center justify-end px-1 py-(--bar-py)">
        <Button
          size="xs"
          iconOnly
          variant="ghost"
          aria-label={`Hide ${side} sidebar`}
          onPress={() => setSidebarCollapsed(side, true)}
        >
          <CloseIcon size={14} />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

      {/* Inner-edge grab strip — positioned by the consumer, per ResizeHandle's contract. */}
      <div className={cn('absolute inset-y-0', side === 'left' ? '-right-1' : '-left-1')}>
        <ResizeHandle
          orientation="vertical"
          value={width}
          min={SIDEBAR_CLAMPS[side].min}
          max={SIDEBAR_CLAMPS[side].max}
          invert={side === 'right'}
          hitSize={8}
          visualSize={2}
          onChange={(px) => setSidebarWidth(side, px)}
          ariaLabel={`Resize ${side} sidebar`}
        />
      </div>
    </div>
  );
}
