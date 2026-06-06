import * as THREE from 'three'
import { matrixFromTransform, transformFromMatrix } from '../three/coords'
import { evalBezierPoints, type BezierPoints } from './easing'
import { identityTransform } from './types'
import type { AnimationKeyframe, PartAnimation, Transform } from './types'

/**
 * Reverse-fits a DENSE imported animation (one baked keyframe per ~fps frame, e.g.
 * KSA's 230-key solar-panel deploy) back into a handful of editable keyframes plus
 * per-segment cubic-bézier easing — the inverse of the export re-baking in
 * {@link import('./animationRig').buildAnimationRig}.
 *
 * Per joint: scalarize the dominant moving channel (rotation angle / translation
 * projection), trim leading/trailing holds to an active window, fit a cubic-bézier to
 * the normalized progress, then GATE by reconstructing the full pose under that easing
 * and checking the residual in native units (degrees / metres). A joint that fits
 * collapses to {start, end} + easing; one that doesn't (multi-axis tumble, etc.) keeps
 * its dense keyframes. Joints' windows are unioned into the global keyframe set; where
 * another joint's boundary splits an eased window, the easing is SUBDIVIDED (de
 * Casteljau) so each sub-segment reproduces its slice of the original curve.
 *
 * This recovers a PERCEPTUALLY-EQUIVALENT easing within tolerance, not provably the
 * artist's literal curve. When nothing fits, the dense form round-trips losslessly.
 */

const POS_TOL = 4e-3 // 4 mm
// Per-joint LOCAL tolerance. Kept modest (not tiny) on purpose: the source is ~24fps
// LINEAR-baked (≈2° inter-frame chord error of its own), and chain joints amplify a
// local angle into tip position — chasing sub-degree fits just multiplies keyframes
// for no visible gain (endpoints are exact regardless). A few-cm transient mid-deploy
// on a multi-metre panel is imperceptible; favour a compact, editable result.
const ROT_TOL_DEG = 2.5
const SCALE_TOL = 3e-3
const CONST_POS_EPS = 1e-5
const CONST_ROT_EPS = 5e-4 // rad (~0.03°)
const HOLD_EPS = 0.002 // fraction of total motion treated as "not moving yet" (tight, so the
// trimmed leading/trailing hold ramp carries negligible reconstruction error)
const MIN_WINDOW_SAMPLES = 4
const TIME_EPS = 1e-6
const RAD2DEG = 180 / Math.PI
/** Max rotation per keyframe segment — beyond this, slerp's 180° arc is ambiguous, so
 *  a large turn is split into sub-segments (each an unambiguous, constant-axis slerp).
 *  Only the slerp-safety bound; fit QUALITY is handled by adaptive depth-splitting. */
const MAX_SEG_ANGLE_DEG = 120

interface Parts {
  pos: THREE.Vector3
  quat: THREE.Quaternion
  scale: THREE.Vector3
}

function toParts(t: Transform): Parts {
  const pos = new THREE.Vector3()
  const quat = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  matrixFromTransform(t).decompose(pos, quat, scale)
  return { pos, quat, scale }
}
function fromParts(p: Parts): Transform {
  return transformFromMatrix(new THREE.Matrix4().compose(p.pos, p.quat, p.scale))
}
function interpParts(a: Parts, b: Parts, alpha: number): Parts {
  return {
    pos: a.pos.clone().lerp(b.pos, alpha),
    quat: a.quat.clone().slerp(b.quat, alpha),
    scale: a.scale.clone().lerp(b.scale, alpha),
  }
}
/** Angle between two quaternions, in radians. */
function angleBetween(a: THREE.Quaternion, b: THREE.Quaternion): number {
  return 2 * Math.acos(Math.min(1, Math.abs(a.dot(b))))
}

// ── per-joint fit ───────────────────────────────────────────────────────────--

type JointFit =
  | { kind: 'const'; jointId: string; traj: Parts[] }
  | { kind: 'eased'; jointId: string; traj: Parts[]; ta: number; tb: number; segments: Segment[] }
  | { kind: 'dense'; jointId: string; traj: Parts[] }

/**
 * The scalar progress trajectory for the dominant moving channel, normalized so the NET
 * displacement spans the total. Returns null when there's no motion (constant). `total`
 * is ~0 for a there-and-back wobble (net-zero) — not reducible to one easing, so the
 * caller keeps such joints dense. `rotational` drives the slerp-arc splitting.
 */
