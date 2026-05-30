import {
  createDefaultContainer,
  write,
  VK_FORMAT_R8G8B8A8_SRGB,
  VK_FORMAT_R8G8B8A8_UNORM,
  KHR_DF_VENDORID_KHRONOS,
  KHR_DF_KHR_DESCRIPTORTYPE_BASICFORMAT,
  KHR_DF_VERSION,
  KHR_DF_MODEL_RGBSDA,
  KHR_DF_PRIMARIES_BT709,
  KHR_DF_TRANSFER_SRGB,
  KHR_DF_TRANSFER_LINEAR,
  KHR_DF_FLAG_ALPHA_STRAIGHT,
  KHR_DF_SAMPLE_DATATYPE_LINEAR,
  KHR_DF_CHANNEL_RGBSDA_RED,
  KHR_DF_CHANNEL_RGBSDA_GREEN,
  KHR_DF_CHANNEL_RGBSDA_BLUE,
  KHR_DF_CHANNEL_RGBSDA_ALPHA,
  KHR_SUPERCOMPRESSION_ZSTD,
  KHR_SUPERCOMPRESSION_NONE,
} from 'ktx-parse'
import type { DecodedImage } from './decodeImage'
import { compressZstd } from './zstd'

/**
 * Assembles a standards-compliant KTX2 file from decoded RGBA8 pixels + mip chain.
 *
 * v1 writes an UNCOMPRESSED color format (VK_FORMAT_R8G8B8A8_SRGB for diffuse,
 * _UNORM for linear data) with optional Zstd supercompression — the same Zstd
 * scheme KSA's own atlases use. This is the most universally accepted KTX2 flavor
 * and, crucially, loads through three's KTX2Loader (which supports R8G8B8A8) so the
 * editor can preview it live. Block-compressed BC7 (to byte-match KSA + cut VRAM)
 * is a deferred swap that touches ONLY this file — see plans/FLEXO_CUSTOM_ASSETS.md
 * and AGENTS.md.
 *
 * The data format descriptor (DFD) is hand-built per the KTX2 spec for a 4×8-bit
 * RGBA texel: bytesPlane=4, four samples (R,G,B at the chosen transfer function,
 * A always linear), bitLength stored as bits−1.
 */

export interface EncodeKtx2Options {
  /** true → sRGB transfer + VK_FORMAT_R8G8B8A8_SRGB (diffuse). false → linear/_UNORM. */
  srgb?: boolean
  /** Apply Zstd supercompression to each level (matches KSA atlases). Default true. */
  zstd?: boolean
}

/** 8-bit UNORM sample range. bitLength is stored as (bits − 1) = 7 per the spec. */
const SAMPLE_BIT_LENGTH = 7
const SAMPLE_UPPER_UNORM8 = 255

export async function encodeImageToKtx2(
  image: DecodedImage,
  options: EncodeKtx2Options = {},
): Promise<Uint8Array> {
  const srgb = options.srgb ?? true
  const useZstd = options.zstd ?? true

  const container = createDefaultContainer()
  container.vkFormat = srgb ? VK_FORMAT_R8G8B8A8_SRGB : VK_FORMAT_R8G8B8A8_UNORM
  container.typeSize = 1
  container.pixelWidth = image.width
  container.pixelHeight = image.height
  container.pixelDepth = 0
  container.layerCount = 0
  container.faceCount = 1
  // ktx-parse's write() emits exactly `levelCount` levels — it does NOT infer the
  // count from the levels array — so it must equal the mip chain length.
  container.levelCount = image.levels.length
  container.supercompressionScheme = useZstd
    ? KHR_SUPERCOMPRESSION_ZSTD
    : KHR_SUPERCOMPRESSION_NONE

  // levels[0] = base (largest); ktx-parse handles the on-disk level ordering/padding.
  container.levels = []
  for (const level of image.levels) {
    const raw = level.rgba
    const levelData = useZstd ? await compressZstd(raw) : raw
    container.levels.push({
      levelData,
      uncompressedByteLength: raw.byteLength,
    })
  }

  container.dataFormatDescriptor = [
    {
      vendorId: KHR_DF_VENDORID_KHRONOS,
      descriptorType: KHR_DF_KHR_DESCRIPTORTYPE_BASICFORMAT,
      versionNumber: KHR_DF_VERSION,
      colorModel: KHR_DF_MODEL_RGBSDA,
      colorPrimaries: KHR_DF_PRIMARIES_BT709,
      transferFunction: srgb ? KHR_DF_TRANSFER_SRGB : KHR_DF_TRANSFER_LINEAR,
      flags: KHR_DF_FLAG_ALPHA_STRAIGHT,
      // Uncompressed 2D texel = 1×1×1×1 block; the DFD stores dimension − 1.
      texelBlockDimension: [0, 0, 0, 0],
      bytesPlane: [4, 0, 0, 0, 0, 0, 0, 0],
      samples: [
        sample(0, KHR_DF_CHANNEL_RGBSDA_RED),
        sample(8, KHR_DF_CHANNEL_RGBSDA_GREEN),
        sample(16, KHR_DF_CHANNEL_RGBSDA_BLUE),
        // Alpha is always linear, even in an sRGB texture.
        sample(24, KHR_DF_CHANNEL_RGBSDA_ALPHA | KHR_DF_SAMPLE_DATATYPE_LINEAR),
      ],
    },
  ]

  // ktx-parse's write() expects an ArrayBuffer-backed view; returns a Uint8Array.
  return write(container, { keepWriter: false })
}

/** One 8-bit UNORM DFD sample for a given bit offset + channel (with any qualifier flags). */
function sample(bitOffset: number, channelType: number) {
  return {
    bitOffset,
    bitLength: SAMPLE_BIT_LENGTH,
    channelType,
    samplePosition: [0, 0, 0, 0],
    sampleLower: 0,
    sampleUpper: SAMPLE_UPPER_UNORM8,
  }
}
