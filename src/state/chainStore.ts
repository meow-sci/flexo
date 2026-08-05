import { persistentJSON } from '@nanostores/persistent';
import { atom } from 'nanostores';
import type { EulerXYZ, Vec3 } from '../ksa/types';
import { randomId } from './ids';

/**
 * The action-chain SESSION: an ordered list of steps ("ops") applied to a frozen
 * set of seed SubPart placements. Pure UI state — no React, no three.js, and no
 * document state, so nothing here enrolls in undo (see the note on
 * {@link $chainSession}). The math that turns a session into instances lives in
 * `src/three/chainMath.ts`, beside the `bulkTransform.ts` primitives it composes.
 *
 * Two families of ops:
 *   - transform steps (translate/rotate/scale) move the whole working set, exactly
 *     as the multi-select "transform by" panel does, with a pivot choice added;
 *   - array steps (linear/radial/grid) REPLICATE the working set, so arrays
 *     compose: [linear x5 on X][linear x3 on Y] is a 15-cell grid.
 *
 * `count` is always the TOTAL number of instances INCLUDING the original ("6
 * around the tank" means 6), which is why every array count clamps to >= 2.
 *
 * Per-op parameters are remembered across sessions in the module-private
 * `flexo:chainDefaults` blob, so tuning a radial ring once makes the next one
 * start where the last left off. That blob is read DEFENSIVELY (see
 * {@link defaultOp}): unknown or malformed fields degrade to the hardcoded
 * defaults rather than being converted — this app never migrates persisted data.
 */

export type ChainOpKind =
  | 'translate'
  | 'rotate'
  | 'scale'
  | 'linear-array'
  | 'radial-array'
  | 'grid-array';
export type ChainAxis = 'x' | 'y' | 'z';
export type ChainPlane = 'xy' | 'xz' | 'yz';
/** Where a transform step pivots: the working set's centroid, the Part origin, or a typed point. */
export type ChainPivotMode = 'centroid' | 'origin' | 'custom';

export interface TranslateOp {
  id: string;
  kind: 'translate';
  delta: Vec3;
}

export interface RotateOp {
  id: string;
  kind: 'rotate';
  degreesDeg: EulerXYZ;
  pivot: ChainPivotMode;
  center: Vec3;
}

export interface ScaleOp {
  id: string;
  kind: 'scale';
  factor: Vec3;
  /** 'smart' scales positions about the pivot too; 'inPlace' only grows each member. */
  mode: 'smart' | 'inPlace';
  pivot: ChainPivotMode;
  center: Vec3;
}

export interface LinearArrayOp {
  id: string;
  kind: 'linear-array';
  count: number;
  offset: Vec3;
  stepRotateDeg: EulerXYZ;
  stepScale: Vec3;
}

export interface RadialArrayOp {
  id: string;
  kind: 'radial-array';
  count: number;
  /** Axis of the circle. Default 'x': a KSA part's nose/long axis is its local +X. */
  axis: ChainAxis;
  center: Vec3;
  startAngleDeg: number;
  sweepDeg: number;
  /** 'rotate' turns each copy with the ring; 'keep' orbits the position only. */
  orient: 'rotate' | 'keep';
  radialOffset: number;
  axialStep: number;
}

export interface GridArrayOp {
  id: string;
  kind: 'grid-array';
  plane: ChainPlane;
  countA: number;
  countB: number;
  spacingA: number;
  spacingB: number;
  centered: boolean;
}

export type ChainOp =
  | TranslateOp
  | RotateOp
  | ScaleOp
  | LinearArrayOp
  | RadialArrayOp
  | GridArrayOp;

export interface ChainSession {
  /** Seed placements' `instanceId`s, in selection order, FROZEN at open. */
  seedIds: string[];
  ops: ChainOp[];
}

/**
 * The open session, or null. Ephemeral, selection-tier state: it is never
 * persisted and never pushes undo — the document is untouched until Apply, which
 * is what makes Cancel unconditionally safe.
 */
export const $chainSession = atom<ChainSession | null>(null);