function scalarTrajectory(traj: Parts[]): { values: number[]; total: number; rotational: boolean } | null {
  const n = traj.length
  let maxRotDev = 0
  for (const p of traj) maxRotDev = Math.max(maxRotDev, angleBetween(traj[0].quat, p.quat))
  const dir = traj[n - 1].pos.clone().sub(traj[0].pos)
  const posNet = dir.length()
  let maxPosDev = 0
  for (const p of traj) maxPosDev = Math.max(maxPosDev, p.pos.distanceTo(traj[0].pos))

  if (maxRotDev * RAD2DEG >= maxPosDev * 1000) {
    if (maxRotDev < CONST_ROT_EPS) return null // no motion anywhere → constant
    // Angle-from-start: monotonic for a single-axis turn ≤180° (the deploy-hinge case);
    // a net-zero there-and-back yields total≈0 below and is kept dense (can't ease it).
    const values = traj.map((p) => angleBetween(traj[0].quat, p.quat))
    return { values, total: values[n - 1], rotational: true }
  }
  if (maxPosDev < CONST_POS_EPS) return null
  if (posNet < CONST_POS_EPS) return { values: traj.map(() => 0), total: 0, rotational: false } // net-zero → dense
  dir.normalize()
  return { values: traj.map((p) => p.pos.clone().sub(traj[0].pos).dot(dir)), total: posNet, rotational: false }
}

/** The time in [times[lo],times[hi]] where the progress `w` first reaches `target`. */
function timeAtProgress(times: number[], w: number[], target: number, lo: number, hi: number): number {
  for (let i = lo; i < hi; i++) {
    if ((w[i] <= target && w[i + 1] >= target) || (w[i] >= target && w[i + 1] <= target)) {
      const dw = w[i + 1] - w[i]
      const f = Math.abs(dw) < 1e-9 ? 0 : (target - w[i]) / dw
      return times[i] + (times[i + 1] - times[i]) * f
    }
  }
  return times[hi]
}

/** One eased sub-segment [t0,t1] of a joint's active window, with its own bézier. */
interface Segment {
  t0: number
  t1: number
  easing: BezierPoints
}

const MAX_SEGMENT_DEPTH = 4

/** Linear-interpolates the normalized progress `w` at an arbitrary time. */
function wAt(times: number[], w: number[], t: number): number {
  const n = times.length
  if (t <= times[0]) return w[0]
  if (t >= times[n - 1]) return w[n - 1]
  let i = 0
  while (i < n - 1 && times[i + 1] <= t) i++
  return w[i] + (w[i + 1] - w[i]) * ((t - times[i]) / (times[i + 1] - times[i]))
}

/** Fits one bézier to the dense progress over [t0,t1], renormalized to its unit square. */
function fitOneSegment(times: number[], w: number[], t0: number, t1: number): BezierPoints {
  const w0 = wAt(times, w, t0)
  const dw = wAt(times, w, t1) - w0
  const ls = [0]
  const lw = [0]
  for (let j = 0; j < times.length; j++) {
    if (times[j] <= t0 + TIME_EPS || times[j] >= t1 - TIME_EPS) continue
    ls.push((times[j] - t0) / (t1 - t0))
    lw.push(Math.abs(dw) < 1e-9 ? 0 : (w[j] - w0) / dw)
  }
  ls.push(1)
  lw.push(1)
  return ls.length < 4 ? [0, 0, 1, 1] : fitBezier(ls, lw)
}

/** Worst rotation residual of slerping pose(t0)→pose(t1) by `easing` vs the dense data. */
function segmentRotErr(times: number[], traj: Parts[], t0: number, t1: number, easing: BezierPoints): number {
  const p0 = sampleTraj(times, traj, t0)
  const p1 = sampleTraj(times, traj, t1)
  let mr = 0
  for (let j = 0; j < times.length; j++) {
    if (times[j] < t0 - TIME_EPS || times[j] > t1 + TIME_EPS) continue
    const recon = interpParts(p0, p1, evalBezierPoints(easing, (times[j] - t0) / (t1 - t0)))
    mr = Math.max(mr, angleBetween(recon.quat, traj[j].quat))
  }
  return mr
}

