import type { AnimationKeyframe, PartAnimation, Transform } from '../../ksa/types';
import { controlPointsOf, matchingPreset, segmentEasingUniform } from '../../ksa/easing';

/**
 * The dopesheet's **column model** (design-animation-mode.md §5.2) as a pure, testable
 * module: `DopeSheetCanvas` consumes it and draws, and nothing else in the timeline has to
 * know how a diamond earns its fill.
 *
 * `AnimationKeyframe` columns are GLOBAL — every joint has a pose at every column — and v2
 * deliberately keeps that model. The per-joint reading users expect (this joint moves HERE,
 * holds THERE) is derived instead:
 *
 * - **◆ `'move'`** — the joint's pose differs from its pose at the PREVIOUS column, or, for
 *   the FIRST column, from its pose at the SECOND (the first column with any outgoing motion).
 * - **◇ `'hold'`** — everything else: a pass-through the retime drag still grabs, because
 *   retiming any diamond retimes the whole column.
 *
 * Zero react / three imports (it is plain data), but it lives under `src/ui/` because it is a
 * VIEW model, not document semantics — the KSA contract knows nothing about diamonds.
 */

/** Pose-equality epsilon, per design §5.2 ("poses compared component-wise, ε = 1e-6"). */
const POSE_EPS = 1e-6;

export interface DopeColumn {
  kfId: string;
  timeSec: number;
  /** `restKeyframeId ?? earliest` — the ⚓ badge column (design §5.6). */
  isAnchor: boolean;
  /** The t=0 column: immovable and undeletable (kept v1 invariant). */
  isRest0: boolean;
}

/** Per-column significance for one joint row. */
export type DopeMark = 'move' | 'hold';

/**
 * A per-segment easing summary for the indicators: a preset name (`'easeInOut'`), `'custom'`
 * for an off-preset uniform curve, `'per-channel'` when the three channels disagree, and
 * `null` for linear (which is stored ABSENT — the storage discipline, design §3).
 */
export type DopeSegment = string | null;

export interface DopeRow {
  jointId: string;
  name: string;
  /** Tree indent, mirroring the `parentJointId` chain. */
  depth: number;
  /** ⚠ when 0 — the joint contributes nothing to the export. */
  memberCount: number;
  /** This joint has at least one child joint — the row draws a disclosure caret. */
  hasChildren: boolean;
  /** This joint's subtree is collapsed (its descendants have no rows of their own). */
  collapsed: boolean;
  /** True when {@link marks}/{@link segments} are the OR-aggregate of a hidden subtree. */
  aggregated: boolean;
  /** One entry per column: does this joint's pose CHANGE here (◆) or hold (◇)? */
  marks: DopeMark[];
  /** One entry per segment `[i → i+1]`; length = `columns.length - 1`. */
  segments: DopeSegment[];
}

export interface DopeSheetModel {
  columns: DopeColumn[];
  rows: DopeRow[];
}

/** The anchor column's id: an explicit, still-live `restKeyframeId`, else the earliest. */
export function anchorColumnId(anim: PartAnimation): string | null {
  if (anim.restKeyframeId && anim.keyframes.some((k) => k.id === anim.restKeyframeId)) {
    return anim.restKeyframeId;
  }
  const sorted = [...anim.keyframes].sort((a, b) => a.timeSec - b.timeSec);
  return sorted[0]?.id ?? null;
}

function sameTransform(a: Transform | undefined, b: Transform | undefined): boolean {
  if (!a || !b) return a === b; // a missing pose only equals another missing pose
  const near = (x: number, y: number) => Math.abs(x - y) <= POSE_EPS;
  return (
    near(a.position.x, b.position.x) &&
    near(a.position.y, b.position.y) &&
    near(a.position.z, b.position.z) &&
    near(a.rotation.x, b.rotation.x) &&
    near(a.rotation.y, b.rotation.y) &&
    near(a.rotation.z, b.rotation.z) &&
    near(a.scale.x, b.scale.x) &&
    near(a.scale.y, b.scale.y) &&
    near(a.scale.z, b.scale.z)
  );
}

/**
 * WHICH channels a joint's pose changes on, between two columns — the keyframe card's
 * `pos rot scale` chips (design §8.4). Same ε as the ◆/◇ rule above, so a chip and a solid
 * diamond can never disagree about whether the joint moved.
 */
export function poseChannelDiff(
  previous: Transform | undefined,
  here: Transform | undefined,
): { position: boolean; rotation: boolean; scale: boolean } {
  const near = (x: number, y: number) => Math.abs(x - y) <= POSE_EPS;
  if (!previous || !here) return { position: !!here !== !!previous, rotation: false, scale: false };
  return {
    position: !(
      near(previous.position.x, here.position.x) &&
      near(previous.position.y, here.position.y) &&
      near(previous.position.z, here.position.z)
    ),
    rotation: !(
      near(previous.rotation.x, here.rotation.x) &&
      near(previous.rotation.y, here.rotation.y) &&
      near(previous.rotation.z, here.rotation.z)
    ),
    scale: !(
      near(previous.scale.x, here.scale.x) &&
      near(previous.scale.y, here.scale.y) &&
      near(previous.scale.z, here.scale.z)
    ),
  };
}

