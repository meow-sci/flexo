/**
 * Fits ONE collision primitive around a cloud of sample points — the "don't make me type
 * `LengthY`" half of collider authoring.
 *
 * Pure and framework-free: the caller supplies world-space sample points (see
 * `src/three/samplePoints.ts`) and a frame quaternion to fit in, and gets back a
 * position + orientation + outer size. The orientation comes back as a QUATERNION
 * deliberately — converting to KSA's Euler XYZ is `src/three/coords.ts`'s job, and that
 * conversion must stay in exactly one place.
 *
 * Core's own colliders are deliberately loose (the medium capsule wraps a ~2 m hull in an
 * `r=0.5` cylinder plus an `r=0.89` sphere), so this aims for "good enough envelope", not a
 * minimum-volume hull. Automatic decomposition into N optimal primitives is out of scope:
 * one primitive per invocation, driven by what the user selected.
 */

import type { ColliderShape, Vec3 } from './types';
import { normalizeColliderSize } from './colliderSize';

/** A quaternion as `[x, y, z, w]` — the same packing `ComputedBounds.quaternion` uses. */
export type Quat = readonly [number, number, number, number];

export const IDENTITY_QUAT: Quat = [0, 0, 0, 1];

export interface ColliderFit {
  /** Shape centre, in the same space the input points were given in. */
  position: Vec3;
  /** Shape orientation in that space. */
  quaternion: Quat;
  /** Outer size in meters, already normalized for the shape. */
  size: Vec3;
}

/** Rotates `v` by `q`. */
function rotate(v: Vec3, q: Quat): Vec3 {
  const [x, y, z, w] = q;
  // t = 2·(q_vec × v); v' = v + w·t + q_vec × t
  const tx = 2 * (y * v.z - z * v.y);
  const ty = 2 * (z * v.x - x * v.z);
  const tz = 2 * (x * v.y - y * v.x);
  return {
    x: v.x + w * tx + (y * tz - z * ty),
    y: v.y + w * ty + (z * tx - x * tz),
    z: v.z + w * tz + (x * ty - y * tx),
  };
}

function conjugate(q: Quat): Quat {
  return [-q[0], -q[1], -q[2], q[3]];
}

function multiply(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

const HALF_SQRT2 = Math.SQRT1_2;

/**
 * Rotation taking the shape's local +Y (KSA's cylinder/capsule axis) onto a local frame
 * axis. The SIGN is irrelevant — an axis is a line, and both cylinder ends are alike.
 */
const AXIS_ALIGN: Record<'x' | 'y' | 'z', Quat> = {
  x: [0, 0, -HALF_SQRT2, HALF_SQRT2], // RotZ(−90°): +Y → +X
  y: IDENTITY_QUAT,
  z: [HALF_SQRT2, 0, 0, HALF_SQRT2], // RotX(+90°): +Y → +Z
};

/**
 * Fits `shape` around `points`.
 *
 * @param frame  the space to fit in — typically the last-selected placement's world
 *               rotation (so a rotated tank gets a rotated cylinder), or identity for a
 *               world-aligned fit.
 * @param margin fractional inset (negative) / outset (positive) applied to every
 *               dimension, e.g. `-0.007` to shave the ~0.7% Core habitually shaves off a
 *               mesh AABB. Default 0.
 * @returns null when there is nothing to fit.
 */
export function fitCollider(
  shape: ColliderShape,
  points: readonly Vec3[],
  frame: Quat = IDENTITY_QUAT,
  margin = 0,
): ColliderFit | null {
  if (points.length === 0) return null;

  // Work in the frame's local space; the AABB there is the oriented box in world space.
  const inv = conjugate(frame);
  const local = points.map((p) => rotate(p, inv));
  const min = { ...local[0] };
  const max = { ...local[0] };
  for (const p of local) {
    min.x = Math.min(min.x, p.x);
    min.y = Math.min(min.y, p.y);
    min.z = Math.min(min.z, p.z);
    max.x = Math.max(max.x, p.x);
    max.y = Math.max(max.y, p.y);
    max.z = Math.max(max.z, p.z);
  }
  const centre: Vec3 = {
    x: (min.x + max.x) / 2,
    y: (min.y + max.y) / 2,
    z: (min.z + max.z) / 2,
  };
  const extents: Vec3 = { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z };
  const grow = 1 + margin;
  const position = rotate(centre, frame);

  if (shape === 'Box') {
    return finish(shape, position, frame, {
      x: extents.x * grow,
      y: extents.y * grow,
      z: extents.z * grow,
    });
  }

  if (shape === 'Sphere') {
    let r = 0;
    for (const p of local) {
      const dx = p.x - centre.x;
      const dy = p.y - centre.y;
      const dz = p.z - centre.z;
      r = Math.max(r, Math.hypot(dx, dy, dz));
    }
    const d = 2 * r * grow;
    // A sphere is rotation-invariant, so keep it axis-aligned rather than inheriting the
    // frame — an arbitrary rotation on a sphere is noise in the exported XML.
    return finish(shape, position, IDENTITY_QUAT, { x: d, y: d, z: d });
  }

  // Cylinder / capsule: the longest AABB axis is the barrel axis.
  const axis: 'x' | 'y' | 'z' =
    extents.y >= extents.x && extents.y >= extents.z ? 'y' : extents.x >= extents.z ? 'x' : 'z';
  const perp: ['x' | 'y' | 'z', 'x' | 'y' | 'z'] =
    axis === 'y' ? ['x', 'z'] : axis === 'x' ? ['y', 'z'] : ['x', 'y'];
  let r = 0;
  for (const p of local) {
    r = Math.max(r, Math.hypot(p[perp[0]] - centre[perp[0]], p[perp[1]] - centre[perp[1]]));
  }
  const length = extents[axis] * grow;
  const diameter = 2 * r * grow;
  const quaternion = multiply(frame, AXIS_ALIGN[axis]);
  // Both shapes take the OUTER height: normalizeColliderSize clamps a capsule shorter than
  // its diameter up to a sphere, and colliderSize subtracts the caps at emit time.
  return finish(shape, position, quaternion, { x: diameter, y: length, z: diameter });
}

function finish(shape: ColliderShape, position: Vec3, quaternion: Quat, size: Vec3): ColliderFit {
  return { position, quaternion, size: normalizeColliderSize(shape, size) };
}