/** `Omit` that distributes over the {@link ChainOp} union (a plain Omit would collapse it). */
type OpBody<T> = T extends unknown ? Omit<T, 'id'> : never;
type ChainOpBody = OpBody<ChainOp>;

/** Positional/metric fields, in meters. Wide enough for any part, tight enough to bound the scene. */
const DISTANCE_LIMIT = 10000;
const ANGLE_LIMIT = 360;
const SCALE_MIN = 0.01;
const SCALE_MAX = 100;
const LINEAR_COUNT_MAX = 500;
/** A radial ring finer than 1 degree per step is never authoring intent. */
const RADIAL_COUNT_MAX = 360;
const GRID_COUNT_MAX = 500;

const ZERO: Vec3 = { x: 0, y: 0, z: 0 };
const ONE: Vec3 = { x: 1, y: 1, z: 1 };

// Fresh objects per call: an op owns its vectors, so two ops of the same kind can
// never alias each other's parameters through a shared default.
function translateBody(): Omit<TranslateOp, 'id'> {
  return { kind: 'translate', delta: { ...ZERO } };
}

function rotateBody(): Omit<RotateOp, 'id'> {
  return { kind: 'rotate', degreesDeg: { ...ZERO }, pivot: 'centroid', center: { ...ZERO } };
}

function scaleBody(): Omit<ScaleOp, 'id'> {
  return {
    kind: 'scale',
    factor: { ...ONE },
    mode: 'smart',
    pivot: 'centroid',
    center: { ...ZERO },
  };
}

function linearArrayBody(): Omit<LinearArrayOp, 'id'> {
  return {
    kind: 'linear-array',
    count: 3,
    offset: { x: 1, y: 0, z: 0 },
    stepRotateDeg: { ...ZERO },
    stepScale: { ...ONE },
  };
}

function radialArrayBody(): Omit<RadialArrayOp, 'id'> {
  return {
    kind: 'radial-array',
    count: 6,
    axis: 'x',
    center: { ...ZERO },
    startAngleDeg: 0,
    sweepDeg: 360,
    orient: 'rotate',
    radialOffset: 0,
    axialStep: 0,
  };
}

function gridArrayBody(): Omit<GridArrayOp, 'id'> {
  return {
    kind: 'grid-array',
    plane: 'xy',
    countA: 3,
    countB: 3,
    spacingA: 1,
    spacingB: 1,
    centered: false,
  };
}

/** The hardcoded (unpersisted) parameters for a kind — also the fallback for every bad field. */
function hardcodedBody(kind: ChainOpKind): ChainOpBody {
  switch (kind) {
    case 'translate':
      return translateBody();
    case 'rotate':
      return rotateBody();
    case 'scale':
      return scaleBody();
    case 'linear-array':
      return linearArrayBody();
    case 'radial-array':
      return radialArrayBody();
    case 'grid-array':
      return gridArrayBody();
  }
}

// The clamp helpers take `unknown` on purpose: clampOp runs on persisted blobs as
// well as on typed patches, so a "number" field may really be a string or missing.
function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function clampCount(value: unknown, min: number, max: number, fallback: number): number {
  return Math.round(clampNumber(value, min, max, fallback));
}

function clampVec(value: unknown, min: number, max: number, fallback: Vec3): Vec3 {
  const src = (typeof value === 'object' && value !== null ? value : {}) as Partial<Vec3>;
  return {
    x: clampNumber(src.x, min, max, fallback.x),
    y: clampNumber(src.y, min, max, fallback.y),
    z: clampNumber(src.z, min, max, fallback.z),
  };
}

function clampEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

const PIVOT_MODES: readonly ChainPivotMode[] = ['centroid', 'origin', 'custom'];

/**
 * Sanitizes every numeric/enum field of an op to the ranges in the plan's §3.5 table,
 * rounding counts to integers and replacing anything non-finite (or the wrong type,
 * which is what a corrupted persisted blob looks like) with the hardcoded default.
 *
 * This is the UX guard, not the authority: `evalChain` re-validates, because ops can
 * also arrive from a stale session that was never written through here.
 *
 * Scale factors clamp POSITIVE. A negative scale is a mirror, and KSA back-face culls a
 * mirrored placement into invisibility — mirroring needs winding-reversed geometry, not
 * a transform, so it is deliberately unreachable from a chain.
 */
