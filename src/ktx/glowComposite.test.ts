import { describe, it, expect } from 'vitest'
import {
  baseSizeFor,
  compositeGlow,
  glowCompositeOf,
  solidGlowBitmap,
  neutralBase,
  solidBase,
  type GlowBitmap,
  type GlowComposite,
} from './glowComposite'
import { createGlow, type GlowRamp } from '../ksa/types'
import type { ImageLevel } from './decodeImage'

function solid(width: number, height: number, color: number[]): ImageLevel {
  const rgba = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) rgba.set(color, i * 4)
  return { width, height, rgba }
}

/** A glow bitmap with an explicit per-texel key, for testing the key → color/mask split. */
function keyedGlow(color: number[], keys: number[]): GlowBitmap {
  const rgba = new Uint8Array(keys.length * 4)
  keys.forEach((k, i) => rgba.set([...color, k], i * 4))
  return { width: keys.length, height: 1, rgba }
}

const FULL: GlowComposite = { coverage: 1, strength: 1 }

describe('solidGlowBitmap', () => {
  it('fills rgb with the color at a FULL key — coverage/strength are the composite s job', () => {
    const g = solidGlowBitmap({ r: 255, g: 0, b: 0 }, 2)
    expect(g.width).toBe(2)
    expect([g.rgba[0], g.rgba[1], g.rgba[2], g.rgba[3]]).toEqual([255, 0, 0, 255])
  })
})

describe('glowCompositeOf', () => {
  it('carries exactly the fields that affect pixels', () => {
    const ramp: GlowRamp = { stops: [{ at: 0, color: { r: 1, g: 2, b: 3 } }] }
    expect(glowCompositeOf({ ...createGlow(), strength: 0.25, coverage: 0.5, ramp })).toEqual({
      strength: 0.25,
      coverage: 0.5,
      ramp,
    })
  })
})

describe('compositeGlow', () => {
  const base = solid(2, 2, [10, 20, 30, 255])

  it('key=0 leaves the base untouched and emits a black mask', () => {
    const { diffuse, mask } = compositeGlow(base, keyedGlow([255, 0, 0], [0]), FULL)
    expect([diffuse.rgba[0], diffuse.rgba[1], diffuse.rgba[2]]).toEqual([10, 20, 30])
    expect([mask.rgba[0], mask.rgba[1], mask.rgba[2]]).toEqual([0, 0, 0])
  })

  it('full key + full coverage/strength replaces the diffuse and emits a white mask', () => {
    const glow = solidGlowBitmap({ r: 200, g: 100, b: 50 })
    const { diffuse, mask } = compositeGlow(base, glow, FULL)
    expect([diffuse.rgba[0], diffuse.rgba[1], diffuse.rgba[2]]).toEqual([200, 100, 50])
    expect([mask.rgba[0], mask.rgba[1], mask.rgba[2]]).toEqual([255, 255, 255])
    expect(diffuse.rgba[3]).toBe(255) // alpha forced opaque
  })

  // THE fix: KSA adds the mask as WHITE (MeshIndirect.frag:286), so a saturated color with a
  // gentle white core is the only setting that reads colored in-game. One slider couldn't say it.
  it('coverage and strength are independent — saturated color, gentle white', () => {
    const glow = solidGlowBitmap({ r: 0, g: 255, b: 0 })
    const { diffuse, mask } = compositeGlow(base, glow, { coverage: 1, strength: 0.3 })
    expect([diffuse.rgba[0], diffuse.rgba[1], diffuse.rgba[2]]).toEqual([0, 255, 0])
    expect(mask.rgba[0]).toBe(Math.round(0.3 * 255))
  })

  it('coverage scales the diffuse blend only, leaving the mask alone', () => {
    const glow = solidGlowBitmap({ r: 210, g: 210, b: 210 })
    const { diffuse, mask } = compositeGlow(base, glow, { coverage: 0.5, strength: 1 })
    expect(diffuse.rgba[0]).toBe(Math.round(10 + (210 - 10) * 0.5))
    expect(mask.rgba[0]).toBe(255)
  })

  it('clamps coverage and strength to 0..1', () => {
    const glow = solidGlowBitmap({ r: 200, g: 100, b: 50 })
    const over = compositeGlow(base, glow, { coverage: 5, strength: 9 })
    expect([over.diffuse.rgba[0], over.mask.rgba[0]]).toEqual([200, 255])
    const under = compositeGlow(base, glow, { coverage: -1, strength: -1 })
    expect([under.diffuse.rgba[0], under.mask.rgba[0]]).toEqual([10, 0])
  })

  it('the key scales BOTH outputs, so a soft edge fades color and mask together', () => {
    const glow = keyedGlow([255, 255, 255], [0, 128, 255])
    const { diffuse, mask } = compositeGlow(solid(3, 1, [0, 0, 0, 255]), glow, FULL)
    expect([mask.rgba[0], mask.rgba[4], mask.rgba[8]]).toEqual([0, 128, 255])
    expect([diffuse.rgba[0], diffuse.rgba[4], diffuse.rgba[8]]).toEqual([0, 128, 255])
  })

  it('a ramp keys the COLOR off the greyscale value instead of the bitmap rgb', () => {
    // The bitmap's own rgb is red; the ramp must win at every key.
    const ramp: GlowRamp = {
      stops: [
        { at: 0, color: { r: 0, g: 0, b: 0 } },
        { at: 1, color: { r: 0, g: 0, b: 255 } },
      ],
    }
    const glow = keyedGlow([255, 0, 0], [0, 128, 255])
    const { diffuse } = compositeGlow(solid(3, 1, [0, 0, 0, 255]), glow, { ...FULL, ramp })
    expect(diffuse.rgba[2]).toBe(0) // key 0 → ramp black
    expect(diffuse.rgba[6]).toBe(64) // key ~0.502 → blue 128, blended by the key itself
    expect(diffuse.rgba[10]).toBe(255) // key 1 → ramp blue at full blend
    expect([diffuse.rgba[0], diffuse.rgba[4], diffuse.rgba[8]]).toEqual([0, 0, 0]) // no red anywhere
  })

  it('keeps the base dimensions and resamples a smaller glow up (nearest)', () => {
    const big = solid(4, 4, [0, 0, 0, 255])
    const glow = solidGlowBitmap({ r: 255, g: 255, b: 255 }, 1) // 1×1
    const { diffuse } = compositeGlow(big, glow, FULL)
    expect([diffuse.width, diffuse.height]).toEqual([4, 4])
    expect(diffuse.rgba[0]).toBe(255)
    expect(diffuse.rgba[15 * 4]).toBe(255)
  })
})

