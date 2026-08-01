/**
 * The ONE place that knows how an IVA seat's stored rotation maps onto KSA's
 * `<ForwardAxis>` / `<UpAxis>` pair, and back.
 *
 * `IVASeatTemplate` (`decomp/KSA/IVASeat.cs`) has no rotation element at all: a seat's
 * orientation is authored as two direction vectors, which the game feeds to
 * `Camera.LookAtRotation` (`decomp/KSA/Camera.cs:190-196`). flexo edits seats with the same
 * position/rotation/scale gizmo everything else uses, so import and export have to convert
 * between the two representations — and that conversion must stay in exactly one place.
 *
 * Pure and framework-free, following the `colliderFit.ts` precedent: hand-rolled quaternion
 * and matrix math, no three.js import. `ivaSeatAxes.test.ts` locks the result bit-for-bit
 * against `src/three/coords.ts` so the `EULER_ORDER` calibration knob stays singular.
 *
 * The local axes below are chosen to equal KSA's own schema defaults, so an un-rotated seat
 * is byte-identical to Core's authoring (identity rotation ⇒ forward `+X`, up `−Z`), and so
 * "facing = local +X" matches what flexo already draws for connectors.
 */

import type { EulerXYZ, Vec3 } from './types';
import type { Quat } from './colliderFit';

/** A seat's local FORWARD axis. Matches `IVASeatTemplate.ForwardAxisAsmb`'s default. */
export const SEAT_LOCAL_FORWARD: Readonly<Vec3> = { x: 1, y: 0, z: 0 };

/** A seat's local UP axis. Matches `IVASeatTemplate.UpAxisAsmb`'s default. */
export const SEAT_LOCAL_UP: Readonly<Vec3> = { x: 0, y: 0, z: -1 };

/**
 * Rotates `v` by `q`. Duplicated from `colliderFit.ts` rather than widening that module's
 * API — it is 8 lines of standard quaternion-rotate.
 */
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

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/** Unit-length `v`, or `null` when `v` is (near) zero — where KSA would produce NaN. */
function normalizeOrNull(v: Vec3): Vec3 | null {
  const len = Math.hypot(v.x, v.y, v.z);
  if (!(len > 1e-12)) return null;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/** Verbatim port of KSA's `QuaternionEx.CreateFromXyzRadians` → `[x, y, z, w]`. */
export function ksaQuatFromEulerXyz(r: EulerXYZ): Quat {
  const c1 = Math.cos(r.x / 2);
  const c2 = Math.cos(r.y / 2);
  const c3 = Math.cos(r.z / 2);
  const s1 = Math.sin(r.x / 2);
  const s2 = Math.sin(r.y / 2);
  const s3 = Math.sin(r.z / 2);
  return [
    -c1 * s2 * s3 + c2 * c3 * s1,
    c1 * c3 * s2 + s1 * c2 * s3,
    c1 * c2 * s3 - s1 * c3 * s2,
    c1 * c2 * c3 + s1 * s2 * s3,
  ];
}

/** The seat's `<ForwardAxis>` + `<UpAxis>` for a stored rotation. Both come out UNIT length. */
export function seatAxesFromRotation(rotation: EulerXYZ): { forward: Vec3; up: Vec3 } {
  const q = ksaQuatFromEulerXyz(rotation);
  return { forward: rotate(SEAT_LOCAL_FORWARD, q), up: rotate(SEAT_LOCAL_UP, q) };
}

/**
 * The stored rotation for an authored (`<ForwardAxis>`, `<UpAxis>`) pair, or `null` when the
 * pair is degenerate (either vector ~zero, or the two parallel — KSA NaNs the camera on both,
 * see scope/connectors-coordinates-iva.md).
 *
 * Orthonormalises the way `Camera.LookAtRotation` (`decomp/KSA/Camera.cs:190-196`) does, so a
 * sloppy non-perpendicular `<UpAxis>` round-trips to its orthogonalised equivalent: TEXTUALLY
 * different, SEMANTICALLY identical (the game derives the same camera frame either way).
 */
export function seatRotationFromAxes(forward: Vec3, up: Vec3): EulerXYZ | null {
  const f = normalizeOrNull(forward); // KSA: double3.Normalize(forwardEcl)
  if (!f) return null;
  const r = normalizeOrNull(cross(f, up)); // KSA: Cross(f, up).Normalized()  ← NaN if parallel
  if (!r) return null;
  const u = normalizeOrNull(cross(r, f)); // KSA: Cross(r, f).Normalized()
  if (!u) return null;

  // Basis COLUMNS are the images of the seat's local axes:
  //   local +X → f          (SEAT_LOCAL_FORWARD)
  //   local +Y → r          (because SEAT_LOCAL_FORWARD × SEAT_LOCAL_UP === +Y)
  //   local +Z → -u         (because SEAT_LOCAL_UP === local -Z)
  // Element names below are three.js Matrix4's m<row><col>. Only these six are needed —
  // the 'ZYX' extraction never touches m13/m23 (which would be -u.x / -u.y).
  const m11 = f.x;
  const m21 = f.y;
  const m31 = f.z;
  const m12 = r.x;
  const m22 = r.y;
  const m32 = r.z;
  const m33 = -u.z;

  // three.js Euler.setFromRotationMatrix(m, 'ZYX') — the SAME order coords.ts calibrates to
  // (EULER_ORDER = 'ZYX' ≡ KSA's "XYZ"; see docs/coordinates.md).
  const y = Math.asin(-Math.min(1, Math.max(-1, m31)));
  if (Math.abs(m31) < 0.9999999) {
    return { x: Math.atan2(m32, m33), y, z: Math.atan2(m21, m11) };
  }
  return { x: 0, y, z: Math.atan2(-m12, m22) };
}
