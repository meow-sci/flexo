import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { assetKeys, getAsset } from '../state/assetDb'
import { getSubPartGeometry } from './MeshAtlasCache'

/**
 * Runtime side of IMPORTED (glTF/GLB) geometry: the `importId → blob: URL` registry over the
 * normalized atlas GLBs in IndexedDB (`assetKeys.importGlb`), plus the two geometry accessors
 * the rest of the app resolves imported SubParts through.
 *
 * WHY A REGISTRY AT ALL: unlike a primitive (regenerable from its `PrimitiveSpec`) or a kitten
 * submesh (re-baked from the shipped kitten gltf), imported geometry has NO regenerable source —
 * the one GLB per import batch IS the geometry. It is loaded once per session into a blob URL
 * and everything downstream (catalog, render cache, mod export) resolves meshes out of it BY
 * NAME, exactly as KSA's own `MeshAtlasFileReference` does (decomp/KSA/MeshAtlasFileReference.cs:22-49).
 *
 * TWO ACCESSORS, DELIBERATELY:
 *  - {@link getImportedGeometry} — EDITOR geometry, via the shared {@link getSubPartGeometry}
 *    cache, so an imported SubPart renders through the identical path (node transform baked,
 *    MikkTSpace tangents for faithful normal-map preview) as a Core SubPart.
 *  - {@link getImportedRawGeometry} — EXPORT geometry, its own loader, NO tangents. See the
 *    comment on that function: MikkTSpace de-indexes, and KSA requires indices.
 *
 * OWNERSHIP: every geometry returned here is SHARED and cached — never dispose one per instance
 * (the same rule as MeshAtlasCache); a caller that needs to mutate must `clone()` first. A
 * missing mesh name or unregistered batch resolves to `null` + a `console.warn`, never a throw:
 * these run inside the scene-rebuild path and one bad descriptor must not take the viewport down.
 */

/** import batch id → blob: URL of its normalized atlas GLB. */
const atlasUrls = new Map<string, string>()
/** blob: URL → parsed GLTF, for the raw (export) path only; the editor path uses MeshAtlasCache. */
const rawGltfs = new Map<string, Promise<GLTF>>()
/** `<blobUrl>#<meshName>` → raw geometry (indexed, no tangents). */
const rawGeometries = new Map<string, THREE.BufferGeometry>()

const rawLoader = new GLTFLoader()

/**
 * Registers an import batch's GLB bytes and returns the blob URL they are served from.
 * Idempotent per `importId`: re-registering returns the existing URL, so the URL stays a
 * stable cache key for MeshAtlasCache and for `CatalogSubPart.atlasUrl`.
 */
export function registerImportAtlas(importId: string, glb: Uint8Array): string {
  const existing = atlasUrls.get(importId)
  if (existing) return existing
  const url = URL.createObjectURL(new Blob([glb.slice()], { type: 'model/gltf-binary' }))
  atlasUrls.set(importId, url)
  return url
}

/** The blob URL for an already-registered import batch, or null. */
export function importAtlasUrl(importId: string): string | null {
  return atlasUrls.get(importId) ?? null
}

/**
 * The blob URL for an import batch, loading its GLB from IndexedDB first when the batch has
 * not been registered this session (project load / undo of a "remove mesh"). Returns null —
 * with a warning — when the batch's bytes are gone, which is the one unrecoverable state:
 * there is no other copy of imported geometry.
 */
export async function ensureImportAtlas(importId: string): Promise<string | null> {
  const existing = atlasUrls.get(importId)
  if (existing) return existing
  const blob = await getAsset(assetKeys.importGlb(importId))
  if (!blob) {
    console.warn(`flexo: imported model '${importId}' has no stored geometry`)
    return null
  }
  const url = URL.createObjectURL(blob)
  atlasUrls.set(importId, url)
  return url
}

/**
 * EDITOR geometry for one imported SubPart: the shared, origin-baked, MikkTSpace-tangented
 * geometry from {@link getSubPartGeometry} — the very same cache Core SubParts render from, so
 * an imported mesh previews normal maps with the correct per-vertex handedness.
 */
export async function getImportedGeometry(
  importId: string,
  meshName: string,
): Promise<THREE.BufferGeometry | null> {
  const url = importAtlasUrl(importId)
  if (!url) {
    console.warn(`flexo: imported model '${importId}' is not registered (mesh '${meshName}')`)
    return null
  }
  try {
    return await getSubPartGeometry(url, meshName)
  } catch (err) {
    console.warn(`flexo: imported mesh '${meshName}' failed to resolve`, err)
    return null
  }
}

/**
 * EXPORT geometry for one imported SubPart: the raw indexed glTF geometry, with the node
 * transform baked but **no tangent generation**.
 *
 * This exists ONLY because MikkTSpace **de-indexes** the geometry it tangents
 * (`computeMikkTSpaceTangents`, see MeshAtlasCache). KSA builds an index buffer only
 * `if (prim.Indices.HasValue)` (decomp/RenderCore.Gltf/GltfUtils.cs:484-488), so a de-indexed
 * mesh would draw nothing; `toKsaGeometry()` in exportGlb.ts defensively re-indexes, but
 * re-indexing an already-de-indexed buffer just rebuilds the trivial 0..n-1 index over
 * duplicated vertices — every shared vertex paid for once per triangle, in a file the user
 * ships. So the export path never touches the editor's tangented cache: it reads the same GLB
 * through this plain loader instead.
 */
export async function getImportedRawGeometry(
  importId: string,
  meshName: string,
): Promise<THREE.BufferGeometry | null> {
  const url = importAtlasUrl(importId)
  if (!url) {
    console.warn(`flexo: imported model '${importId}' is not registered (mesh '${meshName}')`)
    return null
  }
  const cacheKey = `${url}#${meshName}`
  const cached = rawGeometries.get(cacheKey)
  if (cached) return cached
  try {
    let pending = rawGltfs.get(url)
    if (!pending) {
      pending = rawLoader.loadAsync(url)
      rawGltfs.set(url, pending)
    }
    const gltf = await pending
    const node = gltf.scene.getObjectByName(meshName)
    const mesh = node && (node as THREE.Mesh).isMesh ? (node as THREE.Mesh) : null
    if (!mesh) {
      console.warn(`flexo: imported mesh '${meshName}' not found in model '${importId}'`)
      return null
    }
    // The import atlas writes every mesh at identity, but bake the node transform anyway so
    // this accessor stays faithful to the file the way MeshAtlasCache is.
    const geometry = mesh.geometry.clone()
    mesh.updateWorldMatrix(true, false)
    geometry.applyMatrix4(mesh.matrixWorld)
    rawGeometries.set(cacheKey, geometry)
    return geometry
  } catch (err) {
    console.warn(`flexo: imported mesh '${meshName}' failed to load`, err)
    return null
  }
}

/**
 * Revokes every registered blob URL and drops the caches — called on project switch, before
 * re-registering the new project's batches ({@link ensureImportAtlas}). MeshAtlasCache keeps
 * its own entries keyed by the (now dead) URLs; blob URLs are unique per creation, so those
 * entries can never be mis-resolved, they simply age out with the page.
 */
export function clearImportAtlases(): void {
  for (const url of atlasUrls.values()) URL.revokeObjectURL(url)
  atlasUrls.clear()
  rawGltfs.clear()
  rawGeometries.clear()
}
