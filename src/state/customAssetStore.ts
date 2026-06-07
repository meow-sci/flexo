import * as THREE from 'three'
import { atom } from 'nanostores'
import type { CatalogSubPart } from '../ksa/catalog'
import { toUrl } from '../ksa/catalog'
import type {
  CustomMesh,
  CustomTexture,
  EditingPart,
  EmissiveConfig,
  FaceTextureConfig,
  GlassConfig,
  KittenKind,
  KittenMeshSource,
  PrimitiveSpec,
  VisorSurface,
} from '../ksa/types'
import { KITTEN_LABELS } from '../ksa/types'
import {
  $part,
  pushUndo,
  addSubPart,
  nextLayerId,
  setActiveLayer,
  setSelection,
} from './editorStore'
import { $projectName } from './projectStore'
import { $customCatalog } from './catalogStore'
import { $simulateGlass } from './settingsStore'
import { assetKeys, deleteAsset, getAsset, putAsset } from './assetDb'
import {
  buildPrimitiveGeometry,
  PRIMITIVE_FACE_KEYS,
  applyFaceUvTransforms,
} from '../three/primitives'
import { buildMeshAtlasGlb } from '../ksa/exportGlb'
import { decodeImage, type ImageLevel } from '../ktx/decodeImage'
import { encodeImageToKtx2 } from '../ktx/encodeKtx2'
import { compositeGlow, solidGlowBitmap, neutralBase, type GlowBitmap } from '../ktx/glowComposite'
import {
  buildCustomFaceMaterial,
  makeFlatMaterial,
  buildGlowingFaceMaterial,
} from '../three/MaterialFactory'
import { kittenPartSubMeshes, kittenSpecFromSource } from '../ksa/kittenAssets'
import { bakeKittenSubMeshes, buildKittenMaterial } from '../three/kittenBake'

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
/** mesh id -> painted-glow-bitmap blob URL (used for the Glow panel thumbnail). */
const emissivePaintUrls = new Map<string, string>()

/** Reactive map of texture id -> source-image URL, for UI previews. */
export const $customTextureUrls = atom<Record<string, string>>({})
/** Reactive map of mesh id -> painted-glow-bitmap URL, for the Glow panel thumbnail. */
export const $emissivePaintUrls = atom<Record<string, string>>({})

function publishEmissivePaintUrls(): void {
  const rec: Record<string, string> = {}
  for (const [id, url] of emissivePaintUrls) rec[id] = url
  $emissivePaintUrls.set(rec)
}

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
export const customMeshRenderCache = new Map<
  string,
  {
    geometry: THREE.BufferGeometry
    materials: THREE.MeshStandardMaterial[]
  }
>()

/** Id of the custom mesh whose textures are currently being edited (null = panel closed). */
export const $managingMeshId = atom<string | null>(null)

export function setManagingMeshId(id: string | null): void {
  $managingMeshId.set(id)
}

/** Id of the mesh whose glow is being painted in the GlowPaintDialog (null = closed). */
export const $glowPaintMeshId = atom<string | null>(null)

export function setGlowPaintMeshId(id: string | null): void {
  $glowPaintMeshId.set(id)
}

function shortId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8)
}

function sanitizeIdent(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return cleaned || 'Asset'
}

// ── document mutation ────────────────────────────────────────────────────────
/**
 * True only while our own mutation helpers push a $part change. The {@link initCustomAssets}
 * subscriber checks this so it ignores changes we already rebuild for explicitly,
 * and reacts ONLY to external $part swaps (undo/redo, project load). nanostores
 * notifies synchronously inside `set()`, so the flag reliably brackets the notify.
 */
let internalCustomChange = false

function mutate(description: string, detail: string, fn: (part: EditingPart) => void): void {
  const current = $part.get()
  pushUndo(description, detail)
  const next = structuredClone(current)
  fn(next)
  internalCustomChange = true
  try {
    $part.set(next)
  } finally {
    internalCustomChange = false
  }
}

// ── face texture helpers ─────────────────────────────────────────────────────

/** True for a part-ified kitten submesh (geometry baked from the kitten gltf, not a primitive). */
export function isKittenMesh(m: CustomMesh): m is CustomMesh & { kitten: KittenMeshSource } {
  return !!m.kitten
}

/** The shared cached baked geometry for a kitten submesh, or null if the bake failed. */
async function bakedKittenGeometry(src: KittenMeshSource): Promise<THREE.BufferGeometry | null> {
  const subs = await bakeKittenSubMeshes(src.kind)
  return subs.find((s) => s.specKey === src.specKey)?.geometry ?? null
}

