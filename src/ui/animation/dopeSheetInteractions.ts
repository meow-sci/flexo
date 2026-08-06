import type { PartAnimation } from '../../ksa/types';
import { shiftRangeSelection } from '../rangeSelect';

/**
 * The dopesheet's **pointer table** (design-animation-mode.md §5.3) as a pure resolver, so
 * the gesture rules are unit-testable without a canvas, a pointer or a DOM.
 *
 * | Gesture | Target | Result |
 * |---|---|---|
 * | click | ruler or empty track | park the playhead there (clears the pin) |
 * | drag | ruler or empty track | scrub (spring / latch semantics §10.3) |
 * | click | diamond | select the column (replace) + PIN it |
 * | ⌘-click | diamond | toggle the column in `$timelineSelection` (pin unchanged) |
 * | ⇧-click | diamond | grow-only range from the nearest selected column |
 * | ⇧-drag | empty track | marquee over diamonds → ADDITIVE column selection |
 * | drag | diamond | retime the COLUMN (all joints); ⌃ snaps to keys/playhead/clip ends |
 * | double-click | empty track | insert a keyframe at that time (§5.4) |
 * | click | segment span | select the left column + pin |
 * | double-click | segment span | as above + focus that joint's Easing card |
 * | right-click | diamond / segment / track | context menu |
 * | click | cluster pill | zoom the view into the cluster |
 */

/** Pointer travel that separates a click from a drag — shared with the scrub rule (§5.3). */
export const DRAG_THRESHOLD_PX = 4;

/** How close (in px) a retime has to come before ⌃ snapping grabs a candidate. */
export const SNAP_TOLERANCE_PX = 8;

/** What the pointer went down on, resolved from the canvas hit index. */
export type TimelineHit =
  | { kind: 'ruler'; timeSec: number }
  | { kind: 'track'; timeSec: number; rowIndex: number | 'summary' }
  | { kind: 'segment'; timeSec: number; rowIndex: number | 'summary'; kfId: string }
  | { kind: 'diamond'; timeSec: number; rowIndex: number | 'summary'; kfId: string }
  | { kind: 'cluster'; timeSec: number; rowIndex: number | 'summary'; kfIds: string[] };

export interface GestureModifiers {
  shift: boolean;
  meta: boolean;
  ctrl: boolean;
  alt: boolean;
}

export type TimelineIntent =
  /** Park the playhead at `timeSec`, clearing the pin. */
  | { kind: 'park'; timeSec: number }
  /** Start a scrub session (`beginScrub` → `scrubTo` … → `endScrub`). */
  | { kind: 'scrub' }
  /** Additive box-select over columns. */
  | { kind: 'marquee' }
  /** Select one column; `replace` also pins it. */
  | { kind: 'select-column'; kfId: string; mode: 'replace' | 'toggle' | 'range' }
  /** Streaming column retime; `kfId` is the grabbed diamond (the snap anchor). */
  | { kind: 'retime'; kfId: string }
  /** Zoom the view onto an overlap cluster (design §5.3). */
  | { kind: 'zoom-cluster'; kfIds: string[] };

/**
 * The table above, in one function. `dragged` is whether the pointer has passed
 * {@link DRAG_THRESHOLD_PX} — the caller re-resolves once it does, which is exactly how a
 * press that turns into a drag switches from "park" to "scrub" without a second code path.
 */
export function resolveGesture(
  hit: TimelineHit,
  mods: GestureModifiers,
  dragged: boolean,
): TimelineIntent {
  if (hit.kind === 'cluster') {
    return dragged ? { kind: 'scrub' } : { kind: 'zoom-cluster', kfIds: hit.kfIds };
  }
  if (hit.kind === 'diamond') {
    if (dragged) return { kind: 'retime', kfId: hit.kfId };
    if (mods.shift) return { kind: 'select-column', kfId: hit.kfId, mode: 'range' };
    if (mods.meta) return { kind: 'select-column', kfId: hit.kfId, mode: 'toggle' };
    return { kind: 'select-column', kfId: hit.kfId, mode: 'replace' };
  }
  if (hit.kind === 'segment' && !dragged) {
    return { kind: 'select-column', kfId: hit.kfId, mode: 'replace' };
  }
  // Ruler, empty track, and a DRAG that started on a segment span all behave as track:
  // ⇧-drag marquees over the tracks, everything else scrubs; a click parks.
  if (!dragged) return { kind: 'park', timeSec: hit.timeSec };
  return mods.shift && hit.kind !== 'ruler' ? { kind: 'marquee' } : { kind: 'scrub' };
}

