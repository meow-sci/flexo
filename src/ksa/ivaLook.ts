/**
 * The two view clamps the in-game IVA camera applies to your look direction EVERY FRAME —
 * a verbatim port of `IVAController.OnFrame` (`decomp/KSA/IVAController.cs:80-108`).
 *
 * This is the whole reason `<ForwardAxis>` / `<UpAxis>` are authoring decisions rather than a
 * cosmetic initial heading: a seat can never look behind itself, and its pitch stops short of
 * the up pole. flexo's seat preview runs the same clamps so what the author sees is what the
 * game allows (plans/IVA_PLAN.md §1.3, §3.6).
 *
 * Pure and framework-free, following the `colliderFit.ts` / `ivaSeatAxes.ts` precedent:
 * hand-rolled vector math, no three.js import, no store imports.
 */

import type { Vec3 } from './types'

/** KSA's up-pole exclusion threshold: `|dot(look, UpAxisAsmb)| > 0.9` (`IVAController.cs:97`). */
export const IVA_UP_DOT_LIMIT = 0.9

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

function length(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z)
}

/** Verbatim `double3.NormalizeOrZero` (`Brutal.Numerics/double3.cs:545-553`) — zero stays zero. */
function normalizeOrZero(v: Vec3): Vec3 {
  const len = length(v)
  if (len === 0) return { x: 0, y: 0, z: 0 }
  return { x: v.x / len, y: v.y / len, z: v.z / len }
}

/** Verbatim `MathEx.SafeAcos` (`decomp/KSA/MathEx.cs:211-214`) — `acos` of the clamped input. */
function safeAcos(value: number): number {
  return Math.acos(Math.min(1, Math.max(-1, value)))
}

/**
 * Rodrigues rotation of `v` about a UNIT `axis` — the `QuaternionEx.CreateFromAxisAngle(axis, a)`
 * + `double3.Transform(rotation)` pair the controller uses, right-handed and in that order.
 */
function rotateAboutAxis(v: Vec3, axis: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const k = cross(axis, v)
  const d = dot(axis, v) * (1 - c)
  return {
    x: v.x * c + k.x * s + axis.x * d,
    y: v.y * c + k.y * s + axis.y * d,
    z: v.z * c + k.z * s + axis.z * d,
  }
}

/**
 * Clamps a candidate look direction the way the in-game IVA camera does, every frame:
 *  1. never more than 90° from `forward` (compared against the NORMALIZED forward axis);
 *  2. never closer than `acos(0.9) ≈ 25.84°` to `up` — compared against the **RAW** up axis,
 *     magnitude included, which is exactly why a non-unit `<UpAxis>` changes the usable pitch
 *     (see scope/connectors-coordinates-iva.md gotcha 3).
 * Returns a unit vector.
 *
 * Ported line-for-line from `IVAController.cs`:
 *
 * - `:81-82` `vector = ForwardAxis.Transform(…).Normalized()`, then
 *   `num2 = clamp(dot(look, vector), -1, 1)`. Note the forward axis IS normalized here.
 * - `:83-94` when `num2 < 0` the look is rotated by `acos(num2) − acos(0)` about
 *   `cross(look, forward).NormalizeOrZero()`, landing it EXACTLY 90° off forward. Both the
 *   zero-angle and the zero-axis guards are the C#'s own (`:89`), which is why a look exactly
 *   antiparallel to `forward` survives unchanged — the rotation axis degenerates.
 * - `:95-96` `vector2 = UpAxis.Transform(…)` with **no** `.Normalized()`, then
 *   `value = dot(look, vector2)`.
 * - `:97-108` when `|value| > 0.9` the look is rotated by
 *   `safeAcos(value) − safeAcos(0.9 · sign(value))` about `cross(look, up).NormalizeOrZero()`,
 *   under the same two guards (`:103`).
 *
 * Two consequences of that raw-`up` asymmetry, both intentional here:
 *
 * - The landing angle is `acos(0.9)` from the pole ONLY when `|up| == 1`. For `|up| == 2` the
 *   exclusion cone widens to `acos(0.45) ≈ 63.26°` (usable pitch ±~26.7°) and `safeAcos(value)`
 *   saturates, so ONE application under-corrects; the game converges over a few frames because
 *   it re-runs the clamp every frame. This function is a single application — it is NOT
 *   idempotent for a non-unit `up`, exactly like the game's per-frame step.
 * - For `|up| < 1/0.9` near the pole the clamp can never engage at all and the look reaches the
 *   pole outright. flexo therefore always EMITS unit axes and warns on a non-unit import.
 *
 * The C# re-checks nothing: clamp 2 runs once, after clamp 1, and clamp 1 is not re-tested
 * afterwards even though clamp 2 can push the look back out of the forward hemisphere.
 */
export function clampSeatLook(look: Vec3, forward: Vec3, up: Vec3): Vec3 {
  // In the game `double7` (`:80`) is `Double3Ex.Forward` rotated by a quaternion, so it is unit
  // by construction. flexo's callers compose a look from yaw/pitch, so normalize defensively —
  // both dot tests below are only meaningful against a unit look.
  let dir = normalizeOrZero(look)
  if (length(dir) === 0) {
    // Not reachable in the game (a zero `double7` cannot exist); fall back to the seat's facing.
    const f = normalizeOrZero(forward)
    return length(f) === 0 ? { x: 1, y: 0, z: 0 } : f
  }

  // --- Clamp 1: the forward hemisphere (`IVAController.cs:81-94`). ---
  const fwd = normalizeOrZero(forward)
  // The C# uses `.Normalized()`, which NaNs on a zero axis; flexo skips the clamp instead so a
  // degenerate authored `<ForwardAxis>` cannot poison the preview.
  if (length(fwd) !== 0) {
    const num2 = Math.min(1, Math.max(-1, dot(dir, fwd)))
    if (num2 < 0) {
      const num5 = safeAcos(num2) - safeAcos(0)
      const axis = normalizeOrZero(cross(dir, fwd))
      if (num5 !== 0 && length(axis) !== 0) dir = rotateAboutAxis(dir, axis, num5)
    }
  }

  // --- Clamp 2: the up-pole exclusion, against the RAW up axis (`IVAController.cs:95-108`). ---
  const value = dot(dir, up)
  if (Math.abs(value) > IVA_UP_DOT_LIMIT) {
    const num8 = safeAcos(value) - safeAcos(IVA_UP_DOT_LIMIT * Math.sign(value))
    const axis = normalizeOrZero(cross(dir, up))
    if (num8 !== 0 && length(axis) !== 0) dir = rotateAboutAxis(dir, axis, num8)
  }

  // Both rotations preserve length; re-normalize only to shed accumulated float drift.
  return normalizeOrZero(dir)
}
