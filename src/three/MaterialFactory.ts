import * as THREE from 'three'
import type { CatalogSubPart } from '../ksa/catalog'
import { isTextureSupported } from './textureSupport'
import { loadTexture } from './TextureCache'
import { applyKsaShaderPatches } from './normalMapPatch'

/**
 * Builds the PBR material for a SubPart from its catalog texture atlases,
 * replicating KSA's vessel shader:
 *  - diffuse  -> map (sRGB)
 *  - AoRoughMetal (one texture) -> aoMap(.r) / roughnessMap(.g) / metalnessMap(.b)
 *  - normal (BC5 RG) -> normalMap with a custom decode (see normalMapPatch)
 *  - emissive (BC4 R) -> emissiveMap, broadcast .rrr, intensity 1.25
 *
 * Returns the shared per-material-id material; callers (SubPartObject) clone it
 * per instance so selection-highlight emissive edits don't bleed across parts.
 * Falls back to a flat material when textures are unsupported or missing.
 */
const EMISSIVE_MULTIPLIER = 1.25

const materialCache = new Map<string, Promise<THREE.MeshStandardMaterial>>()

export function makeFlatMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0xbfc4cc, metalness: 0.6, roughness: 0.5 })
}

/** Resolves the shared material for a catalog entry (cached by material id). */
export function getSharedMaterial(entry: CatalogSubPart): Promise<THREE.MeshStandardMaterial> {
  if (!isTextureSupported() || !entry.diffuseUrl) {
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
    mat.emissive = new THREE.Color(0xffffff)
    mat.emissiveIntensity = EMISSIVE_MULTIPLIER
  }

  applyKsaShaderPatches(mat, { normal: !!normal, emissive: !!emissive })
  return mat
}
