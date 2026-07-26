import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { lightIlluminance, MAX_OUTER_ANGLE_RAD } from '../ksa/lightFalloff'
import {
  autoExposure,
  MAX_PREVIEW_LIGHTS,
  planPreviewBudget,
  SHELL_COUNT,
  SHELL_MAX_ALPHA,
  shellRadii,
  spotPenumbra,
  spotPreviewCone,
  volumeExposure,
} from './lightVolume'

/**
 * The testable half of the coverage visualization: where the shells sit, and what
 * display exposure they are shaded against. The reference lights are the shipped ones
 * from plans/LIGHT_MANAGEMENT_PLAN.md §1.5 — Core's SpotlightA (I=10, R=5) and the
 * CoreIVASpaceA interior point light (I=0.05, R=1.5), which is the light that justifies
 * the auto-exposure mode at all.
 */

describe('shellRadii', () => {
  it('lays 16 cell-CENTERED shells across the range (R=5)', () => {
    const radii = shellRadii(5)
    expect(radii).toHaveLength(SHELL_COUNT)
    // s_i = ((i + 0.5) / 16) · R — half a step off the 1/d² singularity at the source,
    // half a step inside the range sphere (where illuminance is exactly 0).
    expect(radii[0]).toBeCloseTo(0.15625, 12)
    expect(radii[SHELL_COUNT - 1]).toBeCloseTo(4.84375, 12)
    expect(radii[0]).toBeGreaterThan(0)
    expect(radii[SHELL_COUNT - 1]).toBeLessThan(5)
  })

  it('is strictly increasing and evenly spaced', () => {
    const radii = shellRadii(5)
    const step = 5 / SHELL_COUNT
    for (let i = 1; i < radii.length; i++) {
      expect(radii[i]).toBeGreaterThan(radii[i - 1])
      expect(radii[i] - radii[i - 1]).toBeCloseTo(step, 12)
    }
  })

  it('scales with the range', () => {
    expect(shellRadii(1.5)[0]).toBeCloseTo((0.5 / SHELL_COUNT) * 1.5, 12)
    expect(shellRadii(1.5)[SHELL_COUNT - 1]).toBeCloseTo((15.5 / SHELL_COUNT) * 1.5, 12)
  })

  it('draws NO shells for a degenerate range — KSA culls those lights CPU-side', () => {
    expect(shellRadii(0)).toEqual([])
    expect(shellRadii(-3)).toEqual([])
    expect(shellRadii(Number.NaN)).toEqual([])
    expect(shellRadii(Number.POSITIVE_INFINITY)).toEqual([])
  })

  it('every shell radius yields a finite, non-negative illuminance', () => {
    for (const r of shellRadii(5)) {
      const e = lightIlluminance(r, 5, 10)
      expect(Number.isFinite(e)).toBe(true)
      expect(e).toBeGreaterThan(0)
    }
  })
})

describe('SHELL_MAX_ALPHA', () => {
  it('lets a fully saturated view ray sum to ≲1.6 across the stack', () => {
    expect(SHELL_MAX_ALPHA * SHELL_COUNT).toBeCloseTo(1.6, 12)
  })
})

describe('autoExposure — the per-light Reinhard knee', () => {
  it('SpotlightA (I=10, R=5): E(1.0)=9.984 ⇒ E₀=3.328', () => {
    expect(lightIlluminance(1, 5, 10)).toBeCloseTo(9.984, 6)
    expect(autoExposure(5, 10)).toBeCloseTo(3.328, 6)
  })

  it('CoreIVASpaceA point light (I=0.05, R=1.5): E(0.3)=0.5547 ⇒ E₀≈0.1849', () => {
    expect(lightIlluminance(0.3, 1.5, 0.05)).toBeCloseTo(0.5547, 4)
    expect(autoExposure(1.5, 0.05)).toBeCloseTo(0.1849, 4)
  })

  it('normalises both reference lights to the SAME display value at 0.2·R', () => {
    // The whole point of the mode: E/(E+E₀) at the probe distance is 0.75 for every
    // light, so the I=0.05 interior light reads exactly as well as the I=10 spotlight.
    const display = (rangeM: number, intensity: number) => {
      const e = lightIlluminance(0.2 * rangeM, rangeM, intensity)
      return e / (e + autoExposure(rangeM, intensity))
    }
    expect(display(5, 10)).toBeCloseTo(0.75, 12)
    expect(display(1.5, 0.05)).toBeCloseTo(0.75, 12)
  })

  it('stays positive and finite for a degenerate light (no NaN in the shader)', () => {
    for (const [r, i] of [
      [0, 10],
      [-1, 10],
      [5, 0],
      [5, -2],
      [0, 0],
    ]) {
      const e0 = autoExposure(r, i)
      expect(Number.isFinite(e0)).toBe(true)
      expect(e0).toBeGreaterThan(0)
    }
  })
})

