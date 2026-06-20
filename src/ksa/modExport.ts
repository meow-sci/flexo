import * as THREE from 'three'
import type { CustomMesh, CustomTexture, EditingPart } from './types'
import { serializeGameData, serializePart } from './partXmlSerializer'
import {
  serializeAssets,
  type AssetsSubPartPlan,
  type ReferenceSubPartPlan,
} from './assetsXmlSerializer'
import { buildMeshAtlasGlb } from './exportGlb'
import { buildAnimationRig } from './animationRig'
import { buildAnimationGlb } from './exportAnimationGlb'
import { animGlbPath, isAnimationExportable } from './animationNaming'
import { toUrl, type CatalogSubPart } from './catalog'
import {
  buildPrimitiveGeometry,
  PRIMITIVE_FACE_KEYS,
  applyFaceUvTransforms,
} from '../three/primitives'
import { bakeKittenSubMeshes } from '../three/kittenBake'
import { getPrimaryTextureId, glowBitmapFor } from '../state/customAssetStore'
import { assetKeys, getAsset } from '../state/assetDb'
import type { KittenTextureExportSettings } from '../state/settingsStore'
import { createZip, type ZipEntry } from '../util/zip'
import { encodeImageToKtx2, makeSolidKtx2 } from '../ktx/encodeKtx2'
import { makeSolidPng } from '../ktx/encodePng'
import { decodeImage, buildMipChain, type ImageLevel } from '../ktx/decodeImage'
import { compositeGlow, neutralBase, type GlowBitmap } from '../ktx/glowComposite'

/** How part-ified kitten SubParts supply their textures on export (see settingsStore). */
export type KittenTextureExportConfig = KittenTextureExportSettings
const DEFAULT_KITTEN_TEXTURE_EXPORT: KittenTextureExportConfig = {
  mode: 'bundle',
  contentCorePath: '',
}

/**
 * KSA part-mod export. A "part mod" is a folder the game loads from
 * `Documents/Kitten Space Agency/mods/`. flexo writes its output into a
 * `flexo-parts` subfolder containing:
 *   - `mod.toml`  — declares the mod name and lists the asset XML files
 *   - one `<Name>Part.xml` + one `<Name>GameData.xml` per exported project
 *
 * We emit a separate XML file per project (rather than merging everything into
 * shared files) to keep each project's output self-contained and easy to manage.
 *
 * Two delivery paths share this logic:
 *   - {@link writeModToFolder} writes into a user-granted directory via the File
 *     System Access API, non-destructively (never overwrites existing XML;
 *     rebuilds `mod.toml` from whatever XML actually ends up in the folder).
 *   - {@link buildModZip} produces a downloadable `.zip` with a fresh `flexo-parts`
 *     folder — no filesystem permission required, works in any browser.
 */

export const MOD_FOLDER_NAME = 'flexo-parts'
export const MOD_TOML_NAME = 'mod.toml'
/** The `name` field written into mod.toml. */
export const MOD_NAME = 'flexo-parts'

/** Project name → a safe, space-free base for XML filenames (e.g. "My Part" → "MyPart"). */
export function sanitizeBaseName(projectName: string): string {
  const cleaned = projectName.replace(/[^A-Za-z0-9]+/g, '')
  return cleaned || 'Mod'
}

/** Serializes mod.toml with the given asset filenames (matches KSA's format). */
export function serializeModToml(assets: string[]): string {
  const list = assets.length === 0 ? '[]' : `[ ${assets.map((a) => `"${a}"`).join(', ')}]`
  return `name = "${MOD_NAME}"\nassets = ${list}\n`
}

/**
 * Returns `base.ext`, or the first `base-N.ext` (N≥2) not present in `taken`.
 * `taken` holds **lowercased** names so conflict detection is case-insensitive
 * (matching case-insensitive filesystems like macOS/Windows).
 */
