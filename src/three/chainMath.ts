import * as THREE from 'three';
import type { Vec3 } from '../ksa/types';
import type {
  ChainAxis,
  ChainOp,
  ChainPivotMode,
  ChainPlane,
  GridArrayOp,
  LinearArrayOp,
  RadialArrayOp,
} from '../state/chainStore';
import type { PlacementTransform } from '../state/editorStore';
import {
  centroidOf,
  groupScaledTransform,
  quatFromEulerDeg,
  rotatedAroundOriginTransform,
  scaledInPlaceTransform,
  translatedTransform,
} from './bulkTransform';

/**
 * The action-chain engine: a PURE fold from (seed transforms, ops) to a flat list of
 * instances. No scene, no WebGL, no clock, no randomness — the same inputs always
 * produce the same output, which is what lets the live ghost preview and the Apply
 * commit run the identical code path.
 *
 * State during the fold is a list of GROUPS, each one rigid copy of the whole seed
 * set (`members[i]` is always seed `i`). A transform step maps every member of every
 * group; an array step replaces each group with `count` groups. That is what makes
 * arrays compose — [linear x5][linear x3] is a 15-cell grid — and what keeps a
 * multi-seed selection moving as a unit rather than as loose parts.
 *
 * Exactly one group carries `isSeedGroup`, inherited by each array op's k=0 spawn.
 * At commit its members OVERWRITE the original placements (they may well have moved:
 * a transform step, a radial `startAngleDeg`, a centered grid all move the seeds) and
 * every other instance becomes a clone.
 *
 * Every translate/rotate/scale primitive is delegated to `bulkTransform.ts`, the same
 * module the gizmo and the numeric "transform by" panel use, so a chain can never
 * disagree with them about Euler order ('ZYX', see coords.ts) or smart-scale
 * semantics. Nothing here mutates its inputs; every helper returns fresh objects.
 */

const DEG2RAD = Math.PI / 180;
/** Below this the group centroid is treated as sitting exactly ON the radial axis. */
const AXIS_EPSILON = 1e-6;
const ORIGIN: Vec3 = { x: 0, y: 0, z: 0 };

const AXIS_VECTORS: Readonly<Record<ChainAxis, Vec3>> = {
  x: { x: 1, y: 0, z: 0 },
  y: { x: 0, y: 1, z: 0 },
  z: { x: 0, y: 0, z: 1 },
};

/**
 * Radial direction used when the group sits ON the axis (there is no radial component
 * to preserve), turning `radialOffset` into "push it out this far, then ring it".
 */
const RADIAL_FALLBACK: Readonly<Record<ChainAxis, Vec3>> = {
  x: { x: 0, y: 1, z: 0 },
  y: { x: 1, y: 0, z: 0 },
  z: { x: 1, y: 0, z: 0 },
};

const PLANE_AXES: Readonly<Record<ChainPlane, readonly [Vec3, Vec3]>> = {
  xy: [AXIS_VECTORS.x, AXIS_VECTORS.y],
  xz: [AXIS_VECTORS.x, AXIS_VECTORS.z],
  yz: [AXIS_VECTORS.y, AXIS_VECTORS.z],
};

/** One evaluated placement. `seedIndex` indexes the seed list the chain was opened on. */
export interface ChainInstance {
  seedIndex: number;
  transform: PlacementTransform;
  isSeed: boolean;
}

export interface ChainEvalResult {
  /** Flattened groups, in group order then seed order. EMPTY when `error` is set. */
  instances: ChainInstance[];
  totalInstances: number;
  /** How many placements Apply would create (`totalInstances - seeds`). */
  newCount: number;
  error: string | null;
}

/** Hard ceiling on an evaluated chain — past this, preview and commit stop being usable. */
export const MAX_CHAIN_INSTANCES = 2000;
/** Hard ceiling on a single array step's count. */
export const MAX_ARRAY_COUNT = 500;

/** Scratch for {@link rotatedPositionOnlyTransform}; results are always fresh plain objects. */
const _pos = new THREE.Vector3();