describe('volumeExposure', () => {
  it("'auto' derives the knee from the light itself", () => {
    expect(volumeExposure(5, 10, 'auto', 1)).toBeCloseTo(3.328, 6)
    expect(volumeExposure(1.5, 0.05, 'auto', 42)).toBeCloseTo(0.1849, 4)
  })

  it("'absolute' passes vizExposure through, ignoring the light", () => {
    expect(volumeExposure(5, 10, 'absolute', 1)).toBe(1)
    expect(volumeExposure(1.5, 0.05, 'absolute', 2.5)).toBe(2.5)
  })

  it('floors a 0/negative/non-finite absolute exposure so E/(E+E₀) never divides by 0', () => {
    expect(volumeExposure(5, 10, 'absolute', 0)).toBeGreaterThan(0)
    expect(volumeExposure(5, 10, 'absolute', -1)).toBeGreaterThan(0)
    expect(volumeExposure(5, 10, 'absolute', Number.NaN)).toBeGreaterThan(0)
  })
})

/**
 * The live preview's KSA→three.js cone mapping (plan §3.10). three's spot term is
 * `smoothstep(cos(angle), cos(angle·(1 − penumbra)), cosθ)`, so `penumbra = 1 −
 * inner/outer` places the fully-lit core at exactly KSA's inner angle — the SHAPE
 * matches even though the curve (smoothstep vs KSA's squared linear-in-cosine) does not.
 */
describe('spotPenumbra', () => {
  it("Core's SpotlightA (inner 22.5°, outer 45°) is half soft edge", () => {
    expect(spotPenumbra(Math.PI / 8, Math.PI / 4)).toBeCloseTo(0.5, 12)
  })

  it('inner == outer is a hard edge (penumbra 0)', () => {
    expect(spotPenumbra(0.7, 0.7)).toBe(0)
    expect(spotPenumbra(MAX_OUTER_ANGLE_RAD, MAX_OUTER_ANGLE_RAD)).toBe(0)
  })

  it('inner 0 is fully soft (penumbra 1) — no fully-lit core at all', () => {
    expect(spotPenumbra(0, Math.PI / 4)).toBe(1)
  })

  it('a non-positive or non-finite outer angle yields 0, never NaN', () => {
    // NaN would propagate into THREE.SpotLight.penumbra and take the whole spot with it.
    for (const outer of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const p = spotPenumbra(0.2, outer)
      expect(Number.isFinite(p)).toBe(true)
      expect(p).toBe(0)
    }
    expect(spotPenumbra(Number.NaN, 1)).toBe(0)
  })

  it('clamps into [0, 1] for an unsanitized inner > outer', () => {
    expect(spotPenumbra(1.2, 0.4)).toBe(0)
  })
})