export function uniqueFileName(taken: Set<string>, base: string, ext: string): string {
  const first = `${base}.${ext}`
  if (!taken.has(first.toLowerCase())) return first
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}.${ext}`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
}

export interface ModContent {
  base: string
  partFile: string
  partXml: string
  gameDataFile: string
  gameDataXml: string
}

/**
 * Builds the desired filenames + XML bodies for a project (no conflict resolution).
 * `ivaRemap` (originalTemplateId → variant id, from {@link buildIvaVariantMap}) points
 * IVA-prop placements at their non-Internal export variant; empty for IVA-free parts.
 */
export function buildModContent(
  part: EditingPart,
  projectName: string,
  ivaRemap: ReadonlyMap<string, string> = new Map(),
): ModContent {
  const base = sanitizeBaseName(projectName)
  return {
    base,
    partFile: `${base}Part.xml`,
    partXml: serializePart(part, ivaRemap),
    gameDataFile: `${base}GameData.xml`,
    gameDataXml: serializeGameData(part, base, ivaRemap),
  }
}

/** A token safe for an asset filename segment (letters/digits only). */
function sanitizeAssetToken(name: string): string {
  return name.replace(/[^A-Za-z0-9]+/g, '') || 'asset'
}

/**
 * One placed IVA (Internal) SubPart and the non-Internal export variant it maps to.
 * KSA only renders <Internal>true</Internal> props in IVA camera mode; we re-home each
 * onto a fresh, non-Internal SubPart that reuses the SAME built-in Mesh + Material so it
 * renders everywhere. See {@link buildIvaVariantMap}.
 */
export interface IvaVariant {
  /** Built-in IVA SubPart template id placed in the part, e.g. "CoreIVAPropA_Subpart_ChairA". */
  originalId: string
  /** Project-unique export variant id referenced by the placement and declared in the Assets XML. */
  variantId: string
  /** Built-in <Mesh Id> the variant reuses (NOT redeclared). */
  meshId: string
  /** Built-in <Material Id> the variant reuses, or null when untextured. */
  materialId: string | null
}

/**
 * Builds the IVA→variant map for a part: one entry per DISTINCT placed IVA template
 * (deduped across placements), keyed by the original template id. Non-IVA templates and
 * templates absent from the catalog are skipped. Variant ids are namespaced by the project
 * {@link base} so two flexo mods reusing the same built-in IVA part don't collide; the id is
 * deterministic, so re-exports are stable. Empty when the part places no IVA props.
 */
export function buildIvaVariantMap(
  part: EditingPart,
  catalog: ReadonlyMap<string, CatalogSubPart>,
  base: string,
): Map<string, IvaVariant> {
  const out = new Map<string, IvaVariant>()
  for (const p of part.placements) {
    const templateId = p.subPartTemplateId
    if (out.has(templateId)) continue
    const entry = catalog.get(templateId)
    if (!entry?.internal) continue
    // meshNodeName is the built-in <Mesh Id> (null only for the rare whole-atlas mesh,
    // which no IVA prop uses). Without it we can't reference the geometry — leave as-is.
    if (!entry.meshNodeName) {
      console.warn(`flexo export: IVA SubPart '${templateId}' has no mesh node — left as IVA`)
      continue
    }
    out.set(templateId, {
      originalId: templateId,
      variantId: `flexo_${base}_${templateId}_NotIVA`,
      meshId: entry.meshNodeName,
      materialId: entry.materialId ?? null,
    })
  }
  return out
}

/** Derives the `originalTemplateId → variantId` remap consumed by the Part/GameData serializers. */
function ivaRemapFromVariants(variants: Map<string, IvaVariant>): Map<string, string> {
  return new Map([...variants.values()].map((v) => [v.originalId, v.variantId]))
}

/** Encodes a decoded image to a Zstd KTX2 (sRGB diffuse vs linear mask), generating its mip chain. */
function encodeLevel(level: ImageLevel, srgb: boolean): Promise<Uint8Array> {
  return encodeImageToKtx2(
    { width: level.width, height: level.height, levels: buildMipChain(level) },
    { srgb, zstd: true },
  )
}

/**
 * Composites a mesh's glow onto a base diffuse and writes BOTH the (color-baked) diffuse and the
 * grayscale emissive mask as Textures/<token>_Diffuse.ktx2 / _Emissive.ktx2. The composited
 * diffuse REPLACES any stored diffuse for a glowing mesh — the glow color lives in the diffuse,
 * the mask is white (KSA adds white × 1.25 after lighting). Returns their relative paths.
 */
async function emitGlowTextures(
  token: string,
  base: ImageLevel,
  glow: GlowBitmap,
  binaries: { path: string; data: Uint8Array }[],
): Promise<{ diffusePath: string; emissivePath: string }> {
  const { diffuse, mask } = compositeGlow(base, glow)
  const diffusePath = `Textures/${token}_Diffuse.ktx2`
  const emissivePath = `Textures/${token}_Emissive.ktx2`
  // Diffuse LINEAR/UNORM to match KSA's opaque ModelPbr.frag (it pow(2.2)s the diffuse itself); an
  // sRGB tag would be double-linearized → too dark. The mask stays linear (grayscale add, not color).
  binaries.push({ path: diffusePath, data: await encodeLevel(diffuse, false) })
  binaries.push({ path: emissivePath, data: await encodeLevel(mask, false) })
  return { diffusePath, emissivePath }
}

/** The decoded base diffuse for a glowing primitive (its primary source image), or neutral gray. */
async function exportBaseImage(tex: CustomTexture | undefined): Promise<ImageLevel> {
  if (tex) {
    const src = await getAsset(assetKeys.textureSource(tex.id))
    if (src) return (await decodeImage(src)).levels[0]
  }
  return neutralBase()
}

/** Last path segment of a "Textures/Characters/Foo.ktx2" subpath, e.g. "Foo.ktx2". */
function basename(subpath: string): string {
  return subpath.split('/').pop() || subpath
}

/** Joins the game Content/Core prefix with a Content-relative subpath as a Windows absolute path. */
function joinContentCore(prefix: string, subpath: string): string {
  const root = prefix.replace(/[\\/]+$/, '') // drop a trailing separator
  return `${root}\\${subpath.replace(/\//g, '\\')}`
}

/** Fetches a KSA asset (.ktx2/.png, served under /ksa/) verbatim, for the 'bundle' export mode. */
async function fetchAsset(subpath: string): Promise<Uint8Array> {
  const res = await fetch(toUrl(subpath))
  if (!res.ok) throw new Error(`kitten texture fetch failed (${res.status}): ${subpath}`)
  return new Uint8Array(await res.arrayBuffer())
}

/**
 * Resolves one Content/Core-relative KSA texture subpath to the value emitted as a mod-XML
 * `<… Path>`, per the export mode:
 *  - 'reference' → an absolute `{contentCorePath}\…` path (no file copied).
 *  - 'bundle' → copy the asset verbatim into Textures/ (deduped by subpath via `bundled`).
 * Works for any served KSA asset (a real .ktx2 OR KSA's own .png empties).
 */
async function resolveKittenTexture(
  subpath: string,
  cfg: KittenTextureExportConfig,
  bundled: Map<string, string>,
  binaries: { path: string; data: Uint8Array }[],
): Promise<string> {
  if (cfg.mode === 'reference') return joinContentCore(cfg.contentCorePath, subpath)
  let rel = bundled.get(subpath)
  if (!rel) {
    rel = `Textures/${basename(subpath)}`
    bundled.set(subpath, rel)
    binaries.push({ path: rel, data: await fetchAsset(subpath) })
  }
  return rel
}

/**
 * KSA Core's constant "empty" ORM — a tiny PNG the game ships and uses for its OWN normal-/ORM-less
 * character materials (CharacterAssets.xml: head/eyes/MMU-labels). Pixels are AO=255, Rough=255,
 * Metal=0 (non-metallic). We reference/bundle this real PNG instead of hand-rolling a KTX2: KSA's
 * KTX decoder mis-reads flexo's uncompressed-RGBA8+Zstd textures (no load error logged), binding
 * them to the white fallback texture → Metal=1 → the "highly reflective metallic" chrome look.
 */
const EMPTY_ORM_SUBPATH = 'Textures/Characters/EmptyAoRoughMetallic.png'

/**
 * Builds the Assets plan for one part-ified kitten SubPart. Resolves each KSA texture
 * channel by the export mode: 'reference' → an absolute `{contentCorePath}\…` path (no
 * file copied); 'bundle' → copy the .ktx2 verbatim into Textures/ (deduped by subpath
 * across submeshes/kittens via `bundled`). Channels the submesh lacks (eyes/labels
 * normal+ORM) stay `undefined` so serializeAssets falls back to the shared synthetic.
 */
async function planKittenSubPart(
  m: CustomMesh,
  cfg: KittenTextureExportConfig,
  bundled: Map<string, string>,
  binaries: { path: string; data: Uint8Array }[],
  bundleToken: string,
): Promise<AssetsSubPartPlan> {
  const src = m.kitten!
  const subPartId = m.subPartId
  const transparent = !!src.transparent
  const surface = transparent ? (m.surface ?? 'glass') : undefined

  // Opaque emissive glow (a non-glass submesh with a glow, or a visor in 'glow' mode): emit a
  // solid glow-color diffuse + grayscale mask through KSA's opaque <PartModel> path (glass can't
  // glow). The kitten's own .ktx2 can't be CPU-decoded, so the glow composites over a neutral base.
  const opaqueGlow = transparent ? surface === 'glow' : !!m.emissive
  if (opaqueGlow && m.emissive) {
    const glow = await glowBitmapFor(m)
    if (glow) {
      const paths = await emitGlowTextures(
        `${bundleToken}_${subPartId}`,
        neutralBase(),
        glow,
        binaries,
      )
      return { subPartId, materialId: `${subPartId}_Material`, glass: false, ...paths }
    }
  }

  const resolve = (subpath: string): Promise<string> =>
    resolveKittenTexture(subpath, cfg, bundled, binaries)

  // Glass shell (visor 'glass'/'glassGlow'): a chosen tint becomes a solid sRGB diffuse (KSA's
  // glass shader derives only ~10% of its color from the diffuse, so a saturated solid reads as a
  // subtle tinted glass); no tint keeps the real visor diffuse. Non-glass submeshes also land here.
  const tint = surface === 'glass' || surface === 'glassGlow' ? m.glass?.tint : undefined
  let diffusePath: string
  if (tint) {
    diffusePath = `Textures/${bundleToken}_${subPartId}_Diffuse.ktx2`
    binaries.push({
      path: diffusePath,
      data: await makeSolidKtx2(tint.r, tint.g, tint.b, { srgb: true }),
    })
  } else {
    diffusePath = await resolve(src.diffuse)
  }
  return {
    subPartId,
    materialId: `${subPartId}_Material`,
    diffusePath,
    normalPath: src.normal ? await resolve(src.normal) : undefined,
    aoRoughMetalPath: src.aoRoughMetal ? await resolve(src.aoRoughMetal) : undefined,
    glass: transparent, // the visor renders through KSA's translucent glass path
  }
}

/**
 * Insets a geometry by scaling its vertices toward the bounding-box center. Used for the layered
 * 'glassGlow' visor: the emissive layer sits just inside the ~0.75-opaque glass shell so it shows
 * through without z-fighting. Mutates + returns `geo` (caller passes a clone).
 */
function insetGeometry(geo: THREE.BufferGeometry, factor: number): THREE.BufferGeometry {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute | undefined
  if (!pos) return geo // nothing to inset (e.g. a missing/empty bake)
  geo.computeBoundingBox()
  const center = new THREE.Vector3()
  geo.boundingBox!.getCenter(center)
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(
      i,
      center.x + (pos.getX(i) - center.x) * factor,
      center.y + (pos.getY(i) - center.y) * factor,
      center.z + (pos.getZ(i) - center.z) * factor,
    )
  }
  pos.needsUpdate = true
  return geo
}