/** Returns the first valid textureId across all faces (for KSA single-material export). */
export function getPrimaryTextureId(m: CustomMesh): string {
  if (!m.primitive) return '' // kitten submeshes carry their texture in m.kitten, not customTextures
  for (const key of PRIMITIVE_FACE_KEYS[m.primitive.kind]) {
    const tid = m.faceTextures[key]?.textureId
    if (tid) return tid
  }
  return ''
}

// ── catalog + render cache ────────────────────────────────────────────────────

/**
 * Signature of the mesh state the runtime (atlas + render cache + `$customCatalog`)
 * currently reflects. Compared against the live `$part` in the {@link initCustomAssets}
 * subscriber so undo/redo (which restores `$part.customMeshes` without re-running the
 * mutation helpers) re-triggers a rebuild. Covers geometry (primitive) and per-face
 * texture assignments — the two inputs to the cache/atlas.
 */
let appliedMeshSig = ''

function meshSignature(part: EditingPart): string {
  return JSON.stringify(
    part.customMeshes.map((m) => ({
      s: m.subPartId,
      p: m.primitive,
      k: m.kitten,
      f: m.faceTextures,
      e: m.emissive,
      g: m.glass,
      su: m.surface,
    })),
  )
}

/** The glow bitmap (rgb=color, a=intensity) for a mesh's emissive config, or null when no glow. */
export async function glowBitmapFor(m: CustomMesh): Promise<GlowBitmap | null> {
  const e = m.emissive
  if (!e) return null
  if (e.shape === 'painted') {
    const png = await getAsset(assetKeys.emissivePaint(m.id))
    if (png) {
      const lvl = (await decodeImage(png)).levels[0]
      return { width: lvl.width, height: lvl.height, rgba: lvl.rgba }
    }
    // painted but no bitmap stored yet → fall back to the default color/strength as a solid.
  }
  return solidGlowBitmap(e.color, e.strength)
}

/** The decoded base diffuse for a primitive face (source image), or a neutral gray when untextured. */
async function faceBaseImage(texId: string | undefined): Promise<ImageLevel> {
  if (texId) {
    const src = await getAsset(assetKeys.textureSource(texId))
    if (src) return (await decodeImage(src)).levels[0]
  }
  return neutralBase()
}

/**
 * Builds the render-cache entry + catalog entry for a part-ified kitten submesh:
 * the shared cached baked geometry (never disposed — SubPartObject treats render-cache
 * geometry as shared) + a KSA PBR material (DoubleSide, mirroring KittenObject).
 */
async function buildKittenCatalogEntry(
  m: CustomMesh,
  kitten: KittenMeshSource,
): Promise<CatalogSubPart> {
  const geometry = await bakedKittenGeometry(kitten)
  const mat = await buildKittenSubMeshMaterial(m, kitten)
  mat.side = THREE.DoubleSide
  if (geometry) customMeshRenderCache.set(m.subPartId, { geometry, materials: [mat] })
  return {
    id: m.subPartId,
    atlasUrl: atlasUrl!,
    meshNodeName: m.subPartId,
    materialId: undefined,
    diffuseUrl: toUrl(kitten.diffuse),
    sourceFile: '(kitten)',
  }
}

/**
 * The editor material for a part-ified kitten submesh, honoring its glow / glass-tint / surface:
 *  - opaque glow (any non-glass submesh with a glow, or a visor in 'glow' mode) → a solid
 *    glow-color diffuse + white mask via {@link buildGlowingFaceMaterial} (matches export; the
 *    kitten texture is replaced by the glow color = "the whole submesh glows").
 *  - glass shell (visor 'glass'/'glassGlow') → the kitten material tinted + translucent; 'glassGlow'
 *    adds an emissive-uniform glow that shows through (a single-material approximation of the
 *    layered export). `$simulateGlass` mimics KSA's muted in-game glass.
 *  - everything else → the plain kitten material.
 */
async function buildKittenSubMeshMaterial(
  m: CustomMesh,
  kitten: KittenMeshSource,
): Promise<THREE.MeshStandardMaterial> {
  const transparent = !!kitten.transparent
  const surface = transparent ? (m.surface ?? 'glass') : undefined

  const opaqueGlow = transparent ? surface === 'glow' : !!m.emissive
  if (opaqueGlow && m.emissive) {
    const glow = await glowBitmapFor(m)
    if (glow) {
      const { diffuse, mask } = compositeGlow(neutralBase(), glow)
      return buildGlowingFaceMaterial(diffuse, mask)
    }
  }

  const wantTint = surface === 'glass' || surface === 'glassGlow'
  const glowUniform = surface === 'glassGlow' ? m.emissive : undefined
  return buildKittenMaterial(
    kittenSpecFromSource(kitten, {
      tint: wantTint ? m.glass?.tint : undefined,
      opacity: m.glass?.opacity,
      simulateGlass: wantTint && !!m.glass?.tint && $simulateGlass.get(),
      glowColor: glowUniform?.color,
      glowStrength: glowUniform?.strength,
    }),
  )
}

