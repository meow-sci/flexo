import { describe, it, expect } from 'vitest'
import {
  baseSizeFor,
  compositeGlow,
  solidGlowBitmap,
  neutralBase,
  solidBase,
  type GlowBitmap,
} from './glowComposite'
import type { ImageLevel } from './decodeImage'

function solid(width: number, height: number, color: number[]): ImageLevel {
  const rgba = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) rgba.set(color, i * 4)
  return { width, height, rgba }
}

describe('solidGlowBitmap', () => {
  it('fills rgb with the color and a with strength*255', () => {
    const g = solidGlowBitmap({ r: 255, g: 0, b: 0 }, 0.6, 2)
    expect(g.width).toBe(2)
    expect([g.rgba[0], g.rgba[1], g.rgba[2], g.rgba[3]]).toEqual([255, 0, 0, Math.round(0.6 * 255)])
  })
  it('clamps strength to 0..1', () => {
    expect(solidGlowBitmap({ r: 1, g: 2, b: 3 }, -1).rgba[3]).toBe(0)
    expect(solidGlowBitmap({ r: 1, g: 2, b: 3 }, 5).rgba[3]).toBe(255)
  })
})

describe('compositeGlow', () => {
  const base = solid(2, 2, [10, 20, 30, 255])

  it('mask=0 leaves the base untouched and emits a black mask', () => {
    const glow: GlowBitmap = solidGlowBitmap({ r: 255, g: 0, b: 0 }, 0)
    const { diffuse, mask } = compositeGlow(base, glow)
    expect([diffuse.rgba[0], diffuse.rgba[1], diffuse.rgba[2]]).toEqual([10, 20, 30])
    expect([mask.rgba[0], mask.rgba[1], mask.rgba[2]]).toEqual([0, 0, 0])
  })

  it('mask=255 replaces the diffuse with the glow color and emits a white mask', () => {
    const glow: GlowBitmap = solidGlowBitmap({ r: 200, g: 100, b: 50 }, 1)
    const { diffuse, mask } = compositeGlow(base, glow)
    expect([diffuse.rgba[0], diffuse.rgba[1], diffuse.rgba[2]]).toEqual([200, 100, 50])
    expect([mask.rgba[0], mask.rgba[1], mask.rgba[2]]).toEqual([255, 255, 255])
    expect(diffuse.rgba[3]).toBe(255) // alpha forced opaque
  })

  it('lerps at a partial mask and keeps the base dimensions', () => {
    const glow: GlowBitmap = solidGlowBitmap({ r: 210, g: 220, b: 230 }, 0.5) // a≈128, t≈0.502
    const { diffuse, mask } = compositeGlow(base, glow)
    expect(diffuse.width).toBe(2)
    expect(diffuse.height).toBe(2)
    // lerp(10, 210, ~0.502) ≈ 110
    expect(diffuse.rgba[0]).toBeGreaterThan(100)
    expect(diffuse.rgba[0]).toBeLessThan(120)
    expect(mask.rgba[0]).toBe(glow.rgba[3]) // mask R == glow alpha
  })

  it('resamples a smaller glow up to a larger base (nearest)', () => {
    const big = solid(4, 4, [0, 0, 0, 255])
    const glow = solidGlowBitmap({ r: 255, g: 255, b: 255 }, 1, 1) // 1×1
    const { diffuse } = compositeGlow(big, glow)
    expect(diffuse.width).toBe(4)
    // every texel got the glow
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
    const glow = solidGlowBitmap({ r: 255, g: 0, b: 0 }, 1, 64)
    const size = baseSizeFor(glow)
    expect(size).toEqual({ width: 64, height: 64 })

    const { diffuse, mask } = compositeGlow(
      solidBase({ r: 8, g: 8, b: 8 }, size.width, size.height),
      glow,
    )
    expect([diffuse.width, diffuse.height]).toEqual([64, 64])
    expect([mask.width, mask.height]).toEqual([64, 64])
    expect(compositeGlow(solidBase({ r: 8, g: 8, b: 8 }), glow).diffuse.width).toBe(4)
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
