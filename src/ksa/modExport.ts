import * as THREE from 'three'
import type {
  CustomMaterial,
  CustomMesh,
  CustomTexture,
  EditingPart,
  NormalChannel,
  RgbColor,
  ScalarChannel,
  TextureChannel,
} from './types'
import { isSubPartGameDataEmpty, meshKind } from './types'
import type { PartCollider } from './types'
import { serializeGameData, serializePart } from './partXmlSerializer'
import {
  serializeAssets,
  type AssetsMaterialPlan,
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
import { getImportedRawGeometry } from '../three/importedMeshCache'
import { getPrimaryTextureId, glowFor, type MeshGlow } from '../state/customAssetStore'
import { assetKeys, getAsset } from '../state/assetDb'
import { $modelImportSettings, type KittenTextureExportSettings } from '../state/settingsStore'
import { createZip, type ZipEntry } from '../util/zip'
import { encodeImageToKtx2, makeSolidKtx2 } from '../ktx/encodeKtx2'
import { decodeImage, buildMipChain, type ImageLevel } from '../ktx/decodeImage'
import { packOrmLevel, prepareChannelImage, type OrmSource } from '../ktx/channelTransforms'
import {
  baseSizeFor,
  compositeGlow,
  neutralBase,
  solidBase,
  type GlowBitmap,
} from '../ktx/glowComposite'

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
  /**
   * Built-in SubPart export variants this part needs (see {@link buildExportVariantMap}),
   * keyed by original template id. Threaded into {@link buildCustomBundle} so the Assets XML
   * declares the same reference SubParts the Part/GameData XML now points at.
   */
  variants: Map<string, ExportVariant>
  partFile: string
  partXml: string
  gameDataFile: string
  gameDataXml: string
}

/**
 * Builds the desired filenames + XML bodies for a project (no conflict resolution).
 * Builds the export-variant map internally (from {@link catalog}) so the Part tree and the
 * GameData both reference the fresh variant ids — never the built-in SubPart ids — and
 * returns the variants so the Assets bundle can declare the matching reference SubParts.
 * This is the single source of truth shared by the export buttons AND the XML preview.
 */
export function buildModContent(
  part: EditingPart,
  projectName: string,
  catalog: ReadonlyMap<string, CatalogSubPart> = new Map(),
): ModContent {
  const base = sanitizeBaseName(projectName)
  const variants = buildExportVariantMap(part, catalog, base)
  const remap = variantRemap(variants)
  return {
    base,
    variants,
    partFile: `${base}Part.xml`,
    partXml: serializePart(part, remap),
    gameDataFile: `${base}GameData.xml`,
    gameDataXml: serializeGameData(part, base, remap),
  }
}

/** A token safe for an asset filename segment (letters/digits only). */
function sanitizeAssetToken(name: string): string {
  return name.replace(/[^A-Za-z0-9]+/g, '') || 'asset'
}

/**
 * A built-in SubPart and the fresh export variant flexo redeclares for it. The variant reuses
 * the SAME built-in Mesh + Material (no geometry/texture is duplicated) under a project-unique
 * id, so the part can carry its own SubPart GameData WITHOUT redefining (merging onto) the
 * shared built-in SubPart template. See {@link buildExportVariantMap}.
 */
export interface ExportVariant {
  /** Built-in SubPart template id placed in the part, e.g. "CoreElectricalA_Subpart_SpotlightA". */
  originalId: string
  /** Project-unique export variant id referenced by placements + SubPartGameData, declared in Assets. */
  variantId: string
  /** Built-in <Mesh Id> the variant reuses (NOT redeclared). */
  meshId: string
  /**
   * Built-in `<Material Id>` the variant reuses. NEVER null: a `<PartModel>` with no `<Material>`
   * is a hard startup crash (see {@link buildExportVariantMap}), so a material-less built-in is
   * skipped rather than redeclared.
   */
  materialId: string
  /**
   * The built-in template's OWN geometry `<Collider>`s, copied forward onto the variant.
   * A variant is a FRESH `<SubPart Id>` that reuses only the built-in Mesh/Material — it
   * does NOT inherit anything else the built-in `<SubPart>` declared, so without this the
   * variant would silently lose the built-in collision volume (e.g. the solar-panel cells'
   * `<Box>`). Empty for a template that authors none.
   */
  colliders: PartCollider[]
  /**
   * The `<Internal>` (interior-only) value the variant declares — {@link resolveInternal}'s
   * result. `false` emits no element at all (KSA's default).
   */
  internal: boolean
  /**
   * The built-in template's raw `<RayTracing>` token, carried forward verbatim (null = none
   * authored). A variant inherits nothing but the Mesh/Material it names, so dropping this
   * would turn e.g. a `ShadowProxy` occluder into a visible mesh.
   */
  rayTracing: string | null
  /**
   * The built-in template's `<ShadowCaster>` bool, carried forward (null = none authored, which
   * is KSA's `true` default). Same inheritance rule as {@link rayTracing}: dropping a built-in's
   * explicit `false` (Core's medium-capsule windows) would make the variant start casting
   * shadows. NOT part of the variant-minting gate — flexo never lets the user edit it, so it can
   * never on its own be a REASON to redeclare a template, only a value carried along when a
   * variant already exists.
   */
  shadowCaster: boolean | null
}