/**
 * Splits the active window [ta,tb] into eased sub-segments, fitting an independent
 * bézier to each. A segment is split (at its progress midpoint) when its slerp arc
 * exceeds {@link MAX_SEG_ANGLE_DEG} (otherwise the arc is ambiguous) OR a single bézier
 * can't fit it within tolerance — giving the extra DOF real KSA easings need.
 */
function buildSegments(times: number[], w: number[], traj: Parts[], ta: number, tb: number, lo: number, hi: number): Segment[] {
  const recurse = (t0: number, t1: number, depth: number): Segment[] => {
    const easing = fitOneSegment(times, w, t0, t1)
    const arcDeg = angleBetween(sampleTraj(times, traj, t0).quat, sampleTraj(times, traj, t1).quat) * RAD2DEG
    const errDeg = segmentRotErr(times, traj, t0, t1, easing) * RAD2DEG
    if ((arcDeg <= MAX_SEG_ANGLE_DEG && errDeg <= ROT_TOL_DEG) || depth >= MAX_SEGMENT_DEPTH) return [{ t0, t1, easing }]
    const tm = timeAtProgress(times, w, (wAt(times, w, t0) + wAt(times, w, t1)) / 2, lo, hi)
    if (tm <= t0 + TIME_EPS || tm >= t1 - TIME_EPS) return [{ t0, t1, easing }]
    return [...recurse(t0, tm, depth + 1), ...recurse(tm, t1, depth + 1)]
  }
  return recurse(ta, tb, 0)
}

/**
 * The eased reconstruction of a joint's pose at time `t`: the REAL dense poses at the
 * bracketing segment boundaries slerped/lerped by that segment's bézier. Using real
 * poses (not window-endpoint interps) keeps large constant-axis turns exact; outside
 * [ta,tb] the assembly interpolates linearly, so we mirror that here.
 */
function reconstructEased(times: number[], traj: Parts[], ta: number, tb: number, segments: Segment[], t: number): Parts {
  const t0 = times[0]
  const tEnd = times[times.length - 1]
  if (t <= ta) {
    return ta > t0 ? interpParts(sampleTraj(times, traj, t0), sampleTraj(times, traj, ta), (t - t0) / (ta - t0)) : sampleTraj(times, traj, ta)
  }
  if (t >= tb) {
    return tEnd > tb ? interpParts(sampleTraj(times, traj, tb), sampleTraj(times, traj, tEnd), (t - tb) / (tEnd - tb)) : sampleTraj(times, traj, tb)
  }
  let seg = segments[0]
  for (const s of segments) if (t >= s.t0 - TIME_EPS) seg = s
  const e = evalBezierPoints(seg.easing, (t - seg.t0) / (seg.t1 - seg.t0))
  return interpParts(sampleTraj(times, traj, seg.t0), sampleTraj(times, traj, seg.t1), e)
}

/** Worst-case position/rotation residual of the eased reconstruction vs the dense data. */
function easedResidual(times: number[], traj: Parts[], ta: number, tb: number, segments: Segment[]): { pos: number; rot: number; scale: number } {
  let pos = 0
  let rot = 0
  let scale = 0
  for (let i = 0; i < times.length; i++) {
    const recon = reconstructEased(times, traj, ta, tb, segments, times[i])
    pos = Math.max(pos, recon.pos.distanceTo(traj[i].pos))
    rot = Math.max(rot, angleBetween(recon.quat, traj[i].quat))
    scale = Math.max(scale, recon.scale.distanceTo(traj[i].scale))
  }
  return { pos, rot, scale }
}

function fitJoint(jointId: string, times: number[], traj: Parts[]): JointFit {
  const scalar = scalarTrajectory(traj)
  if (!scalar) return { kind: 'const', jointId, traj }
  // Motion exists but net displacement ~0 (there-and-back) → not reducible to one easing.
  if (scalar.total < CONST_ROT_EPS) return { kind: 'dense', jointId, traj }

  const w = scalar.values.map((v) => v / scalar.total)
  const last = times.length - 1

  const attempt = (lo: number, hi: number): JointFit | null => {
    const ta = times[lo]
    const tb = times[hi]
    if (tb - ta < TIME_EPS) return null
    const segments = buildSegments(times, w, traj, ta, tb, lo, hi)
    const r = easedResidual(times, traj, ta, tb, segments)
    const ok = r.pos <= POS_TOL && r.rot * RAD2DEG <= ROT_TOL_DEG && r.scale <= SCALE_TOL
    if (ok) return { kind: 'eased', jointId, traj, ta, tb, segments }
    return null
  }

  // 1) Full range — a smooth ease compacts to the fewest keys.
  if (times[last] - times[0] > TIME_EPS) {
    const full = attempt(0, last)
    if (full) return full
  }
  // 2) Trim leading/trailing holds to the active window (staged motion).
  let lo = 0
  while (lo < last && Math.abs(w[lo]) < HOLD_EPS) lo++
  let hi = last
  while (hi > 0 && Math.abs(w[hi] - 1) < HOLD_EPS) hi--
  lo = Math.max(0, lo - 1)
  hi = Math.min(last, hi + 1)
  if (hi - lo >= MIN_WINDOW_SAMPLES) {
    const win = attempt(lo, hi)
    if (win) return win
  }
  return { kind: 'dense', jointId, traj }
}

