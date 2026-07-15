import { describe, it, expect } from 'vitest'
import {
  isLinearChannel,
  packOrmLevel,
  prepareChannelImage,
  transformNormalLevel,
} from './channelTransforms'
import type { ImageLevel } from './decodeImage'

function level(width: number, height: number, pixels: number[][]): ImageLevel {
  const rgba = new Uint8Array(width * height * 4)
  pixels.forEach((p, i) => rgba.set(p, i * 4))
  return { width, height, rgba }
}

describe('transformNormalLevel', () => {
  it('flips X (KSA shader negates it) and passes Y through at strength 1', () => {
    // A "+X right" glTF texel (255, 128) must become (0, 128) so KSA's
    // `normalMap.x = -normalMap.x` lands back on +X.
    const out = transformNormalLevel(level(1, 1, [[255, 128, 255, 255]]), 1)
    expect(out.rgba[0]).toBe(0)
    expect(out.rgba[1]).toBe(128)
    expect(out.rgba[3]).toBe(255)
  })

  it('a flat texel stays (near-)flat and gets a full +Z blue', () => {
    const out = transformNormalLevel(level(1, 1, [[128, 128, 0, 255]]), 1)
    // 255 - 128 = 127: byte space has no exact midpoint, so the flip shifts a
    // flat X by one byte (≈0.004 in [-1,1]) — invisible, and inherent to UNORM8.
    expect(out.rgba[0]).toBe(127)
    expect(out.rgba[1]).toBe(128)
    expect(out.rgba[2]).toBe(255) // Z reconstructed ≈ 1 → byte 255
  })

  it('strength scales RG about the 128 midpoint (0 = flat, 2 = doubled)', () => {
    const src = level(1, 1, [[128, 192, 0, 255]]) // y = +64 about midpoint
    expect(transformNormalLevel(src, 0).rgba[1]).toBe(128)
    expect(transformNormalLevel(src, 0.5).rgba[1]).toBe(160)
    expect(transformNormalLevel(src, 2).rgba[1]).toBe(255) // clamped
  })
})

describe('packOrmLevel', () => {
  it('packs grayscale sources into R=AO, G=rough, B=metal', () => {
    const gray = (v: number) => ({ level: level(1, 1, [[v, v, v, 255]]) })
    const out = packOrmLevel(gray(200), gray(100), gray(50))
    expect([...out.rgba]).toEqual([200, 100, 50, 255])
  })

  it('mixes uniform values with maps and resamples to the largest source', () => {
    const rough = {
      level: level(2, 1, [
        [10, 10, 10, 255],
        [250, 250, 250, 255],
      ]),
    }
    const out = packOrmLevel({ value: 255 }, rough, { value: 0 })
    expect(out.width).toBe(2)
    // Both texels: AO uniform 255, metal uniform 0; rough from the map.
    expect(Array.from(out.rgba.slice(0, 4))).toEqual([255, 10, 0, 255])
    expect(Array.from(out.rgba.slice(4, 8))).toEqual([255, 250, 0, 255])
  })
})

describe('prepareChannelImage', () => {
  it('is the identity for non-normal channels', () => {
    const img = { width: 1, height: 1, levels: [level(1, 1, [[9, 9, 9, 255]])] }
    expect(prepareChannelImage(img, 'baseColor')).toBe(img)
    expect(prepareChannelImage(img, 'orm')).toBe(img)
  })

  it('transforms normals and rebuilds the mip chain', () => {
    const img = {
      width: 2,
      height: 2,
      levels: [
        level(2, 2, [
          [255, 128, 0, 255],
          [255, 128, 0, 255],
          [255, 128, 0, 255],
          [255, 128, 0, 255],
        ]),
      ],
    }
    const out = prepareChannelImage(img, 'normal')
    expect(out.levels.length).toBe(2) // 2×2 + 1×1
    expect(out.levels[0].rgba[0]).toBe(0) // X flipped
  })
})

describe('isLinearChannel', () => {
  it('only baseColor is sRGB content', () => {
    expect(isLinearChannel('baseColor')).toBe(false)
    expect(isLinearChannel('normal')).toBe(true)
    expect(isLinearChannel('orm')).toBe(true)
    expect(isLinearChannel('emissiveMask')).toBe(true)
  })
})
