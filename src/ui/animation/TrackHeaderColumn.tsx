import { useStore } from '@nanostores/react';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import {
  Button,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
  ResizeHandle,
  Tooltip,
  cn,
  isPhoneViewport,
} from '../kit';
import { openPanelSheet } from '../shell/phone/phoneSheets';
import { $part } from '../../state/editorStore';
import {
  $activeAnimationId,
  $activeJointId,
  $jointTreeCollapsed,
  openMembersView,
} from '../../state/animationStore';
import type { PartAnimation } from '../../ksa/types';
import { buildDopeSheetModel } from './dopeSheetModel';
import {
  $timelineScrollTop,
  $trackHeaderWidth,
  ROW_H,
  RULER_H,
  SUMMARY_H,
  TRACK_HEADER_MAX,
  TRACK_HEADER_MIN,
  refitForClip,
} from './timelineActions';

/**
 * The dopesheet's left header column (design-animation-mode.md §5.1): the clip switcher, the
 * `∑` label, and one row per visible joint mirroring the navigator tree's ORDER, INDENT and
 * COLLAPSE state (`$jointTreeCollapsed` is shared, so collapsing here collapses there).
 *
 * Row heights come from the same constants the canvas draws with — the two would drift the
 * moment either owned its own number. Vertical scroll is the shared `$timelineScrollTop`
 * atom rather than DOM overflow, which is what keeps the rows pinned to their tracks while
 * the ruler and `∑` row stay put above them.
 */
export function TrackHeaderColumn({ anim }: { anim: PartAnimation }) {
  const part = useStore($part);
  const collapsedMap = useStore($jointTreeCollapsed);
  const activeJointId = useStore($activeJointId);
  const scrollTop = useStore($timelineScrollTop);
  const width = useStore($trackHeaderWidth);
  const { rows } = buildDopeSheetModel(anim, collapsedMap);

  return (
    <div
      className="relative flex flex-none flex-col overflow-hidden border-r border-border bg-panel"
      style={{ width }}
    >
      {/* Clip switcher — change clips without visiting the sidebar. */}
      <div
        className="flex flex-none items-center gap-1 border-b border-border px-1"
        style={{ height: RULER_H }}
      >
        <MenuTrigger>
          <Button size="xs" variant="ghost" className="min-w-0 flex-1 justify-start px-1">
            <span className="min-w-0 flex-1 truncate text-left">{anim.name}</span>
            <ChevronDown size={10} className="shrink-0" />
          </Button>
          <Popover>
            <Menu
              selectionMode="single"
              selectedKeys={[anim.id]}
              onSelectionChange={(keys) => {
                const next = [...keys][0];
                if (typeof next === 'string' && next !== anim.id) {
                  $activeAnimationId.set(next);
                  refitForClip();
                }
              }}
            >
              {part.animations.map((a) => (
                <MenuItem key={a.id} id={a.id}>
                  {a.name}
                </MenuItem>
              ))}
            </Menu>
          </Popover>
        </MenuTrigger>
        <span className="shrink-0 text-xs tabular-nums text-fg-subtle">
          {anim.keyframes.length}
        </span>
      </div>

      {/* The ∑ summary label, sticky with the canvas's summary row. */}
      <div
        className="flex flex-none items-center border-b border-border px-1.5 text-xs text-fg-muted"
        style={{ height: SUMMARY_H }}
      >
        ∑ All joints
      </div>

      {/* Joint rows, translated by the shared scroll offset. */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div style={{ transform: `translateY(${-scrollTop}px)` }}>
          {rows.map((row) => (
            <div
              key={row.jointId}
              className={cn(
                'flex items-center gap-1 pr-1 text-xs',
                row.jointId === activeJointId ? 'bg-accent/10 text-fg' : 'text-fg-muted',
              )}
              style={{ height: ROW_H, paddingLeft: 4 + row.depth * 10 }}
            >
              {row.hasChildren ? (
                <button
                  type="button"
                  aria-label={row.collapsed ? 'Expand joint' : 'Collapse joint'}
                  className="shrink-0 text-fg-subtle hover:text-fg"
                  onClick={() =>
                    $jointTreeCollapsed.set({
                      ...collapsedMap,
                      [row.jointId]: !row.collapsed,
                    })
                  }
                >
                  {row.collapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
                </button>
              ) : (
                <span className="w-[11px] shrink-0" />
              )}
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left"
                onClick={() => $activeJointId.set(row.jointId)}
              >
                {row.name}
              </button>
              <span className="shrink-0 tabular-nums text-fg-subtle">({row.memberCount})</span>
              {row.memberCount === 0 && (
                <Tooltip content="No members — this joint won't export">
                  <button
                    type="button"
                    aria-label="No members"
                    className="shrink-0 text-warning"
                    // The Members view lives in `AnimationSidebar`, i.e. inside the PANEL
                    // sheet on a phone — and this button is inside the TIMELINE sheet, a
                    // different slot. Opening the panel is what makes the tap do anything
                    // visible here; the two sheets are mutually exclusive, so this also
                    // closes the timeline, which is the intended hand-off.
                    onClick={() => {
                      openMembersView(row.jointId);
                      if (isPhoneViewport()) openPanelSheet();
                    }}
                  >
                    <AlertTriangle size={11} />
                  </button>
                </Tooltip>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* The column's own resize edge (100–280px, persisted). */}
      <div className="absolute inset-y-0 -right-1">
        <ResizeHandle
          orientation="vertical"
          value={width}
          min={TRACK_HEADER_MIN}
          max={TRACK_HEADER_MAX}
          onChange={(px) => $trackHeaderWidth.set(px)}
          ariaLabel="Resize the track header column"
        />
      </div>
    </div>
  );
}
