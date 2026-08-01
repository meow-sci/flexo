import { clampSpotAngles, lightIlluminance } from '../ksa/lightFalloff';

/**
 * The **pure** half of the light coverage visualization (plans/LIGHT_MANAGEMENT_PLAN.md
 * §3.6): where the falloff shells sit, and what display exposure the shader curve uses.
 * Deliberately free of three.js — the sampling scheme and the exposure derivation are
 * the parts worth unit-testing, and they must be testable without a WebGL context
 * ({@link import('./LightObject').LightObject} owns everything that needs three).
 *
 * The visual is a stack of {@link SHELL_COUNT} concentric spheres, each shaded with
 * KSA's exact attenuation ({@link import('../ksa/lightFalloff')}) evaluated at the
 * fragment's own distance/angle. Each shell is therefore EXACT at its own radius; the
 * stack reads as a graded volume (and, for a Spot, as a spherical-cap beam) with no
 * cone geometry and no wide-angle degeneracy.
 *
 * The tail of the file is the same story for the OPTIONAL live preview (§3.10): the
 * KSA-cone → `THREE.SpotLight` parameter mapping and the {@link MAX_PREVIEW_LIGHTS}
 * instance budget, kept here for the same reason — they are the parts worth pinning.
 */

/** Concentric shells per light. Enough to read as a gradient, cheap enough for 10+ lights. */
export const SHELL_COUNT = 16;

/**
 * Peak alpha of ONE shell. The shells blend additively, so a fully saturated view ray
 * through all {@link SHELL_COUNT} of them sums to ≲1.6 — bright, but not blown out.
 */
export const SHELL_MAX_ALPHA = 1.6 / SHELL_COUNT;

/** Where the auto exposure probes the light, as a fraction of its range (§3.6). */
const AUTO_EXPOSURE_SAMPLE = 0.2;

/** Floor for the probed illuminance, so a degenerate light still yields a finite knee. */
const MIN_AUTO_ILLUMINANCE = 1e-3;

/**
 * Divisor applied to the probed illuminance. Putting the knee BELOW the probe value
 * lands the 0.2·R sample at E/(E+E₀) = 0.75, i.e. the visible gradient is spent on the
 * light's own working range instead of saturating at the source.
 */
const AUTO_EXPOSURE_DIVISOR = 3;

/** Absolute-mode floor: `E/(E+E₀)` is 0/0 at the range boundary when E₀ is 0. */
const MIN_EXPOSURE = 1e-6;

/**
 * Radii of the falloff shells for a light of range `rangeM`, innermost first:
 * `s_i = ((i + 0.5) / SHELL_COUNT) · rangeM`.
 *
 * Cell-CENTERED sampling — the first shell sits half a step off the singularity at
 * `d = 0` (where `1/d²` blows up) and the last sits half a step inside the range
 * sphere (where illuminance is exactly 0 and a shell would draw nothing). A
 * non-positive or non-finite range yields **no shells at all**: KSA culls those
 * lights CPU-side (`ClusteredLightSystem.cs:669,760`), so drawing coverage for one
 * would be a lie.
 */
export function shellRadii(rangeM: number): number[] {
  if (!Number.isFinite(rangeM) || rangeM <= 0) return [];
  const out: number[] = [];
  for (let i = 0; i < SHELL_COUNT; i++) out.push(((i + 0.5) / SHELL_COUNT) * rangeM);
  return out;
}

/**
 * The auto-mode Reinhard knee `E₀` for one light: the illuminance a fifth of the way
 * out, over {@link AUTO_EXPOSURE_DIVISOR}. Scales with the light, so every light spans
 * the full gradient regardless of its absolute intensity — Core's I=0.05 interior point
 * light and its I=10 spotlight both read (a single fixed reference makes the former
 * invisible, which is honest but useless while editing it).
 */
export function autoExposure(rangeM: number, intensity: number): number {
  const probe = lightIlluminance(AUTO_EXPOSURE_SAMPLE * rangeM, rangeM, intensity);
  return Math.max(probe, MIN_AUTO_ILLUMINANCE) / AUTO_EXPOSURE_DIVISOR;
}

/**
 * The `uExposure` uniform for a light: {@link autoExposure} in `'auto'` mode (per-light
 * normalisation — best for editing one light), or the user's fixed `vizExposure` in
 * `'absolute'` mode (brightness comparable ACROSS lights — best for judging which of
 * several actually lights a surface). Always strictly positive.
 */