export function clampOp(op: ChainOp): ChainOp {
  switch (op.kind) {
    case 'translate': {
      const d = translateBody();
      return {
        id: op.id,
        kind: 'translate',
        delta: clampVec(op.delta, -DISTANCE_LIMIT, DISTANCE_LIMIT, d.delta),
      };
    }
    case 'rotate': {
      const d = rotateBody();
      return {
        id: op.id,
        kind: 'rotate',
        degreesDeg: clampVec(op.degreesDeg, -ANGLE_LIMIT, ANGLE_LIMIT, d.degreesDeg),
        pivot: clampEnum(op.pivot, PIVOT_MODES, d.pivot),
        center: clampVec(op.center, -DISTANCE_LIMIT, DISTANCE_LIMIT, d.center),
      };
    }
    case 'scale': {
      const d = scaleBody();
      return {
        id: op.id,
        kind: 'scale',
        factor: clampVec(op.factor, SCALE_MIN, SCALE_MAX, d.factor),
        mode: clampEnum(op.mode, ['smart', 'inPlace'] as const, d.mode),
        pivot: clampEnum(op.pivot, PIVOT_MODES, d.pivot),
        center: clampVec(op.center, -DISTANCE_LIMIT, DISTANCE_LIMIT, d.center),
      };
    }
    case 'linear-array': {
      const d = linearArrayBody();
      return {
        id: op.id,
        kind: 'linear-array',
        count: clampCount(op.count, 2, LINEAR_COUNT_MAX, d.count),
        offset: clampVec(op.offset, -DISTANCE_LIMIT, DISTANCE_LIMIT, d.offset),
        stepRotateDeg: clampVec(op.stepRotateDeg, -ANGLE_LIMIT, ANGLE_LIMIT, d.stepRotateDeg),
        stepScale: clampVec(op.stepScale, SCALE_MIN, SCALE_MAX, d.stepScale),
      };
    }
    case 'radial-array': {
      const d = radialArrayBody();
      return {
        id: op.id,
        kind: 'radial-array',
        count: clampCount(op.count, 2, RADIAL_COUNT_MAX, d.count),
        axis: clampEnum(op.axis, ['x', 'y', 'z'] as const, d.axis),
        center: clampVec(op.center, -DISTANCE_LIMIT, DISTANCE_LIMIT, d.center),
        startAngleDeg: clampNumber(op.startAngleDeg, -ANGLE_LIMIT, ANGLE_LIMIT, d.startAngleDeg),
        sweepDeg: clampNumber(op.sweepDeg, -ANGLE_LIMIT, ANGLE_LIMIT, d.sweepDeg),
        orient: clampEnum(op.orient, ['rotate', 'keep'] as const, d.orient),
        radialOffset: clampNumber(op.radialOffset, -DISTANCE_LIMIT, DISTANCE_LIMIT, d.radialOffset),
        axialStep: clampNumber(op.axialStep, -DISTANCE_LIMIT, DISTANCE_LIMIT, d.axialStep),
      };
    }
    case 'grid-array': {
      const d = gridArrayBody();
      return {
        id: op.id,
        kind: 'grid-array',
        plane: clampEnum(op.plane, ['xy', 'xz', 'yz'] as const, d.plane),
        countA: clampCount(op.countA, 1, GRID_COUNT_MAX, d.countA),
        countB: clampCount(op.countB, 1, GRID_COUNT_MAX, d.countB),
        spacingA: clampNumber(op.spacingA, -DISTANCE_LIMIT, DISTANCE_LIMIT, d.spacingA),
        spacingB: clampNumber(op.spacingB, -DISTANCE_LIMIT, DISTANCE_LIMIT, d.spacingB),
        centered: typeof op.centered === 'boolean' ? op.centered : d.centered,
      };
    }
  }
}

/**
 * Last-used parameters per op kind, so a chain step opens where the user left it.
 * Module-private and typed `unknown` by design: it is replayed verbatim from
 * localStorage, so its contents are untrusted until {@link defaultOp} filters and
 * {@link clampOp} sanitizes them.
 */