/**
 * The diffuse of the shared fallback material a custom mesh gets when it resolves no texture,
 * material or glow. Matches the editor's untextured look (`MaterialFactory.makeFlatMaterial`'s
 * `0xbfc4cc`), so a bare mesh renders the same in-game as it does in the viewport.
 */
const NEUTRAL_BASE_COLOR: RgbColor = { r: 0xbf, g: 0xc4, b: 0xcc }

/**
 * The `<Internal>` value a SubPart template exports with: the user's explicit flag if the
 * document carries one, else the template's own value (a built-in's catalogued `<Internal>`,
 * `false` for a flexo custom mesh).
 */
export function resolveInternal(
  part: EditingPart,
  templateId: string,
  entry: CatalogSubPart | undefined,
): boolean {
  return part.internalFlags[templateId] ?? entry?.internal ?? false
}

/**
 * True when the part carries flexo-modeled data that must be emitted UNDER this template's
 * id — SubPart GameData (tank/solar/engine), a SubPart-owned collider, or a SubPart-owned
 * light. Emitting any of them under the shared built-in id would MERGE onto the built-in
 * template globally.
 */
function hasSubPartGameData(part: EditingPart, templateId: string): boolean {
  return (
    part.subPartGameData.some(
      (s) => s.subPartTemplateId === templateId && !isSubPartGameDataEmpty(s),
    ) ||
    part.colliders.some((c) => c.ownerTemplateId === templateId) ||
    part.lights.some((l) => l.ownerTemplateId === templateId)
  )
}

/**
 * Builds the built-in-SubPart → export-variant map: one entry per DISTINCT placed built-in
 * template (deduped across placements) that needs redeclaring, because it is EITHER
 *   - carrying an `<Internal>` (interior-only) value the built-in doesn't have — the user flipped
 *     the flag for this template (see {@link resolveInternal}), OR
 *   - carrying flexo SubPart GameData (a <Light>, tank, etc.) — emitting that under the built-in
 *     id would MERGE onto the shared built-in template (KSA dedups GameData by id), corrupting
 *     every other use of that SubPart. The variant moves the GameData onto a fresh id instead.
 *
 * A template flexo changes NOTHING about gets no variant: the placement references the built-in id
 * and keeps the built-in's own `<Internal>`/`<RayTracing>`/`<ShadowCaster>` for free.
 *
 * **BUILT-IN TEMPLATES ONLY.** Custom meshes are skipped explicitly, by document lookup — NOT by
 * catalog absence. The catalog handed in is `$catalogIndex`, which merges `$customCatalog`
 * (`catalogStore.ts`), so custom meshes ARE present and a membership test silently let them
 * through. A variant of a custom mesh is pure harm: the whole mechanism exists to avoid merging
 * GameData onto a SHARED built-in template, and a custom SubPart id is already project-unique and
 * declared by this same export, so there is nothing to collide with. Worse, custom catalog entries
 * carry NO `materialId` (their material lives in `customMeshRenderCache`), so the variant emitted a
 * `<PartModel>` with no `<Material>` — an unconditional NRE in
 * `ThumbnailRenderResources.AddDraw` that crashes KSA at startup, before the main menu. Adding a
 * `<Light>` to a custom mesh was enough to trigger it. See plans/FIX_EMISSIVES_BUG.md.
 *
 * Variant ids are namespaced by the project {@link base} (deterministic, so re-exports are stable).
 */
export function buildExportVariantMap(
  part: EditingPart,
  catalog: ReadonlyMap<string, CatalogSubPart>,
  base: string,
): Map<string, ExportVariant> {
  const out = new Map<string, ExportVariant>()
  // expandGlassGlow appends synthetic `_Glow` meshes to customMeshes before this runs, so they
  // are covered here too.
  const customIds = new Set(part.customMeshes.map((m) => m.subPartId))
  for (const p of part.placements) {
    const templateId = p.subPartTemplateId
    if (out.has(templateId)) continue
    if (customIds.has(templateId)) continue // declared directly by this export — never a variant
    const entry = catalog.get(templateId)
    if (!entry) continue // unknown template — leave the reference as authored
    const wantInternal = resolveInternal(part, templateId, entry)
    const internalDiffers = wantInternal !== (entry.internal ?? false)
    if (!internalDiffers && !hasSubPartGameData(part, templateId)) continue
    // meshNodeName is the built-in <Mesh Id> (null only for the rare whole-atlas mesh). Without
    // it we can't reference the geometry — leave the built-in reference as-is.
    if (!entry.meshNodeName) {
      console.warn(
        `flexo export: built-in SubPart '${templateId}' has no mesh node — left as a direct reference`,
      )
      continue
    }
    // Same rule for the material: a variant reuses the built-in's <Material Id>, and a
    // <PartModel> with no <Material> crashes KSA at startup (AddDraw derefs it unguarded). No
    // shipped Core SubPart omits one, so this is defensive — but redeclaring without it would
    // trade a cosmetic limitation for a crash.
    if (!entry.materialId) {
      console.warn(
        `flexo export: built-in SubPart '${templateId}' has no material — left as a direct reference (its SubPart GameData / Internal flag cannot be applied)`,
      )
      continue
    }
    out.set(templateId, {
      originalId: templateId,
      variantId: `flexo_${base}_${templateId}`,
      meshId: entry.meshNodeName,
      materialId: entry.materialId,
      colliders: entry.colliders ?? [],
      internal: wantInternal,
      rayTracing: entry.rayTracing ?? null,
      shadowCaster: entry.shadowCaster ?? null,
    })
  }
  return out
}