/**
 * Rotates only the POSITION about `origin` (orientation and scale untouched) — the
 * radial 'keep' mode, for copies that must orbit while still facing one way (a ring
 * of solar panels). Mirrors {@link rotatedAroundOriginTransform} minus its
 * orientation update.
 */
export function rotatedPositionOnlyTransform(
  t: PlacementTransform,
  q: THREE.Quaternion,
  origin: Vec3,
): PlacementTransform {
  _pos
    .set(t.position.x - origin.x, t.position.y - origin.y, t.position.z - origin.z)
    .applyQuaternion(q);
  return {
    position: { x: origin.x + _pos.x, y: origin.y + _pos.y, z: origin.z + _pos.z },
    rotation: { ...t.rotation },
    scale: { ...t.scale },
  };
}

/** One rigid copy of the whole seed set; `members[i]` is seed `i`. */
interface ChainGroup {
  members: PlacementTransform[];
  isSeedGroup: boolean;
}

function copyTransform(t: PlacementTransform): PlacementTransform {
  return {
    position: { ...t.position },
    rotation: { ...t.rotation },
    scale: { ...t.scale },
  };
}

function scaledVec(v: Vec3, k: number): Vec3 {
  return { x: v.x * k, y: v.y * k, z: v.z * k };
}

function addVec(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

/**
 * True for the exact identity quaternion, which is what a zero-degree step produces.
 * Rotating by it is a no-op mathematically but NOT numerically: the helpers re-express
 * the result as Euler angles, which can return a different-but-equivalent triple. Skipping
 * the call keeps "k = 0 is exactly identity" literally true, so an unmoved seed commits
 * back its own stored rotation rather than a re-canonicalized one.
 */
function isIdentityQuat(q: THREE.Quaternion): boolean {
  return q.x === 0 && q.y === 0 && q.z === 0 && q.w === 1;
}

function positionsOf(groups: readonly ChainGroup[]): Vec3[] {
  const out: Vec3[] = [];
  for (const group of groups) {
    for (const member of group.members) out.push(member.position);
  }
  return out;
}

/** The shared pivot for a transform step: whole-working-set centroid, Part origin, or typed point. */
function pivotPoint(groups: readonly ChainGroup[], pivot: ChainPivotMode, center: Vec3): Vec3 {
  if (pivot === 'origin') return { ...ORIGIN };
  if (pivot === 'custom') return { ...center };
  return centroidOf(positionsOf(groups));
}

function mapGroups(
  groups: readonly ChainGroup[],
  fn: (t: PlacementTransform) => PlacementTransform,
): ChainGroup[] {
  return groups.map((group) => ({
    members: group.members.map(fn),
    isSeedGroup: group.isSeedGroup,
  }));
}

/**
 * Linear array — the issue's "duplicate N times spaced +5m on X each". ITERATED delta:
 * copy k is k applications of the per-step delta, rotating about the copy's OWN moved
 * centroid, so copies march in a straight line while turning in place (a staircase, or
 * a helix with a Y offset plus a Y twist).
 *
 * The per-step quaternion accumulates by MULTIPLICATION inside the loop. Building it as
 * `quatFromEulerDeg(k * step)` would be wrong for any multi-axis step: Euler angles do
 * not scale linearly under composition.
 */
function linearArray(groups: readonly ChainGroup[], op: LinearArrayOp): ChainGroup[] {
  const qStep = quatFromEulerDeg(op.stepRotateDeg);
  const out: ChainGroup[] = [];
  for (const group of groups) {
    const centroid = centroidOf(group.members.map((m) => m.position));
    const qk = new THREE.Quaternion();
    for (let k = 0; k < op.count; k++) {
      if (k > 0) qk.multiply(qStep);
      const offset = scaledVec(op.offset, k);
      const movedCentroid = addVec(centroid, offset);
      // Scale is IN PLACE: positions never compound with it, only each member's own size.
      const stepScale: Vec3 = {
        x: op.stepScale.x ** k,
        y: op.stepScale.y ** k,
        z: op.stepScale.z ** k,
      };
      const members = group.members.map((t) => {
        const moved = translatedTransform(t, offset);
        const turned = isIdentityQuat(qk)
          ? moved
          : rotatedAroundOriginTransform(moved, qk, movedCentroid);
        return scaledInPlaceTransform(turned, stepScale);
      });
      out.push({ members, isSeedGroup: k === 0 && group.isSeedGroup });
    }
  }
  return out;
}

/**
 * Radial array — copies on a circle about the axis line through `center`.
 *
 * A full circle divides the sweep by `count` (no 0deg/360deg overlap); any partial
 * sweep divides by `count - 1` so the last copy lands exactly on the end angle.
 */
function radialArray(groups: readonly ChainGroup[], op: RadialArrayOp): ChainGroup[] {
  const axis = AXIS_VECTORS[op.axis];
  const axisVec = new THREE.Vector3(axis.x, axis.y, axis.z);
  const angleStep =
    Math.abs(op.sweepDeg) === 360 ? op.sweepDeg / op.count : op.sweepDeg / (op.count - 1);

  const out: ChainGroup[] = [];
  for (const group of groups) {
    const centroid = centroidOf(group.members.map((m) => m.position));
    // Radial component of the group's offset from the axis: what `radialOffset` extends.
    const fromCenter: Vec3 = {
      x: centroid.x - op.center.x,
      y: centroid.y - op.center.y,
      z: centroid.z - op.center.z,
    };
    const along = fromCenter.x * axis.x + fromCenter.y * axis.y + fromCenter.z * axis.z;
    const radial: Vec3 = {
      x: fromCenter.x - along * axis.x,
      y: fromCenter.y - along * axis.y,
      z: fromCenter.z - along * axis.z,
    };
    const length = Math.hypot(radial.x, radial.y, radial.z);
    const radialDir =
      length < AXIS_EPSILON ? RADIAL_FALLBACK[op.axis] : scaledVec(radial, 1 / length);
    const outward = scaledVec(radialDir, op.radialOffset);

    for (let k = 0; k < op.count; k++) {
      const theta = (op.startAngleDeg + k * angleStep) * DEG2RAD;
      const qk = new THREE.Quaternion().setFromAxisAngle(axisVec, theta);
      const rise = scaledVec(axis, k * op.axialStep);
      const members = group.members.map((t) => {
        const pushed = translatedTransform(t, outward);
        let orbited = pushed;
        if (!isIdentityQuat(qk)) {
          orbited =
            op.orient === 'rotate'
              ? rotatedAroundOriginTransform(pushed, qk, op.center)
              : rotatedPositionOnlyTransform(pushed, qk, op.center);
        }
        return translatedTransform(orbited, rise);
      });
      out.push({ members, isSeedGroup: k === 0 && group.isSeedGroup });
    }
  }
  return out;
}

/** Grid array — rows x columns on a plane; orientation and scale untouched. */
function gridArray(groups: readonly ChainGroup[], op: GridArrayOp): ChainGroup[] {
  const [uA, uB] = PLANE_AXES[op.plane];
  const base = op.centered
    ? addVec(
        scaledVec(uA, -((op.countA - 1) * op.spacingA) / 2),
        scaledVec(uB, -((op.countB - 1) * op.spacingB) / 2),
      )
    : { ...ORIGIN };

  const out: ChainGroup[] = [];
  for (const group of groups) {
    for (let i = 0; i < op.countA; i++) {
      for (let j = 0; j < op.countB; j++) {
        const delta = addVec(
          addVec(base, scaledVec(uA, i * op.spacingA)),
          scaledVec(uB, j * op.spacingB),
        );
        out.push({
          members: group.members.map((t) => translatedTransform(t, delta)),
          isSeedGroup: i === 0 && j === 0 && group.isSeedGroup,
        });
      }
    }
  }
  return out;
}

function applyOp(groups: readonly ChainGroup[], op: ChainOp): ChainGroup[] {
  switch (op.kind) {
    case 'translate':
      return mapGroups(groups, (t) => translatedTransform(t, op.delta));
    case 'rotate': {
      const pivot = pivotPoint(groups, op.pivot, op.center);
      const q = quatFromEulerDeg(op.degreesDeg);
      return mapGroups(groups, (t) => rotatedAroundOriginTransform(t, q, pivot));
    }
    case 'scale': {
      // Kind is always 'subpart' (only placements seed a chain), so scale always applies.
      const pivot = op.mode === 'smart' ? pivotPoint(groups, op.pivot, op.center) : null;
      return mapGroups(groups, (t) => groupScaledTransform('subpart', t, op.factor, pivot));
    }
    case 'linear-array':
      return linearArray(groups, op);
    case 'radial-array':
      return radialArray(groups, op);
    case 'grid-array':
      return gridArray(groups, op);
  }
}

/** How many groups one input group becomes (1 for every transform step). */
function spawnCount(op: ChainOp): number {
  switch (op.kind) {
    case 'linear-array':
    case 'radial-array':
      return op.count;
    case 'grid-array':
      return op.countA * op.countB;
    default:
      return 1;
  }
}

function positiveScaleError(factor: Vec3): string | null {
  return factor.x <= 0 || factor.y <= 0 || factor.z <= 0 ? 'Scale must be positive' : null;
}

function arrayCountError(count: number): string | null {
  if (count < 2) return 'Count must be ≥ 2';
  if (count > MAX_ARRAY_COUNT) return `Array too large (max ${MAX_ARRAY_COUNT})`;
  return null;
}

/**
 * Validates one op. `clampOp` normally keeps these unreachable, but the engine is the
 * authority: a session can hold ops that were never written through the store's clamp.
 */
function validateOp(op: ChainOp): string | null {
  switch (op.kind) {
    case 'translate':
    case 'rotate':
      return null;
    case 'scale':
      return positiveScaleError(op.factor);
    case 'linear-array':
      return arrayCountError(op.count) ?? positiveScaleError(op.stepScale);
    case 'radial-array':
      return (
        arrayCountError(op.count) ??
        (Math.abs(op.sweepDeg) < AXIS_EPSILON ? 'Sweep must be non-zero' : null)
      );
    case 'grid-array': {
      const total = op.countA * op.countB;
      if (total < 2) return 'Grid must produce at least 2 instances';
      if (total > MAX_ARRAY_COUNT) return `Grid too large (max ${MAX_ARRAY_COUNT})`;
      return null;
    }
  }
}

function errorResult(error: string): ChainEvalResult {
  return { instances: [], totalInstances: 0, newCount: 0, error };
}

/**
 * Evaluates `ops` over `seeds` (the seeds' CURRENT transforms, so the preview follows a
 * gizmo drag live). Never throws and never mutates its arguments; every failure comes
 * back as `error` with an empty instance list.
 *
 * Ops are validated up front so a bad parameter always beats a size complaint, and the
 * instance ceiling is checked BEFORE an array step expands — no one benefits from
 * building a million transforms to then reject them.
 */
export function evalChain(
  seeds: readonly PlacementTransform[],
  ops: readonly ChainOp[],
): ChainEvalResult {
  if (seeds.length === 0) return errorResult('Seeds no longer exist');

  for (const op of ops) {
    const error = validateOp(op);
    if (error !== null) return errorResult(error);
  }

  let groups: ChainGroup[] = [{ members: seeds.map(copyTransform), isSeedGroup: true }];
  for (const op of ops) {
    const spawns = spawnCount(op);
    if (spawns > 1) {
      const total = groups.length * spawns * seeds.length;
      if (total > MAX_CHAIN_INSTANCES) {
        return errorResult(`Too many instances (${total} > ${MAX_CHAIN_INSTANCES})`);
      }
    }
    groups = applyOp(groups, op);
  }

  const instances: ChainInstance[] = [];
  for (const group of groups) {
    for (let seedIndex = 0; seedIndex < group.members.length; seedIndex++) {
      instances.push({
        seedIndex,
        transform: group.members[seedIndex],
        isSeed: group.isSeedGroup,
      });
    }
  }

  const totalInstances = instances.length;
  return {
    instances,
    totalInstances,
    newCount: totalInstances - seeds.length,
    error: null,
  };
}
