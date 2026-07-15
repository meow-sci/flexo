import { describe, it, expect } from 'vitest'
import {
  read,
  VK_FORMAT_R8G8B8A8_UNORM,
  KHR_SUPERCOMPRESSION_NONE,
  KHR_SUPERCOMPRESSION_ZSTD,
  KHR_DF_MODEL_RGBSDA,
  KHR_DF_TRANSFER_LINEAR,
} from 'ktx-parse'
import { encodeImageToKtx2, makeSolidKtx2, ktx2VkFormat, isLegacySrgbKtx2 } from './encodeKtx2'
import { buildMipChain, type ImageLevel } from './decodeImage'

function solid(width: number, height: number, color = [200, 100, 50, 255]): ImageLevel {
  const rgba = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) rgba.set(color, i * 4)
  return { width, height, rgba }
}

describe('encodeImageToKtx2', () => {
  it('writes an uncompressed RGBA8 KTX2 that ktx-parse can read back', async () => {
    const levels = buildMipChain(solid(4, 4)) // 4×4, 2×2, 1×1
    const bytes = await encodeImageToKtx2({ width: 4, height: 4, levels }, { zstd: false })

    const ktx = read(bytes)
    expect(ktx.vkFormat).toBe(VK_FORMAT_R8G8B8A8_UNORM)
    expect(ktx.pixelWidth).toBe(4)
    expect(ktx.pixelHeight).toBe(4)
    expect(ktx.faceCount).toBe(1)
    expect(ktx.supercompressionScheme).toBe(KHR_SUPERCOMPRESSION_NONE)
    expect(ktx.levels.length).toBe(3)
    expect(ktx.levels[0].levelData.byteLength).toBe(4 * 4 * 4)
    expect(ktx.levels[0].uncompressedByteLength).toBe(4 * 4 * 4)

    const dfd = ktx.dataFormatDescriptor[0]
    expect(dfd.colorModel).toBe(KHR_DF_MODEL_RGBSDA)
    expect(dfd.samples.length).toBe(4)
  })

  it('tags the container UNORM + linear even for sRGB content (KSA decodes in-shader)', async () => {
    // KSA honors the file vkFormat AND gamma-decodes the diffuse sample in its shader,
    // so an _SRGB-tagged file would double-decode in-game. The convention (matching
    // KSA Core's own atlases) is sRGB bytes + UNORM/linear tags.
    const levels = buildMipChain(solid(2, 2))
    const ktx = read(await encodeImageToKtx2({ width: 2, height: 2, levels }, { zstd: false }))
    expect(ktx.vkFormat).toBe(VK_FORMAT_R8G8B8A8_UNORM)
    expect(ktx.dataFormatDescriptor[0].transferFunction).toBe(KHR_DF_TRANSFER_LINEAR)
  })

  it('zstd option supercompresses each level (uncompressedByteLength preserved)', async () => {
    const levels = buildMipChain(solid(8, 8))
    const bytes = await encodeImageToKtx2({ width: 8, height: 8, levels }, { zstd: true })
    const ktx = read(bytes)
    expect(ktx.supercompressionScheme).toBe(KHR_SUPERCOMPRESSION_ZSTD)
    expect(ktx.levels[0].uncompressedByteLength).toBe(8 * 8 * 4)
    // A solid color is highly compressible — stored bytes should be far smaller.
    expect(ktx.levels[0].levelData.byteLength).toBeLessThan(8 * 8 * 4)
  })
})

describe('makeSolidKtx2', () => {
  it('encodes a 1×1 UNORM/linear-tagged solid (synthetic normal/ORM, tints, masks)', async () => {
    const ktx = read(await makeSolidKtx2(128, 128, 255))
    expect(ktx.vkFormat).toBe(VK_FORMAT_R8G8B8A8_UNORM)
    expect(ktx.pixelWidth).toBe(1)
    expect(ktx.pixelHeight).toBe(1)
    expect(ktx.supercompressionScheme).toBe(KHR_SUPERCOMPRESSION_ZSTD)
  })
})

describe('legacy sRGB-tagged cache detection', () => {
  it('reads the vkFormat and flags only the legacy _SRGB tag', async () => {
    const fresh = await makeSolidKtx2(10, 20, 30)
    expect(ktx2VkFormat(fresh)).toBe(VK_FORMAT_R8G8B8A8_UNORM)
    expect(isLegacySrgbKtx2(fresh)).toBe(false)

    // Patch the header's vkFormat to 43 (VK_FORMAT_R8G8B8A8_SRGB) — a pre-convention file.
    const legacy = fresh.slice()
    legacy[12] = 43
    expect(ktx2VkFormat(legacy)).toBe(43)
    expect(isLegacySrgbKtx2(legacy)).toBe(true)
  })

  it('rejects non-KTX2 bytes', () => {
    expect(ktx2VkFormat(new Uint8Array([1, 2, 3]))).toBe(-1)
    expect(isLegacySrgbKtx2(new Uint8Array(32))).toBe(false)
  })
})