// ── cubic-bézier least-squares fit (Levenberg–Marquardt) ───────────────────────

/** Solves a 4×4 system M·x = b by Gaussian elimination w/ partial pivot (null if singular). */
function solve4(M: number[][], b: number[]): number[] | null {
  const a = M.map((row, i) => [...row, b[i]])
  for (let col = 0; col < 4; col++) {
    let piv = col
    for (let r = col + 1; r < 4; r++) if (Math.abs(a[r][col]) > Math.abs(a[piv][col])) piv = r
    if (Math.abs(a[piv][col]) < 1e-14) return null
    ;[a[col], a[piv]] = [a[piv], a[col]]
    for (let r = 0; r < 4; r++) {
      if (r === col) continue
      const f = a[r][col] / a[col][col]
      for (let c = col; c <= 4; c++) a[r][c] -= f * a[col][c]
    }
  }
  return [a[0][4] / a[0][0], a[1][4] / a[1][1], a[2][4] / a[2][2], a[3][4] / a[3][3]]
}

/** Newton solve for the bézier parameter p with X(p)=x given x1,x2 (clamped [0,1]). */
function paramForX(x1: number, x2: number, x: number): number {
  let p = x
  for (let i = 0; i < 12; i++) {
    const mt = 1 - p
    const fx = 3 * mt * mt * p * x1 + 3 * mt * p * p * x2 + p * p * p - x
    if (Math.abs(fx) < 1e-7) break
    const d = 3 * mt * mt * x1 + 6 * mt * p * (x2 - x1) + 3 * p * p * (1 - x2)
    if (Math.abs(d) < 1e-9) break
    p = Math.min(1, Math.max(0, p - fx / d))
  }
  return p
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** Seeds spanning common easing shapes — LM can get trapped, so we multi-start. */
const FIT_SEEDS: number[][] = [
  [1 / 3, 1 / 3, 2 / 3, 2 / 3], // linear
  [0.42, 0, 1, 1], // ease-in
  [0, 0, 0.58, 1], // ease-out
  [0.42, 0, 0.58, 1], // ease-in-out
  [0.25, 0.1, 0.25, 1], // CSS ease
  [0.6, 0.04, 0.98, 0.34], // strong ease-in
  [0.5, 0, 0.5, 1], // symmetric
]

/** One Levenberg–Marquardt run from a seed; returns the fit and its sum-of-squares. */
function lmFit(s: number[], w: number[], seed: number[]): { points: BezierPoints; cost: number } {
  const n = s.length
  const evalP = (p: number[], x: number) => evalBezierPoints([clamp01(p[0]), p[1], clamp01(p[2]), p[3]], x)
  const residuals = (p: number[]) => {
    const r = new Array<number>(n)
    for (let i = 0; i < n; i++) r[i] = evalP(p, s[i]) - w[i]
    return r
  }
  const cost = (r: number[]) => r.reduce((c, v) => c + v * v, 0)

  let p = [...seed]
  let r = residuals(p)
  let c = cost(r)
  let lambda = 1e-3
  const eps = 1e-6
  for (let iter = 0; iter < 60 && c > 1e-12; iter++) {
    const J: number[][] = [] // J[k][i] = ∂r_i/∂p_k (central differences)
    for (let k = 0; k < 4; k++) {
      const pp = [...p]
      pp[k] += eps
      const rp = residuals(pp)
      const pm = [...p]
      pm[k] -= eps
      const rm = residuals(pm)
      J.push(rp.map((v, i) => (v - rm[i]) / (2 * eps)))
    }
    const A: number[][] = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]
    const g = [0, 0, 0, 0]
    for (let a = 0; a < 4; a++) {
      for (let b = 0; b < 4; b++) {
        let sum = 0
        for (let i = 0; i < n; i++) sum += J[a][i] * J[b][i]
        A[a][b] = sum
      }
      let gg = 0
      for (let i = 0; i < n; i++) gg += J[a][i] * r[i]
      g[a] = gg
    }
    let improved = false
    for (let tries = 0; tries < 8; tries++) {
      const M = A.map((row, i) => row.map((v, j) => (i === j ? v * (1 + lambda) : v)))
      const d = solve4(M, g.map((v) => -v))
      if (d) {
        const pn = p.map((v, i) => v + d[i])
        const cn = cost(residuals(pn))
        if (cn < c) {
          p = pn
          r = residuals(pn)
          c = cn
          lambda = Math.max(lambda * 0.5, 1e-10)
          improved = true
          break
        }
      }
      lambda *= 4
    }
    if (!improved) break
  }
  return { points: [clamp01(p[0]), p[1], clamp01(p[2]), p[3]], cost: c }
}

