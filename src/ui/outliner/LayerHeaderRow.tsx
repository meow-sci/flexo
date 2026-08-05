import { ChevronDown, ChevronRight } from 'lucide-react';
import { Button, cn } from '../kit';
import { LAYER_COLOR_HEX } from './layerColors';
import type { OutlinerLayerSection } from './outlinerTree';

/**
 * A layer's header row in the Outliner (design: design-build-mode.md §2.2).
 *
 * **This is the P5A.13 skeleton**: chevron, color dot, name, count chip, and the inherited
 * `· hidden` / `· locked` flags. The remaining §2.2 controls — active radio dot, color
 * popover, inline rename, eye, opacity popover, lock, listed, drag grip, ⋮ menu, and the
 * delete/clear inline strips — arrive in **P5A.14**, which extends THIS component and adds
 * the ＋ Layer row to the panel. The props are already the whole section, so that task adds
 * handlers, not plumbing.
 *
 * Rendered inside a react-aria `GridListHeader`, which is NOT a selectable row: clicking a
 * layer header can never disturb the entity selection.
 */
export function LayerHeaderRow({
  section,
  collapsed,
  onToggleCollapsed,
}: {
  section: OutlinerLayerSection;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const { layer, view, total, shown } = section;
  const filtering = shown !== total;
  return (
    <div
      className={cn(
        'flex items-center gap-1 px-1 py-(--density-row-py)',
        // An UNLISTED layer stays in the tree as a ghost header (v1 made it vanish, which
        // is how users lost track of a layer they had only unlisted). §2.2 ≡ row.
        !view.listed && 'opacity-40',
      )}
    >
      <Button
        iconOnly
        size="sm"
        variant="ghost"
        className="size-5 shrink-0"
        aria-label={collapsed ? `Expand ${layer.name}` : `Collapse ${layer.name}`}
        onPress={onToggleCollapsed}
      >
        {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
      </Button>
      <span
        aria-hidden
        className={cn(
          'size-2 shrink-0 rounded-full',
          layer.color ? '' : 'border border-border-strong',
        )}
        style={layer.color ? { background: LAYER_COLOR_HEX[layer.color] } : undefined}
      />
      <span className="min-w-0 flex-1 truncate text-xs font-medium uppercase tracking-wide text-fg-muted">
        {layer.name}
      </span>
      <span className="shrink-0 text-[11px] tabular-nums text-fg-subtle">
        {filtering ? `${shown}/${total}` : total}
      </span>
      {!view.visible && <span className="shrink-0 text-[11px] text-fg-subtle">· hidden</span>}
      {view.locked && <span className="shrink-0 text-[11px] text-fg-subtle">· locked</span>}
    </div>
  );
}