/** How far inside the glass shell the layered glow sits (1 = coincident → z-fights). */
const GLASS_GLOW_INSET = 0.99

/**
 * Expands a part for export so each placed 'glassGlow' visor becomes TWO SubParts at one transform —
 * the faithful KSA pattern (Core emits glass + opaque as sibling SubParts). For each such mesh we
 * append a synthetic '<id>_Glow' kitten mesh (opaque emissive, geometry inset) plus a parallel
 * placement at the original's transform. Returns the augmented part (fed to BOTH serializePart and
 * buildCustomBundle so atlas/subparts/part-tree agree) + the set of subPartIds to inset. No-op
 * (original part + empty set) when there are no glassGlow visors.
 */
export function expandGlassGlow(part: EditingPart): { part: EditingPart; insetIds: Set<string> } {
  const placed = new Set(part.placements.map((p) => p.subPartTemplateId))
  const layered = part.customMeshes.filter(
    (m) => m.kitten?.transparent && m.surface === 'glassGlow' && placed.has(m.subPartId),
  )
  if (layered.length === 0) return { part, insetIds: new Set() }

  const customMeshes = [...part.customMeshes]
  const placements = [...part.placements]
  const insetIds = new Set<string>()
  for (const m of layered) {
    const glowId = `${m.subPartId}_Glow`
    insetIds.add(glowId)
    customMeshes.push({
      id: m.id, // share the IndexedDB key so a 'painted' glow's bitmap resolves
      name: `${m.name} Glow`,
      subPartId: glowId,
      kitten: m.kitten,
      faceTextures: {},
      emissive: m.emissive,
      surface: 'glow', // opaque emissive layer on export
    })
    for (const pl of part.placements) {
      if (pl.subPartTemplateId === m.subPartId) {
        placements.push({ ...pl, instanceId: `${pl.instanceId}_glow`, subPartTemplateId: glowId })
      }
    }
  }
  return { part: { ...part, customMeshes, placements }, insetIds }
}

