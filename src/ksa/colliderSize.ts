/**
 * The ONE place that knows how a {@link PartCollider}'s `scale` (its outer size in
 * meters — see the {@link PartCollider} docs for why size lives in `scale`) maps onto
 * KSA's per-shape `<LengthX|LengthY|LengthZ>` / `<Radius>` dimension elements, and back.
 *
 * Bepu constructor semantics (verified against shipped collider data vs. the real GLB
 * mesh AABBs — see scope/colliders.md §"Shape semantics"):
 *   - `Box(LengthX, LengthY, LengthZ)`  — FULL extents on local X/Y/Z.
 *   - `Cylinder(Radius, LengthY)`       — Y-axis aligned, `LengthY` the FULL length.
 *   - `Capsule(Radius, LengthY)`        — Y-axis aligned; `LengthY` is only the
 *     CYLINDRICAL segment, the two hemispherical caps add `Radius` at each end, so the
 *     tip-to-tip height is `LengthY + 2·Radius`.
 *   - `Sphere(Radius)`.
 *
 * Local **Y** is therefore the cylinder/capsule axis, and `size` is always the outer
 * bounding box of the shape in its own local frame.
 */

import type { ColliderShape, Vec3 } from './types'

/**
 * Smallest dimension a collider may have. KSA feeds every `<Radius>`/`<Length*>`
 * straight into a Bepu shape constructor, and a zero/negative/NaN extent produces a
 * degenerate collidable, so the size math clamps rather than trusting user input.
 */
export const MIN_COLLIDER_SIZE_M = 1e-4

/**
 * Fallback outer size (meters) for a dimension KSA's XML omits. `DistanceReference`
 * defaults to **NaN**, not 0 (`DistanceReference.SetValue` leaves `_value = double.NaN`
 * when no unit attribute is present), so an omitted `<Radius>` would build a
 * `new Sphere(NaN)` in-game. flexo substitutes a visible 1 m and warns on import — and
 * ALWAYS emits every dimension on export.
 */
export const DEFAULT_COLLIDER_SIZE_M = 1

/**
 * The raw KSA dimension elements of one collider shape, in meters. A field is `null`
 * exactly when that shape has no such element (e.g. a sphere has no `LengthY`).
 */
export interface ColliderDimensions {
  /** `<LengthX M>` — Box only. */
  lengthXM: number | null
  /** `<LengthY M>` — Box (extent), Cylinder (full length), Capsule (segment length). */
  lengthYM: number | null
  /** `<LengthZ M>` — Box only. */
  lengthZM: number | null
  /** `<Radius M>` — Sphere / Cylinder / Capsule. */
  radiusM: number | null
}

function clampDim(v: number): number {
  return Number.isFinite(v) && v > MIN_COLLIDER_SIZE_M ? v : MIN_COLLIDER_SIZE_M
}

/**
 * Snaps a size onto the degrees of freedom its shape actually has, so a non-uniform
 * scale-gizmo drag (or a hand-typed field) can't describe a shape KSA cannot represent.
 * Mirrors containerStore's `normalizeSize`; applied by BOTH the numeric fields and the
 * gizmo write-back.
 *
 *  - Box      — free (three independent extents).
 *  - Sphere   — uniform; the largest axis wins.
 *  - Cylinder — X and Z are the same diameter; the larger wins.
 *  - Capsule  — as Cylinder, plus height ≥ diameter (a capsule shorter than its
 *    diameter IS a sphere, and would emit a negative `<LengthY>`).
 */
export function normalizeColliderSize(shape: ColliderShape, size: Vec3): Vec3 {
  const x = clampDim(size.x)
  const y = clampDim(size.y)
  const z = clampDim(size.z)
  switch (shape) {
    case 'Box':
      return { x, y, z }
    case 'Sphere': {
      const d = Math.max(x, y, z)
      return { x: d, y: d, z: d }
    }
    case 'Cylinder': {
      const d = Math.max(x, z)
      return { x: d, y, z: d }
    }
    case 'Capsule': {
      const d = Math.max(x, z)
      return { x: d, y: Math.max(y, d), z: d }
    }
  }
}

