import * as THREE from 'three'
import { atom } from 'nanostores'
import type { CatalogSubPart } from '../ksa/catalog'
import { toUrl } from '../ksa/catalog'
import type {
  CustomMaterial,
  CustomMesh,
  CustomTexture,
  EditingPart,
  EmissiveConfig,
  FaceTextureConfig,
  GlassConfig,
  ImportedMeshSource,
  KittenKind,
  KittenMeshSource,
  PrimitiveSpec,
  ScalarChannel,
  TextureChannel,
  VisorSurface,
} from '../ksa/types'
import {
  BUILT_IN_LAYER_IDS,
  DEFAULT_LAYER_ID,
  KITTEN_LABELS,
  createDefaultMaterial,
  materialTextureIds,
  meshKind,
} from '../ksa/types'
import type { NormalizedImport } from '../ksa/importNormalize'
import type { ImportMaterialPlan } from '../ksa/importMaterials'
import {
  $activeLayerId,
  $part,
  pushUndo,
  addSubPart,
  nextLayerId,
  setActiveLayer,
  setSelection,
} from './editorStore'
import { $projectName } from './projectStore'
import { $customCatalog } from './catalogStore'
import { $modelImportSettings, $simulateGlass } from './settingsStore'
import { assetKeys, deleteAsset, getAsset, putAsset } from './assetDb'
import {
  buildPrimitiveGeometry,
  PRIMITIVE_FACE_KEYS,
  applyFaceUvTransforms,
} from '../three/primitives'
import { buildMeshAtlasGlb } from '../ksa/exportGlb'
import { decodeImage, type ImageLevel } from '../ktx/decodeImage'
import { encodeImageToKtx2, isLegacySrgbKtx2 } from '../ktx/encodeKtx2'
import { prepareChannelImage } from '../ktx/channelTransforms'
import {
  baseSizeFor,
  compositeGlow,
  solidGlowBitmap,
  neutralBase,
  solidBase,
  type GlowBitmap,
} from '../ktx/glowComposite'
import {
  applyMaterialChannels,
  buildCustomFaceMaterial,
  buildCustomMaterial,
  makeFlatMaterial,
  buildGlowingFaceMaterial,
  type MaterialChannelMaps,
} from '../three/MaterialFactory'
import { kittenPartSubMeshes, kittenSpecFromSource } from '../ksa/kittenAssets'
import { bakeKittenSubMeshes, buildKittenMaterial } from '../three/kittenBake'
import {
  clearImportAtlases,
  ensureImportAtlas,
  getImportedGeometry,
  importAtlasUrl,
  registerImportAtlas,
  releaseImportAtlas,
} from '../three/importedMeshCache'

/**
 * Orchestrates user-created custom assets (textures + primitive meshes). Ties the
 * document descriptors ({@link EditingPart.customTextures}/{@link EditingPart.customMeshes})
 * to (a) their binaries in IndexedDB, (b) runtime blob URLs the renderer/UI consume,
 * (c) synthetic {@link CatalogSubPart} entries in `$customCatalog`, and (d) the
 * {@link customMeshRenderCache} — per-mesh pre-built Three.js geometry + per-face
 * material arrays used by SubPartObject to render per-face textures and baked UV
 * transforms directly, bypassing the atlas-GLB round-trip.
 *
 * Design notes (see plans/FLEXO_CUSTOM_ASSETS.md, plans/IMPORT_MODELS.md):
 *  - Texture binaries (source image + encoded .ktx2) persist in IndexedDB.
 *    Primitive/kitten mesh GLBs are NOT persisted — regenerated from the primitive
 *    params / re-baked from the kitten gltf. An IMPORTED model's normalized GLB is
 *    the exception: it is the only copy of that geometry, so it persists under
 *    `assetKeys.importGlb` and doubles as that batch's own mesh atlas (see
 *    src/three/importedMeshCache.ts).
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

/**
 * An open request for the model-import dialog (null = closed). Ephemeral UI state, like the
 * two ids above: the dialog is mounted once in `app.tsx` and opened from BOTH entry points —
 * the Add menu (with no files, so it shows its drop zone) and a drag-drop onto the 3D
 * viewport (with the dropped files, so it goes straight to the review step). `id` changes on
 * every open so the dialog body remounts with fresh per-import state.
 */
export interface ImportModelRequest {
  id: string
  files: File[]
}

export const $importModelRequest = atom<ImportModelRequest | null>(null)

export function openImportModel(files: File[] = []): void {
  $importModelRequest.set({ id: shortId(), files })
}