/** A custom-asset bundle for export: the Assets XML + the binary files it references. */
export interface CustomBundle {
  /** Desired Assets XML filename, or null when there are no custom assets to emit. */
  assetsFile: string | null
  assetsXml: string | null
  /** Binary files, each path relative to the mod folder (e.g. "Meshes/X.glb"). */
  binaries: { path: string; data: Uint8Array }[]
}

/**
 * Builds the custom-asset bundle for a project: a geometry mesh-atlas GLB (one named
 * node per custom SubPart actually placed), the diffuse .ktx2 for each referenced
 * custom texture, and the Assets XML that declares the MeshAtlas/PbrMaterial/SubPart.
 * The Assets XML also declares any IVA-prop export variants (`ivaVariants`), which reuse
 * built-in Mesh/Material and ship no binaries. Returns an empty bundle (animations only)
 * when neither custom SubParts nor IVA variants are present.
 *
 * The .ktx2 bytes come from IndexedDB (encoded at upload time); the GLB is generated
 * fresh from the stored primitive params.
 */
export async function buildCustomBundle(
  part: EditingPart,
  base: string,
  kittenTex: KittenTextureExportConfig = DEFAULT_KITTEN_TEXTURE_EXPORT,
  ivaVariants: Map<string, IvaVariant> = new Map(),
  insetIds: ReadonlySet<string> = new Set(),
): Promise<CustomBundle> {
  const binaries: { path: string; data: Uint8Array }[] = []

  // Animations export independently of custom meshes (a Core-only part can still be
  // animated): one Animations/<id>.glb per exportable animation, path-matched to the
  // <KeyframeAnimation Path> emitted in the GameData XML.
  for (const anim of part.animations) {
    if (!isAnimationExportable(anim)) continue
    const rig = buildAnimationRig(anim, part.placements, part.partId)
    binaries.push({ path: animGlbPath(base, anim), data: buildAnimationGlb(rig) })
  }

  const placed = new Set(part.placements.map((p) => p.subPartTemplateId))
  const meshes = part.customMeshes.filter((m) => placed.has(m.subPartId))

  // De-IVA'd props: reference-only SubParts reusing built-in Mesh/Material (no binaries).
  const referenceSubParts: ReferenceSubPartPlan[] = [...ivaVariants.values()].map((v) => ({
    subPartId: v.variantId,
    meshId: v.meshId,
    materialId: v.materialId,
  }))

  // Nothing to declare → no Assets XML, but still ship any animation glbs above.
  if (meshes.length === 0 && referenceSubParts.length === 0) {
    return { assetsFile: null, assetsXml: null, binaries }
  }

  // Custom geometry (primitive/kitten meshes) → build the mesh-atlas GLB, its textures, and
  // the per-mesh PbrMaterial SubParts. Skipped entirely for an IVA-only part (no atlas needed).
  let meshAtlasPath: string | undefined
  const subParts: AssetsSubPartPlan[] = []
  let normalPath: string | undefined
  let aoRoughMetalPath: string | undefined
  if (meshes.length > 0) {
    // Derive a bundle token from base (project name) + the first mesh's random id suffix.
    // Mesh ids contain a random UUID fragment generated at creation time, so this is
    // unique across different parts even when they share the same default partId.
    // Using base keeps the filename human-readable; the hash suffix makes it unique.
    const bundleToken = `${base}_${meshes[0].id.replace(/^mesh_/, '')}`
    meshAtlasPath = `Meshes/${bundleToken}_MeshAtlas.glb`
    const nodes = await Promise.all(
      meshes.map(async (m) => {
        if (m.kitten) {
          // Always bundle the baked geometry (KSA can't skin the source gltf); clone the
          // shared cache so the post-build dispose() frees the clone, not the cache. A layered
          // 'glassGlow' glow layer is inset so it sits just inside its glass shell.
          const subs = await bakeKittenSubMeshes(m.kitten.kind)
          const geo = subs.find((s) => s.specKey === m.kitten!.specKey)?.geometry
          let cloned = geo ? geo.clone() : new THREE.BufferGeometry()
          if (insetIds.has(m.subPartId)) cloned = insetGeometry(cloned, GLASS_GLOW_INSET)
          return { name: m.subPartId, geometry: cloned }
        }
        const geometry = buildPrimitiveGeometry(m.primitive!)
        applyFaceUvTransforms(geometry, PRIMITIVE_FACE_KEYS[m.primitive!.kind], m.faceTextures)
        return { name: m.subPartId, geometry }
      }),
    )
    try {
      binaries.push({ path: meshAtlasPath, data: await buildMeshAtlasGlb(nodes) })
    } finally {
      for (const n of nodes) n.geometry.dispose()
    }

    const texById = new Map(part.customTextures.map((t) => [t.id, t]))
    const texPath = new Map<string, string>() // texId -> relative path (dedupe shared textures)
    const kittenTexPath = new Map<string, string>() // kitten subpath -> mod path (bundle mode)
    for (const m of meshes) {
      // Part-ified kitten submesh: full PBR from the KSA .ktx2 (referenced/bundled), or a generated
      // solid tint diffuse (glass) / glow textures (emissive) per the visor surface mode.
      if (m.kitten) {
        subParts.push(await planKittenSubPart(m, kittenTex, kittenTexPath, binaries, bundleToken))
        continue
      }
      // Glowing primitive: composite the glow into the diffuse (color baked in) + emit the
      // grayscale emissive mask. Glow-only (untextured) meshes composite over a neutral base.
      const glow = await glowBitmapFor(m)
      if (glow) {
        const primaryTexId = getPrimaryTextureId(m)
        const base = await exportBaseImage(primaryTexId ? texById.get(primaryTexId) : undefined)
        const paths = await emitGlowTextures(`${bundleToken}_${m.subPartId}`, base, glow, binaries)
        subParts.push({
          subPartId: m.subPartId,
          materialId: `${m.subPartId}_Material`,
          diffusePath: paths.diffusePath,
          emissivePath: paths.emissivePath,
        })
        continue
      }
      let diffusePath: string | null = null
      let materialId: string | null = null
      // For KSA export, one material per SubPart — use the primary (first valid) face texture.
      const primaryTexId = getPrimaryTextureId(m)
      const tex = primaryTexId ? texById.get(primaryTexId) : undefined
      if (tex) {
        let rel = texPath.get(tex.id)
        if (!rel) {
          const blob = await getAsset(assetKeys.textureKtx2(tex.id))
          if (blob) {
            rel = `Textures/${sanitizeAssetToken(tex.name)}_${sanitizeAssetToken(tex.id)}_Diffuse.ktx2`
            texPath.set(tex.id, rel)
            binaries.push({ path: rel, data: new Uint8Array(await blob.arrayBuffer()) })
          }
        }
        if (rel) {
          diffusePath = rel
          materialId = `${m.subPartId}_Material`
        }
      }
      subParts.push({ subPartId: m.subPartId, materialId, diffusePath })
    }

    // KSA's ThumbnailRenderResources.AddDraw dereferences NormalReference and PBRMap without null
    // checks, so every PbrMaterial needs both a Normal and an AoRoughMetal. The constant channels
    // (SubParts with no real per-SubPart map) must NOT be hand-rolled KTX2 — KSA's KTX decoder
    // mis-reads flexo's uncompressed-RGBA8+Zstd textures (rendered chrome / wavy mis-lighting):
    //  - Normal → a tiny flat-normal PNG (R=128,G=128,B=255). KSA's opaque shader reconstructs
    //    the normal's Z from R,G only (normalMap.z = sqrt(1-x²-y²)), so R=G=128 reads as +Z = the
    //    geometry normal. Bundled (flexo-authored; no game-install path). NOT KSA's own
    //    <Normal Id="EmptyNormal"/> — that texture isn't flat under this reconstruction.
    //  - ORM → KSA's own EmptyAoRoughMetallic.png (a PNG), referenced/bundled per the export mode.
    if (subParts.some((sp) => sp.materialId !== null)) {
      normalPath = `Textures/${bundleToken}_FlatNormal.png`
      binaries.push({ path: normalPath, data: makeSolidPng(128, 128, 255) })
      aoRoughMetalPath = await resolveKittenTexture(
        EMPTY_ORM_SUBPATH,
        kittenTex,
        kittenTexPath,
        binaries,
      )
    }
  }

  return {
    assetsFile: `${base}Assets.xml`,
    assetsXml: serializeAssets({
      meshAtlasPath,
      subParts,
      referenceSubParts,
      normalPath,
      aoRoughMetalPath,
    }),
    binaries,
  }
}

