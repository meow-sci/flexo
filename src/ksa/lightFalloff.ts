/**
 * The ONE place that knows KSA's light falloff — a verbatim port of the clustered
 * light pre-pass attenuation that lights part meshes in-game, powering the editor's
 * coverage visualization. This file is a **ported-math game contract**: re-verify it
 * against the sources below on every game update (scope/GAME_UPDATE_CHECKLIST.md).
 *
 * Sources (`ksa-game-assemblies/current`, build 2026.7.9.5018):
 *  - `Content/Core/Shaders/Lighting/LightPrePass.comp:274-297` — THE attenuation
 *    math: distance window + squared spot edge (epsilon constants at `:35-38`).
 *  - `Content/Core/Shaders/Lighting/LightData.glsl:19-30` — the GPU light struct:
 *    `innerAngle`/`outerAngle` arrive as COSINES (packed on the CPU by
 *    `Light.CreateLightData`, `decomp/KSA.Rendering.Lighting/Light.cs:97-101`),
 *    with a 0 sentinel for point lights.
 *  - `decomp/KSA.Rendering.Lighting/Light.cs:54-79` — `CreateSpotLight`'s angle
 *    sanitizer (swap, THEN clamp outer, THEN clamp inner; the clamp constants live
 *    at `Light.cs:10-12`).
 *
 * The exact formulas (plans/LIGHT_MANAGEMENT_PLAN.md §1.4 — the ONLY falloff model
 * flexo draws; no other approximation):
 *
 * ```
 * E(d)    = Intensity · saturate(1 − (d/Range)⁴) / d²                      (illuminance at distance d)
 * spot(θ) = saturate( (cosθ − cos(Outer)) / (cos(Inner) − cos(Outer)) )²   (1 inside inner cone, 0 outside outer)
 * E_spot  = E(d) · spot(θ)
 * ```
 *
 * `E` is monotonically decreasing and EXACTLY 0 at `d = Range` (the hard boundary
 * sphere); the spot term is exactly 1 inside the inner cone and exactly 0 on and
 * outside the outer cone — so the range sphere and both cones are true iso-surfaces
 * of the in-game light, not decoration.
 *
 * Pure and framework-free, following the `ivaSeatAxes.ts` discipline: no three.js.
 */

/**
 * Spot outer-cone half-angle ceiling, radians (≈89.943°) — `MAX_OUTER_ANGLE`,
 * `decomp/KSA.Rendering.Lighting/Light.cs:10`. Core's own `OuterAngle=1.57`
 * floodlights exceed it and rely on the runtime clamp.
 */
export const MAX_OUTER_ANGLE_RAD = 1.5697963;

/**
 * Spot outer-cone half-angle floor, radians — `MIN_OUTER_ANGLE`,
 * `decomp/KSA.Rendering.Lighting/Light.cs:12`.
 */
export const MIN_OUTER_ANGLE_RAD = 1e-5;

/** `SPOT_DENOM_EPSILON` (`LightPrePass.comp:38`) — the spot-edge denominator floor. */
const SPOT_DENOM_EPSILON = 1e-4;

/**
 * flexo's d² floor. The GPU floors the squared distance at `DIST_EPSILON = 1e-12`
 * (`LightPrePass.comp:36`), which puts E(0) at ~10¹²·Intensity; flexo floors at 1e-6
 * so the on-axis value stays display-scale finite. Identical for every d ≥ 1e-3 m.
 */
const DIST_SQ_FLOOR = 1e-6;

/** GLSL `saturate` — clamp to [0, 1]. */
function saturate(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * `Light.CreateSpotLight`'s angle sanitizer, verbatim
 * (`decomp/KSA.Rendering.Lighting/Light.cs:54-79`): **swap** when `inner > outer`,
 * THEN clamp outer to [{@link MIN_OUTER_ANGLE_RAD}, {@link MAX_OUTER_ANGLE_RAD}],
 * THEN clamp inner to [0, outer] — the order matters. flexo stores and emits what
 * the user authors; the VISUALIZATION runs through this so it always shows what the
 * game will do (plan D12), and `lightValidation` flags the swap case.
 */
export function clampSpotAngles(
  innerRad: number,
  outerRad: number,
): { innerRad: number; outerRad: number } {
  const swap = innerRad > outerRad;
  const rawInner = swap ? outerRad : innerRad;
  const rawOuter = swap ? innerRad : outerRad;
  const outer = Math.min(Math.max(rawOuter, MIN_OUTER_ANGLE_RAD), MAX_OUTER_ANGLE_RAD);
  const inner = Math.min(Math.max(rawInner, 0), outer);
  return { innerRad: inner, outerRad: outer };
}

/**
 * Illuminance at distance `d` meters from the light, before any spot term:
 * `E(d) = intensity · saturate(1 − (d/range)⁴) / max(d², 1e-6)` —
 * `LightPrePass.comp:281-284` (`rangeAtt`, times `light.intensity` from `:296`).
 *
 * Exactly 0 when `rangeM <= 0`. The decisive cull for those is CPU-side —
 * `ClusteredLightSystem.cs:669` (`!inLight.Range.IsNearlyZero()`) and `:760`
 * (`!(light.Range <= 0f) && !(light.Intensity <= 0f)`) — a range-0 light never
 * reaches the GPU. (The shader-side `step(RANGE_EPSILON, …)` at `:284` would
 * DISABLE the window — windowless 1/d² — and `TileFrustum.glsl:53`'s
 * `inRange <= 0` branch is an apex-containment test, not a reject; neither is the
 * cull.) Also exactly 0 for every `d >= rangeM` (the window is 0 on the range
 * sphere). Finite at `d = 0` thanks to the d² floor, and monotonically decreasing
 * over (0, range).
 */
export function lightIlluminance(d: number, rangeM: number, intensity: number): number {
  if (rangeM <= 0 || d >= rangeM) return 0;
  const x2 = (d * d) / (rangeM * rangeM);
  const win = saturate(1 - x2 * x2);
  return (intensity * win) / Math.max(d * d, DIST_SQ_FLOOR);
}

/**
 * The spot angular term, ALREADY squared — `LightPrePass.comp:290-294`:
 * `s = saturate((cosθ − cos(outer)) / max(cos(inner) − cos(outer), 1e-4)); s²`.
 *
 * `cosTheta` is the cosine of the angle between the aim axis and the light→point
 * direction (the shader's `dot(light.direction, -lightDir)`). The angles are RAW
 * radians — the cosine packing the GPU receives (`LightData.glsl:23,26`,
 * `Light.cs:97-101`) happens here. NO angle sanitizing is applied; callers wanting
 * game parity pass {@link clampSpotAngles} output. Exactly 1 inside the inner cone,
 * exactly 0 on and outside the outer cone; out-of-range `cosTheta` just saturates.
 */
export function spotAttenuation(cosTheta: number, innerRad: number, outerRad: number): number {
  const denom = Math.max(Math.cos(innerRad) - Math.cos(outerRad), SPOT_DENOM_EPSILON);
  const s = saturate((cosTheta - Math.cos(outerRad)) / denom);
  return s * s;
}
