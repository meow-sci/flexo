import { describe, it, expect } from 'vitest'
import {
  read,
  VK_FORMAT_R8G8B8A8_SRGB,
  VK_FORMAT_R8G8B8A8_UNORM,
  KHR_SUPERCOMPRESSION_NONE,
  KHR_SUPERCOMPRESSION_ZSTD,
  KHR_DF_MODEL_RGBSDA,
} from 'ktx-parse'
import { encodeImageToKtx2 } from './encodeKtx2'
import { buildMipChain, type ImageLevel } from './decodeImage'

function solid(width: number, height: number, color = [200, 100, 50, 255]): ImageLevel {
  const rgba = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) rgba.set(color, i * 4)
  return { width, height, rgba }
}

describe('encodeImageToKtx2', () => {
  it('writes an uncompressed sRGB RGBA8 KTX2 that ktx-parse can read back', async () => {
    const levels = buildMipChain(solid(4, 4)) // 4×4, 2×2, 1×1
    const bytes = await encodeImageToKtx2({ width: 4, height: 4, levels }, { srgb: true, zstd: false })

    const ktx = read(bytes)
    expect(ktx.vkFormat).toBe(VK_FORMAT_R8G8B8A8_SRGB)
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

  it('linear option uses VK_FORMAT_R8G8B8A8_UNORM', async () => {
    const levels = buildMipChain(solid(2, 2))
    const bytes = await encodeImageToKtx2({ width: 2, height: 2, levels }, { srgb: false, zstd: false })
    expect(read(bytes).vkFormat).toBe(VK_FORMAT_R8G8B8A8_UNORM)
  })

  it('zstd option supercompresses each level (uncompressedByteLength preserved)', async () => {
    const levels = buildMipChain(solid(8, 8))
    const bytes = await encodeImageToKtx2({ width: 8, height: 8, levels }, { srgb: true, zstd: true })
    const ktx = read(bytes)
    expect(ktx.supercompressionScheme).toBe(KHR_SUPERCOMPRESSION_ZSTD)
    expect(ktx.levels[0].uncompressedByteLength).toBe(8 * 8 * 4)
    // A solid color is highly compressible — stored bytes should be far smaller.
    expect(ktx.levels[0].levelData.byteLength).toBeLessThan(8 * 8 * 4)
  })
})