/**
 * Builds a downloadable zip containing `flexo-parts/` with a fresh mod.toml, the
 * project's Part + GameData XML, and — when custom SubParts are placed — an Assets
 * XML plus the referenced Meshes/*.glb and Textures/*.ktx2. Filenames are the
 * un-suffixed desired names (a zip is always a clean slate).
 */
export async function buildModZip(
  part: EditingPart,
  projectName: string,
  kittenTex?: KittenTextureExportConfig,
  catalog: ReadonlyMap<string, CatalogSubPart> = new Map(),
): Promise<Blob> {
  // Layered 'glassGlow' visors expand into glass + inset-glow SubPart pairs; feed the augmented
  // part to BOTH the Part/GameData serializers and the bundle so placements + geometry agree.
  const { part: expandedPart, insetIds } = expandGlassGlow(part)
  const ivaVariants = buildIvaVariantMap(expandedPart, catalog, sanitizeBaseName(projectName))
  const content = buildModContent(expandedPart, projectName, ivaRemapFromVariants(ivaVariants))
  const bundle = await buildCustomBundle(
    expandedPart,
    content.base,
    kittenTex,
    ivaVariants,
    insetIds,
  )
  const encoder = new TextEncoder()
  const xmlAssets = [content.partFile, content.gameDataFile]
  if (bundle.assetsFile) xmlAssets.push(bundle.assetsFile)

  const entries: ZipEntry[] = [
    {
      name: `${MOD_FOLDER_NAME}/${MOD_TOML_NAME}`,
      data: encoder.encode(serializeModToml(xmlAssets)),
    },
    { name: `${MOD_FOLDER_NAME}/${content.partFile}`, data: encoder.encode(content.partXml) },
    {
      name: `${MOD_FOLDER_NAME}/${content.gameDataFile}`,
      data: encoder.encode(content.gameDataXml),
    },
  ]
  if (bundle.assetsFile && bundle.assetsXml) {
    entries.push({
      name: `${MOD_FOLDER_NAME}/${bundle.assetsFile}`,
      data: encoder.encode(bundle.assetsXml),
    })
  }
  for (const b of bundle.binaries) {
    entries.push({ name: `${MOD_FOLDER_NAME}/${b.path}`, data: b.data })
  }
  return createZip(entries)
}

