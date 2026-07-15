import * as THREE from 'three'
import type { CatalogSubPart } from '../ksa/catalog'
import type { RgbColor, TextureWrap } from '../ksa/types'
import type { ImageLevel } from '../ktx/decodeImage'
import { loadTexture, loadWrappedTexture } from './TextureCache'
import { applyKsaShaderPatches } from './normalMapPatch'

/**
 * Builds the PBR material for a SubPart from its catalog texture atlases,
 * replicating KSA's vessel shader:
 *  - diffuse  -> map (sRGB)
 *  - AoRoughMetal (one texture) -> aoMap(.r) / roughnessMap(.g) / metalnessMap(.b)
 *  - normal (BC5 RG) -> normalMap with a custom decode (see normalMapPatch)
 *  - emissive (BC4 R) -> emissiveMap, broadcast .rrr, boosted + ADDED in the
 *    shader patch (so the `emissive` uniform stays free for the selection tint)
 *
 * Returns the shared per-material-id material; callers (SubPartObject) clone it
 * per instance so selection-highlight emissive edits don't bleed across parts.
 * Falls back to a flat material only when the SubPart has no diffuse atlas — the
 * atlases are UASTC, which KTX2Loader transcodes on every GPU/browser (no BCn
 * capability gate needed; see textureSupport).
 */

const materialCache = new Map<string, Promise<THREE.MeshStandardMaterial>>()

export function makeFlatMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0xbfc4cc, metalness: 0.6, roughness: 0.5 })
}

/**
 * The scalar PBR values a custom face exports when it has no user material: the shared
 * synthetic NeutralORM solid is (AO=255, Rough=128, Metal=0). The editor materials use the
 * SAME values so what you see is what ships.
 */
export const NEUTRAL_METALNESS = 0
export const NEUTRAL_ROUGHNESS = 128 / 255

/** Builds a diffuse-only material for a single custom-mesh face (no user material assigned). */
export async function buildCustomFaceMaterial(
  ktx2Url: string,
  wrap: TextureWrap = 'repeat',
): Promise<THREE.MeshStandardMaterial> {
  const texture = await loadWrappedTexture(ktx2Url, 'srgb', wrap)
  return new THREE.MeshStandardMaterial({
    map: texture,
    metalness: NEUTRAL_METALNESS,
    roughness: NEUTRAL_ROUGHNESS,
  })
}

/**
 * A material's resolved scalar/map channels (see customAssetStore's
 * resolveMaterialChannels). Uniform values render as material scalars and export
 * as solid texels — same numbers, same look. Mapped channels bind the stored
 * .ktx2 with the scalar forced to 1 (three multiplies map × scalar; KSA reads
 * the map alone — same result). Channel semantics match KSA's AoRoughMetal
 * (R=AO, G=rough, B=metal) which is also three's native map convention.
 */
export interface MaterialChannelMaps {
  metalness: number
  roughness: number
  metalnessMapUrl?: string
  roughnessMapUrl?: string
  occlusionMapUrl?: string
  /** A pre-packed AO/Rough/Metal image; overrides the three separate maps. */
  ormPackedUrl?: string
  normalMapUrl?: string
  /** Normal strength — editor-side normalScale; baked into RG on export. */
  normalScale?: number
}

/** Loads and attaches a material's scalar/map channels onto a three material. */
export async function applyMaterialChannels(
  mat: THREE.MeshStandardMaterial,
  ch: MaterialChannelMaps,
): Promise<void> {
  mat.metalness = ch.metalness
  mat.roughness = ch.roughness
  if (ch.ormPackedUrl) {
    const orm = await loadTexture(ch.ormPackedUrl, 'linear')
    mat.aoMap = orm
    mat.roughnessMap = orm
    mat.metalnessMap = orm
    mat.aoMap.channel = 0 // KSA uses TEXCOORD_0 for all maps
    mat.aoMapIntensity = 1
  } else {
    if (ch.occlusionMapUrl) {
      mat.aoMap = await loadTexture(ch.occlusionMapUrl, 'linear')
      mat.aoMap.channel = 0
      mat.aoMapIntensity = 1
    }
    if (ch.roughnessMapUrl) mat.roughnessMap = await loadTexture(ch.roughnessMapUrl, 'linear')
    if (ch.metalnessMapUrl) mat.metalnessMap = await loadTexture(ch.metalnessMapUrl, 'linear')
  }
  if (ch.normalMapUrl) {
    mat.normalMap = await loadTexture(ch.normalMapUrl, 'linear')
    mat.normalMapType = THREE.TangentSpaceNormalMap
    const s = ch.normalScale ?? 1
    // The stored map already carries the strength-1 KSA transform (X-flip); the
    // editor applies strength as normalScale, the export bakes it into RG — same math.
    mat.normalScale.set(s, s)
  }
}

/**
 * The resolved per-face inputs of a {@link CustomMaterial} (see customAssetStore's
 * refreshCatalog): the base color as an image blob URL (a face texture or the
 * material's baseColor map) OR a uniform sRGB color, plus the channel maps.
 */
export interface CustomFaceSpec extends MaterialChannelMaps {
  /** Diffuse .ktx2 blob URL; wins over {@link color} when set. */
  mapUrl?: string
  /** Uniform base color (sRGB 0..255) when there is no image. */
  color?: RgbColor
  wrap: TextureWrap
}

