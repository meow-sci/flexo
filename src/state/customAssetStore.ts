import * as THREE from 'three'
import { atom } from 'nanostores'
import type { CatalogSubPart } from '../ksa/catalog'
import type { CustomMesh, CustomTexture, EditingPart, FaceTextureConfig, PrimitiveSpec } from '../ksa/types'
import { $part, pushUndo, addSubPart } from './editorStore'
import { $projectName } from './projectStore'
import { $customCatalog } from './catalogStore'
import { assetKeys, deleteAsset, getAsset, putAsset } from './assetDb'
import { buildPrimitiveGeometry, PRIMITIVE_FACE_KEYS, applyFaceUvTransforms } from '../three/primitives'
import { buildMeshAtlasGlb } from '../ksa/exportGlb'
import { decodeImage } from '../ktx/decodeImage'
import { encodeImageToKtx2 } from '../ktx/encodeKtx2'
import { buildCustomFaceMaterial, makeFlatMaterial } from '../three/MaterialFactory'

/**
 * Orchestrates user-created custom assets (textures + primitive meshes). Ties the
 * document descriptors ({@link EditingPart.customTextures}/{@link EditingPart.customMeshes})
 * to (a) their binaries in IndexedDB, (b) runtime blob URLs the renderer/UI consume,
 * (c) synthetic {@link CatalogSubPart} entries in `$customCatalog`, and (d) the
 * {@link customMeshRenderCache} — per-mesh pre-built Three.js geometry + per-face
 * material arrays used by SubPartObject to render per-face textures and baked UV
 * transforms directly, bypassing the atlas-GLB round-trip.
 *
 * Design notes (see plans/FLEXO_CUSTOM_ASSETS.md):
 *  - Texture binaries (source image + encoded .ktx2) persist in IndexedDB.
 *    Mesh GLBs are NOT persisted — regenerated from primitive params.
 *  - Atlas GLB (for KSA export) is rebuilt when the mesh set or shape changes;
 *    face-config changes only rebuild the render cache.
 *  - KSA export uses one PbrMaterial per SubPart (the first face with a texture).
 */

// ── runtime blob URLs (not persisted) ───────────────────────────────────────
let atlasUrl: string | null = null
/** texture id -> encoded .ktx2 blob URL (used as the catalog diffuse URL). */
const textureKtx2Urls = new Map<string, string>()
/** texture id -> source-image blob URL (used for UI thumbnails). */
const textureSrcUrls = new Map<string, string>()

/** Reactive map of texture id -> source-image URL, for UI previews. */
export const $customTextureUrls = atom<Record<string, string>>({})

function publishTextureUrls(): void {
  const rec: Record<string, string> = {}
  for (const [id, url] of textureSrcUrls) rec[id] = url
  $customTextureUrls.set(rec)
}

/**
 * Pre-built Three.js render data for custom mesh editor preview. Keyed by subPartId.
 * Rebuilt by refreshCatalog() on any face-config or texture change. SubPartObject
 * reads from this map to render per-face textures with baked UV transforms.
 */
export const customMeshRenderCache = new Map<string, {
  geometry: THREE.BufferGeometry
  materials: THREE.MeshStandardMaterial[]
}>()

/** Id of the custom mesh whose textures are currently being edited (null = panel closed). */
export const $managingMeshId = atom<string | null>(null)

export function setManagingMeshId(id: string | null): void {
  $managingMeshId.set(id)
}

function shortId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8)
}

function sanitizeIdent(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return cleaned || 'Asset'
}

// ── document mutation ────────────────────────────────────────────────────────
function mutate(description: string, detail: string, fn: (part: EditingPart) => void): void {
  const current = $part.get()
  pushUndo(description, detail)
  const next = structuredClone(current)
  fn(next)
  $part.set(next)
}

// ── face texture helpers ─────────────────────────────────────────────────────

/** Returns the first valid textureId across all faces (for KSA single-material export). */
export function getPrimaryTextureId(m: CustomMesh): string {
  for (const key of PRIMITIVE_FACE_KEYS[m.primitive.kind]) {
    const tid = m.faceTextures[key]?.textureId
    if (tid) return tid
  }
  return ''
}

