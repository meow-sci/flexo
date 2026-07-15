import type { TextureChannel } from '../ksa/types'
import { buildMipChain, type DecodedImage, type ImageLevel } from './decodeImage'

/**
 * Per-channel pixel transforms between a user's uploaded image and the bytes flexo
 * stores/exports. All channels share the RGBA8+Zstd container (encodeKtx2); what
 * differs is the MEANING of the bytes and any preparation KSA's shader expects:
 *
 *  - **normal** — KSA's mesh shader decodes normals as `vec3(rg * 2 - 1)` with
 *    `x = -x` and Z reconstructed (SharedFrag.glsl getNormalFromMap_ShaderX). User
 *    uploads follow the standard OpenGL/glTF convention (+X right), so we FLIP X at
 *    encode; the editor previews through the same KSA-replica patch, so editor and
 *    game agree by construction. Strength scales RG about the 128 midpoint (KSA has
 *    no usable per-material normal-strength scalar for parts). B is recomputed so a
 *    raw view of the stored texture still looks like a normal map.
 *  - **orm / roughness / metalness / occlusion / emissiveMask** — linear data,
 *    stored as-is. Byte-space mip averaging IS linear-space filtering for these.
 *  - **baseColor** — sRGB content, stored as-is (KSA's shader gamma-decodes once;
 *    see encodeKtx2).
 *
 * Mips are always rebuilt from the transformed base level.
 */

/** True for channels whose pixels are linear data (not sRGB-encoded color). */
export function isLinearChannel(channel: TextureChannel): boolean {
  return channel !== 'baseColor'
}

/**
 * Prepares a decoded upload for its channel: applies the per-channel pixel
 * transform to the base level and rebuilds the mip chain. `normalStrength`
 * applies only to the 'normal' channel (1 = as authored).
 */
export function prepareChannelImage(
  decoded: DecodedImage,
  channel: TextureChannel,
  normalStrength = 1,
): DecodedImage {
  if (channel !== 'normal') return decoded
  const base = transformNormalLevel(decoded.levels[0], normalStrength)
  return { width: base.width, height: base.height, levels: buildMipChain(base) }
}

/**
 * glTF-convention normal map → KSA-convention bytes: X flipped, RG scaled about 128
 * by `strength`, Z (blue) recomputed for consistency. Alpha forced opaque.
 */
export function transformNormalLevel(level: ImageLevel, strength: number): ImageLevel {
  const out = new Uint8Array(level.rgba.length)
  for (let i = 0; i < level.rgba.length; i += 4) {
    const x = 255 - level.rgba[i] // KSA shader: normalMap.x = -normalMap.x
    const y = level.rgba[i + 1]
    const sx = clampByte(128 + (x - 128) * strength)
    const sy = clampByte(128 + (y - 128) * strength)
    out[i] = sx
    out[i + 1] = sy
    out[i + 2] = reconstructZ(sx, sy)
    out[i + 3] = 255
  }
  return { width: level.width, height: level.height, rgba: out }
}

/** Z = sqrt(1 - x² - y²) in byte space — what KSA's shader reconstructs from RG. */
function reconstructZ(xb: number, yb: number): number {
  const x = (xb / 255) * 2 - 1
  const y = (yb / 255) * 2 - 1
  const z = Math.sqrt(Math.max(0, 1 - x * x - y * y))
  return clampByte((z * 0.5 + 0.5) * 255)
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)))
}

/** One grayscale ORM input: an image (R channel read) or a uniform byte value. */
export type OrmSource = { level: ImageLevel } | { value: number }

/**
 * Packs occlusion/roughness/metalness sources into one AoRoughMetal image
 * (R=AO, G=rough, B=metal — MeshIndirect.frag "Following GLTF spec"). Output
 * dimensions = the largest source (uniform-only callers should use a 1×1 solid
 * instead); smaller sources are nearest-resampled. Grayscale images read R.
 */
export function packOrmLevel(ao: OrmSource, rough: OrmSource, metal: OrmSource): ImageLevel {
  const dims = [ao, rough, metal]
    .filter((s): s is { level: ImageLevel } => 'level' in s)
    .map((s) => s.level)
  const width = Math.max(1, ...dims.map((l) => l.width))
  const height = Math.max(1, ...dims.map((l) => l.height))
  const rgba = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4
      rgba[o] = sampleOrm(ao, x, y, width, height)
      rgba[o + 1] = sampleOrm(rough, x, y, width, height)
      rgba[o + 2] = sampleOrm(metal, x, y, width, height)
      rgba[o + 3] = 255
    }
  }
  return { width, height, rgba }
}

function sampleOrm(src: OrmSource, x: number, y: number, w: number, h: number): number {
  if ('value' in src) return src.value
  const l = src.level
  const sx = l.width === w ? x : Math.min(l.width - 1, Math.floor((x * l.width) / w))
  const sy = l.height === h ? y : Math.min(l.height - 1, Math.floor((y * l.height) / h))
  return l.rgba[(sy * l.width + sx) * 4]
}
