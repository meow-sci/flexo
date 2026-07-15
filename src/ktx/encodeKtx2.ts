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
 * Writes an UNCOMPRESSED `VK_FORMAT_R8G8B8A8_UNORM` + linear-transfer container with
 * optional Zstd supercompression — the same Zstd scheme KSA's own atlases use. This is
 * the most universally accepted KTX2 flavor and, crucially, loads through three's
 * KTX2Loader (which supports R8G8B8A8) so the editor can preview it live.
 * Block-compressed BC7 (to byte-match KSA + cut VRAM) is a deferred swap that touches
 * ONLY this file — see plans/CUSTOM_TEXTURES_PLAN.md and AGENTS.md.
 *
 * **Container tags are ALWAYS UNORM + linear, even for sRGB content (diffuse).**
 * KSA's engine honors the file's vkFormat verbatim (Brutal.TextureApi.Ktx/Loader.cs →
 * libktx) AND its mesh shader gamma-decodes the diffuse sample itself
 * (MeshIndirect.frag: `gammaToLinear(texture(...))`, gammaToLinear = pow 2.2). A
 * `_SRGB`-tagged file therefore gets decoded TWICE in-game (hardware sRGB view + the
 * shader) — mid-tones render visibly too dark. KSA Core's own atlases follow the same
 * convention this module now does: sRGB-encoded BYTES, linear/UNORM container tags,
 * one decode in the shader. The editor is unaffected — TextureCache forces
 * `texture.colorSpace` per call site and never trusts the container tags.
 *
 * The data format descriptor (DFD) is hand-built per the KTX2 spec for a 4×8-bit
 * RGBA texel: bytesPlane=4, four samples, bitLength stored as bits−1.
 */

export interface EncodeKtx2Options {
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
  const useZstd = options.zstd ?? true

  const container = createDefaultContainer()
  container.vkFormat = VK_FORMAT_R8G8B8A8_UNORM
  container.typeSize = 1
  container.pixelWidth = image.width
  container.pixelHeight = image.height
  container.pixelDepth = 0
  container.layerCount = 0
  container.faceCount = 1
  // ktx-parse's write() emits exactly `levelCount` levels — it does NOT infer the
  // count from the levels array — so it must equal the mip chain length.
  container.levelCount = image.levels.length
  container.supercompressionScheme = useZstd ? KHR_SUPERCOMPRESSION_ZSTD : KHR_SUPERCOMPRESSION_NONE

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
      transferFunction: KHR_DF_TRANSFER_LINEAR,
      flags: KHR_DF_FLAG_ALPHA_STRAIGHT,
      // Uncompressed 2D texel = 1×1×1×1 block; the DFD stores dimension − 1.
      texelBlockDimension: [0, 0, 0, 0],
      bytesPlane: [4, 0, 0, 0, 0, 0, 0, 0],
      samples: [
        sample(0, KHR_DF_CHANNEL_RGBSDA_RED),
        sample(8, KHR_DF_CHANNEL_RGBSDA_GREEN),
        sample(16, KHR_DF_CHANNEL_RGBSDA_BLUE),
        sample(24, KHR_DF_CHANNEL_RGBSDA_ALPHA | KHR_DF_SAMPLE_DATATYPE_LINEAR),
      ],
    },
  ]

  // ktx-parse's write() expects an ArrayBuffer-backed view; returns a Uint8Array.
  return write(container, { keepWriter: false })
}

/**
 * Encodes a 1×1 solid-color RGBA8 KTX2 (Zstd). The channel decides what the bytes mean:
 *  - data channels (the synthetic Normal (128,128,255) / AoRoughMetal solids, emissive
 *    masks) — the values ARE the linear data.
 *  - a solid DIFFUSE (a picked base color, glass tint, whole-mesh glow color) — pass
 *    sRGB 0..255 values; KSA's shader gamma-decodes the diffuse sample, so sRGB bytes
 *    yield exactly the picked color (container tags stay UNORM/linear — see module doc).
 */
export function makeSolidKtx2(
  r: number,
  g: number,
  b: number,
  options: { a?: number } = {},
): Promise<Uint8Array> {
  const rgba = new Uint8Array([r, g, b, options.a ?? 255])
  return encodeImageToKtx2(
    { width: 1, height: 1, levels: [{ width: 1, height: 1, rgba }] },
    { zstd: true },
  )
}

const KTX2_MAGIC = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]

/** vkFormat (uint32 LE at byte offset 12) of a KTX2 file, or -1 when not a KTX2 header. */
export function ktx2VkFormat(bytes: Uint8Array): number {
  if (bytes.length < 16) return -1
  for (let i = 0; i < KTX2_MAGIC.length; i++) if (bytes[i] !== KTX2_MAGIC[i]) return -1
  return bytes[12] | (bytes[13] << 8) | (bytes[14] << 16) | (bytes[15] << 24)
}

/**
 * True for a stored `.ktx2` written by the pre-UNORM-convention encoder (vkFormat 43 =
 * `VK_FORMAT_R8G8B8A8_SRGB`). Those files double-gamma-decode in-game (see module doc);
 * the stored encode is a derived cache of the source image, so callers regenerate it.
 */
export function isLegacySrgbKtx2(bytes: Uint8Array): boolean {
  return ktx2VkFormat(bytes) === VK_FORMAT_R8G8B8A8_SRGB
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