// ── catalog + render cache ────────────────────────────────────────────────────

async function refreshCatalog(): Promise<void> {
  if (!atlasUrl) {
    customMeshRenderCache.clear()
    $customCatalog.set([])
    return
  }
  const part = $part.get()

  customMeshRenderCache.clear()

  const entries: CatalogSubPart[] = await Promise.all(
    part.customMeshes.map(async (m) => {
      const ft = m.faceTextures
      const faceKeys = PRIMITIVE_FACE_KEYS[m.primitive.kind]

      // Build geometry with UV transforms baked in.
      const geometry = buildPrimitiveGeometry(m.primitive)
      applyFaceUvTransforms(geometry, faceKeys, ft)

      // One material per face group; flat fallback for untextured faces.
      const materials: THREE.MeshStandardMaterial[] = []
      for (const key of faceKeys) {
        const texId = ft[key]?.textureId
        const ktx2Url = texId ? textureKtx2Urls.get(texId) : undefined
        if (ktx2Url) {
          materials.push(await buildCustomFaceMaterial(ktx2Url))
        } else {
          materials.push(makeFlatMaterial())
        }
      }

      customMeshRenderCache.set(m.subPartId, { geometry, materials })

      const primaryTexId = getPrimaryTextureId(m)
      return {
        id: m.subPartId,
        atlasUrl: atlasUrl!,
        meshNodeName: m.subPartId,
        materialId: undefined,
        diffuseUrl: primaryTexId ? textureKtx2Urls.get(primaryTexId) : undefined,
        sourceFile: '(custom)',
      }
    }),
  )
  $customCatalog.set(entries)
}

/** Rebuilds the combined mesh-atlas GLB blob (for KSA export), then refreshes the catalog. */
async function rebuildAtlas(): Promise<void> {
  const part = $part.get()
  if (atlasUrl) {
    URL.revokeObjectURL(atlasUrl)
    atlasUrl = null
  }
  if (part.customMeshes.length > 0) {
    const nodes = part.customMeshes.map((m) => {
      const faceKeys = PRIMITIVE_FACE_KEYS[m.primitive.kind]
      const geometry = buildPrimitiveGeometry(m.primitive)
      applyFaceUvTransforms(geometry, faceKeys, m.faceTextures)
      return { name: m.subPartId, geometry }
    })
    try {
      const glb = await buildMeshAtlasGlb(nodes)
      atlasUrl = URL.createObjectURL(new Blob([glb.slice()], { type: 'model/gltf-binary' }))
    } finally {
      for (const n of nodes) n.geometry.dispose()
    }
  }
  await refreshCatalog()
}

// ── textures ─────────────────────────────────────────────────────────────────
export async function addCustomTexture(file: Blob, name: string): Promise<CustomTexture> {
  const id = `tex_${shortId()}`
  const decoded = await decodeImage(file)
  const ktx2 = await encodeImageToKtx2(decoded, { srgb: true, zstd: true })

  await putAsset(assetKeys.textureSource(id), file, file.type || 'image/png')
  await putAsset(assetKeys.textureKtx2(id), ktx2, 'image/ktx2')

  textureKtx2Urls.set(id, URL.createObjectURL(new Blob([ktx2.slice()], { type: 'image/ktx2' })))
  textureSrcUrls.set(id, URL.createObjectURL(file))
  publishTextureUrls()

  const tex: CustomTexture = { id, name: name.trim() || 'texture', width: decoded.width, height: decoded.height }
  mutate('add texture', tex.name, (p) => {
    p.customTextures.push(tex)
  })
  return tex
}

export function removeCustomTexture(id: string): void {
  const name = $part.get().customTextures.find((t) => t.id === id)?.name ?? ''
  mutate('remove texture', name, (p) => {
    p.customTextures = p.customTextures.filter((t) => t.id !== id)
    for (const m of p.customMeshes) {
      for (const key of Object.keys(m.faceTextures)) {
        if (m.faceTextures[key]?.textureId === id) {
          m.faceTextures[key] = { ...m.faceTextures[key]!, textureId: '' }
        }
      }
    }
  })
  revokeTexture(id)
  void deleteAsset(assetKeys.textureSource(id))
  void deleteAsset(assetKeys.textureKtx2(id))
  publishTextureUrls()
  void refreshCatalog()
}

