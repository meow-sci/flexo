/**
 * "How good is my approximation?" — the on-demand QA readout for a Part's collision volume.
 *
 * Two questions, and they pull in opposite directions:
 *  - **Gaps** — mesh geometry outside every collider clips through terrain and other
 *    vehicles (only the collision compound exists to physics; the render mesh is invisible
 *    to it).
 *  - **Bloat** — collider volume far beyond the mesh is an invisible wall, and it inflates
 *    the vehicle's `BoundingBoxAsmb` / `BoundingSphereRadiusBody`, which KSA derives from
 *    the collider compound when colliders exist (`Vehicle.cs:1514-1520`).
 *
 * Deliberately a manual, on-demand check (like the reference-container warn pass), never a
 * live per-frame cost: a vertex-precision sample of a real part is tens of thousands of
 * points against every collider.
 *
 * Pure — no stores, no three, no React. Points come in ALREADY in the collider's space
 * (Part space for a part-level collider; the caller resolves owner frames, which is the
 * same rule `EditorScene` uses to place the visuals).
 */

import type { PartCollider, Vec3 } from '../ksa/types';

/** A collider placed in the space the sample points are expressed in. */
export interface PlacedCollider {
  /** The document entity (for `id` / `shape` / `scale` — its own transform is ignored). */
  collider: PartCollider;
  /** Shape centre in sample-point space. */
  position: Vec3;
  /** Shape orientation as a quaternion `[x, y, z, w]` in that space. */
  quaternion: readonly [number, number, number, number];
}

export interface CoverageReport {
  /** How many sample points were tested. */
  sampled: number;
  /** Points inside at least one collider. */
  covered: number;
  /** `covered / sampled` in [0, 1]; 1 when there was nothing to sample. */
  fraction: number;
  /** The uncovered points, so the viewport can show WHERE the hole is. */
  uncovered: Vec3[];
  /** Summed collider volume (m³). Overlaps are counted twice — see {@link bloat}. */
  colliderVolumeM3: number;
  /** Volume of the sample points' world AABB (m³); 0 when degenerate. */
  meshBoundsVolumeM3: number;
  /**
   * `colliderVolumeM3 / meshBoundsVolumeM3`, or null when the mesh bounds are degenerate.
   * A ratio near 1 is normal (Core's colliders are deliberately coarse); several times
   * that means invisible walls and an inflated vehicle bounding box. Overlap is FREE in
   * KSA (a Bepu compound never self-collides), so an overlapping composite legitimately
   * scores high — read this as a smell, not a rule.
   */
  bloat: number | null;
}

/** Rotates `v` by the CONJUGATE of `q` — i.e. takes a point into the shape's local frame. */
function toLocal(v: Vec3, q: readonly [number, number, number, number]): Vec3 {
  const [qx, qy, qz, w] = q;
  const x = -qx;
  const y = -qy;
  const z = -qz;
  const tx = 2 * (y * v.z - z * v.y);
  const ty = 2 * (z * v.x - x * v.z);
  const tz = 2 * (x * v.y - y * v.x);
  return {
    x: v.x + w * tx + (y * tz - z * ty),
    y: v.y + w * ty + (z * tx - x * tz),
    z: v.z + w * tz + (x * ty - y * tx),
  };
}

/** Small tolerance so a point exactly ON a face counts as inside. */
const EPS = 1e-6;

/**
 * True when `point` (in the same space as `placed.position`) is inside the primitive.
 * Mirrors the Bepu shape semantics in scope/colliders.md: box half-extents, Y-aligned
 * cylinder, and a capsule measured against its SEGMENT (its size carries the tip-to-tip
 * height, so the segment is `y - x`).
 */
export function pointInCollider(point: Vec3, placed: PlacedCollider): boolean {
  const { collider } = placed;
  const d = toLocal(
    {
      x: point.x - placed.position.x,
      y: point.y - placed.position.y,
      z: point.z - placed.position.z,
    },
    placed.quaternion,
  );
  const hx = collider.scale.x / 2;
  const hy = collider.scale.y / 2;
  const hz = collider.scale.z / 2;
  switch (collider.shape) {
    case 'Box':
      return Math.abs(d.x) <= hx + EPS && Math.abs(d.y) <= hy + EPS && Math.abs(d.z) <= hz + EPS;
    case 'Sphere':
      return Math.hypot(d.x, d.y, d.z) <= hx + EPS;
    case 'Cylinder':
      return Math.abs(d.y) <= hy + EPS && Math.hypot(d.x, d.z) <= hx + EPS;
    case 'Capsule': {
      // Distance to the segment: clamp onto it along Y, then measure radially.
      const halfSegment = Math.max(0, (collider.scale.y - collider.scale.x) / 2);
      const dy = Math.max(-halfSegment, Math.min(halfSegment, d.y));
      return Math.hypot(d.x, d.y - dy, d.z) <= hx + EPS;
    }
  }
}

/** Outer volume (m³) of one primitive, from its outer size. */
export function colliderVolumeM3(collider: PartCollider): number {
  const { x, y } = collider.scale;
  const r = x / 2;
  switch (collider.shape) {
    case 'Box':
      return collider.scale.x * collider.scale.y * collider.scale.z;
    case 'Sphere':
      return (4 / 3) * Math.PI * r ** 3;
    case 'Cylinder':
      return Math.PI * r ** 2 * y;
    case 'Capsule': {
      const segment = Math.max(0, y - x);
      return Math.PI * r ** 2 * segment + (4 / 3) * Math.PI * r ** 3;
    }
  }
}

/**
 * Scores a collision volume against sampled mesh geometry. `maxUncovered` caps how many
 * uncovered points are RETURNED (the counts stay exact) so a vertex-precision sample can't
 * hand the viewport a million dots to draw.
 */
export function evaluateCoverage(
  points: readonly Vec3[],
  colliders: readonly PlacedCollider[],
  maxUncovered = 2000,
): CoverageReport {
  let covered = 0;
  const uncovered: Vec3[] = [];
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };

  for (const p of points) {
    min.x = Math.min(min.x, p.x);
    min.y = Math.min(min.y, p.y);
    min.z = Math.min(min.z, p.z);
    max.x = Math.max(max.x, p.x);
    max.y = Math.max(max.y, p.y);
    max.z = Math.max(max.z, p.z);
    if (colliders.some((c) => pointInCollider(p, c))) covered++;
    else if (uncovered.length < maxUncovered) uncovered.push(p);
  }

  const meshBoundsVolumeM3 =
    points.length > 0 ? (max.x - min.x) * (max.y - min.y) * (max.z - min.z) : 0;
  const volume = colliders.reduce((sum, c) => sum + colliderVolumeM3(c.collider), 0);
  return {
    sampled: points.length,
    covered,
    fraction: points.length > 0 ? covered / points.length : 1,
    uncovered,
    colliderVolumeM3: volume,
    meshBoundsVolumeM3,
    bloat: meshBoundsVolumeM3 > EPS ? volume / meshBoundsVolumeM3 : null,
  };
}