describe('neutralBase', () => {
  it('is opaque mid-gray', () => {
    const b = neutralBase(2, 2)
    expect([b.rgba[0], b.rgba[1], b.rgba[2], b.rgba[3]]).toEqual([128, 128, 128, 255])
  })
})

describe('baseSizeFor — a synthesised base must not throw the glow away', () => {
  it('sizes a uniform base to the glow, so the composite keeps the glow resolution', () => {
    // compositeGlow outputs at the BASE's resolution. A colour-only material used to
    // synthesise a 4×4 solid, which collapsed a 64×64 painted/imported glow to 4×4.
    const glow = solidGlowBitmap({ r: 255, g: 0, b: 0 }, 64)
    const size = baseSizeFor(glow)
    expect(size).toEqual({ width: 64, height: 64 })

    const { diffuse, mask } = compositeGlow(
      solidBase({ r: 8, g: 8, b: 8 }, size.width, size.height),
      glow,
      FULL,
    )
    expect([diffuse.width, diffuse.height]).toEqual([64, 64])
    expect([mask.width, mask.height]).toEqual([64, 64])
    expect(compositeGlow(solidBase({ r: 8, g: 8, b: 8 }), glow, FULL).diffuse.width).toBe(4)
  })

  it('keeps a 4×4 floor (and handles a missing glow) so nothing shrinks below the old default', () => {
    expect(baseSizeFor(null)).toEqual({ width: 4, height: 4 })
    expect(baseSizeFor({ width: 1, height: 1 })).toEqual({ width: 4, height: 4 })
    expect(baseSizeFor({ width: 2048, height: 1024 })).toEqual({ width: 2048, height: 1024 })
  })

  it('solidBase fills non-square dimensions with the colour', () => {
    const b = solidBase({ r: 1, g: 2, b: 3 }, 4, 2)
    expect([b.width, b.height, b.rgba.length]).toEqual([4, 2, 32])
    expect(Array.from(b.rgba.slice(28))).toEqual([1, 2, 3, 255])
  })
})