const $chainDefaults = persistentJSON<Partial<Record<ChainOpKind, unknown>>>(
  'flexo:chainDefaults',
  {},
);

/**
 * A fresh op of `kind`: the hardcoded parameters with the persisted last-used values
 * laid over them field-by-field, then clamped.
 *
 * Only keys that exist on the hardcoded shape are copied, so a stale field from an
 * older build is dropped rather than converted — the defensive read this codebase
 * mandates instead of migration code.
 */
export function defaultOp(kind: ChainOpKind): ChainOp {
  const body = hardcodedBody(kind) as Record<string, unknown>;
  const stored = $chainDefaults.get()[kind];
  const merged: Record<string, unknown> = { ...body };
  if (typeof stored === 'object' && stored !== null) {
    const source = stored as Record<string, unknown>;
    for (const key of Object.keys(body)) {
      if (key === 'kind') continue;
      const value = source[key];
      if (value !== undefined) merged[key] = value;
    }
  }
  return clampOp({ ...merged, id: randomId(), kind } as ChainOp);
}

/** Starts a session over `seedIds` (selection order), replacing any open one. */
export function openChain(seedIds: readonly string[]): void {
  $chainSession.set({ seedIds: [...seedIds], ops: [] });
}

export function closeChain(): void {
  $chainSession.set(null);
}

/** Appends a step of `kind` and returns its id (`''` when no session is open). */
export function addChainOp(kind: ChainOpKind): string {
  const session = $chainSession.get();
  if (!session) return '';
  const op = defaultOp(kind);
  $chainSession.set({ ...session, ops: [...session.ops, op] });
  return op.id;
}

/**
 * Merges `patch` into the step, clamps the result, and remembers it as the kind's
 * default for the next session. `id`/`kind` are never patchable — a step's kind is
 * fixed at creation (change it by removing and adding a step).
 */
export function updateChainOp(id: string, patch: Partial<ChainOp>): void {
  const session = $chainSession.get();
  if (!session) return;
  const index = session.ops.findIndex((op) => op.id === id);
  if (index < 0) return;

  const current = session.ops[index];
  const next = clampOp({ ...current, ...patch, id, kind: current.kind } as ChainOp);
  const ops = session.ops.slice();
  ops[index] = next;
  $chainSession.set({ ...session, ops });

  const { id: _id, ...body } = next;
  $chainDefaults.set({ ...$chainDefaults.get(), [next.kind]: body });
}

export function removeChainOp(id: string): void {
  const session = $chainSession.get();
  if (!session) return;
  const ops = session.ops.filter((op) => op.id !== id);
  if (ops.length === session.ops.length) return;
  $chainSession.set({ ...session, ops });
}

/**
 * Moves a step to an absolute slot — what the chain window's **drag-reorder** commits
 * (design-build-mode.md §9.2). The index is clamped into range, so a drop past either end
 * lands at that end; an unknown id or an unchanged position is a no-op.
 *
 * Session edits are ephemeral: never undoable, never in the document.
 */
export function moveChainOpTo(id: string, index: number): void {
  const session = $chainSession.get();
  if (!session) return;
  const from = session.ops.findIndex((op) => op.id === id);
  if (from < 0) return;
  const to = Math.max(0, Math.min(index, session.ops.length - 1));
  if (to === from) return;
  const ops = session.ops.slice();
  const [moved] = ops.splice(from, 1);
  ops.splice(to, 0, moved);
  $chainSession.set({ ...session, ops });
}

/** Moves a step one slot up (`-1`) or down (`+1`); a no-op at the ends or for an unknown id. */
export function moveChainOp(id: string, dir: -1 | 1): void {
  const session = $chainSession.get();
  if (!session) return;
  const index = session.ops.findIndex((op) => op.id === id);
  if (index < 0) return;
  const target = index + dir;
  if (target < 0 || target >= session.ops.length) return;
  const ops = session.ops.slice();
  ops[index] = session.ops[target];
  ops[target] = session.ops[index];
  $chainSession.set({ ...session, ops });
}
