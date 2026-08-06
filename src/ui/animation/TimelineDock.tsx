import { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { Plus } from 'lucide-react';
import { Button, InlineConfirmStrip, ResizeHandle, cn } from '../kit';
import { $mode } from '../../state/modeStore';
import {
  $layout,
  maxTimelineHeight,
  setTimelineHeight,
  TIMELINE_MIN_HEIGHT,
} from '../../state/layoutStore';
import {
  $activeAnimation,
  $activeAnimationId,
  addAnimation,
  openMembersView,
} from '../../state/animationStore';
import { TransportBar } from './TransportBar';
import { TrackHeaderColumn } from './TrackHeaderColumn';
import { DopeSheetCanvas } from './DopeSheetCanvas';
import { $timelineDeleteConfirm, commitColumnDelete, refitForClip } from './timelineActions';

/**
 * **The timeline dock** (LOCKED #5; foundation §1.1 + §9; design-animation-mode.md §5.1):
 * a full-width flex row between the workspace band and the status bar, mounted ONLY in
 * Animation mode. Structure, top to bottom: the top-edge resize strip, the always-visible
 * {@link TransportBar}, then the tracks area — the {@link TrackHeaderColumn} beside the
 * {@link DopeSheetCanvas}.
 *
 * Two independent visibility controls, both persisted in `flexo:layout` and NEITHER an undo
 * step (foundation §13):
 * - **Window ▸ Timeline** toggles `timeline.hidden` — the dock unmounts entirely.
 * - the transport's **⌄** toggles `timeline.collapsed` — the dock stays as the 32px
 *   transport-only strip.
 *
 * Height is `timeline.height`, clamped 120px–50vh by `setTimelineHeight`; the dock is a real
 * flex sibling, so the viewport shrinks by exactly this much and the orbit centre stays the
 * visible centre. Floating windows are allowed to overlap it (foundation §6.1) — they clamp
 * to the whole workspace band, which already includes this row.
 *
 * **Extension points for 11C/11D** (both mount alongside, not inside): the right navigator
 * replaces `ModeSidebar`'s Animation branch and shares `$jointTreeCollapsed` +
 * `$activeJointId` with the header column here; the left focus cards read the same
 * `$timelineSelection` / `$editKeyframeId` this dock writes. The one hook this file owes
 * them is the `// TODO(11C)` in `DopeSheetCanvas`'s segment double-click, which should focus
 * the Easing card.
 */
export function TimelineDock() {
  const mode = useStore($mode);
  const layout = useStore($layout);
  const anim = useStore($activeAnimation);
  const activeId = useStore($activeAnimationId);
  const confirm = useStore($timelineDeleteConfirm);
  const { height, collapsed, hidden } = layout.timeline;
  const inMode = mode === 'animation';

  // Clip switch → auto-fit + playhead to the new clip's anchor (design §5.9 / §6.1). Keyed
  // on the id so it runs once per switch, not on every document edit.
  useEffect(() => {
    if (inMode && activeId) refitForClip();
  }, [activeId, inMode]);

  if (!inMode || hidden) return null;

  return (
    <section
      data-surface="timeline"
      aria-label="Timeline"
      // The focus contract (design §12.2): the dock claims focus on pointer-down exactly
      // like the viewport host, which is what turns the `surface:timeline` scope on — and
      // clicking the viewport hands it straight back. `tabIndex={-1}` makes the section
      // focusable without putting it in the tab order; the guard means a press on a button
      // or the canvas inside keeps ITS focus (both are still inside the surface).
      tabIndex={-1}
      onPointerDown={(e) => {
        if (!e.currentTarget.contains(document.activeElement)) e.currentTarget.focus();
      }}
      className={cn(
        'relative flex flex-none flex-col border-t border-border bg-panel outline-none',
        collapsed && 'h-8',
      )}
      style={collapsed ? undefined : { height }}
    >
      {/* Top-edge resize: dragging UP grows the dock, hence `invert`. */}
      {!collapsed && (
        <div className="absolute inset-x-0 -top-1">
          <ResizeHandle
            orientation="horizontal"
            value={height}
            min={TIMELINE_MIN_HEIGHT}
            max={maxTimelineHeight()}
            invert
            onChange={setTimelineHeight}
            ariaLabel="Resize the timeline"
          />
        </div>
      )}

      <TransportBar />

      {!collapsed && (
        <div className="flex min-h-0 flex-1">
          {anim ? (
            <>
              <TrackHeaderColumn anim={anim} />
              <div className="relative flex min-h-0 flex-1 flex-col">
                <DopeSheetCanvas anim={anim} />
                <TimelineHints anim={anim} />
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2">
              <p className="text-xs text-fg-subtle">No animation clips — create one to start</p>
              <Button size="xs" variant="secondary" onPress={() => addAnimation()}>
                <Plus size={12} /> Animation
              </Button>
            </div>
          )}
        </div>
      )}

      {/* The >5-column delete question (foundation §14.3) renders IN the dock, never as a
          dialog stacked over whatever is open. */}
      {confirm && (
        <div className="flex-none border-t border-border px-2 py-1">
          <InlineConfirmStrip
            size="xs"
            label={`Delete ${confirm.ids.length} keyframes?`}
            confirmLabel="Delete"
            onConfirm={() => commitColumnDelete(confirm.ids)}
            onCancel={() => $timelineDeleteConfirm.set(null)}
          />
        </div>
      )}
    </section>
  );
}

/**
 * The §5.10 hint states, as DOM over the canvas so their actions stay clickable: a
 * single-keyframe clip explains how to make a second one, and a clip whose joints have no
 * members points at the Members view.
 */
function TimelineHints({ anim }: { anim: Parameters<typeof TrackHeaderColumn>[0]['anim'] }) {
  const noMembers =
    anim.joints.length > 0 && anim.joints.every((j) => j.memberInstanceIds.length === 0);
  const single = anim.keyframes.length < 2;
  if (!single && !noMembers) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-1 flex justify-center">
      <div className="pointer-events-auto rounded-md border border-border bg-panel-raised px-2 py-1 text-xs text-fg-muted">
        {single && (
          <span>
            Move the playhead, pose a joint, then press K — or double-click a track to add a
            keyframe.
          </span>
        )}
        {!single && noMembers && (
          <button
            type="button"
            className="text-warning underline-offset-2 hover:underline"
            onClick={() => openMembersView()}
          >
            Joints need members to animate — open Members
          </button>
        )}
      </div>
    </div>
  );
}
