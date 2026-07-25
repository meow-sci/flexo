import { describe, it, expect } from 'vitest'
import {
  cappedSize,
  estimateImportCost,
  formatBytes,
  geometryBytes,
  groupWarnings,
  imageSizeOf,
  SCALE_PRESETS,
  textureVramBytes,
  warningSeverity,
} from './importEstimates'
import type { ImportWarning } from './importPlan'

/** Minimal but REAL headers — the parser must work on bytes a glTF actually embeds. */
function pngHeader(width: number, height: number): Uint8Array {
  const b = new Uint8Array(24)
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  b.set([0, 0, 0, 13], 8)
  b.set([0x49, 0x48, 0x44, 0x52], 12) // "IHDR"
  new DataView(b.buffer).setUint32(16, width)
  new DataView(b.buffer).setUint32(20, height)
  return b
}

function jpegHeader(width: number, height: number): Uint8Array {
  // SOI, an APP0 segment to be skipped, then SOF0 carrying the dimensions.
  const b = new Uint8Array(2 + 4 + 2 + 12)
  const view = new DataView(b.buffer)
  b.set([0xff, 0xd8], 0)
  b.set([0xff, 0xe0], 2)
  view.setUint16(4, 4) // APP0 length (covers itself + 2 payload bytes)
  b.set([0xff, 0xc0], 8)
  view.setUint16(10, 11)
  b[12] = 8 // precision
  view.setUint16(13, height)
  view.setUint16(15, width)
  return b
}

function webpLossyHeader(width: number, height: number): Uint8Array {
  const b = new Uint8Array(32)
  const view = new DataView(b.buffer)
  b.set(
    [...'RIFF'].map((c) => c.charCodeAt(0)),
    0,
  )
  b.set(
    [...'WEBP'].map((c) => c.charCodeAt(0)),
    8,
  )
  b.set(
    [...'VP8 '].map((c) => c.charCodeAt(0)),
    12,
  )
  view.setUint16(26, width, true)
  view.setUint16(28, height, true)
  return b
}

describe('imageSizeOf — header-only dimension reads', () => {
  it('reads PNG, JPEG and WebP dimensions', () => {
    expect(imageSizeOf(pngHeader(2048, 1024))).toEqual({ width: 2048, height: 1024 })
    expect(imageSizeOf(jpegHeader(640, 480))).toEqual({ width: 640, height: 480 })
    expect(imageSizeOf(webpLossyHeader(256, 128))).toEqual({ width: 256, height: 128 })
  })

  it('returns null for unrecognised or truncated bytes', () => {
    expect(imageSizeOf(new Uint8Array([1, 2, 3, 4]))).toBeNull()
    expect(imageSizeOf(pngHeader(64, 64).subarray(0, 12))).toBeNull()
  })
})

describe('cappedSize — what decodeImage will actually store', () => {
  it('downscales the LONGEST edge to the cap, preserving aspect', () => {
    expect(cappedSize({ width: 4096, height: 2048 }, 2048)).toEqual({ width: 2048, height: 1024 })
    expect(cappedSize({ width: 1000, height: 4000 }, 1024)).toEqual({ width: 256, height: 1024 })
  })

  it('never upscales a small texture', () => {
    expect(cappedSize({ width: 64, height: 32 }, 4096)).toEqual({ width: 64, height: 32 })
  })

  it('costs an unknown image a full cap-square rather than nothing', () => {
    expect(cappedSize(null, 1024)).toEqual({ width: 1024, height: 1024 })
  })
})

describe('VRAM + mod size', () => {
  it('costs a texture at RGBA8 + a third for mips', () => {
    // 4096² × 4 B × 4/3 ≈ 89.5 MB — the number that motivates the 2048 default.
    expect(textureVramBytes({ width: 4096, height: 4096 })).toBe(89478485)
    expect(textureVramBytes({ width: 1024, height: 1024 })).toBe(5592405)
  })

  it('sums capped textures and adds the geometry to the mod estimate', () => {
    const cost = estimateImportCost({
      textureSizes: [{ width: 4096, height: 4096 }, null],
      maxTextureSize: 1024,
      triangles: 1000,
      vertices: 600,
      subParts: 1,
    })
    // Both textures land at 1024² — the oversized one downscaled, the unknown one assumed.
    expect(cost.textureCount).toBe(2)
    expect(cost.sizes).toEqual([
      { width: 1024, height: 1024 },
      { width: 1024, height: 1024 },
    ])
    expect(cost.vramBytes).toBe(2 * textureVramBytes({ width: 1024, height: 1024 }))
    expect(cost.modBytes).toBeGreaterThan(geometryBytes(600, 1000))
  })

  it('shrinks the view-mesh contribution when decimation is on', () => {
    const heavy = { textureSizes: [], maxTextureSize: 2048, triangles: 100_000, vertices: 60_000 }
    const undecimated = estimateImportCost({ ...heavy, subParts: 1 })
    const decimated = estimateImportCost({ ...heavy, subParts: 1, viewMeshBudget: 2000 })
    expect(decimated.modBytes).toBeLessThan(undecimated.modBytes)
    // Only the view copy shrinks; the render mesh is untouched.
    expect(undecimated.modBytes - decimated.modBytes).toBe(geometryBytes(0, 98_000))
  })
})

describe('formatBytes', () => {
  it('formats binary units', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(89478485)).toBe('85.3 MB')
  })
})

describe('groupWarnings', () => {
  const warn = (code: ImportWarning['code'], subject: string): ImportWarning => ({
    code,
    subject,
    message: `${code} on ${subject}`,
  })

  it('groups per-channel subjects under their object and ranks loudest first', () => {
    const groups = groupWarnings([
      warn('mirrored', 'Bolt'),
      warn('samplerWrap', 'Paint:normal'),
      warn('textureUv1', 'Paint:base colour'),
      warn('noUv', 'Hull'),
    ])
    expect(groups.map((g) => g.subject)).toEqual(['Hull', 'Paint', 'Bolt'])
    expect(groups[0]!.severity).toBe('error')
    expect(groups[1]!.items).toHaveLength(2)
    expect(groups[2]!.severity).toBe('info')
  })

  it('grades every warning code (no silent fallthrough to a default)', () => {
    expect(warningSeverity('noMeshes')).toBe('error')
    expect(warningSeverity('animations')).toBe('warning')
    expect(warningSeverity('skinned')).toBe('info')
  })
})

describe('SCALE_PRESETS', () => {
  it('offers the two unit conversions the plan calls for, plus metres', () => {
    expect(SCALE_PRESETS.map((p) => p.value)).toEqual([0.01, 0.0254, 1])
  })
})