function revokeTexture(id: string): void {
  const k = textureKtx2Urls.get(id)
  if (k) URL.revokeObjectURL(k)
  textureKtx2Urls.delete(id)
  const s = textureSrcUrls.get(id)
  if (s) URL.revokeObjectURL(s)
  textureSrcUrls.delete(id)
}

// ── meshes ───────────────────────────────────────────────────────────────────
export async function addCustomMesh(args: {
  name: string
  primitive: PrimitiveSpec
  textureId: string
}): Promise<CustomMesh> {
  const id = `mesh_${shortId()}`
  const faceTextures: Partial<Record<string, FaceTextureConfig>> = {}
  if (args.textureId) {
    for (const key of PRIMITIVE_FACE_KEYS[args.primitive.kind]) {
      faceTextures[key] = { textureId: args.textureId, uvScale: { x: 1, y: 1 }, uvOffset: { x: 0, y: 0 } }
    }
  }
  const mesh: CustomMesh = {
    id,
    name: args.name.trim() || 'mesh',
    subPartId: `flexo_${sanitizeIdent(args.name)}_${shortId()}`,
    primitive: args.primitive,
    faceTextures,
  }
  mutate('add mesh', mesh.name, (p) => {
    p.customMeshes.push(mesh)
  })
  await rebuildAtlas()
  addSubPart(mesh.subPartId)
  return mesh
}

export async function updateCustomMesh(
  id: string,
  patch: Partial<Pick<CustomMesh, 'name' | 'primitive' | 'faceTextures'>>,
): Promise<void> {
  mutate('edit mesh', id, (p) => {
    const m = p.customMeshes.find((x) => x.id === id)
    if (m) Object.assign(m, patch)
  })
  if (patch.primitive) await rebuildAtlas()
  else await refreshCatalog()
}

/** Updates a single face's texture + UV config for a custom mesh. */
export async function updateMeshFaceConfig(
  meshId: string,
  faceKey: string,
  config: FaceTextureConfig,
): Promise<void> {
  mutate('edit face texture', meshId, (p) => {
    const m = p.customMeshes.find((x) => x.id === meshId)
    if (!m) return
    m.faceTextures[faceKey] = config
  })
  await refreshCatalog()
}

export async function removeCustomMesh(id: string): Promise<void> {
  const mesh = $part.get().customMeshes.find((x) => x.id === id)
  mutate('remove mesh', mesh?.name ?? '', (p) => {
    p.customMeshes = p.customMeshes.filter((x) => x.id !== id)
    if (mesh) p.placements = p.placements.filter((pl) => pl.subPartTemplateId !== mesh.subPartId)
  })
  await rebuildAtlas()
}

// ── hydration on project load ─────────────────────────────────────────────────
export async function hydrateCustomAssets(): Promise<void> {
  for (const id of [...textureKtx2Urls.keys(), ...textureSrcUrls.keys()]) revokeTexture(id)
  publishTextureUrls()

  const part = $part.get()
  for (const t of part.customTextures) {
    const k = await getAsset(assetKeys.textureKtx2(t.id))
    if (k) textureKtx2Urls.set(t.id, URL.createObjectURL(k))
    const s = await getAsset(assetKeys.textureSource(t.id))
    if (s) textureSrcUrls.set(t.id, URL.createObjectURL(s))
  }
  publishTextureUrls()
  await rebuildAtlas()
}

// Re-hydrate whenever the active project changes (load/rename) — and once on init.
if (typeof indexedDB !== 'undefined' && typeof window !== 'undefined') {
  $projectName.subscribe(() => {
    void hydrateCustomAssets().catch((err) => console.warn('flexo: custom-asset hydrate failed', err))
  })
}
