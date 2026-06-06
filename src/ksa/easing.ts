import type { EasingConfig, EasingPreset } from './types'

/**
 * CSS-style cubic-bézier easing — the shared representation for keyframe-segment
 * easing across authoring (the editor), preview/export sampling
 * ({@link import('./animationRig').sampleJointLocal}), and the reverse-fit importer
 * ({@link import('./easingFit')}).
 *
 * A curve is defined by two control points P1=(x1,y1), P2=(x2,y2) with the endpoints
 * fixed at P0=(0,0) and P3=(1,1) — exactly the CSS `cubic-bezier()` / Blender F-curve
 * model. To ease a linear progress `alpha` (= the x coordinate) we solve x(p)=alpha
 * for the curve parameter p, then return y(p). x MUST stay monotonic, so the editor
 * and fitter clamp x1,x2 ∈ [0,1]; y is free (overshoot >1 / anticipation <0 are valid
 * and produce a "bouncy" look — fine for lerp/slerp which simply extrapolate).
 */

/** Control-point tuple [x1, y1, x2, y2] with implicit endpoints (0,0) and (1,1). */
export type BezierPoints = readonly [number, number, number, number]

/** Named presets → cubic-bézier control points (CSS conventions; Penner-equivalent). */
export const EASING_PRESETS: Record<EasingPreset, BezierPoints> = {
  linear: [0, 0, 1, 1],
  easeIn: [0.42, 0, 1, 1],
  easeOut: [0, 0, 0.58, 1],
  easeInOut: [0.42, 0, 0.58, 1],
  easeInCubic: [0.32, 0, 0.67, 0],
  easeOutCubic: [0.33, 1, 0.68, 1],
  easeInOutCubic: [0.65, 0, 0.35, 1],
  easeInSine: [0.12, 0, 0.39, 0],
  easeOutSine: [0.61, 1, 0.88, 1],
  easeInOutSine: [0.37, 0, 0.63, 1],
}

const LINEAR: BezierPoints = [0, 0, 1, 1]
const NEWTON_ITERS = 8
const NEWTON_EPS = 1e-7
const BISECT_ITERS = 32

/** The control points for an easing config (linear if absent/unknown/NaN). */
export function controlPointsOf(cfg: EasingConfig | undefined | null): BezierPoints {
  if (!cfg) return LINEAR
  if (cfg.kind === 'preset') return EASING_PRESETS[cfg.preset] ?? LINEAR
  const { x1, y1, x2, y2 } = cfg
  if (![x1, y1, x2, y2].every(Number.isFinite)) return LINEAR
  return [x1, y1, x2, y2]
}

/** True when the config is (or resolves to) the linear identity curve. */
export function isLinearEasing(cfg: EasingConfig | undefined | null): boolean {
  const [x1, y1, x2, y2] = controlPointsOf(cfg)
  return x1 === 0 && y1 === 0 && x2 === 1 && y2 === 1
}

/** Cubic Bernstein value with P0=0, P3=1: B(t)=3(1-t)²t·c1 + 3(1-t)t²·c2 + t³. */
function bezier(t: number, c1: number, c2: number): number {
  const mt = 1 - t
  return 3 * mt * mt * t * c1 + 3 * mt * t * t * c2 + t * t * t
}

/** dB/dt for {@link bezier}. */
function bezierSlope(t: number, c1: number, c2: number): number {
  const mt = 1 - t
  return 3 * mt * mt * c1 + 6 * mt * t * (c2 - c1) + 3 * t * t * (1 - c2)
}

/** Solves x(p)=x for the curve parameter p ∈ [0,1] (Newton-Raphson + bisection). */
function solveForP(x: number, x1: number, x2: number): number {
  // Newton-Raphson from a good initial guess (x ≈ p for gentle curves).
  let t = x
  for (let i = 0; i < NEWTON_ITERS; i++) {
    const fx = bezier(t, x1, x2) - x
    if (Math.abs(fx) < NEWTON_EPS) return t
    const d = bezierSlope(t, x1, x2)
    if (Math.abs(d) < 1e-9) break
    t -= fx / d
    if (t < 0 || t > 1) break // left the domain — fall through to bisection
  }
  // Bisection fallback on [0,1] (x(p) is monotonic when x1,x2 ∈ [0,1]).
  let lo = 0
  let hi = 1
  for (let i = 0; i < BISECT_ITERS; i++) {
    t = (lo + hi) / 2
    const fx = bezier(t, x1, x2)
    if (Math.abs(fx - x) < NEWTON_EPS) return t
    if (fx < x) lo = t
    else hi = t
  }
  return t
}

/**
 * Warps a linear segment progress `alpha` ∈ [0,1] through the easing curve.
 * Returns `alpha` unchanged for linear/absent easing. The result may fall outside
 * [0,1] for overshooting curves (intended).
 */
export function evalEasing(cfg: EasingConfig | undefined | null, alpha: number): number {
  const [x1, y1, x2, y2] = controlPointsOf(cfg)
  if (x1 === 0 && y1 === 0 && x2 === 1 && y2 === 1) return alpha // linear fast-path
  if (alpha <= 0) return 0
  if (alpha >= 1) return 1
  const p = solveForP(alpha, x1, x2)
  return bezier(p, y1, y2)
}

/** Evaluates raw control points (used by the editor preview / fitter oracle). */
export function evalBezierPoints(points: BezierPoints, alpha: number): number {
  const [x1, y1, x2, y2] = points
  if (x1 === 0 && y1 === 0 && x2 === 1 && y2 === 1) return alpha
  if (alpha <= 0) return 0
  if (alpha >= 1) return 1
  return bezier(solveForP(alpha, x1, x2), y1, y2)
}
