import { describe, it, expect } from 'vitest'
import {
  GLOW_RAMP_PRESETS,
  defaultGlowRamp,
  glowRampCss,
  glowRampFromImage,
  hexToRgb,
  normalizeGlowRamp,
  rgbToHex,
  sampleGlowRamp,
} from './glowRamp'
import type { GlowRamp } from '../ksa/types'
import type { ImageLevel } from './decodeImage'

const BLACK_TO_BLUE: GlowRamp = {
  stops: [
    { at: 0, color: { r: 0, g: 0, b: 0 } },
    { at: 1, color: { r: 0, g: 0, b: 255 } },
  ],
}

/** A `width`×`height` image whose middle row is `row` (other rows are magenta, to prove which
 *  row is read). */
function rowImage(row: { r: number; g: number; b: number }[], height = 1): ImageLevel {
  const width = row.length
  const rgba = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    const mid = y === Math.floor(height / 2)
    for (let x = 0; x < width; x++) {
      const c = mid ? row[x] : { r: 255, g: 0, b: 255 }
      rgba.set([c.r, c.g, c.b, 255], (y * width + x) * 4)
    }
  }
  return { width, height, rgba }
}

/** A linear black → red → white gradient of `n` samples — the shape of KSA's TemperatureLut. */
function blackbodyRow(n: number): { r: number; g: number; b: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1)
    return t < 0.5
      ? { r: Math.round(t * 2 * 255), g: 0, b: 0 }
      : { r: 255, g: Math.round((t - 0.5) * 2 * 255), b: Math.round((t - 0.5) * 2 * 255) }
  })
}

describe('sampleGlowRamp', () => {
  it('interpolates linearly between stops', () => {
    expect(sampleGlowRamp(BLACK_TO_BLUE, 0)).toEqual({ r: 0, g: 0, b: 0 })
    expect(sampleGlowRamp(BLACK_TO_BLUE, 0.5)).toEqual({ r: 0, g: 0, b: 128 })
    expect(sampleGlowRamp(BLACK_TO_BLUE, 1)).toEqual({ r: 0, g: 0, b: 255 })
  })

  it('clamps outside the first/last stop, like a LUT texture s clamp-to-edge', () => {
    const inset: GlowRamp = {
      stops: [
        { at: 0.25, color: { r: 10, g: 10, b: 10 } },
        { at: 0.75, color: { r: 200, g: 200, b: 200 } },
      ],
    }
    expect(sampleGlowRamp(inset, 0)).toEqual({ r: 10, g: 10, b: 10 })
    expect(sampleGlowRamp(inset, -5)).toEqual({ r: 10, g: 10, b: 10 })
    expect(sampleGlowRamp(inset, 1)).toEqual({ r: 200, g: 200, b: 200 })
    expect(sampleGlowRamp(inset, 9)).toEqual({ r: 200, g: 200, b: 200 })
  })

  it('treats coincident stops as a hard edge instead of dividing by zero', () => {
    const edge: GlowRamp = {
      stops: [
        { at: 0, color: { r: 0, g: 0, b: 0 } },
        { at: 0.5, color: { r: 0, g: 0, b: 0 } },
        { at: 0.5, color: { r: 255, g: 255, b: 255 } },
        { at: 1, color: { r: 255, g: 255, b: 255 } },
      ],
    }
    expect(sampleGlowRamp(edge, 0.49).r).toBeLessThan(10)
    expect(sampleGlowRamp(edge, 0.51).r).toBe(255)
  })

  it('is black for an empty ramp rather than throwing', () => {
    expect(sampleGlowRamp({ stops: [] }, 0.5)).toEqual({ r: 0, g: 0, b: 0 })
  })
})