/** Derives the `originalTemplateId → variantId` remap consumed by the Part/GameData serializers. */
function variantRemap(variants: Map<string, ExportVariant>): Map<string, string> {
  return new Map([...variants.values()].map((v) => [v.originalId, v.variantId]))
}

/** Encodes a decoded image to a Zstd KTX2, generating its mip chain. */
function encodeLevel(level: ImageLevel): Promise<Uint8Array> {
  return encodeImageToKtx2(
    { width: level.width, height: level.height, levels: buildMipChain(level) },
    { zstd: true },
  )
}

/**
 * Composites a mesh's glow onto a base diffuse and writes BOTH the (color-baked) diffuse and the
 * grayscale emissive mask as Textures/<token>_Diffuse.ktx2 / _Emissive.ktx2. The composited
 * diffuse REPLACES any stored diffuse for a glowing mesh — the glow color (and any color ramp,
 * baked here since KSA has no LUT slot) lives in the diffuse, the mask is grayscale and KSA adds
 * it as white × 1.25 after lighting. Returns their relative paths.
 */
async function emitGlowTextures(
  token: string,
  base: ImageLevel,
  glow: MeshGlow,
  binaries: { path: string; data: Uint8Array }[],
): Promise<{ diffusePath: string; emissivePath: string }> {
  const { diffuse, mask } = compositeGlow(base, glow.bitmap, glow.settings)
  const diffusePath = `Textures/${token}_Diffuse.ktx2`
  const emissivePath = `Textures/${token}_Emissive.ktx2`
  binaries.push({ path: diffusePath, data: await encodeLevel(diffuse) })
  binaries.push({ path: emissivePath, data: await encodeLevel(mask) })
  return { diffusePath, emissivePath }
}

/**
 * The decoded base diffuse a glowing primitive composites over: its primary face
 * texture → its material's baseColor image → the material's picked color (solid) →
 * neutral gray. Mirrors customAssetStore's faceBaseImage so editor == export.
 *
 * `glow` sizes the SYNTHESISED bases only: compositeGlow outputs at the base's resolution,
 * so a 4×4 solid would throw a high-resolution glow away (see glowComposite.baseSizeFor).
 */
async function exportBaseImage(
  tex: CustomTexture | undefined,
  material: CustomMaterial | undefined,
  texById: ReadonlyMap<string, CustomTexture>,
  glow?: GlowBitmap | null,
): Promise<ImageLevel> {
  const mapTex =
    tex ??
    (material?.baseColor.kind === 'map' ? texById.get(material.baseColor.textureId) : undefined)
  if (mapTex) {
    const src = await getAsset(assetKeys.textureSource(mapTex.id))
    if (src) return (await decodeImage(src)).levels[0]
  }
  const { width, height } = baseSizeFor(glow)
  if (material?.baseColor.kind === 'color')
    return solidBase(material.baseColor.color, width, height)
  return neutralBase(width, height)
}

/** Two-digit lowercase hex of a 0..255 value (solid-texture filename tokens). */
function hex2(v: number): string {
  return Math.max(0, Math.min(255, Math.round(v)))
    .toString(16)
    .padStart(2, '0')
}

/** A 0..1 channel value quantized to a texel byte. */
function toTexel(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v * 255)))
}

/** Resolved texture channels for one <PbrMaterial> (all binaries already emitted). */
interface ResolvedChannels {
  diffusePath: string
  normalPath: string
  aoRoughMetalPath: string
  emissivePath?: string
}

/**
 * Per-bundle texture/material emission state: dedupes solid-color textures by value
 * and <PbrMaterial>s by resolved channel set (Core's own pattern — one material
 * shared by many SubParts), pushing each binary exactly once.
 */
class BundleTextures {
  private readonly solids = new Map<string, Promise<string>>()
  private readonly materialByChannels = new Map<string, string>()
  /** The deduped <PbrMaterial> list, in first-use order. */
  readonly materials: AssetsMaterialPlan[] = []
  private readonly token: string
  private readonly binaries: { path: string; data: Uint8Array }[]

  constructor(token: string, binaries: { path: string; data: Uint8Array }[]) {
    this.token = token
    this.binaries = binaries
  }