export function volumeExposure(
  rangeM: number,
  intensity: number,
  mode: 'auto' | 'absolute',
  vizExposure: number,
): number {
  if (mode === 'absolute') {
    return Number.isFinite(vizExposure) ? Math.max(vizExposure, MIN_EXPOSURE) : MIN_EXPOSURE;
  }
  return Math.max(autoExposure(rangeM, intensity), MIN_EXPOSURE);
}

// ── Live lighting preview (plans/LIGHT_MANAGEMENT_PLAN.md §3.10) ─────────────────────
// The pure half of the OTHER light visualization: real three.js lights hung off the
// markers. Everything below is the KSA-field → three.js-parameter mapping and the
// instance budget — no three.js types, so it unit-tests without a WebGL context.

/**
 * How many light INSTANCES may carry a real three.js preview light at once. Each one
 * adds a `NUM_POINT_LIGHTS`/`NUM_SPOT_LIGHTS` define to every material, so the whole
 * scene re-links its shader programs whenever the count changes; 16 is generous for a
 * part while keeping the toggle responsive (and the WebGL uniform budget comfortable).
 */
export const MAX_PREVIEW_LIGHTS = 16;

/**
 * three's `SpotLight.penumbra` for a KSA cone: the fraction of the outer half-angle the
 * soft edge occupies. three's spot term is
 * `smoothstep(cos(angle), cos(angle · (1 − penumbra)), cosθ)`, so `penumbra = 1 −
 * inner/outer` puts the fully-lit core at exactly KSA's inner angle — the shape matches,
 * the curve does not (smoothstep vs KSA's SQUARED linear-in-cosine ramp; see
 * {@link import('../ksa/lightFalloff').spotAttenuation}).
 *
 * Angles are expected ALREADY SANITIZED ({@link clampSpotAngles}) — pass raw authored
 * ones through {@link spotPreviewCone} instead. A non-positive (or non-finite) outer
 * angle yields 0 rather than a division blowing up into `NaN`, which would silently make
 * three drop the whole spot.
 */
export function spotPenumbra(innerRad: number, outerRad: number): number {
  if (!Number.isFinite(outerRad) || outerRad <= 0) return 0;
  const p = 1 - innerRad / outerRad;
  if (!Number.isFinite(p)) return 0;
  return p < 0 ? 0 : p > 1 ? 1 : p;
}

/**
 * The full authored-cone → three.js mapping: KSA's own angle sanitizer
 * ({@link clampSpotAngles} — swap, clamp outer to ≤1.5697963 rad, clamp inner into it)
 * followed by {@link spotPenumbra}. The SAME clamped angles the coverage shells and the
 * boundary wireframe use, so the preview's lit footprint and the wireframe cone agree.
 */
export function spotPreviewCone(
  innerRad: number,
  outerRad: number,
): { angleRad: number; penumbra: number } {
  const clamped = clampSpotAngles(innerRad, outerRad);
  return { angleRad: clamped.outerRad, penumbra: spotPenumbra(clamped.innerRad, clamped.outerRad) };
}

/** {@link planPreviewBudget}'s answer: how many instances of each light to light up. */
export interface PreviewBudget {
  /** Per light, in document order: how many of its instances get a preview light. */
  perLight: number[];
  /** Total preview lights the plan enables (≤ the cap). */
  enabled: number;
  /** Total light instances offered. */
  total: number;
}

/**
 * Spends the {@link MAX_PREVIEW_LIGHTS} budget over the document's lights, **in document
 * order**, counting INSTANCES rather than documents: a SubPart-owned light placed 5 times
 * is 5 lights in-game and 5 preview lights here, so it spends 5 of the budget (and may be
 * partially funded — the first k of its instances light up, the rest stay markers).
 *
 * `instanceCounts[i]` is how many visuals light `i` has. Negative/non-finite counts are
 * treated as 0 so a bad input can never hand three a negative index.
 */
export function planPreviewBudget(
  instanceCounts: readonly number[],
  cap: number = MAX_PREVIEW_LIGHTS,
): PreviewBudget {
  const budget = Number.isFinite(cap) ? Math.max(Math.floor(cap), 0) : 0;
  const perLight: number[] = [];
  let enabled = 0;
  let total = 0;
  for (const raw of instanceCounts) {
    const count = Number.isFinite(raw) ? Math.max(Math.floor(raw), 0) : 0;
    total += count;
    const take = Math.min(count, budget - enabled);
    perLight.push(take);
    enabled += take;
  }
  return { perLight, enabled, total };
}