const isXml = (name: string) => name.toLowerCase().endsWith('.xml')

/** All file names directly inside `dir`. */
async function listFileNames(dir: FileSystemDirectoryHandle): Promise<string[]> {
  const names: string[] = []
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === 'file') names.push(name)
  }
  return names
}

async function writeTextFile(
  dir: FileSystemDirectoryHandle,
  name: string,
  contents: string,
): Promise<void> {
  const fileHandle = await dir.getFileHandle(name, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(contents)
  await writable.close()
}

/** Writes binary bytes at a "Sub/Dir/file.ext" path under `root`, creating subdirs. */
async function writeBinaryAtPath(
  root: FileSystemDirectoryHandle,
  relPath: string,
  data: Uint8Array,
): Promise<void> {
  const segments = relPath.split('/')
  const fileName = segments.pop()!
  let dir = root
  for (const seg of segments) dir = await dir.getDirectoryHandle(seg, { create: true })
  const fileHandle = await dir.getFileHandle(fileName, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(data as unknown as BufferSource)
  await writable.close()
}

export interface WriteResult {
  partFile: string
  gameDataFile: string
  /** Assets XML filename when custom assets were written, else null. */
  assetsFile: string | null
  assets: string[]
}

/**
 * Non-destructively writes the project's mod files into `<modsDir>/flexo-parts`:
 *   - creates the `flexo-parts` folder if absent;
 *   - writes the Part + GameData XML under non-conflicting names (existing XML is
 *     never overwritten — a `-2`, `-3`, … suffix is added on collision);
 *   - rebuilds `mod.toml` to list the complete set of `.xml` files now present in
 *     the folder (regardless of what the previous `assets` list contained).
 */
export async function writeModToFolder(
  modsDir: FileSystemDirectoryHandle,
  part: EditingPart,
  projectName: string,
  kittenTex?: KittenTextureExportConfig,
  catalog: ReadonlyMap<string, CatalogSubPart> = new Map(),
): Promise<WriteResult> {
  const modDir = await modsDir.getDirectoryHandle(MOD_FOLDER_NAME, { create: true })
  const { part: expandedPart, insetIds } = expandGlassGlow(part)
  const ivaVariants = buildIvaVariantMap(expandedPart, catalog, sanitizeBaseName(projectName))
  const content = buildModContent(expandedPart, projectName, ivaRemapFromVariants(ivaVariants))

  const bundle = await buildCustomBundle(
    expandedPart,
    content.base,
    kittenTex,
    ivaVariants,
    insetIds,
  )

  const taken = new Set((await listFileNames(modDir)).map((n) => n.toLowerCase()))
  const partFile = uniqueFileName(taken, `${content.base}Part`, 'xml')
  taken.add(partFile.toLowerCase())
  const gameDataFile = uniqueFileName(taken, `${content.base}GameData`, 'xml')
  taken.add(gameDataFile.toLowerCase())

  await writeTextFile(modDir, partFile, content.partXml)
  await writeTextFile(modDir, gameDataFile, content.gameDataXml)

  // Custom assets: the Assets XML respects the non-overwrite contract (suffixed on
  // collision); the binaries it references are regenerated deterministically and
  // written into Meshes/, Textures/, and Animations/ (overwrite is fine — same content).
  let assetsFile: string | null = null
  if (bundle.assetsFile && bundle.assetsXml) {
    assetsFile = uniqueFileName(taken, `${content.base}Assets`, 'xml')
    await writeTextFile(modDir, assetsFile, bundle.assetsXml)
  }
  // Binaries are written even with no Assets XML — an animation-only part (Core
  // SubParts) ships an Animations/*.glb referenced by the GameData XML.
  for (const b of bundle.binaries) await writeBinaryAtPath(modDir, b.path, b.data)

  const assets = (await listFileNames(modDir)).filter(isXml).sort((a, b) => a.localeCompare(b))
  await writeTextFile(modDir, MOD_TOML_NAME, serializeModToml(assets))

  return { partFile, gameDataFile, assetsFile, assets }
}