/**
 * Fits cubic-bézier control points (x1,y1,x2,y2) to monotonic (s,w) samples — the
 * residual is easing(s_i) − w_i (the easing solves X(p)=s_i, then returns Y(p)).
 * Multi-starts {@link lmFit} from several seeds and keeps the best, since LM alone gets
 * trapped on asymmetric curves. x-handles stay in [0,1] (monotonic time); y is free.
 */
export function fitBezier(s: number[], w: number[]): BezierPoints {
  let best = lmFit(s, w, FIT_SEEDS[0])
  for (let i = 1; i < FIT_SEEDS.length; i++) {
    const cand = lmFit(s, w, FIT_SEEDS[i])
    if (cand.cost < best.cost) best = cand
  }
  return best.points
}

// ── de Casteljau subdivision (split an eased window at interior boundaries) ─────

type P2 = [number, number]
const lerpP = (a: P2, b: P2, t: number): P2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

/** The control polygon of the cubic over parameter sub-range [t0,t1]. */
function bezierSegment(P: [P2, P2, P2, P2], t0: number, t1: number): [P2, P2, P2, P2] {
  const splitRight = (cp: [P2, P2, P2, P2], t: number): [P2, P2, P2, P2] => {
    const a = lerpP(cp[0], cp[1], t)
    const b = lerpP(cp[1], cp[2], t)
    const c = lerpP(cp[2], cp[3], t)
    const d = lerpP(a, b, t)
    const e = lerpP(b, c, t)
    const f = lerpP(d, e, t)
    return [f, e, c, cp[3]] // curve over [t,1]
  }
  const splitLeft = (cp: [P2, P2, P2, P2], t: number): [P2, P2, P2, P2] => {
    const a = lerpP(cp[0], cp[1], t)
    const b = lerpP(cp[1], cp[2], t)
    const c = lerpP(cp[2], cp[3], t)
    const d = lerpP(a, b, t)
    const e = lerpP(b, c, t)
    const f = lerpP(d, e, t)
    return [cp[0], a, d, f] // curve over [0,t]
  }
  const left = splitLeft(P, t1) // [0, t1]
  return splitRight(left, t1 > 0 ? t0 / t1 : 0) // → [t0, t1]
}

/**
 * The easing for a time sub-range [s0,s1] of a full easing curve, renormalized to its
 * own unit square — so a window split by a neighboring keyframe still reproduces the
 * original motion exactly. Returns linear if degenerate.
 */
export function subdivideEasing(full: BezierPoints, s0: number, s1: number): BezierPoints {
  const [x1, y1, x2, y2] = full
  const P: [P2, P2, P2, P2] = [
    [0, 0],
    [x1, y1],
    [x2, y2],
    [1, 1],
  ]
  const p0 = paramForX(x1, x2, s0)
  const p1 = paramForX(x1, x2, s1)
  if (p1 - p0 < 1e-6) return [0, 0, 1, 1]
  const seg = bezierSegment(P, p0, p1)
  const [r0, r1, r2, r3] = seg
  const dx = r3[0] - r0[0]
  const dy = r3[1] - r0[1]
  if (Math.abs(dx) < 1e-9 || Math.abs(dy) < 1e-9) return [0, 0, 1, 1]
  const nx1 = (r1[0] - r0[0]) / dx
  const ny1 = (r1[1] - r0[1]) / dy
  const nx2 = (r2[0] - r0[0]) / dx
  const ny2 = (r2[1] - r0[1]) / dy
  return [Math.min(1, Math.max(0, nx1)), ny1, Math.min(1, Math.max(0, nx2)), ny2]
}