  private solid(key: string, path: string, r: number, g: number, b: number): Promise<string> {
    let pending = this.solids.get(key)
    if (!pending) {
      pending = makeSolidKtx2(r, g, b).then((data) => {
        this.binaries.push({ path, data })
        return path
      })
      this.solids.set(key, pending)
    }
    return pending
  }

  /** The shared flat tangent-space normal (128,128,255 ≈ +Z) for map-less materials. */
  flatNormal(): Promise<string> {
    return this.solid('normal', `Textures/${this.token}_FlatNormal.ktx2`, 128, 128, 255)
  }

  /**
   * A solid AO/Rough/Metal texel (bytes 0..255). The legacy neutral (255,128,0 =
   * AO 1 / rough 0.5 / metal 0) keeps its historical `_NeutralORM` filename.
   */
  ormSolid(ao: number, rough: number, metal: number): Promise<string> {
    const path =
      ao === 255 && rough === 128 && metal === 0
        ? `Textures/${this.token}_NeutralORM.ktx2`
        : `Textures/${this.token}_ORM_${hex2(ao)}${hex2(rough)}${hex2(metal)}.ktx2`
    return this.solid(`orm:${ao},${rough},${metal}`, path, ao, rough, metal)
  }

  /** A solid diffuse of the picked sRGB color (KSA's shader gamma-decodes it once). */
  baseColorSolid(c: RgbColor): Promise<string> {
    const path = `Textures/${this.token}_BaseColor_${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}.ktx2`
    return this.solid(`base:${c.r},${c.g},${c.b}`, path, c.r, c.g, c.b)
  }

  /**
   * Interns a resolved channel set: identical channels share one <PbrMaterial>
   * (the first claimant's `preferredId` names it), mirroring how one Core pack
   * material serves every SubPart in the pack.
   */
  intern(channels: ResolvedChannels, preferredId: string): string {
    const key = `${channels.diffusePath}|${channels.normalPath}|${channels.aoRoughMetalPath}|${channels.emissivePath ?? ''}`
    const existing = this.materialByChannels.get(key)
    if (existing) return existing
    this.materialByChannels.set(key, preferredId)
    this.materials.push({ id: preferredId, ...channels })
    return preferredId
  }
}

/** The uniform value of a scalar channel. */
function scalarValue(c: ScalarChannel, fallback: number): number {
  return c.kind === 'value' ? c.value : fallback
}

/** The map texture id of a scalar channel, if any. */
function scalarMapId(c: ScalarChannel): string | undefined {
  return c.kind === 'map' ? c.textureId : undefined
}

/** The exported <PbrMaterial Id> for a mesh rendering its material verbatim (shareable). */
function materialExportId(material: CustomMaterial): string {
  return `flexo_${sanitizeAssetToken(material.name)}_${material.id.replace(/^mat_/, '')}_Material`
}

