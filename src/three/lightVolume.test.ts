import { describe, expect, it } from 'vitest'
import { lightIlluminance } from '../ksa/lightFalloff'
import {
  autoExposure,
  SHELL_COUNT,
  SHELL_MAX_ALPHA,
  shellRadii,
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