function isLinear(p: BezierPoints): boolean {
  return Math.abs(p[0]) < 1e-4 && Math.abs(p[1]) < 1e-4 && Math.abs(p[2] - 1) < 1e-4 && Math.abs(p[3] - 1) < 1e-4
}

// ── assembly ───────────────────────────────────────────────────────────────────

function round6(t: number): number {
  return Math.round(t * 1e6) / 1e6
}

/** Linear-samples a joint's dense trajectory at time `t`. */
function sampleTraj(times: number[], traj: Parts[], t: number): Parts {
  const n = times.length
  if (t <= times[0]) return traj[0]
  if (t >= times[n - 1]) return traj[n - 1]
  let i = 0
  while (i < n - 1 && times[i + 1] <= t) i++
  const alpha = (t - times[i]) / (times[i + 1] - times[i])
  return interpParts(traj[i], traj[i + 1], alpha)
}

/**
 * A joint's pose at a global keyframe time: the REAL dense pose (so every keyframe is
 * exact data). The per-segment easing — applied at preview/export — reproduces the
 * in-between motion. Constant joints hold their rest pose.
 */
function poseAt(fit: JointFit, times: number[], t: number): Parts {
  if (fit.kind === 'const') return fit.traj[0]
  return sampleTraj(times, fit.traj, t)
}

/**
 * Compresses a dense {@link PartAnimation} (as produced by the GLB importer) into a
 * compact eased one. Returns the input unchanged when it's already compact (≤2
 * keyframes) or when nothing about it benefits from fitting.
 */
export function fitAnimationEasing(anim: PartAnimation): PartAnimation {
  const dense = [...anim.keyframes].sort((a, b) => a.timeSec - b.timeSec)
  if (dense.length <= 2) return anim
  const times = dense.map((k) => k.timeSec)

  const fits = anim.joints.map((j) => fitJoint(j.id, times, dense.map((k) => toParts(k.poses[j.id] ?? identityTransform()))))

  // Global keyframe set: endpoints + every eased joint's segment boundaries (window
  // bounds plus large-turn / fit-quality splits); dense joints (rare) pin all times.
  const ctrl = new Set<number>([round6(times[0]), round6(times[times.length - 1])])
  for (const f of fits) {
    if (f.kind === 'eased') {
      for (const seg of f.segments) {
        ctrl.add(round6(seg.t0))
        ctrl.add(round6(seg.t1))
      }
    } else if (f.kind === 'dense') {
      for (const t of times) ctrl.add(round6(t))
    }
  }
  const gtimes = [...ctrl].sort((a, b) => a - b)
  if (gtimes.length >= times.length) return anim // no compaction possible

  const keyframes: AnimationKeyframe[] = gtimes.map((t, i) => ({ id: `${anim.id}_kf${i}`, timeSec: t, poses: {} }))

  for (const f of fits) {
    for (let i = 0; i < gtimes.length; i++) keyframes[i].poses[f.jointId] = fromParts(poseAt(f, times, gtimes[i]))
    if (f.kind !== 'eased') continue
    for (let i = 0; i < gtimes.length - 1; i++) {
      const g0 = gtimes[i]
      const g1 = gtimes[i + 1]
      // The joint segment containing this global span (segments tile [ta,tb]).
      const seg = f.segments.find((s) => g0 >= s.t0 - TIME_EPS && g1 <= s.t1 + TIME_EPS)
      if (!seg) continue // hold (outside the active window)
      const span = seg.t1 - seg.t0
      const sub = subdivideEasing(seg.easing, (g0 - seg.t0) / span, (g1 - seg.t0) / span)
      if (!isLinear(sub)) {
        const kf = keyframes[i]
        ;(kf.easings ??= {})[f.jointId] = { kind: 'cubicBezier', x1: sub[0], y1: sub[1], x2: sub[2], y2: sub[3] }
      }
    }
  }

  return { ...anim, keyframes }
}