describe('normalizeGlowRamp', () => {
  it('sorts stops and clamps positions', () => {
    const r = normalizeGlowRamp([
      { at: 1.5, color: { r: 1, g: 1, b: 1 } },
      { at: -1, color: { r: 2, g: 2, b: 2 } },
      { at: 0.4, color: { r: 3, g: 3, b: 3 } },
    ])
    expect(r.stops.map((s) => s.at)).toEqual([0, 0.4, 1])
    expect(r.stops[0].color).toEqual({ r: 2, g: 2, b: 2 })
  })

  it('copies stop colors so dragging a stop can never mutate the caller s input', () => {
    const input = [{ at: 0, color: { r: 1, g: 2, b: 3 } }]
    const out = normalizeGlowRamp(input)
    out.stops[0].color.r = 99
    expect(input[0].color.r).toBe(1)
  })
})

describe('glowRampFromImage', () => {
  it('reads the MIDDLE row, so a zoomed screenshot of a 1-px LUT works', () => {
    const ramp = glowRampFromImage(
      rowImage(
        [
          { r: 0, g: 0, b: 0 },
          { r: 255, g: 255, b: 255 },
        ],
        5,
      ),
    )
    // Magenta fills every row but the middle one — none of it may reach the ramp.
    for (const s of ramp.stops) expect(s.color).not.toEqual({ r: 255, g: 0, b: 255 })
    expect(ramp.stops[0].color).toEqual({ r: 0, g: 0, b: 0 })
    expect(ramp.stops[ramp.stops.length - 1].color).toEqual({ r: 255, g: 255, b: 255 })
  })

  it('reduces a smooth gradient to a handful of stops that still reproduce it', () => {
    const row = blackbodyRow(256)
    const ramp = glowRampFromImage(rowImage(row))
    expect(ramp.stops.length).toBeGreaterThanOrEqual(2)
    expect(ramp.stops.length).toBeLessThanOrEqual(8) // two straight segments + rounding
    for (let i = 0; i < row.length; i++) {
      const got = sampleGlowRamp(ramp, i / (row.length - 1))
      expect(Math.abs(got.r - row[i].r)).toBeLessThanOrEqual(6)
      expect(Math.abs(got.g - row[i].g)).toBeLessThanOrEqual(6)
      expect(Math.abs(got.b - row[i].b)).toBeLessThanOrEqual(6)
    }
  })

  it('caps the stop count so a noisy image can t bloat the descriptor', () => {
    const noisy = Array.from({ length: 256 }, (_, i) => ({
      r: i % 2 ? 255 : 0,
      g: i % 3 ? 200 : 20,
      b: i % 5 ? 120 : 240,
    }))
    expect(glowRampFromImage(rowImage(noisy)).stops.length).toBeLessThanOrEqual(24)
  })

  it('is a flat ramp for a solid image', () => {
    const ramp = glowRampFromImage(rowImage([{ r: 40, g: 60, b: 80 }]))
    expect(sampleGlowRamp(ramp, 0)).toEqual({ r: 40, g: 60, b: 80 })
    expect(sampleGlowRamp(ramp, 1)).toEqual({ r: 40, g: 60, b: 80 })
  })
})

describe('hex helpers + css', () => {
  it('round-trips a color through hex', () => {
    expect(hexToRgb(rgbToHex({ r: 18, g: 200, b: 7 }))).toEqual({ r: 18, g: 200, b: 7 })
  })

  it('renders a css gradient with every stop', () => {
    const css = glowRampCss(BLACK_TO_BLUE)
    expect(css).toContain('linear-gradient(to right')
    expect(css).toContain('#000000 0.00%')
    expect(css).toContain('#0000ff 100.00%')
  })
})

describe('presets', () => {
  it('every preset is sorted, in range, and has at least two stops', () => {
    for (const p of GLOW_RAMP_PRESETS) {
      expect(p.ramp.stops.length).toBeGreaterThanOrEqual(2)
      const ats = p.ramp.stops.map((s) => s.at)
      expect(ats).toEqual([...ats].sort((a, b) => a - b))
      for (const at of ats) expect(at).toBeGreaterThanOrEqual(0)
      for (const at of ats) expect(at).toBeLessThanOrEqual(1)
    }
  })

  it('defaultGlowRamp deep-copies the preset, so editing it never edits the preset', () => {
    const a = defaultGlowRamp()
    a.stops[0].color.r = 123
    expect(defaultGlowRamp().stops[0].color.r).not.toBe(123)
  })
})
