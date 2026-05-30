import { atom } from 'nanostores'
import type { CatalogSubPart } from '../ksa/catalog'
import type { CustomMesh, CustomTexture, EditingPart, PrimitiveSpec } from '../ksa/types'
import { $part, pushUndo, addSubPart } from './editorStore'
import { $projectName } from './projectStore'
import { $customCatalog } from './catalogStore'
import { assetKeys, deleteAsset, getAsset, putAsset } from './assetDb'
import { buildPrimitiveGeometry } from '../three/primitives'
import { buildMeshAtlasGlb } from '../ksa/exportGlb'
import { decodeImage } from '../ktx/decodeImage'
import { encodeImageToKtx2 } from '../ktx/encodeKtx2'

/**
 * Orchestrates user-created custom assets (textures + primitive meshes). It is the
 * one place that ties the document descriptors ({@link EditingPart.customTextures}/
 * {@link EditingPart.customMeshes}) to (a) their binaries in IndexedDB, (b) the
 * runtime blob URLs the renderer/UI consume, and (c) the synthetic
 * {@link CatalogSubPart} entries (in `$customCatalog`) that let the EXISTING scene
 * pipeline render custom meshes with no special-casing.
 *
 * Design notes (see plans/FLEXO_CUSTOM_ASSETS.md):
 *  - Texture binaries (source image + encoded .ktx2) persist in IndexedDB keyed by
 *    the texture's globally-unique id. Mesh GLBs are NOT persisted — they're cheap
 *    to regenerate from the primitive params in the descriptor.
 *  - The custom mesh-atlas GLB is rebuilt (one combined GLB, one named node per
 *    mesh) whenever the mesh set/params change; a fresh blob URL each time makes the
 *    scene rebuild affected objects (EditorScene subscribes to `$customCatalog`).
 *  - Catalog entries leave `materialId` undefined so MaterialFactory caches by the
 *    diffuse URL — re-encoding/replacing a texture (new blob URL) busts the cache.
 *
 * This store legitimately depends on three/ktx builders (it generates geometry and
 * encodes textures), unlike the framework-agnostic document stores.
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

function shortId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8)
}

/** Name → identifier-safe token for SubPart ids / GLB node names. */
function sanitizeIdent(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return cleaned || 'Asset'
}

// ── document mutation (single chokepoint; mirrors editorStore's add* pattern) ──
function mutate(description: string, detail: string, fn: (part: EditingPart) => void): void {
  const current = $part.get()
  pushUndo(description, detail)
  const next = structuredClone(current)
  fn(next)
  $part.set(next)
}

// ── catalog projection ───────────────────────────────────────────────────────
function refreshCatalog(): void {
  const part = $part.get()
  if (!atlasUrl) {
    $customCatalog.set([])
    return
  }
  const entries: CatalogSubPart[] = part.customMeshes.map((m) => ({
    id: m.subPartId,
    atlasUrl: atlasUrl!,
    meshNodeName: m.subPartId,
    // Leave materialId undefined so the material caches by diffuse URL (busts on edit).
    materialId: undefined,
    diffuseUrl: m.textureId ? textureKtx2Urls.get(m.textureId) : undefined,
    sourceFile: '(custom)',
  }))
  $customCatalog.set(entries)
}

/** Rebuilds the combined mesh-atlas GLB blob from all custom meshes, then refreshes the catalog. */
async function rebuildAtlas(): Promise<void> {
  const part = $part.get()
  if (atlasUrl) {
    URL.revokeObjectURL(atlasUrl)
    atlasUrl = null
  }
  if (part.customMeshes.length > 0) {
    const nodes = part.customMeshes.map((m) => ({
      name: m.subPartId,
      geometry: buildPrimitiveGeometry(m.primitive),
    }))
    try {
      const glb = await buildMeshAtlasGlb(nodes)
      atlasUrl = URL.createObjectURL(new Blob([glb.slice()], { type: 'model/gltf-binary' }))
    } finally {
      for (const n of nodes) n.geometry.dispose()
    }
  }
  refreshCatalog()
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
    for (const m of p.customMeshes) if (m.textureId === id) m.textureId = ''
  })
  revokeTexture(id)
  void deleteAsset(assetKeys.textureSource(id))
  void deleteAsset(assetKeys.textureKtx2(id))
  publishTextureUrls()
  refreshCatalog() // meshes that used this texture now render untextured
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
  const mesh: CustomMesh = {
    id,
    name: args.name.trim() || 'mesh',
    subPartId: `flexo_${sanitizeIdent(args.name)}_${shortId()}`,
    primitive: args.primitive,
    textureId: args.textureId,
  }
  mutate('add mesh', mesh.name, (p) => {
    p.customMeshes.push(mesh)
  })
  await rebuildAtlas() // makes the template renderable before we place it
  addSubPart(mesh.subPartId) // place it in the scene (selects it)
  return mesh
}

export async function updateCustomMesh(
  id: string,
  patch: Partial<Pick<CustomMesh, 'name' | 'primitive' | 'textureId'>>,
): Promise<void> {
  mutate('edit mesh', id, (p) => {
    const m = p.customMeshes.find((x) => x.id === id)
    if (m) Object.assign(m, patch)
  })
  if (patch.primitive) await rebuildAtlas()
  else refreshCatalog() // texture-only change: geometry (atlas) unchanged
}

export async function removeCustomMesh(id: string): Promise<void> {
  const mesh = $part.get().customMeshes.find((x) => x.id === id)
  mutate('remove mesh', mesh?.name ?? '', (p) => {
    p.customMeshes = p.customMeshes.filter((x) => x.id !== id)
    if (mesh) p.placements = p.placements.filter((pl) => pl.subPartTemplateId !== mesh.subPartId)
  })
  await rebuildAtlas()
}

// ── hydration on project load ──────────────────────────────────────────────────
/** Rebuilds all runtime URLs + the atlas from the current document + IndexedDB. */
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

// Re-hydrate whenever the active project changes (load/rename) — and once now
// (nanostores fires the subscriber immediately with the current project). Guarded
// to the browser so pure/node tests never touch IndexedDB.
if (typeof indexedDB !== 'undefined' && typeof window !== 'undefined') {
  $projectName.subscribe(() => {
    void hydrateCustomAssets().catch((err) => console.warn('flexo: custom-asset hydrate failed', err))
  })
}