/**
 * ⇧-click over columns: the **grow-only** range rule, verbatim — this reuses the list
 * convention's pure core (`rangeSelect.shiftRangeSelection`) rather than growing a second
 * implementation of it; only the hook around it is list-DOM-bound.
 */
export function growOnlyColumnRange(
  clickedKfId: string,
  orderedKfIds: readonly string[],
  selected: readonly string[],
): string[] {
  const next = shiftRangeSelection(clickedKfId, {
    orderedKeys: orderedKfIds,
    selectedKeys: new Set(selected),
  });
  // Keep timeline order — the selection drives status counts and the clipboard's dt math.
  return orderedKfIds.filter((id) => next.has(id));
}

/** ⌘-click: plain membership toggle, order-preserving. */
export function toggleColumn(kfId: string, selected: readonly string[]): string[] {
  return selected.includes(kfId) ? selected.filter((id) => id !== kfId) : [...selected, kfId];
}

/** ⇧-drag marquee: every column whose time falls inside the swept range, ADDED to the set. */
export function marqueeColumns(
  anim: PartAnimation,
  fromSec: number,
  toSec: number,
  selected: readonly string[],
): string[] {
  const lo = Math.min(fromSec, toSec);
  const hi = Math.max(fromSec, toSec);
  const swept = anim.keyframes.filter((k) => k.timeSec >= lo && k.timeSec <= hi).map((k) => k.id);
  const set = new Set([...selected, ...swept]);
  return [...anim.keyframes]
    .sort((a, b) => a.timeSec - b.timeSec)
    .filter((k) => set.has(k.id))
    .map((k) => k.id);
}

/** "Nice" ruler steps, ascending — the adaptive tick ladder (design §5.1). */
const TICK_STEPS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 30, 60];

/** The minor/major ruler steps for a zoom level: minor ≥ 8px apart, major ≥ 60px apart. */
export function rulerSteps(pxPerSec: number): { minor: number; major: number } {
  const pick = (minPx: number) =>
    TICK_STEPS.find((step) => step * pxPerSec >= minPx) ?? TICK_STEPS[TICK_STEPS.length - 1];
  const minor = pick(8);
  const major = Math.max(pick(60), minor);
  return { minor, major };
}

/**
 * The ⌃-held snap candidates (design §5.3): every OTHER keyframe time, the playhead, and
 * the clip's start and end. The dragged set is excluded so a column never snaps to itself.
 */
export function snapCandidates(
  anim: PartAnimation,
  movingIds: readonly string[],
  playheadSec: number,
): number[] {
  const moving = new Set(movingIds);
  const times = anim.keyframes.filter((k) => !moving.has(k.id)).map((k) => k.timeSec);
  return [...times, playheadSec, 0, anim.durationSec].sort((a, b) => a - b);
}

export interface RetimeSnapOptions {
  /** The grabbed diamond's ORIGINAL time — snapping is resolved against this column. */
  anchorTime: number;
  /** Raw pointer delta, seconds. */
  rawDt: number;
  pxPerSec: number;
  /** Default snapping: the ruler's minor-tick grid. */
  gridSec: number;
  /** ⌃ held ⇒ snap to {@link snapCandidates} instead of the grid. */
  ctrlHeld: boolean;
  candidates: readonly number[];
}

/**
 * The retime delta after snapping. Default is the adaptive ruler grid; holding ⌃ swaps to
 * the keyframe/playhead/clip-end candidate set, and only inside a
 * {@link SNAP_TOLERANCE_PX} pixel window — beyond that the raw delta wins, so ⌃ can never
 * yank a column somewhere the pointer is not.
 */
export function resolveRetimeDt(o: RetimeSnapOptions): number {
  const target = o.anchorTime + o.rawDt;
  if (o.ctrlHeld) {
    const tol = SNAP_TOLERANCE_PX / Math.max(1e-6, o.pxPerSec);
    let best: number | null = null;
    for (const c of o.candidates) {
      if (Math.abs(c - target) > tol) continue;
      if (best === null || Math.abs(c - target) < Math.abs(best - target)) best = c;
    }
    return best === null ? o.rawDt : best - o.anchorTime;
  }
  if (o.gridSec <= 0) return o.rawDt;
  return Math.round(target / o.gridSec) * o.gridSec - o.anchorTime;
}