describe('spotPreviewCone — the sanitizer + mapping the preview actually uses', () => {
  it("Core's FloodlightA (0.23 / 1.57) clamps to KSA's max outer and reads ~0.8535", () => {
    const cone = spotPreviewCone(0.23, 1.57)
    expect(cone.angleRad).toBeCloseTo(MAX_OUTER_ANGLE_RAD, 12)
    expect(cone.penumbra).toBeCloseTo(0.8535, 4)
  })

  it("Core's SpotlightA (0.392699 / 0.785398) passes through at penumbra 0.5", () => {
    const cone = spotPreviewCone(Math.PI / 8, Math.PI / 4)
    expect(cone.angleRad).toBeCloseTo(Math.PI / 4, 12)
    expect(cone.penumbra).toBeCloseTo(0.5, 12)
  })

  it("swaps inverted angles exactly as KSA's CreateSpotLight does", () => {
    const cone = spotPreviewCone(0.8, 0.4)
    expect(cone.angleRad).toBeCloseTo(0.8, 12)
    expect(cone.penumbra).toBeCloseTo(0.5, 12)
  })

  it('stays finite for a degenerate cone (outer 0 clamps to the game floor)', () => {
    const cone = spotPreviewCone(0, 0)
    expect(cone.angleRad).toBeGreaterThan(0)
    expect(Number.isFinite(cone.penumbra)).toBe(true)
  })
})

/**
 * Every preview light adds a shader define, so the scene re-links its programs when the
 * count changes — hence a hard cap, spent over INSTANCES (a SubPart-owned light placed
 * five times is five in-game lights) in document order.
 */
describe('planPreviewBudget', () => {
  it('enables everything when the document fits under the cap', () => {
    expect(planPreviewBudget([1, 1, 3])).toEqual({ perLight: [1, 1, 3], enabled: 5, total: 5 })
  })

  it('truncates in document order, funding a light PARTIALLY at the boundary', () => {
    // 10 + 10 instances against a cap of 16: the second light gets its first 6 visuals.
    const plan = planPreviewBudget([10, 10])
    expect(plan.perLight).toEqual([10, 6])
    expect(plan.enabled).toBe(MAX_PREVIEW_LIGHTS)
    expect(plan.total).toBe(20)
  })

  it('gives nothing to lights past the cap', () => {
    const plan = planPreviewBudget([16, 4, 1])
    expect(plan.perLight).toEqual([16, 0, 0])
    expect(plan.enabled).toBe(16)
    expect(plan.total).toBe(21)
  })

  it('honors an explicit cap (including 0)', () => {
    expect(planPreviewBudget([2, 2], 3)).toEqual({ perLight: [2, 1], enabled: 3, total: 4 })
    expect(planPreviewBudget([2, 2], 0)).toEqual({ perLight: [0, 0], enabled: 0, total: 4 })
  })

  it('treats a bad instance count as 0 rather than handing back a negative index', () => {
    const plan = planPreviewBudget([-3, Number.NaN, 2])
    expect(plan.perLight).toEqual([0, 0, 2])
    expect(plan.enabled).toBe(2)
    expect(plan.total).toBe(2)
  })

  it('is empty for a document with no lights', () => {
    expect(planPreviewBudget([])).toEqual({ perLight: [], enabled: 0, total: 0 })
  })
})

/**
 * three's `SpotLight` constructor copies `Object3D.DEFAULT_UP` into `position`, so a fresh
 * spot sits at local (0,1,0). `LightObject` pins it back to the origin — without that the
 * preview beam emits 1 m above the marker AND tilts (its target is at local (range,0,0), so
 * the aim came out (range,−1,0): ~9.5° off at range 6). This pins the three-side default
 * that made the bug, so a version bump that changes it can't silently un-fix or re-break it.
 */
describe('THREE.SpotLight default position (the preview-aim trap)', () => {
  it('is (0,1,0), which is why LightObject re-pins it to the origin', () => {
    const spot = new THREE.SpotLight(0xffffff, 1, 1, 1, 0, 2)
    expect([spot.position.x, spot.position.y, spot.position.z]).toEqual([0, 1, 0])
    spot.dispose()
  })

  it('aims exactly along +X once pinned, and (range,-1,0) if it is not', () => {
    const range = 6
    const aimFrom = (y: number) => {
      const dir = new THREE.Vector3(range, 0, 0).sub(new THREE.Vector3(0, y, 0))
      return { x: dir.x, y: dir.y, z: dir.z }
    }
    expect(aimFrom(0)).toEqual({ x: range, y: 0, z: 0 })
    expect(aimFrom(1)).toEqual({ x: range, y: -1, z: 0 })
  })
})