/** Outer size (meters) → the KSA dimension elements to emit. Normalizes first. */
export function colliderDimensions(shape: ColliderShape, size: Vec3): ColliderDimensions {
  const s = normalizeColliderSize(shape, size)
  switch (shape) {
    case 'Box':
      return { lengthXM: s.x, lengthYM: s.y, lengthZM: s.z, radiusM: null }
    case 'Sphere':
      return { lengthXM: null, lengthYM: null, lengthZM: null, radiusM: s.x / 2 }
    case 'Cylinder':
      return { lengthXM: null, lengthYM: s.y, lengthZM: null, radiusM: s.x / 2 }
    case 'Capsule':
      // <LengthY> is the cylindrical segment only; the caps add one radius per end.
      return { lengthXM: null, lengthYM: s.y - s.x, lengthZM: null, radiusM: s.x / 2 }
  }
}

/**
 * The KSA dimension elements → outer size (meters). A `null` (absent in the XML)
 * dimension becomes {@link DEFAULT_COLLIDER_SIZE_M} rather than the NaN KSA itself would
 * produce; callers warn. The result is normalized, so it always round-trips.
 */
export function colliderSizeFromDimensions(
  shape: ColliderShape,
  dims: Partial<ColliderDimensions>,
): Vec3 {
  const len = (v: number | null | undefined) => (v == null ? DEFAULT_COLLIDER_SIZE_M : v)
  const dia = (v: number | null | undefined) => (v == null ? DEFAULT_COLLIDER_SIZE_M : v * 2)
  switch (shape) {
    case 'Box':
      return normalizeColliderSize(shape, {
        x: len(dims.lengthXM),
        y: len(dims.lengthYM),
        z: len(dims.lengthZM),
      })
    case 'Sphere': {
      const d = dia(dims.radiusM)
      return normalizeColliderSize(shape, { x: d, y: d, z: d })
    }
    case 'Cylinder': {
      const d = dia(dims.radiusM)
      return normalizeColliderSize(shape, { x: d, y: len(dims.lengthYM), z: d })
    }
    case 'Capsule': {
      const d = dia(dims.radiusM)
      // Tip-to-tip height = segment + 2·radius; an omitted segment means "just the caps".
      const segment = dims.lengthYM ?? 0
      return normalizeColliderSize(shape, { x: d, y: segment + d, z: d })
    }
  }
}

/** The dimension element names a shape MUST carry (KSA NaNs any it omits). */
export function colliderDimensionNames(shape: ColliderShape): readonly string[] {
  switch (shape) {
    case 'Box':
      return ['LengthX', 'LengthY', 'LengthZ']
    case 'Sphere':
      return ['Radius']
    case 'Cylinder':
    case 'Capsule':
      return ['LengthY', 'Radius']
  }
}

/** A size field's one-character visible label plus its accessible name. */
export interface ColliderSizeLabel {
  /** ONE character — the inspector's label slot is a single glyph wide. */
  short: string
  /** Spoken/tooltip name, e.g. "Diameter". */
  full: string
}

/**
 * Per-axis labels for the size fields of a shape (`null` ⇒ that axis is not independently
 * editable — {@link normalizeColliderSize} derives it — so the field is hidden). Drives the
 * inspector's "Size (m)" group.
 */
export function colliderSizeLabels(
  shape: ColliderShape,
): [ColliderSizeLabel | null, ColliderSizeLabel | null, ColliderSizeLabel | null] {
  const dia: ColliderSizeLabel = { short: '\u00D8', full: 'Diameter' }
  const height: ColliderSizeLabel = { short: 'H', full: 'Height' }
  switch (shape) {
    case 'Box':
      return [
        { short: 'X', full: 'Length X' },
        { short: 'Y', full: 'Length Y' },
        { short: 'Z', full: 'Length Z' },
      ]
    case 'Sphere':
      return [dia, null, null]
    case 'Cylinder':
    case 'Capsule':
      return [dia, height, null]
  }
}