export function closeImportModel(): void {
  $importModelRequest.set(null)
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

/**
 * Returns the first valid textureId across all faces (for KSA single-material export).
 * Only primitives have faces: a kitten submesh carries its texture in `m.kitten`, and an
 * imported mesh gets its surface from its {@link CustomMaterial} (Phase 2) — neither has a
 * per-face texture grid.
 */
export function getPrimaryTextureId(m: CustomMesh): string {
  switch (meshKind(m)) {
    case 'kitten':
    case 'imported':
      return ''
    case 'primitive': {
      if (!m.primitive) return ''
      for (const key of PRIMITIVE_FACE_KEYS[m.primitive.kind]) {
        const tid = m.faceTextures[key]?.textureId
        if (tid) return tid
      }
      return ''
    }
  }
}

// ── catalog + render cache ────────────────────────────────────────────────────

/**
 * Signature of the mesh state the runtime (atlas + render cache + `$customCatalog`)
 * currently reflects. Compared against the live `$part` in the {@link initCustomAssets}
 * subscriber so undo/redo (which restores `$part.customMeshes` without re-running the
 * mutation helpers) re-triggers a rebuild. Covers geometry (primitive params, kitten
 * submesh, imported mesh reference) and per-face texture assignments — the inputs to
 * the cache/atlas.
 */
let appliedMeshSig = ''

function meshSignature(part: EditingPart): string {
  return JSON.stringify({
    meshes: part.customMeshes.map((m) => ({
      s: m.subPartId,
      p: m.primitive,
      k: m.kitten,
      // Only the geometry-resolving fields of an imported source: which GLB, which mesh in
      // it, and whether it renders as glass. Provenance/counts can't change what we build.
      // Without this an undo of an import would leave the imported SubParts in the scene.
      i: m.imported
        ? { i: m.imported.importId, n: m.imported.meshName, t: m.imported.transparent }
        : undefined,
      f: m.faceTextures,
      mt: m.materialId,
      e: m.emissive,
      g: m.glass,
      su: m.surface,
    })),
    // Material CONTENTS feed the render cache (color/metal/rough per face), so an
    // undo/redo of a material edit must re-trigger a rebuild too.
    materials: part.customMaterials,
  })
}

/** The mesh's material, or undefined when unassigned / dangling. */
function materialFor(part: EditingPart, m: CustomMesh): CustomMaterial | undefined {
  return m.materialId ? part.customMaterials.find((x) => x.id === m.materialId) : undefined
}

/** The uniform value of a scalar channel; a mapped channel multiplies at 1 (three convention). */
function scalarValue(c: ScalarChannel, fallback: number): number {
  return c.kind === 'value' ? c.value : fallback
}

/** ktx2 blob URL for a map-kind scalar channel, if any. */
function scalarMapUrl(c: ScalarChannel): string | undefined {
  return c.kind === 'map' ? textureKtx2Urls.get(c.textureId) : undefined
}

/**
 * Resolves a material's scalar/normal channels into the editor inputs
 * ({@link MaterialChannelMaps}): uniform values pass through as scalars; mapped
 * channels resolve to their stored-.ktx2 blob URLs with the scalar forced to 1
 * (three multiplies map × scalar; KSA reads the map alone — same result). A packed
 * ORM overrides the three separate channels, mirroring the export.
 */
function resolveMaterialChannels(material: CustomMaterial): MaterialChannelMaps {
  const ormPackedUrl = material.ormPacked
    ? textureKtx2Urls.get(material.ormPacked.textureId)
    : undefined
  const metalnessMapUrl = ormPackedUrl ? undefined : scalarMapUrl(material.metalness)
  const roughnessMapUrl = ormPackedUrl ? undefined : scalarMapUrl(material.roughness)
  const occlusionMapUrl =
    ormPackedUrl || !material.occlusion
      ? undefined
      : textureKtx2Urls.get(material.occlusion.textureId)
  return {
    metalness: ormPackedUrl || metalnessMapUrl ? 1 : scalarValue(material.metalness, 0),
    roughness: ormPackedUrl || roughnessMapUrl ? 1 : scalarValue(material.roughness, 0.5),
    metalnessMapUrl,
    roughnessMapUrl,
    occlusionMapUrl,
    ormPackedUrl,
    normalMapUrl: material.normal ? textureKtx2Urls.get(material.normal.textureId) : undefined,
    normalScale: material.normal?.strength,
  }
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

/**
 * The decoded base diffuse a glow composites over, for one primitive face: the face's
 * texture → the material's baseColor image → the material's picked color (as a solid)
 * → neutral gray. Mirrors the export-side resolution in modExport so editor == export.
 *
 * `glow` sizes the SYNTHESISED bases only: compositeGlow outputs at the base's resolution,
 * so a 4×4 solid would throw away a high-resolution glow (see glowComposite.baseSizeFor).
 */
async function faceBaseImage(
  texId: string | undefined,
  material: CustomMaterial | undefined,
  glow?: GlowBitmap | null,
): Promise<ImageLevel> {
  const mapTexId =
    texId || (material?.baseColor.kind === 'map' ? material.baseColor.textureId : undefined)
  if (mapTexId) {
    const src = await getAsset(assetKeys.textureSource(mapTexId))
    if (src) return (await decodeImage(src)).levels[0]
  }
  const { width, height } = baseSizeFor(glow)
  if (material?.baseColor.kind === 'color')
    return solidBase(material.baseColor.color, width, height)
  return neutralBase(width, height)
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
      const size = baseSizeFor(glow)
      const { diffuse, mask } = compositeGlow(neutralBase(size.width, size.height), glow)
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

/**
 * Builds the render-cache entry + catalog entry for an IMPORTED glTF mesh.
 *
 * The batch's own normalized GLB IS the mesh atlas here (it holds one named mesh per imported
 * SubPart, exactly like a KSA `<MeshAtlas>`), so the entry points at that blob URL rather than
 * the shared primitive/kitten atlas — truthful, and it still resolves if the render cache ever
 * misses. Geometry comes from the shared MeshAtlasCache (tangents, node transform baked), so
 * imported SubParts render through the identical path as Core ones.
 *
 * The surface goes through the SAME resolvers as a primitive's — `resolveMaterialChannels` +
 * `buildCustomMaterial`, and `glowBitmapFor` + `compositeGlow` + `buildGlowingFaceMaterial`
 * for a glow — so the editor preview and the exported `<PbrMaterial>` are produced by one
 * body of code. The only difference is that an imported mesh has no per-face grid: one
 * material for the whole mesh, exactly like a KSA `<PartModel>`.
 */
async function buildImportedCatalogEntry(
  part: EditingPart,
  m: CustomMesh,
  imported: ImportedMeshSource,
): Promise<CatalogSubPart | null> {
  const url = importAtlasUrl(imported.importId)
  const geometry = await getImportedGeometry(imported.importId, imported.meshName)
  if (!url || !geometry) {
    console.warn(`flexo: imported mesh '${m.name}' has no resolvable geometry — skipped`)
    return null
  }

  const material = materialFor(part, m)
  const channels = material ? resolveMaterialChannels(material) : undefined
  const baseMapUrl =
    material?.baseColor.kind === 'map'
      ? textureKtx2Urls.get(material.baseColor.textureId)
      : undefined
  const glow = await glowBitmapFor(m)

  let mat: THREE.MeshStandardMaterial
  if (glow) {
    const { diffuse, mask } = compositeGlow(await faceBaseImage(undefined, material, glow), glow)
    const pbr = channels
      ? { metalness: channels.metalness, roughness: channels.roughness }
      : undefined
    mat = buildGlowingFaceMaterial(diffuse, mask, 'repeat', pbr)
    // SubPartObject re-applies the shader patches per instance from the final map set, so
    // attaching the material's map channels here leaves the flags correct.
    if (channels) await applyMaterialChannels(mat, channels)
  } else if (channels) {
    mat = await buildCustomMaterial({
      mapUrl: baseMapUrl,
      color: material?.baseColor.kind === 'color' ? material.baseColor.color : undefined,
      wrap: 'repeat',
      ...channels,
    })
  } else {
    mat = makeFlatMaterial()
  }
  customMeshRenderCache.set(m.subPartId, { geometry, materials: [mat] })
  return {
    id: m.subPartId,
    atlasUrl: url,
    meshNodeName: m.subPartId,
    materialId: undefined,
    // Cache-busting key for the shared-material cache, exactly like the primitive path.
    diffuseUrl: baseMapUrl,
    sourceFile: '(imported)',
  }
}

/**
 * Builds the render-cache entry + catalog entry for a parametric primitive mesh: geometry with
 * the per-face UV transforms baked in, and one material per face group.
 */
async function buildPrimitiveCatalogEntry(
  part: EditingPart,
  m: CustomMesh,
): Promise<CatalogSubPart | null> {
  if (!m.primitive) {
    console.warn(`flexo: custom mesh '${m.name}' has no geometry source — skipped`)
    return null
  }
  const ft = m.faceTextures
  const faceKeys = PRIMITIVE_FACE_KEYS[m.primitive.kind]

  // Build geometry with UV transforms baked in.
  const geometry = buildPrimitiveGeometry(m.primitive)
  applyFaceUvTransforms(geometry, faceKeys, ft)

  // One material per face group. Resolution per face: the face's own texture overrides
  // the mesh material's base color; the scalar/map/normal channels always come from the
  // mesh material (neutral when unassigned). A glowing mesh composites its glow bitmap
  // over the same resolved base so editor == export; meshes with neither material nor
  // face texture keep the legacy flat look.
  const glow = await glowBitmapFor(m)
  const material = materialFor(part, m)
  const channels = material ? resolveMaterialChannels(material) : undefined
  const materials: THREE.MeshStandardMaterial[] = []
  for (const key of faceKeys) {
    const texId = ft[key]?.textureId
    const wrap = ft[key]?.wrap ?? 'repeat'
    if (glow) {
      const { diffuse, mask } = compositeGlow(await faceBaseImage(texId, material, glow), glow)
      const pbr = channels
        ? { metalness: channels.metalness, roughness: channels.roughness }
        : undefined
      const gmat = buildGlowingFaceMaterial(diffuse, mask, wrap, pbr)
      // Attach the material's map channels too; SubPartObject re-applies the shader
      // patches per instance from the final map set, so the flags end up correct.
      if (channels) await applyMaterialChannels(gmat, channels)
      materials.push(gmat)
    } else if (material && channels) {
      const faceUrl = texId ? textureKtx2Urls.get(texId) : undefined
      const baseMapUrl =
        faceUrl ??
        (material.baseColor.kind === 'map'
          ? textureKtx2Urls.get(material.baseColor.textureId)
          : undefined)
      materials.push(
        await buildCustomMaterial({
          mapUrl: baseMapUrl,
          color: material.baseColor.kind === 'color' ? material.baseColor.color : undefined,
          wrap,
          ...channels,
        }),
      )
    } else {
      const ktx2Url = texId ? textureKtx2Urls.get(texId) : undefined
      materials.push(ktx2Url ? await buildCustomFaceMaterial(ktx2Url, wrap) : makeFlatMaterial())
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
}

async function refreshCatalog(): Promise<void> {
  // Whatever we build below reflects the current $part; record it so the $part
  // subscriber doesn't treat our own rebuild as an external (undo/redo) change.
  appliedMeshSig = meshSignature($part.get())
  const part = $part.get()

  customMeshRenderCache.clear()

  // The shared atlas backs primitive + kitten meshes ONLY, so its absence must not silence
  // imported ones: a project whose only custom meshes are imported has no shared atlas at all
  // (each import batch brings its own GLB) and still has to render.
  const entries = await Promise.all(
    part.customMeshes.map(async (m): Promise<CatalogSubPart | null> => {
      switch (meshKind(m)) {
        case 'imported':
          return m.imported ? buildImportedCatalogEntry(part, m, m.imported) : null
        case 'kitten':
          return m.kitten && atlasUrl ? buildKittenCatalogEntry(m, m.kitten) : null
        case 'primitive':
          return atlasUrl ? buildPrimitiveCatalogEntry(part, m) : null
      }
    }),
  )
  $customCatalog.set(entries.filter((e) => e !== null))
}

/**
 * Rebuilds the combined mesh-atlas GLB blob for the GENERATED meshes (primitives + kitten
 * bakes), then refreshes the catalog.
 *
 * IMPORTED meshes contribute nothing here on purpose: each import batch already persists its
 * own normalized GLB, which doubles as that batch's mesh atlas (importedMeshCache). Re-encoding
 * a multi-megabyte imported model through GLTFExporter on every face-texture tweak or undo
 * would be a serious perf regression for zero gain.
 */
async function rebuildAtlasNow(): Promise<void> {
  const part = $part.get()
  if (atlasUrl) {
    URL.revokeObjectURL(atlasUrl)
    atlasUrl = null
  }
  const nodes: { name: string; geometry: THREE.BufferGeometry }[] = []
  for (const m of part.customMeshes) {
    switch (meshKind(m)) {
      case 'imported':
        break // has its own GLB — see the header above
      case 'kitten': {
        if (!m.kitten) break
        // Clone the shared cached bake so the post-build dispose() below frees the
        // clone and leaves the cache (used by the render path) intact.
        const baked = await bakedKittenGeometry(m.kitten)
        nodes.push({
          name: m.subPartId,
          geometry: baked ? baked.clone() : new THREE.BufferGeometry(),
        })
        break
      }
      case 'primitive': {
        if (!m.primitive) break
        const faceKeys = PRIMITIVE_FACE_KEYS[m.primitive.kind]
        const geometry = buildPrimitiveGeometry(m.primitive)
        applyFaceUvTransforms(geometry, faceKeys, m.faceTextures)
        nodes.push({ name: m.subPartId, geometry })
        break
      }
    }
  }
  if (nodes.length > 0) {
    try {
      const glb = await buildMeshAtlasGlb(nodes)
      atlasUrl = URL.createObjectURL(new Blob([glb.slice()], { type: 'model/gltf-binary' }))
    } finally {
      for (const n of nodes) n.geometry.dispose()
    }
  }
  // Always refresh: an import-only project builds no shared atlas but still has a catalog.
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

/**
 * Creates a texture's BINARIES and runtime URLs and returns its descriptor — everything
 * {@link addCustomTexture} does EXCEPT touching the document.
 *
 * Split out because an import creates several textures, several materials and several meshes
 * that must land in ONE undo step: each `mutate()` is one undo entry, so the non-mutating
 * halves have to be callable on their own (see {@link importModelAsMeshes}).
 */
async function createTextureAsset(
  file: Blob,
  name: string,
  channel: TextureChannel,
  maxSize?: number,
): Promise<CustomTexture> {
  const id = `tex_${shortId()}`
  const decoded = prepareChannelImage(await decodeImage(file, maxSize), channel)
  const ktx2 = await encodeImageToKtx2(decoded, { zstd: true })

  await putAsset(assetKeys.textureSource(id), file, file.type || 'image/png')
  await putAsset(assetKeys.textureKtx2(id), ktx2, 'image/ktx2')

  textureKtx2Urls.set(id, URL.createObjectURL(new Blob([ktx2.slice()], { type: 'image/ktx2' })))
  textureSrcUrls.set(id, URL.createObjectURL(file))
  publishTextureUrls()

  return {
    id,
    name: name.trim() || 'texture',
    width: decoded.width,
    height: decoded.height,
    channel,
  }
}

export async function addCustomTexture(
  file: Blob,
  name: string,
  channel: TextureChannel = 'baseColor',
): Promise<CustomTexture> {
  const tex = await createTextureAsset(file, name, channel)
  mutate('add texture', tex.name, (p) => {
    p.customTextures.push(tex)
  })
  return tex
}

/**
 * Re-declares which PBR channel an uploaded image is for: re-encodes the stored
 * .ktx2 from the original source with the new channel's transforms (the encode is
 * a derived cache of the source), updates the descriptor, and rebuilds the catalog.
 */
export async function setTextureChannel(id: string, channel: TextureChannel): Promise<void> {
  const src = await getAsset(assetKeys.textureSource(id))
  if (!src) return
  const decoded = prepareChannelImage(await decodeImage(src), channel)
  const ktx2 = await encodeImageToKtx2(decoded, { zstd: true })
  await putAsset(assetKeys.textureKtx2(id), ktx2, 'image/ktx2')
  const old = textureKtx2Urls.get(id)
  if (old) URL.revokeObjectURL(old)
  textureKtx2Urls.set(id, URL.createObjectURL(new Blob([ktx2.slice()], { type: 'image/ktx2' })))
  publishTextureUrls()

  const name = $part.get().customTextures.find((t) => t.id === id)?.name ?? ''
  mutate('texture channel', name, (p) => {
    const t = p.customTextures.find((x) => x.id === id)
    if (t) t.channel = channel
  })
  await refreshCatalog()
}

/**
 * Downgrades every material channel that references the removed texture to its
 * uniform/absent form, so material 'map' channels only ever point at live textures
 * (the project-JSON export gate relies on this invariant — see projectTransfer).
 */
function clearMaterialTextureRefs(mat: CustomMaterial, textureId: string): void {
  const fresh = createDefaultMaterial(mat.id, mat.name)
  if (mat.baseColor.kind === 'map' && mat.baseColor.textureId === textureId) {
    mat.baseColor = fresh.baseColor
  }
  if (mat.metalness.kind === 'map' && mat.metalness.textureId === textureId) {
    mat.metalness = fresh.metalness
  }
  if (mat.roughness.kind === 'map' && mat.roughness.textureId === textureId) {
    mat.roughness = fresh.roughness
  }
  if (mat.occlusion?.textureId === textureId) delete mat.occlusion
  if (mat.ormPacked?.textureId === textureId) delete mat.ormPacked
  if (mat.normal?.textureId === textureId) delete mat.normal
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
    for (const mat of p.customMaterials) clearMaterialTextureRefs(mat, id)
  })
  revokeTexture(id)
  void deleteAsset(assetKeys.textureSource(id))
  void deleteAsset(assetKeys.textureKtx2(id))
  publishTextureUrls()
  void refreshCatalog()
}

// ── materials ────────────────────────────────────────────────────────────────

/**
 * The descriptor half of {@link addCustomMaterial} — pure, no document write. Same split
 * rationale as {@link createTextureAsset}: an import builds several of these and commits them
 * all in one `mutate()`.
 */
function buildCustomMaterialDescriptor(
  name: string,
  init?: Partial<Omit<CustomMaterial, 'id' | 'name'>>,
): CustomMaterial {
  return {
    ...createDefaultMaterial(`mat_${shortId()}`, name.trim() || 'material'),
    ...init,
  }
}

/**
 * Creates a reusable material. `init` overlays the neutral defaults (a preset's
 * metal/rough values, a picked base color). Returns the created material.
 */
export async function addCustomMaterial(
  name: string,
  init?: Partial<Omit<CustomMaterial, 'id' | 'name'>>,
): Promise<CustomMaterial> {
  const mat = buildCustomMaterialDescriptor(name, init)
  mutate('add material', mat.name, (p) => {
    p.customMaterials.push(mat)
  })
  await refreshCatalog()
  return mat
}

export async function updateCustomMaterial(
  id: string,
  patch: Partial<Omit<CustomMaterial, 'id'>>,
): Promise<void> {
  const name = $part.get().customMaterials.find((m) => m.id === id)?.name ?? ''
  mutate('edit material', patch.name ?? name, (p) => {
    const m = p.customMaterials.find((x) => x.id === id)
    if (m) Object.assign(m, patch)
  })
  await refreshCatalog()
}

/** Removes a material and unassigns it from every mesh that referenced it. */
export async function removeCustomMaterial(id: string): Promise<void> {
  const name = $part.get().customMaterials.find((m) => m.id === id)?.name ?? ''
  mutate('remove material', name, (p) => {
    p.customMaterials = p.customMaterials.filter((m) => m.id !== id)
    for (const m of p.customMeshes) {
      if (m.materialId === id) delete m.materialId
    }
  })
  await refreshCatalog()
}

/** Assigns (or clears, with `undefined`) a mesh's material. */
export async function setMeshMaterial(
  meshId: string,
  materialId: string | undefined,
): Promise<void> {
  const name = $part.get().customMeshes.find((m) => m.id === meshId)?.name ?? ''
  mutate('assign material', name, (p) => {
    const m = p.customMeshes.find((x) => x.id === meshId)
    if (!m) return
    if (materialId) m.materialId = materialId
    else delete m.materialId
  })
  await refreshCatalog()
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
  /** Seeds every face with this texture (the quick "image on a shape" path). */
  textureId: string
  /** The {@link CustomMaterial} for the whole mesh (color/metal/rough/normal). */
  materialId?: string
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
  if (args.materialId) mesh.materialId = args.materialId
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

/** Layer/instance-id base for an imported SubPart: lowercase, id-safe, never empty. */
function instanceBase(name: string): string {
  return sanitizeIdent(name).toLowerCase()
}

/**
 * Turns the {@link ImportMaterialPlan}'s specs into real flexo assets: one
 * {@link CustomTexture} per {@link ImportTextureSpec} (binaries + KTX2 + blob URLs) and one
 * {@link CustomMaterial} per {@link ImportMaterialSpec}, wired to those texture ids.
 *
 * NOTHING here writes to the document — the descriptors are handed back for the single
 * `mutate()` in {@link importModelAsMeshes}. Imported textures and materials are ORDINARY
 * flexo assets from this point on: editable in the material dialog, reusable on other meshes,
 * deletable, and exported through the same `<PbrMaterial>` path as hand-authored ones.
 */
async function createImportMaterialAssets(
  plan: ImportMaterialPlan,
): Promise<{ textures: CustomTexture[]; materials: Map<string, CustomMaterial> }> {
  const textureByKey = new Map<string, CustomTexture>()
  // The SAME cap `planImportMaterials` decoded with (settingsStore), so the .ktx2 that ships
  // is the size the import dialog costed — flexo's KTX2 is uncompressed RGBA8, so this cap is
  // the user's only VRAM lever until block compression lands.
  const maxSize = $modelImportSettings.get().maxTextureSize
  for (const spec of plan.textures) {
    const blob = new Blob([spec.bytes.slice()], { type: spec.mime })
    textureByKey.set(spec.key, await createTextureAsset(blob, spec.name, spec.channel, maxSize))
  }

  const materials = new Map<string, CustomMaterial>()
  for (const spec of plan.materials) {
    const baseTex = spec.baseColorTextureKey
      ? textureByKey.get(spec.baseColorTextureKey)
      : undefined
    const ormTex = spec.ormTextureKey ? textureByKey.get(spec.ormTextureKey) : undefined
    const normalTex = spec.normalTextureKey ? textureByKey.get(spec.normalTextureKey) : undefined
    const init: Partial<Omit<CustomMaterial, 'id' | 'name'>> = {
      baseColor: baseTex
        ? { kind: 'map', textureId: baseTex.id }
        : { kind: 'color', color: spec.baseColor ?? { r: 255, g: 255, b: 255 } },
      // The scalars are what KSA gets when there is no packed image (as a solid ORM texel);
      // an ormPacked texture overrides them in both the editor and the export.
      metalness: { kind: 'value', value: spec.metalness },
      roughness: { kind: 'value', value: spec.roughness },
    }
    if (ormTex) init.ormPacked = { textureId: ormTex.id }
    if (normalTex) init.normal = { textureId: normalTex.id, strength: spec.normalStrength }
    materials.set(spec.key, buildCustomMaterialDescriptor(spec.name, init))
  }
  return { textures: [...textureByKey.values()], materials }
}

/**
 * Commits a normalized model import into the document — the editor-facing half of the importer
 * (parse/analyze/normalize/translate live in `loadModelFile.ts` + `importPlan.ts` +
 * `importNormalize.ts` + `importMaterials.ts`).
 *
 * In ONE undo step it creates a layer named after the file, every imported texture and
 * material, one {@link CustomMesh} per normalized mesh, and one placement per instance the
 * plan found (one SubPart, N placements — KSA's own instancing pattern). The rebuild then
 * publishes the catalog/render-cache so the imported SubParts render through the normal
 * SubPart pipeline, exactly like a primitive.
 *
 * ONE UNDO STEP is the constraint that shapes this function: `mutate()` pushes an undo entry,
 * so every binary (the geometry GLB, each texture's source + .ktx2, each glow bitmap) is
 * written and registered FIRST, and a single `mutate()` at the end appends all the
 * descriptors at once. It is also required for correctness — the rebuild that mutation
 * triggers resolves geometry, texture URLs and glow bitmaps out of exactly those binaries.
 */
export async function importModelAsMeshes(
  normalized: NormalizedImport,
  fileName: string,
  materialPlan?: ImportMaterialPlan,
): Promise<void> {
  await putAsset(assetKeys.importGlb(normalized.importId), normalized.glb, 'model/gltf-binary')
  registerImportAtlas(normalized.importId, normalized.glb)

  const assets = materialPlan
    ? await createImportMaterialAssets(materialPlan)
    : { textures: [], materials: new Map<string, CustomMaterial>() }

  /**
   * Mesh descriptors are built BEFORE the mutation because a glowing material's bitmap is
   * keyed by the mesh id (assetKeys.emissivePaint), so the id has to exist before the blob
   * can be written — and the blob has to exist before the rebuild reads it.
   */
  const meshes: CustomMesh[] = []
  for (const mesh of normalized.meshes) {
    const spec = materialPlan?.materialKeyByGroup.get(mesh.materialGroupKey)
    const material = spec ? assets.materials.get(spec) : undefined
    const materialSpec = spec ? materialPlan?.materials.find((m) => m.key === spec) : undefined
    const id = `mesh_${shortId()}`
    const descriptor: CustomMesh = {
      id,
      name: mesh.name,
      subPartId: mesh.subPartId,
      imported: {
        importId: normalized.importId,
        // The GLB names every mesh by its subPartId (see importNormalize's atlas build).
        meshName: mesh.subPartId,
        sourceFile: normalized.fileName,
        sourceNode: mesh.sourceNode,
        sourceMaterial: mesh.sourceMaterial,
        triangles: mesh.triangles,
        vertices: mesh.vertices,
      },
      faceTextures: {},
    }
    if (material) descriptor.materialId = material.id
    if (materialSpec?.transparent) descriptor.imported!.transparent = true
    if (materialSpec?.glowPng) {
      // REUSE OF THE 'painted' SHAPE (plans/IMPORT_MODELS.md §3.4 called for a new 'map'
      // shape): an imported emissive is exactly what 'painted' already models — an RGBA
      // bitmap where rgb is the glow colour and a is the intensity, stored under
      // assetKeys.emissivePaint(meshId). Reusing it means glowBitmapFor(), compositeGlow(),
      // the editor material and the exporter all work unchanged, and the user can retouch
      // an imported glow in the existing paint dialog.
      const png = new Blob([materialSpec.glowPng.slice()], { type: 'image/png' })
      await putAsset(assetKeys.emissivePaint(id), png, 'image/png')
      emissivePaintUrls.set(id, URL.createObjectURL(png))
      descriptor.emissive = {
        shape: 'painted',
        color: materialSpec.glowColor ?? DEFAULT_GLOW.color,
        strength: materialSpec.glowStrength ?? DEFAULT_GLOW.strength,
      }
    }
    meshes.push(descriptor)
  }
  publishEmissivePaintUrls()

  const layerId = nextLayerId($part.get())
  const layerName = fileName.replace(/\.[^.]+$/, '') || 'Imported model'
  const newPlacementIndices: number[] = []
  mutate('import model', fileName, (p) => {
    p.layers.push({ id: layerId, name: layerName })
    p.customTextures.push(...assets.textures)
    p.customMaterials.push(...assets.materials.values())
    for (let i = 0; i < normalized.meshes.length; i++) {
      const mesh = normalized.meshes[i]!
      p.customMeshes.push(meshes[i]!)
      // Keep instanceIds unique across the whole part (e.g. the same file imported twice).
      const base = instanceBase(mesh.name)
      let taken = p.placements.filter(
        (pl) => pl.instanceId === base || pl.instanceId.startsWith(`${base}_`),
      ).length
      for (const t of mesh.placements) {
        taken++
        p.placements.push({
          instanceId: `${base}_${taken}`,
          subPartTemplateId: mesh.subPartId,
          position: { ...t.position },
          rotation: { ...t.rotation },
          scale: { ...t.scale },
          layerId,
        })
        newPlacementIndices.push(p.placements.length - 1)
      }
    }
  })
  await scheduleRebuild()
  // Active layer + selection are ephemeral (not undo-tracked).
  setActiveLayer(layerId)
  setSelection(newPlacementIndices, [], [])
}

/**
 * Everything removing ONE import batch takes with it, as counts + ids. Computed by
 * {@link planImportRemoval} and consumed by BOTH {@link removeImport} and the Custom Assets
 * modal's confirm dialog, so the numbers the user agrees to are the numbers that happen.
 */
export interface ImportRemovalPlan {
  /** {@link CustomMesh.id} of every SubPart of the batch. */
  meshIds: string[]
  /** Their {@link CustomMesh.subPartId}s (what placements reference). */
  subPartIds: string[]
  /** How many placements reference those SubParts. */
  placements: number
  /** Materials the batch leaves unreferenced (see the reference-counting note below). */
  materialIds: string[]
  /** Textures those materials (and the removed meshes' faces) leave unreferenced. */
  textureIds: string[]
  /** Layers left with no entity at all once the batch is gone (dropped with it). */
  layerIds: string[]
}

/** Every texture a mesh's per-face grid points at (primitives only; imported meshes have none). */
function meshFaceTextureIds(m: CustomMesh): string[] {
  return Object.values(m.faceTextures)
    .map((f) => f?.textureId)
    .filter((id): id is string => !!id)
}

/**
 * Plans the removal of one import batch (one dropped file): its meshes, their placements, and
 * the assets the batch LEAVES BEHIND.
 *
 * GARBAGE COLLECTION IS REFERENCE COUNTED, NOT PROVENANCE TAGGED. Imported textures and
 * materials are ordinary flexo assets the moment they land — reusable, re-assignable,
 * editable — so "which material came from this file" is the wrong question by the time the
 * user removes it. Instead: take the assets the batch's meshes were USING, and purge exactly
 * those that nothing in the post-removal document still references. That cleans up correctly
 * when the user has re-assigned materials since importing (a material the batch brought in but
 * that now dresses a hand-made box SURVIVES; a hand-made material the user moved onto an
 * imported SubPart, and nothing else, is collected).
 *
 * A material or texture that is simply unassigned — created in the Add menu and never used —
 * is NEVER touched: only assets the removed meshes referenced are candidates.
 */
export function planImportRemoval(part: EditingPart, importId: string): ImportRemovalPlan {
  const removed = part.customMeshes.filter((m) => m.imported?.importId === importId)
  const meshIds = new Set(removed.map((m) => m.id))
  const subPartIds = new Set(removed.map((m) => m.subPartId))
  const kept = part.customMeshes.filter((m) => !meshIds.has(m.id))

  // Materials: candidates are the ones the removed meshes wore; survivors are those any
  // remaining mesh still wears.
  const keptMaterialIds = new Set(kept.map((m) => m.materialId).filter(Boolean))
  const purgedMaterials = part.customMaterials.filter(
    (mat) =>
      removed.some((m) => m.materialId === mat.id) &&
      !keptMaterialIds.has(mat.id) &&
      !kept.some((m) => m.materialId === mat.id),
  )
  const purgedMaterialIds = new Set(purgedMaterials.map((m) => m.id))

  // Textures: candidates are those the purged materials + the removed meshes' faces pointed
  // at; survivors are those any SURVIVING material channel or remaining mesh face still does.
  const candidates = new Set<string>()
  for (const mat of purgedMaterials) for (const id of materialTextureIds(mat)) candidates.add(id)
  for (const m of removed) for (const id of meshFaceTextureIds(m)) candidates.add(id)
  const stillUsed = new Set<string>()
  for (const mat of part.customMaterials) {
    if (purgedMaterialIds.has(mat.id)) continue
    for (const id of materialTextureIds(mat)) stillUsed.add(id)
  }
  for (const m of kept) for (const id of meshFaceTextureIds(m)) stillUsed.add(id)
  const textureIds = part.customTextures
    .filter((t) => candidates.has(t.id) && !stillUsed.has(t.id))
    .map((t) => t.id)

  // Layers: only ones this batch was placed on, and only when nothing at all is left on them
  // (the import's own layer, unless the user has since moved other entities onto it).
  const batchLayers = new Set(
    part.placements.filter((pl) => subPartIds.has(pl.subPartTemplateId)).map((pl) => pl.layerId),
  )
  const layerIds = [...batchLayers].filter(
    (id) =>
      !BUILT_IN_LAYER_IDS.includes(id) &&
      part.layers.some((l) => l.id === id) &&
      !part.placements.some((pl) => pl.layerId === id && !subPartIds.has(pl.subPartTemplateId)) &&
      !part.connectors.some((c) => c.layerId === id) &&
      !part.kittens.some((k) => k.layerId === id),
  )

  return {
    meshIds: [...meshIds],
    subPartIds: [...subPartIds],
    placements: part.placements.filter((pl) => subPartIds.has(pl.subPartTemplateId)).length,
    materialIds: [...purgedMaterialIds],
    textureIds,
    layerIds,
  }
}

/**
 * Removes a whole import batch: every SubPart that came from that one file, their placements,
 * the materials/textures the batch leaves unreferenced ({@link planImportRemoval}), and the
 * layer if the batch was the only thing on it — as ONE undo step.
 *
 * UNDO RESTORES THE DOCUMENT, NOT THE BYTES. Mirroring {@link removeCustomTexture}, the binaries
 * are deleted from IndexedDB outright: the batch's geometry GLB, each purged texture's source +
 * `.ktx2`, and each removed mesh's painted-glow bitmap. Undo brings the descriptors back but
 * their geometry/textures are gone — imported geometry has no regenerable source, so a restored
 * mesh would render nothing. The confirm dialog in CustomAssetsModal says exactly this.
 */
export async function removeImport(importId: string): Promise<void> {
  const before = $part.get()
  const plan = planImportRemoval(before, importId)
  if (plan.meshIds.length === 0) return

  const meshIds = new Set(plan.meshIds)
  const subPartIds = new Set(plan.subPartIds)
  const materialIds = new Set(plan.materialIds)
  const textureIds = new Set(plan.textureIds)
  const layerIds = new Set(plan.layerIds)
  const label = before.customMeshes.find((m) => m.imported?.importId === importId)?.imported
    ?.sourceFile

  mutate('remove import', label ?? importId, (p) => {
    p.customMeshes = p.customMeshes.filter((m) => !meshIds.has(m.id))
    p.placements = p.placements.filter((pl) => !subPartIds.has(pl.subPartTemplateId))
    p.customMaterials = p.customMaterials.filter((m) => !materialIds.has(m.id))
    p.customTextures = p.customTextures.filter((t) => !textureIds.has(t.id))
    p.layers = p.layers.filter((l) => !layerIds.has(l.id))
  })

  // Selection/active layer are ephemeral; both may now point at something that no longer
  // exists (placement INDICES shift when placements are spliced out).
  setSelection([], [], [])
  if (layerIds.has($activeLayerId.get())) setActiveLayer(DEFAULT_LAYER_ID)

  for (const id of textureIds) {
    revokeTexture(id)
    void deleteAsset(assetKeys.textureSource(id))
    void deleteAsset(assetKeys.textureKtx2(id))
  }
  publishTextureUrls()
  for (const id of meshIds) {
    const url = emissivePaintUrls.get(id)
    if (url) URL.revokeObjectURL(url)
    emissivePaintUrls.delete(id)
    void deleteAsset(assetKeys.emissivePaint(id))
  }
  publishEmissivePaintUrls()
  void deleteAsset(assetKeys.importGlb(importId))
  releaseImportAtlas(importId)

  await scheduleRebuild()
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

/**
 * Toggles an IMPORTED mesh's "render as glass": exports through KSA's translucent
 * `<PartModelGlass>` instead of `<PartModel>` (modExport reads `imported.transparent`).
 *
 * Export-only by design — the editor keeps showing the opaque PBR surface. KSA's glass is one
 * fixed shader (≈75% opacity, ~10% diffuse tint, never emissive — MeshGlassIndirect.frag), so
 * there is no material of the user's to preview: whatever the editor drew would be a second,
 * differently-wrong guess. The panel says so in one line instead.
 *
 * No-op on a non-imported mesh (a primitive is never glass; a visor uses
 * {@link setMeshSurface}).
 */
export async function setMeshTransparent(meshId: string, transparent: boolean): Promise<void> {
  const name = $part.get().customMeshes.find((m) => m.id === meshId)?.name ?? ''
  mutate('render as glass', name, (p) => {
    const m = p.customMeshes.find((x) => x.id === meshId)
    if (!m?.imported) return
    if (transparent) m.imported.transparent = true
    else delete m.imported.transparent
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

/**
 * Removes a custom mesh and every placement of it.
 *
 * The import GLB of an imported mesh is deliberately NOT deleted from IndexedDB: undo must be
 * able to restore the mesh, and the other SubParts of the same import batch still resolve their
 * geometry out of that one file. Reclaiming a batch's bytes is an explicit user action
 * ("Remove import" in the Custom Assets modal — plans/IMPORT_MODELS.md §4.3, Phase 5).
 */
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

/**
 * The stored `.ktx2` is a derived cache of the stored source image. Encodes written by
 * pre-UNORM-convention builds are tagged `VK_FORMAT_R8G8B8A8_SRGB`, which KSA gamma-decodes
 * TWICE in-game (hardware sRGB view + the shader's own gammaToLinear) — mid-tones render
 * too dark. Regenerate such a stale cache from the source (cache invalidation, not data
 * migration; see encodeKtx2.ts).
 */
async function ensureCurrentKtx2(id: string, stored: Blob): Promise<Blob> {
  const header = new Uint8Array(await stored.slice(0, 16).arrayBuffer())
  if (!isLegacySrgbKtx2(header)) return stored
  const src = await getAsset(assetKeys.textureSource(id))
  if (!src) return stored
  const ktx2 = await encodeImageToKtx2(await decodeImage(src), { zstd: true })
  await putAsset(assetKeys.textureKtx2(id), ktx2, 'image/ktx2')
  return new Blob([ktx2.slice()], { type: 'image/ktx2' })
}

// ── hydration on project load ─────────────────────────────────────────────────
export async function hydrateCustomAssets(): Promise<void> {
  for (const id of [...textureKtx2Urls.keys(), ...textureSrcUrls.keys()]) revokeTexture(id)
  publishTextureUrls()
  for (const url of emissivePaintUrls.values()) URL.revokeObjectURL(url)
  emissivePaintUrls.clear()
  clearImportAtlases()

  const part = $part.get()
  for (const t of part.customTextures) {
    const k = await getAsset(assetKeys.textureKtx2(t.id))
    if (k) textureKtx2Urls.set(t.id, URL.createObjectURL(await ensureCurrentKtx2(t.id, k)))
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
  // Re-register every import batch's geometry GLB (the only copy — nothing regenerates it)
  // BEFORE the rebuild, which resolves imported meshes out of those blob URLs by name.
  const importIds = new Set<string>()
  for (const m of part.customMeshes) if (m.imported) importIds.add(m.imported.importId)
  for (const importId of importIds) await ensureImportAtlas(importId)
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