/** Exported filename suffix per texture channel (mirrors Core's naming). */
const CHANNEL_SUFFIX: Record<TextureChannel, string> = {
  baseColor: 'Diffuse',
  normal: 'Normal',
  orm: 'AoRoughMetal',
  roughness: 'Rough',
  metalness: 'Metal',
  occlusion: 'AO',
  emissiveMask: 'Emissive',
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

/** Fetches a KSA .ktx2 (served under /ksa/) verbatim, for the 'bundle' export mode. */
async function fetchKtx2(subpath: string): Promise<Uint8Array> {
  const res = await fetch(toUrl(subpath))
  if (!res.ok) throw new Error(`kitten texture fetch failed (${res.status}): ${subpath}`)
  return new Uint8Array(await res.arrayBuffer())
}

/**
 * Builds the Assets plan for one part-ified kitten SubPart. Resolves each KSA texture
 * channel by the export mode: 'reference' → an absolute `{contentCorePath}\…` path (no
 * file copied); 'bundle' → copy the .ktx2 verbatim into Textures/ (deduped by subpath
 * across submeshes/kittens via `bundled`). Channels the submesh lacks (eyes/labels
 * normal+ORM) resolve to the shared synthetic solids; the material is interned into
 * `tex` so identical channel sets (two part-ified kittens of one kind) share one entry.
 */
async function planKittenSubPart(
  m: CustomMesh,
  cfg: KittenTextureExportConfig,
  bundled: Map<string, string>,
  binaries: { path: string; data: Uint8Array }[],
  bundleToken: string,
  tex: BundleTextures,
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
    const glow = await glowFor(m)
    if (glow) {
      const size = baseSizeFor(glow.bitmap)
      const paths = await emitGlowTextures(
        `${bundleToken}_${subPartId}`,
        neutralBase(size.width, size.height),
        glow,
        binaries,
      )
      const materialId = tex.intern(
        {
          diffusePath: paths.diffusePath,
          normalPath: await tex.flatNormal(),
          aoRoughMetalPath: await tex.ormSolid(255, 128, 0),
          emissivePath: paths.emissivePath,
        },
        `${subPartId}_Material`,
      )
      return { subPartId, materialId, glass: false }
    }
  }

  const resolve = async (subpath: string): Promise<string> => {
    if (cfg.mode === 'reference') return joinContentCore(cfg.contentCorePath, subpath)
    let rel = bundled.get(subpath)
    if (!rel) {
      rel = `Textures/${basename(subpath)}`
      bundled.set(subpath, rel)
      binaries.push({ path: rel, data: await fetchKtx2(subpath) })
    }
    return rel
  }

  // Glass shell (visor 'glass'/'glassGlow'): a chosen tint becomes a solid diffuse of the picked
  // sRGB color (KSA's glass shader derives only ~10% of its color from the diffuse, so a saturated
  // solid reads as a subtle tinted glass); no tint keeps the real visor diffuse. Non-glass
  // submeshes also land here. Glass materials never carry <Emissive> (KSA glass ignores it).
  const tint = surface === 'glass' || surface === 'glassGlow' ? m.glass?.tint : undefined
  let diffusePath: string
  if (tint) {
    diffusePath = `Textures/${bundleToken}_${subPartId}_Diffuse.ktx2`
    binaries.push({
      path: diffusePath,
      data: await makeSolidKtx2(tint.r, tint.g, tint.b),
    })
  } else {
    diffusePath = await resolve(src.diffuse)
  }
  const materialId = tex.intern(
    {
      diffusePath,
      normalPath: src.normal ? await resolve(src.normal) : await tex.flatNormal(),
      aoRoughMetalPath: src.aoRoughMetal
        ? await resolve(src.aoRoughMetal)
        : await tex.ormSolid(255, 128, 0),
    },
    `${subPartId}_Material`,
  )
  // The visor renders through KSA's translucent glass path.
  return { subPartId, materialId, glass: transparent }
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
 *
 * DELIBERATELY KITTEN-ONLY. An IMPORTED mesh may also export as glass (`imported.transparent`),
 * but it takes the plain single-SubPart glass route: the layered trick needs a second copy of the
 * geometry inset inside the shell, which for a hand-modelled visor shell is exact and for an
 * arbitrary imported mesh (open surfaces, non-convex hulls) is a scale-toward-bbox-center guess
 * that would poke through. An imported glass mesh therefore just doesn't glow — the honest KSA
 * behaviour (MeshGlassIndirect.frag never samples emissive).
 */
export function expandGlassGlow(part: EditingPart): { part: EditingPart; insetIds: Set<string> } {
  const placed = new Set(part.placements.map((p) => p.subPartTemplateId))
  const layered = part.customMeshes.filter(
    (m) =>
      meshKind(m) === 'kitten' &&
      m.kitten?.transparent &&
      m.surface === 'glassGlow' &&
      placed.has(m.subPartId),
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

/**
 * Triangle budget for the `<id>_VM` picking meshes in a SHIPPED mod: above this, the view mesh
 * is decimated (index buffer only — see exportGlb's decimateViewGeometry).
 *
 * WHY 2000: KSA's editor hover is a CPU cost, not a GPU one. `Part.RayCastEgoSubPart`
 * (`decomp/KSA/Part.cs:1854-1887`) runs `Ray.RaycastWatertight` — a plain triangle loop over
 * `MeshReference.PositionCompare`, which is the view mesh DE-INDEXED into one `double3` (24 B)
 * per index at load (`decomp/KSA/MeshReference.cs:87-95`) — for every SubPart of every part
 * under the cursor, every frame the mouse moves. 2 000 triangles is ~144 KB of compare data and
 * a loop that finishes in microseconds; it is also comfortably above every flexo primitive and
 * kitten submesh (so nothing hand-authored is ever touched) while capping a 150 k-triangle
 * imported model at 1.3% of its raw picking cost. Picking accuracy is the only trade, and the
 * _VM mesh is never rendered.
 */
export const VIEW_MESH_TRIANGLE_BUDGET = 2000

/**
 * The `_VM` budget this export runs with: the constant above, or `undefined` (ship the view
 * meshes at full resolution) when the user turned decimation off in the import settings.
 * Read from the persisted store rather than threaded through every caller — it is a global
 * user preference, and the store yields its default (decimation ON) wherever nothing was
 * ever persisted, which is also what tests get.
 */
function viewMeshBudget(): number | undefined {
  return $modelImportSettings.get().decimateViewMeshes ? VIEW_MESH_TRIANGLE_BUDGET : undefined
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
 * The Assets XML also declares the export variants (`variants` — built-in SubParts whose
 * `<Internal>` flag the user overrode AND ones that carry GameData), which reuse built-in
 * Mesh/Material and ship no binaries. Returns an empty bundle (animations only) when neither custom SubParts nor
 * variants are present.
 *
 * The .ktx2 bytes come from IndexedDB (encoded at upload time); the atlas GLB is generated
 * fresh, per mesh source — primitives from their stored params, kitten submeshes from the
 * shared bake, IMPORTED meshes from the raw (untangented, indexed) geometry of their import
 * batch's stored GLB. Every SubPart, whatever its source, ends up as one node in ONE atlas
 * with one `<PbrMaterial>` and one decimated `<id>_VM` picking mesh.
 */
export async function buildCustomBundle(
  part: EditingPart,
  base: string,
  kittenTex: KittenTextureExportConfig = DEFAULT_KITTEN_TEXTURE_EXPORT,
  variants: Map<string, ExportVariant> = new Map(),
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

  // Export variants (overridden <Internal> + built-in SubParts carrying GameData): reference-only
  // SubParts reusing built-in Mesh/Material (no binaries).
  const referenceSubParts: ReferenceSubPartPlan[] = [...variants.values()].map((v) => ({
    subPartId: v.variantId,
    meshId: v.meshId,
    materialId: v.materialId,
    colliders: v.colliders,
    internal: v.internal,
    rayTracing: v.rayTracing,
    shadowCaster: v.shadowCaster,
  }))

  // Nothing to declare → no Assets XML, but still ship any animation glbs above.
  if (meshes.length === 0 && referenceSubParts.length === 0) {
    return { assetsFile: null, assetsXml: null, binaries }
  }

  // Custom geometry (primitive/kitten/imported meshes) → build the mesh-atlas GLB, its textures,
  // and the deduped PbrMaterial list. Skipped entirely for a variant-only part (no atlas needed).
  let meshAtlasPath: string | undefined
  const subParts: AssetsSubPartPlan[] = []
  let materials: AssetsMaterialPlan[] = []
  if (meshes.length > 0) {
    // Derive a bundle token from base (project name) + the first mesh's random id suffix.
    // Mesh ids contain a random UUID fragment generated at creation time, so this is
    // unique across different parts even when they share the same default partId.
    // Using base keeps the filename human-readable; the hash suffix makes it unique.
    const bundleToken = `${base}_${meshes[0].id.replace(/^mesh_/, '')}`
    meshAtlasPath = `Meshes/${bundleToken}_MeshAtlas.glb`
    // One atlas node per placed custom mesh, resolved per geometry source. A source that can't
    // produce geometry yields null: the SubPart is dropped from BOTH the atlas and the Assets XML
    // below (a <SubPart> whose <Mesh Id> names nothing would be a dangling reference in-game),
    // but the rest of the export still ships — never throw half-way through a user's export.
    const nodes = (
      await Promise.all(
        meshes.map(async (m) => {
          switch (meshKind(m)) {
            case 'kitten': {
              // Always bundle the baked geometry (KSA can't skin the source gltf); clone the
              // shared cache so the post-build dispose() frees the clone, not the cache. A layered
              // 'glassGlow' glow layer is inset so it sits just inside its glass shell.
              const subs = await bakeKittenSubMeshes(m.kitten!.kind)
              const geo = subs.find((s) => s.specKey === m.kitten!.specKey)?.geometry
              let cloned = geo ? geo.clone() : new THREE.BufferGeometry()
              if (insetIds.has(m.subPartId)) cloned = insetGeometry(cloned, GLASS_GLOW_INSET)
              return { name: m.subPartId, geometry: cloned }
            }
            case 'imported': {
              // The RAW (untangented, indexed) geometry — never the editor's MikkTSpace cache,
              // which is de-indexed and would export as a silent no-draw (see the GEOMETRY block
              // in exportGlb.ts and getImportedRawGeometry's own comment). Cloned for the same
              // reason as the kitten bake: the cache is shared and must survive dispose().
              const src = m.imported!
              const geo = await getImportedRawGeometry(src.importId, src.meshName)
              if (!geo) {
                console.warn(
                  `flexo export: imported mesh '${src.meshName}' (${src.sourceFile}) has no geometry — SubPart '${m.subPartId}' skipped`,
                )
                return null
              }
              return { name: m.subPartId, geometry: geo.clone() }
            }
            case 'primitive': {
              const geometry = buildPrimitiveGeometry(m.primitive!)
              applyFaceUvTransforms(
                geometry,
                PRIMITIVE_FACE_KEYS[m.primitive!.kind],
                m.faceTextures,
              )
              return { name: m.subPartId, geometry }
            }
          }
        }),
      )
    ).filter((n) => n !== null)
    const emitted = new Set(nodes.map((n) => n.name))
    if (nodes.length === 0) {
      meshAtlasPath = undefined // every mesh failed to resolve — declare no atlas at all
    } else {
      try {
        binaries.push({
          path: meshAtlasPath,
          data: await buildMeshAtlasGlb(nodes, { viewMeshBudget: viewMeshBudget() }),
        })
      } finally {
        for (const n of nodes) n.geometry.dispose()
      }
    }

    const tex = new BundleTextures(bundleToken, binaries)
    const texById = new Map(part.customTextures.map((t) => [t.id, t]))
    const materialById = new Map(part.customMaterials.map((mt) => [mt.id, mt]))
    const texPath = new Map<string, string>() // texId -> relative path (dedupe shared textures)
    const kittenTexPath = new Map<string, string>() // kitten subpath -> mod path (bundle mode)

    /** Copies a stored uploaded .ktx2 into the bundle once, returning its path (null = blob gone). */
    const storedTexturePath = async (texId: string): Promise<string | null> => {
      const t = texById.get(texId)
      if (!t) return null
      let rel = texPath.get(t.id)
      if (!rel) {
        const blob = await getAsset(assetKeys.textureKtx2(t.id))
        if (!blob) return null
        const suffix = CHANNEL_SUFFIX[t.channel ?? 'baseColor']
        rel = `Textures/${sanitizeAssetToken(t.name)}_${sanitizeAssetToken(t.id)}_${suffix}.ktx2`
        texPath.set(t.id, rel)
        binaries.push({ path: rel, data: new Uint8Array(await blob.arrayBuffer()) })
      }
      return rel
    }

    /** The decoded base level of a stored texture's SOURCE image, or null. */
    const sourceLevel = async (texId: string): Promise<ImageLevel | null> => {
      const src = await getAsset(assetKeys.textureSource(texId))
      return src ? (await decodeImage(src)).levels[0] : null
    }

    /**
     * The <Normal> path for a material: strength 1 copies the stored .ktx2 verbatim
     * (the KSA X-flip transform is baked at upload), any other strength regenerates
     * from the source with the strength scaled into RG — the editor's normalScale
     * applies the same multiplier, so both render identically. Deduped per
     * (texture, strength); null → caller falls back to the flat solid.
     */
    const normalPaths = new Map<string, Promise<string | null>>()
    const normalPathFor = (normal: NormalChannel): Promise<string | null> => {
      const key = `${normal.textureId}@${normal.strength}`
      let pending = normalPaths.get(key)
      if (!pending) {
        pending = (async () => {
          if (normal.strength === 1) return storedTexturePath(normal.textureId)
          const t = texById.get(normal.textureId)
          const src = t ? await getAsset(assetKeys.textureSource(t.id)) : null
          if (!t || !src) return null
          const prepared = prepareChannelImage(await decodeImage(src), 'normal', normal.strength)
          const pct = Math.round(normal.strength * 100)
          const rel = `Textures/${sanitizeAssetToken(t.name)}_${sanitizeAssetToken(t.id)}_s${pct}_Normal.ktx2`
          binaries.push({ path: rel, data: await encodeImageToKtx2(prepared, { zstd: true }) })
          return rel
        })()
        normalPaths.set(key, pending)
      }
      return pending
    }

    /** The material's <Normal> path (its map when set and resolvable, else the flat solid). */
    const resolveNormal = async (material: CustomMaterial | undefined): Promise<string> => {
      if (material?.normal) {
        const p = await normalPathFor(material.normal)
        if (p) return p
      }
      return tex.flatNormal()
    }

    /**
     * The material's <AoRoughMetal> path: a pre-packed upload copies verbatim; any
     * grayscale AO/rough/metal map packs with the uniform channels into one image
     * (R=AO G=rough B=metal); all-uniform channels become a solid texel. Deduped by
     * the source combination.
     */
    const ormPacks = new Map<string, Promise<string | null>>()
    const resolveOrm = async (material: CustomMaterial | undefined): Promise<string> => {
      if (!material) return tex.ormSolid(255, 128, 0) // legacy neutral (no material assigned)
      if (material.ormPacked) {
        const p = await storedTexturePath(material.ormPacked.textureId)
        if (p) return p
      }
      const aoId = material.occlusion?.textureId
      const roughId = scalarMapId(material.roughness)
      const metalId = scalarMapId(material.metalness)
      const roughByte = toTexel(scalarValue(material.roughness, 0.5))
      const metalByte = toTexel(scalarValue(material.metalness, 0))
      if (!aoId && !roughId && !metalId) return tex.ormSolid(255, roughByte, metalByte)

      const key = `${aoId ?? '-'}|${roughId ?? roughByte}|${metalId ?? metalByte}`
      let pending = ormPacks.get(key)
      if (!pending) {
        pending = (async () => {
          const src = async (id: string | undefined, value: number): Promise<OrmSource> => {
            const level = id ? await sourceLevel(id) : null
            return level ? { level } : { value }
          }
          const packed = packOrmLevel(
            await src(aoId, 255),
            await src(roughId, roughByte),
            await src(metalId, metalByte),
          )
          const rel = `Textures/${bundleToken}_${sanitizeAssetToken(material.name)}_${material.id.replace(/^mat_/, '')}_AoRoughMetal.ktx2`
          binaries.push({ path: rel, data: await encodeLevel(packed) })
          return rel
        })()
        ormPacks.set(key, pending)
      }
      const packedPath = await pending
      return packedPath ?? tex.ormSolid(255, roughByte, metalByte)
    }

    /**
     * Stamps a planned custom SubPart with its `<Internal>` (interior-only) value.
     *
     * GLASS IS EXCLUDED, HARD: `<PartModelGlass>` has no `<Internal>` field in KSA at all — the
     * only `[XmlElement("Internal")]` in the whole decomp is `PartModelModule.cs:35` — so a glass
     * mesh drops the flag rather than emitting it where the game can never read it. A layered
     * 'glassGlow' visor is glass WHOLE: its shell lands here as glass, and the opaque emissive
     * layer expandGlassGlow splits off carries a synthetic `<id>_Glow` template id the document
     * can hold no flag for, so half a layered surface is never marked interior-only.
     */
    const withInternal = (plan: AssetsSubPartPlan): AssetsSubPartPlan => ({
      ...plan,
      internal: !plan.glass && resolveInternal(part, plan.subPartId, undefined),
    })

    for (const m of meshes) {
      if (!emitted.has(m.subPartId)) continue // geometry failed to resolve (warned above)
      // Part-ified kitten submesh: full PBR from the KSA .ktx2 (referenced/bundled), or a generated
      // solid tint diffuse (glass) / glow textures (emissive) per the visor surface mode.
      if (meshKind(m) === 'kitten') {
        subParts.push(
          withInternal(
            await planKittenSubPart(m, kittenTex, kittenTexPath, binaries, bundleToken, tex),
          ),
        )
        continue
      }
      // An imported mesh flagged `transparent` (glTF alphaMode BLEND, opt-in at import) renders
      // through KSA's translucent <PartModelGlass> instead of <PartModel>. Primitives are never
      // glass — the flag only exists on kitten/imported sources.
      const glass = m.imported?.transparent === true
      const material = m.materialId ? materialById.get(m.materialId) : undefined
      // Glowing primitive/imported mesh: composite the glow into the diffuse (color baked in) +
      // emit the grayscale emissive mask. The base under the glow resolves exactly like the
      // editor: face texture > material baseColor image > material color > neutral gray. The
      // material's scalar channels still ship via the ORM solid.
      //
      // Glass never takes this path: MeshGlassIndirect.frag doesn't sample the emissive map at
      // all, so an <Emissive> on a glass material is dead weight that only muddies material
      // interning — the same rule planKittenSubPart applies to a 'glass' visor.
      const glow = glass ? null : await glowFor(m)
      if (glow) {
        const primaryTexId = getPrimaryTextureId(m)
        const base = await exportBaseImage(
          primaryTexId ? texById.get(primaryTexId) : undefined,
          material,
          texById,
          glow.bitmap,
        )
        const paths = await emitGlowTextures(`${bundleToken}_${m.subPartId}`, base, glow, binaries)
        const materialId = tex.intern(
          {
            diffusePath: paths.diffusePath,
            normalPath: await resolveNormal(material),
            aoRoughMetalPath: await resolveOrm(material),
            emissivePath: paths.emissivePath,
          },
          `${m.subPartId}_Material`,
        )
        subParts.push(withInternal({ subPartId: m.subPartId, materialId, glass }))
        continue
      }
      // Diffuse resolution: the primary (first textured) face wins, then the material's
      // base color (image or picked-color solid). Neither → the shared neutral material.
      //
      // There is NO "untextured <PartModel>" in KSA: ThumbnailRenderResources.AddDraw derefs
      // Material.DiffuseReference/NormalReference/PBRMap with no null guard, so omitting
      // <Material> crashes the game at startup. Zero Core PartModels omit it. The fallback
      // interns to ONE <PbrMaterial> across every bare mesh, and its color matches the editor's
      // untextured look (MaterialFactory.makeFlatMaterial) so in-game == viewport.
      const primaryTexId = getPrimaryTextureId(m)
      let diffusePath = primaryTexId ? await storedTexturePath(primaryTexId) : null
      if (!diffusePath && material) {
        diffusePath =
          material.baseColor.kind === 'map'
            ? await storedTexturePath(material.baseColor.textureId)
            : await tex.baseColorSolid(material.baseColor.color)
      }
      if (!diffusePath) {
        const materialId = tex.intern(
          {
            diffusePath: await tex.baseColorSolid(NEUTRAL_BASE_COLOR),
            normalPath: await tex.flatNormal(),
            aoRoughMetalPath: await tex.ormSolid(255, 128, 0),
          },
          `${bundleToken}_NeutralMaterial`,
        )
        subParts.push(withInternal({ subPartId: m.subPartId, materialId, glass }))
        continue
      }
      // A mesh rendering its material verbatim (no per-face diffuse override) interns under
      // the material's own exported id, so meshes sharing a material share one <PbrMaterial>.
      const preferredId =
        material && !primaryTexId ? materialExportId(material) : `${m.subPartId}_Material`
      const materialId = tex.intern(
        {
          diffusePath,
          normalPath: await resolveNormal(material),
          aoRoughMetalPath: await resolveOrm(material),
        },
        preferredId,
      )
      subParts.push(withInternal({ subPartId: m.subPartId, materialId, glass }))
    }

    materials = tex.materials
  }

  return {
    assetsFile: `${base}Assets.xml`,
    assetsXml: serializeAssets({
      meshAtlasPath,
      materials,
      subParts,
      referenceSubParts,
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
  const content = buildModContent(expandedPart, projectName, catalog)
  const bundle = await buildCustomBundle(
    expandedPart,
    content.base,
    kittenTex,
    content.variants,
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
  const content = buildModContent(expandedPart, projectName, catalog)

  const bundle = await buildCustomBundle(
    expandedPart,
    content.base,
    kittenTex,
    content.variants,
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