async function refreshCatalog(): Promise<void> {
  // Whatever we build below reflects the current $part; record it so the $part
  // subscriber doesn't treat our own rebuild as an external (undo/redo) change.
  appliedMeshSig = meshSignature($part.get())
  if (!atlasUrl) {
    customMeshRenderCache.clear()
    $customCatalog.set([])
    return
  }
  const part = $part.get()

  customMeshRenderCache.clear()

  const entries: CatalogSubPart[] = await Promise.all(
    part.customMeshes.map(async (m) => {
      if (m.kitten) return buildKittenCatalogEntry(m, m.kitten)
      const ft = m.faceTextures
      const faceKeys = PRIMITIVE_FACE_KEYS[m.primitive!.kind]

      // Build geometry with UV transforms baked in.
      const geometry = buildPrimitiveGeometry(m.primitive!)
      applyFaceUvTransforms(geometry, faceKeys, ft)

      // One material per face group. A glowing mesh composites its glow bitmap over each face's
      // base diffuse (source image, or neutral gray when untextured) so editor == export; an
      // un-glowing mesh keeps the diffuse-only path (flat fallback for untextured faces).
      const glow = await glowBitmapFor(m)
      const materials: THREE.MeshStandardMaterial[] = []
      for (const key of faceKeys) {
        const texId = ft[key]?.textureId
        const wrap = ft[key]?.wrap ?? 'repeat'
        if (glow) {
          const { diffuse, mask } = compositeGlow(await faceBaseImage(texId), glow)
          materials.push(buildGlowingFaceMaterial(diffuse, mask, wrap))
        } else {
          const ktx2Url = texId ? textureKtx2Urls.get(texId) : undefined
          materials.push(
            ktx2Url ? await buildCustomFaceMaterial(ktx2Url, wrap) : makeFlatMaterial(),
          )
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
async function rebuildAtlasNow(): Promise<void> {
  const part = $part.get()
  if (atlasUrl) {
    URL.revokeObjectURL(atlasUrl)
    atlasUrl = null
  }
  if (part.customMeshes.length > 0) {
    const nodes = await Promise.all(
      part.customMeshes.map(async (m) => {
        if (m.kitten) {
          // Clone the shared cached bake so the post-build dispose() below frees the
          // clone and leaves the cache (used by the render path) intact.
          const baked = await bakedKittenGeometry(m.kitten)
          return { name: m.subPartId, geometry: baked ? baked.clone() : new THREE.BufferGeometry() }
        }
        const faceKeys = PRIMITIVE_FACE_KEYS[m.primitive!.kind]
        const geometry = buildPrimitiveGeometry(m.primitive!)
        applyFaceUvTransforms(geometry, faceKeys, m.faceTextures)
        return { name: m.subPartId, geometry }
      }),
    )
    try {
      const glb = await buildMeshAtlasGlb(nodes)
      atlasUrl = URL.createObjectURL(new Blob([glb.slice()], { type: 'model/gltf-binary' }))
    } finally {
      for (const n of nodes) n.geometry.dispose()
    }
  }
  await refreshCatalog()
}

let rebuilding: Promise<void> | null = null
let rebuildAgain = false

/**
 * Serializes atlas rebuilds. Rebuilds revoke + recreate the shared atlas blob URL,
 * so two overlapping {@link rebuildAtlasNow} runs would race on it. Concurrent
 * callers (e.g. a mutation helper AND the $part undo/redo subscriber firing for the
 * same change) coalesce onto the in-flight run, with one extra pass queued so the
 * final rebuild always reflects the latest `$part` + texture URLs.
 */
function scheduleRebuild(): Promise<void> {
  if (rebuilding) {
    rebuildAgain = true
    return rebuilding
  }
  rebuilding = (async () => {
    try {
      do {
        rebuildAgain = false
        await rebuildAtlasNow()
      } while (rebuildAgain)
    } finally {
      rebuilding = null
    }
  })()
  return rebuilding
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

  const tex: CustomTexture = {
    id,
    name: name.trim() || 'texture',
    width: decoded.width,
    height: decoded.height,
  }
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
      faceTextures[key] = {
        textureId: args.textureId,
        uvScale: { x: 1, y: 1 },
        uvOffset: { x: 0, y: 0 },
      }
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
  await scheduleRebuild()
  addSubPart(mesh.subPartId)
  return mesh
}

/**
 * "Make Kitten Mesh" — part-ifies a kitten (hunter/polaris/banjo) into exportable
 * custom SubParts. In ONE undo step it creates a "<Name> Mesh" layer and adds the
 * kitten's submeshes (suit, head, eyes, helmet, visor, pack…) as custom meshes +
 * identity placements on that layer; the rebuild then bakes their geometry and
 * publishes the catalog/render-cache so they render via the normal SubPart pipeline.
 */
export async function makeKittenMeshPart(kind: KittenKind): Promise<void> {
  const subs = kittenPartSubMeshes(kind)
  const label = KITTEN_LABELS[kind]
  const layerId = nextLayerId($part.get())
  const newPlacementIndices: number[] = []
  mutate('make kitten mesh', label, (p) => {
    p.layers.push({ id: layerId, name: `${label} Mesh` })
    for (const sub of subs) {
      const subPartId = `flexo_${kind}_${sub.specKey}_${shortId()}`
      p.customMeshes.push({
        id: `mesh_${shortId()}`,
        name: `${label} ${sub.label}`,
        subPartId,
        kitten: sub.source,
        faceTextures: {},
      })
      // Keep instanceId unique across the whole part (e.g. two part-ified Hunters).
      const base = `${kind}_${sub.specKey}`
      const taken = p.placements.filter(
        (pl) => pl.instanceId === base || pl.instanceId.startsWith(`${base}_`),
      ).length
      p.placements.push({
        instanceId: `${base}_${taken + 1}`,
        subPartTemplateId: subPartId,
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        layerId,
      })
      newPlacementIndices.push(p.placements.length - 1)
    }
  })
  await scheduleRebuild()
  // Active layer + selection are ephemeral (not undo-tracked).
  setActiveLayer(layerId)
  setSelection(newPlacementIndices, [], [])
}

export async function updateCustomMesh(
  id: string,
  patch: Partial<Pick<CustomMesh, 'name' | 'primitive' | 'faceTextures'>>,
): Promise<void> {
  mutate('edit mesh', id, (p) => {
    const m = p.customMeshes.find((x) => x.id === id)
    if (m) Object.assign(m, patch)
  })
  if (patch.primitive) await scheduleRebuild()
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

/**
 * Sets (or clears, with `undefined`) a mesh's emissive glow config. Covers Off / Whole and the
 * color/strength controls. The painted bitmap is written separately by {@link setMeshGlowPainted}.
 */
export async function setMeshGlow(meshId: string, cfg: EmissiveConfig | undefined): Promise<void> {
  mutate('edit glow', meshId, (p) => {
    const m = p.customMeshes.find((x) => x.id === meshId)
    if (m) m.emissive = cfg
  })
  await refreshCatalog()
}

/** Sets (or clears) the translucent-glass tint for a glass-capable (visor) mesh. */
export async function setMeshGlass(meshId: string, cfg: GlassConfig | undefined): Promise<void> {
  mutate('edit visor tint', meshId, (p) => {
    const m = p.customMeshes.find((x) => x.id === meshId)
    if (m) m.glass = cfg
  })
  await refreshCatalog()
}

const DEFAULT_GLASS_TINT: GlassConfig = { tint: { r: 120, g: 200, b: 255 }, opacity: 0.45 }
const DEFAULT_GLOW: EmissiveConfig = {
  shape: 'whole',
  color: { r: 120, g: 220, b: 255 },
  strength: 0.6,
}

/**
 * Sets a glass-capable (visor) mesh's surface mode, seeding default tint/glow configs so the
 * relevant controls have something to edit. Both configs persist across mode switches (the mode
 * gates which one renders/exports), so toggling never discards the user's tint or glow settings.
 */
export async function setMeshSurface(meshId: string, surface: VisorSurface): Promise<void> {
  mutate('visor surface', meshId, (p) => {
    const m = p.customMeshes.find((x) => x.id === meshId)
    if (!m) return
    m.surface = surface
    if ((surface === 'glass' || surface === 'glassGlow') && !m.glass)
      m.glass = { ...DEFAULT_GLASS_TINT }
    if ((surface === 'glow' || surface === 'glassGlow') && !m.emissive)
      m.emissive = { ...DEFAULT_GLOW }
  })
  await refreshCatalog()
}

/**
 * Stores a painted glow bitmap (RGBA PNG) for a mesh and sets its emissive shape to 'painted'.
 * `defaults` seeds the descriptor's color/strength (the painter's brush defaults).
 */
export async function setMeshGlowPainted(
  meshId: string,
  png: Blob,
  defaults: { color: { r: number; g: number; b: number }; strength: number },
): Promise<void> {
  await putAsset(assetKeys.emissivePaint(meshId), png, 'image/png')
  const old = emissivePaintUrls.get(meshId)
  if (old) URL.revokeObjectURL(old)
  emissivePaintUrls.set(meshId, URL.createObjectURL(png))
  publishEmissivePaintUrls()
  mutate('paint glow', meshId, (p) => {
    const m = p.customMeshes.find((x) => x.id === meshId)
    if (m) m.emissive = { shape: 'painted', color: defaults.color, strength: defaults.strength }
  })
  await refreshCatalog()
}

export async function removeCustomMesh(id: string): Promise<void> {
  const mesh = $part.get().customMeshes.find((x) => x.id === id)
  mutate('remove mesh', mesh?.name ?? '', (p) => {
    p.customMeshes = p.customMeshes.filter((x) => x.id !== id)
    if (mesh) p.placements = p.placements.filter((pl) => pl.subPartTemplateId !== mesh.subPartId)
  })
  const paintUrl = emissivePaintUrls.get(id)
  if (paintUrl) URL.revokeObjectURL(paintUrl)
  emissivePaintUrls.delete(id)
  publishEmissivePaintUrls()
  void deleteAsset(assetKeys.emissivePaint(id))
  await scheduleRebuild()
}

// ── hydration on project load ─────────────────────────────────────────────────
export async function hydrateCustomAssets(): Promise<void> {
  for (const id of [...textureKtx2Urls.keys(), ...textureSrcUrls.keys()]) revokeTexture(id)
  publishTextureUrls()
  for (const url of emissivePaintUrls.values()) URL.revokeObjectURL(url)
  emissivePaintUrls.clear()

  const part = $part.get()
  for (const t of part.customTextures) {
    const k = await getAsset(assetKeys.textureKtx2(t.id))
    if (k) textureKtx2Urls.set(t.id, URL.createObjectURL(k))
    const s = await getAsset(assetKeys.textureSource(t.id))
    if (s) textureSrcUrls.set(t.id, URL.createObjectURL(s))
  }
  publishTextureUrls()
  // Reload painted-glow bitmaps (the 'whole' shape is regenerated from color/strength — no blob).
  for (const m of part.customMeshes) {
    if (m.emissive?.shape === 'painted') {
      const png = await getAsset(assetKeys.emissivePaint(m.id))
      if (png) emissivePaintUrls.set(m.id, URL.createObjectURL(png))
    }
  }
  publishEmissivePaintUrls()
  await scheduleRebuild()
}

/**
 * Wires the custom-asset hydration into the project lifecycle. Must be called
 * once from main.tsx AFTER hydrateProjectOnBoot() so that the immediate
 * subscriber callback reads the already-populated $part (not the initial empty
 * createEmptyPart()). Calling it before hydrateProjectOnBoot() would hydrate
 * against the wrong part, and for projects whose name equals the default
 * ("Untitled") the $projectName atom would never re-fire (nanostores skips
 * same-value sets), so the real project's assets would never load.
 */
export function initCustomAssets(): void {
  if (typeof indexedDB === 'undefined' || typeof window === 'undefined') return
  $projectName.subscribe(() => {
    void hydrateCustomAssets().catch((err) =>
      console.warn('flexo: custom-asset hydrate failed', err),
    )
  })
  // Undo/redo (and any external $part swap) restores customMeshes without running
  // the mutation helpers, so the atlas / render cache / $customCatalog go stale and
  // the restored — or any newly added — instances render nothing until reload. Watch
  // for a mesh-set/geometry/face-texture change the runtime hasn't applied yet and
  // rebuild. Cheap no-op on unrelated $part changes (transform edits, etc.).
  $part.subscribe((part) => {
    if (internalCustomChange) return // our own helpers rebuild explicitly
    if (meshSignature(part) !== appliedMeshSig) {
      void scheduleRebuild().catch((err) => console.warn('flexo: custom-mesh rebuild failed', err))
    }
  })
  // The "simulate in-game glass" preview toggle changes how tinted visor materials are built —
  // rebuild the catalog (materials only) when it flips. `.listen` skips the initial value.
  $simulateGlass.listen(() => {
    void refreshCatalog().catch((err) => console.warn('flexo: glass-sim refresh failed', err))
  })
}