/** Builds the editor material for a custom-mesh face driven by a {@link CustomMaterial}. */
export async function buildCustomMaterial(
  spec: CustomFaceSpec,
): Promise<THREE.MeshStandardMaterial> {
  const mat = new THREE.MeshStandardMaterial()
  if (spec.mapUrl) {
    mat.map = await loadWrappedTexture(spec.mapUrl, 'srgb', spec.wrap)
  } else if (spec.color) {
    mat.color.setRGB(
      spec.color.r / 255,
      spec.color.g / 255,
      spec.color.b / 255,
      THREE.SRGBColorSpace,
    )
  }
  await applyMaterialChannels(mat, spec)
  // The KSA normal decode (RG, X-flip, Z-reconstruct) — SubPartObject re-applies per
  // clone from the final map set; applied here too so direct renders are correct.
  applyKsaShaderPatches(mat, { normal: !!mat.normalMap, emissive: false })
  return mat
}

function wrapMode(wrap: TextureWrap): THREE.Wrapping {
  if (wrap === 'mirror') return THREE.MirroredRepeatWrapping
  if (wrap === 'clamp') return THREE.ClampToEdgeWrapping
  return THREE.RepeatWrapping
}

/** A DataTexture from raw RGBA8, matching the KTX2/GLB UV convention (flipY=false; see TextureCache). */
function makeDataTexture(
  level: ImageLevel,
  colorSpace: THREE.ColorSpace,
  wrap: TextureWrap,
): THREE.DataTexture {
  const tex = new THREE.DataTexture(
    level.rgba,
    level.width,
    level.height,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  )
  tex.colorSpace = colorSpace
  tex.wrapS = tex.wrapT = wrapMode(wrap)
  tex.flipY = false
  tex.generateMipmaps = true
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.needsUpdate = true
  return tex
}

/**
 * Builds a glowing custom-mesh face material from pre-composited buffers (see
 * src/ktx/glowComposite): `diffuse` carries the glow COLOR baked in (sRGB), `mask` is a grayscale
 * emissive mask (linear; KSA reads R). Mirrors {@link buildTextured}'s emissive block — the
 * `emissive` uniform stays free for the per-instance selection highlight, and the mask drives the
 * glow via the KSA shader patch (broadcast `.rrr` × 1.25, ADDED). Shared by the primitive face
 * path and the part-ified-kitten glow path; callers (SubPartObject) clone per instance.
 */
export function buildGlowingFaceMaterial(
  diffuse: ImageLevel,
  mask: ImageLevel,
  wrap: TextureWrap = 'repeat',
  pbr?: { metalness: number; roughness: number },
): THREE.MeshStandardMaterial {
  const map = makeDataTexture(diffuse, THREE.SRGBColorSpace, wrap)
  const emissiveMap = makeDataTexture(mask, THREE.NoColorSpace, wrap)
  const mat = new THREE.MeshStandardMaterial({
    map,
    metalness: pbr?.metalness ?? NEUTRAL_METALNESS,
    roughness: pbr?.roughness ?? NEUTRAL_ROUGHNESS,
  })
  mat.emissiveMap = emissiveMap
  // emissive uniform deliberately left black (free for the selection highlight); the glow is
  // ADDED from the mask in the shader patch — see normalMapPatch + SubPartObject.setSelected.
  applyKsaShaderPatches(mat, { normal: false, emissive: true })
  return mat
}

/** Resolves the shared material for a catalog entry (cached by material id). */
export function getSharedMaterial(entry: CatalogSubPart): Promise<THREE.MeshStandardMaterial> {
  if (!entry.diffuseUrl) {
    return Promise.resolve(makeFlatMaterial())
  }
  const key = entry.materialId ?? entry.diffuseUrl
  let pending = materialCache.get(key)
  if (!pending) {
    pending = buildTextured(entry).catch((err) => {
      console.warn(`MaterialFactory: textured material failed for ${key}`, err)
      return makeFlatMaterial()
    })
    materialCache.set(key, pending)
  }
  return pending
}

async function buildTextured(entry: CatalogSubPart): Promise<THREE.MeshStandardMaterial> {
  const [map, pbr, normal, emissive] = await Promise.all([
    loadTexture(entry.diffuseUrl!, 'srgb'),
    entry.aoRoughMetalUrl ? loadTexture(entry.aoRoughMetalUrl, 'linear') : null,
    entry.normalUrl ? loadTexture(entry.normalUrl, 'linear') : null,
    entry.emissiveUrl ? loadTexture(entry.emissiveUrl, 'linear') : null,
  ])

  const mat = new THREE.MeshStandardMaterial({
    map,
    metalness: 1, // KSA reads metal/rough straight from the map (no multiplier)
    roughness: 1,
  })

  if (pbr) {
    mat.aoMap = pbr
    mat.roughnessMap = pbr
    mat.metalnessMap = pbr
    mat.aoMap.channel = 0 // KSA uses TEXCOORD_0 for all maps (no second UV set)
    mat.aoMapIntensity = 1
  }

  if (normal) {
    mat.normalMap = normal
    mat.normalMapType = THREE.TangentSpaceNormalMap
    mat.normalScale.set(1, 1)
  }

  if (emissive) {
    mat.emissiveMap = emissive
    // The part's own emissive is derived from the map and ADDED in the shader
    // patch (with the boost baked in there). We deliberately leave `mat.emissive`
    // black / intensity at the default so the standard `emissive` uniform stays
    // free to carry the per-instance selection highlight — otherwise the (often
    // black) emissive map would multiply the highlight tint to nothing. See
    // normalMapPatch + SubPartObject.setSelected.
  }

  applyKsaShaderPatches(mat, { normal: !!normal, emissive: !!emissive })
  return mat
}