/** The label for one joint's outgoing easing at a column (see {@link DopeSegment}). */
function segmentLabel(kf: AnimationKeyframe, jointId: string): DopeSegment {
  const uniform = segmentEasingUniform(kf.easings?.[jointId]);
  if (uniform === undefined) return null; // absent ⇒ linear on every channel
  if (uniform === 'mixed') return 'per-channel';
  return matchingPreset(controlPointsOf(uniform)) ?? 'custom';
}

/**
 * The joint's ancestor ids, nearest first. Cycle- and missing-parent-safe, mirroring
 * `animationRig.jointWorld`'s visited-set walk — a corrupt chain must render, not hang.
 */
function ancestorsOf(jointId: string, parentOf: ReadonlyMap<string, string | null>): string[] {
  const out: string[] = [];
  const seen = new Set<string>([jointId]);
  let cur = parentOf.get(jointId) ?? null;
  while (cur && parentOf.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    out.push(cur);
    cur = parentOf.get(cur) ?? null;
  }
  return out;
}

/**
 * Builds the dopesheet's columns + visible joint rows.
 *
 * Rows follow DOCUMENT order (which is also the export order and the navigator tree's
 * order); `collapsed` hides a joint's descendants and folds their marks/segments up into the
 * collapsed parent's row, flagged `aggregated` so the canvas can draw it hollow-stacked.
 */
export function buildDopeSheetModel(
  anim: PartAnimation,
  collapsed: Record<string, boolean>,
): DopeSheetModel {
  const sorted = [...anim.keyframes].sort((a, b) => a.timeSec - b.timeSec);
  const anchorId = anchorColumnId(anim);
  const columns: DopeColumn[] = sorted.map((k) => ({
    kfId: k.id,
    timeSec: k.timeSec,
    isAnchor: k.id === anchorId,
    isRest0: k.timeSec === 0,
  }));

  const parentOf = new Map(anim.joints.map((j) => [j.id, j.parentJointId]));

  /** Raw (un-aggregated) per-joint marks + segment labels. */
  const marksOf = new Map<string, DopeMark[]>();
  const segmentsOf = new Map<string, DopeSegment[]>();
  for (const joint of anim.joints) {
    const marks: DopeMark[] = sorted.map((kf, i) => {
      const here = kf.poses[joint.id];
      // The first column is ◆ when it has any OUTGOING motion; every other column compares
      // backwards. A single-column clip has nothing to compare against ⇒ hold.
      const other = i === 0 ? sorted[1]?.poses[joint.id] : sorted[i - 1].poses[joint.id];
      if (i === 0 && sorted.length < 2) return 'hold';
      return sameTransform(here, other) ? 'hold' : 'move';
    });
    marksOf.set(joint.id, marks);
    segmentsOf.set(
      joint.id,
      sorted.slice(0, -1).map((kf) => segmentLabel(kf, joint.id)),
    );
  }

  const rows: DopeRow[] = [];
  for (const joint of anim.joints) {
    const ancestors = ancestorsOf(joint.id, parentOf);
    if (ancestors.some((id) => collapsed[id])) continue; // a collapsed ancestor hides it
    const isCollapsed = !!collapsed[joint.id];
    const descendants = anim.joints.filter(
      (j) => j.id !== joint.id && ancestorsOf(j.id, parentOf).includes(joint.id),
    );
    const subtree = isCollapsed ? descendants : [];
    const marks = [...(marksOf.get(joint.id) ?? [])];
    const segments = [...(segmentsOf.get(joint.id) ?? [])];
    for (const child of subtree) {
      const childMarks = marksOf.get(child.id) ?? [];
      for (let i = 0; i < marks.length; i++) if (childMarks[i] === 'move') marks[i] = 'move';
      const childSegments = segmentsOf.get(child.id) ?? [];
      for (let i = 0; i < segments.length; i++) {
        const a = segments[i];
        const b = childSegments[i];
        if (b === null || b === undefined) continue;
        segments[i] = a === null ? b : a === b ? a : 'per-channel';
      }
    }
    rows.push({
      jointId: joint.id,
      name: joint.name,
      depth: ancestors.length,
      memberCount: joint.memberInstanceIds.length,
      hasChildren: descendants.length > 0,
      collapsed: isCollapsed,
      aggregated: subtree.length > 0,
      marks,
      segments,
    });
  }

  return { columns, rows };
}

/** The summary (`∑`) row: a column is solid when ANY joint moves there (design §5.1). */
export function summaryMarks(model: DopeSheetModel): DopeMark[] {
  return model.columns.map((_, i) =>
    model.rows.some((r) => r.marks[i] === 'move') ? 'move' : 'hold',
  );
}
