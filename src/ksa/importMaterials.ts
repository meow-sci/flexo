import type {
  GltfMaterialDef,
  GltfTextureRef,
  LoadedModel,
  ModelSource,
} from '../three/loadModelFile'
import { decodeImage, encodeLevelToPng, type ImageLevel } from '../ktx/decodeImage'
import { packOrmLevel, type OrmSource } from '../ktx/channelTransforms'
import type { GlowBitmap } from '../ktx/glowComposite'
import { WarningSink, type ImportPlan, type ImportWarning } from './importPlan'
import type { RgbColor, TextureChannel } from './types'

/**
 * MATERIAL pass of the model importer: a glTF document's metallic-roughness materials → the
 * flexo {@link import('./types').CustomTexture}/{@link import('./types').CustomMaterial} model,
 * i.e. KSA's five `<PbrMaterial>` slots (plan §3.4).
 *
 * THE GOVERNING FACT: `<PbrMaterial>` has FIVE TEXTURE SLOTS AND ZERO SCALARS
 * (decomp/KSA/PbrMaterialReference.cs; plans/CUSTOM_TEXTURES_PLAN.md §1). Every glTF *factor*
 * — baseColorFactor, metallicFactor, roughnessFactor, occlusionStrength, emissiveFactor,
 * KHR_materials_emissive_strength — therefore has to be BAKED INTO PIXELS here, because
 * there is nowhere downstream to put a number. Everything else maps 1:1:
 *
 *   glTF baseColorTexture × baseColorFactor      → `<Diffuse>`       (channel 'baseColor')
 *   glTF occlusion.R + metallicRoughness.G/B     → `<AoRoughMetal>`  (channel 'orm')
 *   glTF normalTexture + scale                   → `<Normal>`        (channel 'normal')
 *   glTF emissiveTexture × emissiveFactor        → composited diffuse + `<Emissive>` mask
 *   —                                            → `<ThinFilm>`      (no glTF equivalent)
 *
 * The ORM packing needs no conversion at all: KSA's shader comment says "Following GLTF spec"
 * and reads R=AO, G=rough, B=metal (Content/Core/Shaders/MeshIndirect.frag) — the exact glTF
 * occlusion+metallicRoughness layout.
 *
 * The output is deliberately descriptor-shaped (specs referencing specs by key): nothing here
 * touches the editor document, IndexedDB or three, so the whole translation is unit-testable
 * and the store wiring (customAssetStore.importModelAsMeshes) stays a separate concern.
 */

// ── output shape ─────────────────────────────────────────────────────────────

/** One texture to create for an import: source bytes + the flexo channel it was authored for. */
export interface ImportTextureSpec {
  /** Dedupe key: source-content hash + channel + any baked-factor parameters. */
  key: string
  /** User-facing texture name, e.g. "hull_basecolor". */
  name: string
  channel: TextureChannel
  /**
   * Ready-to-store SOURCE image bytes: the glTF image verbatim when nothing had to be baked,
   * otherwise a PNG of the generated pixels. Stored under `tex-src:<id>` and re-encoded from
   * on every later channel/strength change — so it must always be a real, lossless image.
   */
  bytes: Uint8Array
  mime: string
}

/** One material to create, referencing {@link ImportTextureSpec} keys. */
export interface ImportMaterialSpec {
  /** Dedupe key across groups (the glTF material index). */
  key: string
  name: string
  baseColorTextureKey?: string
  /** Used when there is no base-colour texture (exports as a deduped 1×1 solid). sRGB 0..255. */
  baseColor?: RgbColor
  /** Pre-packed R=AO G=rough B=metal. */
  ormTextureKey?: string
  /** Used when {@link ormTextureKey} is absent (exports as a solid ORM texel). 0..1. */
  metalness: number
  roughness: number
  normalTextureKey?: string
  /** glTF `normalTexture.scale`; baked into RG by the existing encode, NOT here. */
  normalStrength: number
  /**
   * Composed glow bitmap (rgb = emissive colour, a = intensity), PNG-encoded, when the
   * material emits. Stored under `assetKeys.emissivePaint(meshId)` — see the EMISSIVE note.
   */
  glowPng?: Uint8Array
  /**
   * The uniform-colour equivalent of {@link glowPng}, stored as the `EmissiveConfig.color` (the
   * paint tool's brush default if the user retouches the import). The glow's magnitude lives in
   * the bitmap's alpha — the imported `EmissiveConfig` passes it through at coverage/strength 1.
   */
  glowColor?: RgbColor
  /** glTF `alphaMode: BLEND` — the SubPart may export through `<PartModelGlass>`. */
  transparent?: boolean
}

export interface ImportMaterialPlan {
  textures: ImportTextureSpec[]
  materials: ImportMaterialSpec[]
  /** `ImportGroup.key` → `ImportMaterialSpec.key`. */
  materialKeyByGroup: Map<string, string>
  warnings: ImportWarning[]
}

export interface ImportMaterialOptions {
  /** Longest-edge cap for images we have to decode + regenerate. */
  maxTextureSize?: number
  /**
   * Image codecs, injectable so the translation is testable without a canvas (happy-dom has
   * no `createImageBitmap`). Defaults are the browser canvas ones in `src/ktx/decodeImage`.
   */
  decodeLevel?: (bytes: Uint8Array, mime: string) => Promise<ImageLevel | null>
  encodePng?: (level: ImageLevel) => Promise<Uint8Array>
}

// ── colour space ─────────────────────────────────────────────────────────────
//
// Base colour and emissive are sRGB-ENCODED bytes; their factors are LINEAR multipliers.
// Multiplying sRGB bytes by a linear factor is simply wrong (0.5 × a mid-grey byte is much
// darker than half the light), so every colour bake round-trips through linear.

/** sRGB byte (0..255) → linear 0..1, the exact IEC 61966-2-1 transfer function. */
export function srgbByteToLinear(byte: number): number {
  const c = byte / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** Linear 0..1 → sRGB byte (0..255), clamped. */
export function linearToSrgbByte(value: number): number {
  const c = clamp01(value)
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055
  return Math.round(s * 255)
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)))
}

/** Rec.709 relative luminance of a LINEAR RGB triple. */
function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

// ── content hashing (dedup keys) ─────────────────────────────────────────────

const FNV64_PRIME_LO = 0x000001b3
const FNV64_PRIME_HI = 0x00000100
const TWO32 = 4294967296

/**
 * FNV-1a-64 over the raw bytes, as 16 lowercase hex chars — a DEDUP KEY, not a digest.
 * Deliberately not `crypto.subtle`: that API is async and unavailable in the test
 * environment, and this only has to tell two images apart.
 *
 * The 64-bit multiply is done in 32-bit halves: `lo * 0x1b3` stays under 2^53 so it is exact
 * as a double, and the high half only needs the two `Math.imul` cross terms plus the carry.
 */
export function hashBytes(bytes: Uint8Array): string {
  let hi = 0xcbf29ce4
  let lo = 0x84222325
  for (let i = 0; i < bytes.length; i++) {
    lo = (lo ^ bytes[i]!) >>> 0
    const full = lo * FNV64_PRIME_LO
    const carry = Math.floor(full / TWO32)
    const nextHi =
      (((Math.imul(hi, FNV64_PRIME_LO) >>> 0) + (Math.imul(lo, FNV64_PRIME_HI) >>> 0) + carry) %
        TWO32) >>>
      0
    lo = (full % TWO32) >>> 0
    hi = nextHi
  }
  return hi.toString(16).padStart(8, '0') + lo.toString(16).padStart(8, '0')
}

// ── pure pixel transforms ────────────────────────────────────────────────────

/**
 * Multiplies a LINEAR RGB factor into an sRGB-encoded base-colour image: decode each byte to
 * linear, scale, re-encode. Alpha is forced opaque — KSA parts are opaque or glass, never
 * per-texel alpha (there is no cutout in the part shader, PartModelRenderer.cs).
 */
export function bakeBaseColorFactor(level: ImageLevel, factor: readonly number[]): ImageLevel {
  const rgba = new Uint8Array(level.rgba.length)
  for (let i = 0; i < rgba.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      rgba[i + c] = linearToSrgbByte(srgbByteToLinear(level.rgba[i + c]!) * (factor[c] ?? 1))
    }
    rgba[i + 3] = 255
  }
  return { width: level.width, height: level.height, rgba }
}

/**
 * Lifts one channel of an image into a grayscale level (value in R), scaled by a factor.
 * {@link packOrmLevel} reads R from each source, and glTF puts roughness in G and metalness
 * in B of one image — so each has to be lifted out before packing. These channels are LINEAR
 * data, so multiplying the BYTES by the factor is the correct operation.
 */
export function extractChannel(level: ImageLevel, offset: number, factor: number): ImageLevel {
  const rgba = new Uint8Array(level.rgba.length)
  for (let i = 0; i < rgba.length; i += 4) {
    const v = clampByte(level.rgba[i + offset]! * factor)
    rgba[i] = v
    rgba[i + 1] = v
    rgba[i + 2] = v
    rgba[i + 3] = 255
  }
  return { width: level.width, height: level.height, rgba }
}

/**
 * glTF's occlusion strength: `ao = 1 + strength * (texR - 1)` (glTF 2.0 §material.occlusion),
 * i.e. strength 0 disables the map entirely. Applied in byte space — AO is linear data.
 */
export function applyOcclusionStrength(level: ImageLevel, strength: number): ImageLevel {
  const rgba = new Uint8Array(level.rgba.length)
  for (let i = 0; i < rgba.length; i += 4) {
    const v = clampByte(255 + strength * (level.rgba[i]! - 255))
    rgba[i] = v
    rgba[i + 1] = v
    rgba[i + 2] = v
    rgba[i + 3] = 255
  }
  return { width: level.width, height: level.height, rgba }
}

/**
 * Packs glTF's occlusion + metallicRoughness pair (and their factors) into ONE
 * AoRoughMetal image: R=AO, G=rough, B=metal — KSA's layout, which IS the glTF layout
 * ("Following GLTF spec", MeshIndirect.frag). Sources of different sizes are
 * nearest-resampled to the largest by {@link packOrmLevel}.
 */
export function packGltfOrm(args: {
  /** The metallicRoughness image (G=rough, B=metal), or null when the material has none. */
  mrLevel: ImageLevel | null
  /** The occlusion image (R=AO), or null. */
  occLevel: ImageLevel | null
  metallicFactor: number
  roughnessFactor: number
  occlusionStrength: number
}): ImageLevel {
  const ao: OrmSource = args.occLevel
    ? { level: applyOcclusionStrength(args.occLevel, args.occlusionStrength) }
    : { value: 255 } // no map ⇒ fully unoccluded
  const rough: OrmSource = args.mrLevel
    ? { level: extractChannel(args.mrLevel, 1, args.roughnessFactor) }
    : { value: clampByte(args.roughnessFactor * 255) }
  const metal: OrmSource = args.mrLevel
    ? { level: extractChannel(args.mrLevel, 2, args.metallicFactor) }
    : { value: clampByte(args.metallicFactor * 255) }
  return packOrmLevel(ao, rough, metal)
}

/**
 * Builds the glow bitmap for an emissive material: `rgb = emissiveTexel × emissive` as sRGB
 * bytes, `a = linear luminance of that product`.
 *
 * WHY a bitmap and not a colour: KSA's glow is WHITE × mask × 1.25 ADDED after lighting
 * (MeshIndirect.frag) — there is no emissive colour anywhere in `<PbrMaterial>`. The colour
 * therefore has to be composited into the DIFFUSE and only the intensity can be a mask, which
 * is exactly what `src/ktx/glowComposite.compositeGlow` does with this bitmap.
 */
export function buildGlowBitmap(
  emissiveLevel: ImageLevel | null,
  emissive: readonly number[],
  solidSize = 4,
): GlowBitmap {
  const width = emissiveLevel?.width ?? solidSize
  const height = emissiveLevel?.height ?? solidSize
  const rgba = new Uint8Array(width * height * 4)
  for (let i = 0; i < rgba.length; i += 4) {
    let lr = emissive[0] ?? 0
    let lg = emissive[1] ?? 0
    let lb = emissive[2] ?? 0
    if (emissiveLevel) {
      lr *= srgbByteToLinear(emissiveLevel.rgba[i]!)
      lg *= srgbByteToLinear(emissiveLevel.rgba[i + 1]!)
      lb *= srgbByteToLinear(emissiveLevel.rgba[i + 2]!)
    }
    rgba[i] = linearToSrgbByte(lr)
    rgba[i + 1] = linearToSrgbByte(lg)
    rgba[i + 2] = linearToSrgbByte(lb)
    rgba[i + 3] = Math.round(clamp01(luminance(lr, lg, lb)) * 255)
  }
  return { width, height, rgba }
}

// ── the translation ──────────────────────────────────────────────────────────

/** glTF's own default material when a primitive names none (glTF 2.0 §material). */
const GLTF_DEFAULT_METALLIC = 1
const GLTF_DEFAULT_ROUGHNESS = 1

/** An image's original bytes plus the content hash every dedup key is built from. */
interface SourceImage {
  index: number
  bytes: Uint8Array
  mime: string
  hash: string
  name?: string
}

function isWhite(factor: readonly number[]): boolean {
  return (factor[0] ?? 1) === 1 && (factor[1] ?? 1) === 1 && (factor[2] ?? 1) === 1
}

function isBlack(rgb: readonly number[]): boolean {
  return (rgb[0] ?? 0) <= 0 && (rgb[1] ?? 0) <= 0 && (rgb[2] ?? 0) <= 0
}

/** Compact, stable text for a factor, so it can go in a dedup key. */
function factorKey(values: readonly number[]): string {
  return values.map((v) => v.toFixed(4)).join(',')
}

/** `KHR_materials_emissive_strength` — a plain multiplier on emissiveFactor. */
function emissiveStrengthOf(def: GltfMaterialDef | undefined): number {
  const ext = def?.extensions?.KHR_materials_emissive_strength as
    | { emissiveStrength?: number }
    | undefined
  return ext?.emissiveStrength ?? 1
}

/**
 * Translates a plan's glTF materials into texture + material specs.
 *
 * Two groups referencing the same glTF material share ONE {@link ImportMaterialSpec}; one
 * image used for one channel with one set of baked factors yields ONE
 * {@link ImportTextureSpec} — but the SAME image used for two channels yields two, because
 * each channel is encoded differently (sRGB vs linear, the normal X-flip).
 */
export async function planImportMaterials(
  model: LoadedModel,
  plan: ImportPlan,
  opts: ImportMaterialOptions = {},
): Promise<ImportMaterialPlan> {
  const source = model.source
  const empty: ImportMaterialPlan = {
    textures: [],
    materials: [],
    materialKeyByGroup: new Map(),
    warnings: [],
  }
  // No glTF document behind the scene (a programmatically built model) ⇒ no materials to
  // translate; the meshes keep the neutral look.
  if (!source) return empty

  const builder = new MaterialPlanBuilder(source, opts)
  for (const group of plan.groups) {
    const key = await builder.materialFor(group.materialIndex, group.sourceMaterial)
    builder.plan.materialKeyByGroup.set(group.key, key)
  }
  return builder.plan
}

/** Accumulates the deduped texture/material specs while walking the plan's groups. */
class MaterialPlanBuilder {
  readonly plan: ImportMaterialPlan = {
    textures: [],
    materials: [],
    materialKeyByGroup: new Map(),
    warnings: [],
  }
  private readonly source: ModelSource
  private readonly opts: ImportMaterialOptions
  private readonly warnings = new WarningSink()
  private readonly textureKeys = new Set<string>()
  private readonly materialKeys = new Set<string>()
  private readonly images = new Map<number, Promise<SourceImage | null>>()
  private readonly levels = new Map<number, Promise<ImageLevel | null>>()

  constructor(source: ModelSource, opts: ImportMaterialOptions) {
    this.source = source
    this.opts = opts
    this.plan.warnings = this.warnings.list
  }

  // ── image access ───────────────────────────────────────────────────────────

  /** The image a texture ref points at, or null (missing, or a non-decodable basisu source). */
  private async imageFor(ref: GltfTextureRef | undefined): Promise<SourceImage | null> {
    if (!ref) return null
    const texture = this.source.json.textures?.[ref.index]
    // KHR_texture_basisu images are supercompressed; analyzeImport already warned.
    if (!texture || texture.source === undefined) return null
    const index = texture.source
    let pending = this.images.get(index)
    if (!pending) {
      pending = this.source.imageBytes(index).then((raw) =>
        raw
          ? {
              index,
              bytes: raw.bytes,
              mime: raw.mime,
              hash: hashBytes(raw.bytes),
              name: this.source.json.images?.[index]?.name,
            }
          : null,
      )
      this.images.set(index, pending)
    }
    return pending
  }

  /** The decoded base level of an image, or null (with a warning) when it can't be decoded. */
  private async levelFor(image: SourceImage, subject: string): Promise<ImageLevel | null> {
    let pending = this.levels.get(image.index)
    if (!pending) {
      pending = this.decode(image)
      this.levels.set(image.index, pending)
    }
    const level = await pending
    if (!level) {
      this.warnings.add({
        code: 'imageDecode',
        subject: image.name ?? `image ${image.index}`,
        message: `The ${subject} image could not be decoded, so its factors could not be baked into pixels.`,
        remedy: 'Re-export the model with PNG or JPEG images.',
      })
    }
    return level
  }

  private async decode(image: SourceImage): Promise<ImageLevel | null> {
    if (this.opts.decodeLevel) return this.opts.decodeLevel(image.bytes, image.mime)
    try {
      const blob = new Blob([image.bytes.slice()], { type: image.mime })
      return (await decodeImage(blob, this.opts.maxTextureSize)).levels[0]!
    } catch (err) {
      console.warn(`flexo: glTF image ${image.index} could not be decoded`, err)
      return null
    }
  }

  private encodePng(level: ImageLevel): Promise<Uint8Array> {
    return (this.opts.encodePng ?? encodeLevelToPng)(level)
  }

  // ── texture interning ──────────────────────────────────────────────────────

  /** Ships a glTF image verbatim for a channel — nothing had to be baked into it. */
  private addVerbatim(image: SourceImage, channel: TextureChannel, name: string): string {
    return this.addTexture(`${image.hash}|${channel}`, image.name ?? name, channel, {
      bytes: image.bytes,
      mime: image.mime,
    })
  }

  private addTexture(
    key: string,
    name: string,
    channel: TextureChannel,
    data: { bytes: Uint8Array; mime: string },
  ): string {
    if (!this.textureKeys.has(key)) {
      this.textureKeys.add(key)
      this.plan.textures.push({ key, name, channel, bytes: data.bytes, mime: data.mime })
    }
    return key
  }

  // ── materials ──────────────────────────────────────────────────────────────

  /** Interns the spec for one glTF material index, returning its key. */
  async materialFor(materialIndex: number | null, fallbackName: string): Promise<string> {
    const key = materialIndex === null ? 'mat:default' : `mat:${materialIndex}`
    if (this.materialKeys.has(key)) return key
    this.materialKeys.add(key)
    const def = materialIndex === null ? undefined : this.source.json.materials?.[materialIndex]
    this.plan.materials.push(await this.buildMaterial(key, def?.name || fallbackName, def))
    return key
  }

  private async buildMaterial(
    key: string,
    name: string,
    def: GltfMaterialDef | undefined,
  ): Promise<ImportMaterialSpec> {
    const pbr = def?.pbrMetallicRoughness ?? {}
    const metallicFactor = pbr.metallicFactor ?? GLTF_DEFAULT_METALLIC
    const roughnessFactor = pbr.roughnessFactor ?? GLTF_DEFAULT_ROUGHNESS
    const spec: ImportMaterialSpec = {
      key,
      name,
      metalness: metallicFactor,
      roughness: roughnessFactor,
      normalStrength: def?.normalTexture?.scale ?? 1,
    }

    // ── <Diffuse> ────────────────────────────────────────────────────────────
    const baseFactor = pbr.baseColorFactor ?? [1, 1, 1, 1]
    const baseImage = await this.imageFor(pbr.baseColorTexture)
    if (baseImage && isWhite(baseFactor)) {
      spec.baseColorTextureKey = this.addVerbatim(baseImage, 'baseColor', `${name}_basecolor`)
    } else if (baseImage) {
      // A tint has to become pixels — KSA has no per-material colour multiplier.
      const level = await this.levelFor(baseImage, 'base colour')
      if (level) {
        spec.baseColorTextureKey = this.addTexture(
          `${baseImage.hash}|baseColor|f${factorKey(baseFactor.slice(0, 3))}`,
          baseImage.name ?? `${name}_basecolor`,
          'baseColor',
          {
            bytes: await this.encodePng(bakeBaseColorFactor(level, baseFactor)),
            mime: 'image/png',
          },
        )
      } else {
        spec.baseColorTextureKey = this.addVerbatim(baseImage, 'baseColor', `${name}_basecolor`)
      }
    } else {
      // No image: the factor alone IS the base colour. Factor alpha is deliberately ignored.
      spec.baseColor = {
        r: linearToSrgbByte(baseFactor[0] ?? 1),
        g: linearToSrgbByte(baseFactor[1] ?? 1),
        b: linearToSrgbByte(baseFactor[2] ?? 1),
      }
    }

    // ── <AoRoughMetal> ───────────────────────────────────────────────────────
    const occlusionStrength = def?.occlusionTexture?.strength ?? 1
    const mrImage = await this.imageFor(pbr.metallicRoughnessTexture)
    const occImage = await this.imageFor(def?.occlusionTexture)
    const untouched = metallicFactor === 1 && roughnessFactor === 1 && occlusionStrength === 1
    if (mrImage && occImage && mrImage.index === occImage.index && untouched) {
      // Blender's "glTF Settings" ORM packing: one image already in KSA's exact layout.
      // Reuse it byte-for-byte — a smaller mod and no resample/requantize loss.
      spec.ormTextureKey = this.addVerbatim(mrImage, 'orm', `${name}_orm`)
    } else if (mrImage || occImage) {
      const mrLevel = mrImage ? await this.levelFor(mrImage, 'metallic-roughness') : null
      const occLevel = occImage ? await this.levelFor(occImage, 'occlusion') : null
      if (mrLevel || occLevel) {
        const packed = packGltfOrm({
          mrLevel,
          occLevel,
          metallicFactor,
          roughnessFactor,
          occlusionStrength,
        })
        const partKey = `${mrImage?.hash ?? '-'}+${occImage?.hash ?? '-'}`
        spec.ormTextureKey = this.addTexture(
          `${partKey}|orm|f${factorKey([metallicFactor, roughnessFactor, occlusionStrength])}`,
          `${name}_orm`,
          'orm',
          { bytes: await this.encodePng(packed), mime: 'image/png' },
        )
      }
    }
    // No maps at all ⇒ no ORM texture; the scalars above export as a solid ORM texel.

    // ── <Normal> ─────────────────────────────────────────────────────────────
    const normalImage = await this.imageFor(def?.normalTexture)
    if (normalImage) {
      // Verbatim, un-transformed: `prepareChannelImage(..., 'normal', strength)` owns KSA's
      // X-flip and the strength bake at encode time, and modExport.normalPathFor re-derives a
      // strength ≠ 1 from this same source. Pre-transforming here would apply both twice.
      spec.normalTextureKey = this.addVerbatim(normalImage, 'normal', `${name}_normal`)
    }

    // ── <Emissive> ───────────────────────────────────────────────────────────
    const strength = emissiveStrengthOf(def)
    const emissive = (def?.emissiveFactor ?? [0, 0, 0]).map((v) => v * strength)
    if (!isBlack(emissive)) {
      const emissiveImage = await this.imageFor(def?.emissiveTexture)
      const emissiveLevel = emissiveImage ? await this.levelFor(emissiveImage, 'emissive') : null
      const glow = buildGlowBitmap(emissiveLevel, emissive)
      spec.glowPng = await this.encodePng(glow)
      // The descriptor colour is the uniform equivalent of the bitmap (and the paint tool's
      // brush default if the user later retouches the glow). Its magnitude is already in the
      // bitmap's alpha, so nothing else needs carrying over.
      spec.glowColor = {
        r: linearToSrgbByte(emissive[0] ?? 0),
        g: linearToSrgbByte(emissive[1] ?? 0),
        b: linearToSrgbByte(emissive[2] ?? 0),
      }
    }

    // ── alpha ────────────────────────────────────────────────────────────────
    // MASK has no KSA equivalent at all (analyzeImport warns); BLEND becomes the opt-in
    // `<PartModelGlass>` path on the SubPart.
    if (def?.alphaMode === 'BLEND') spec.transparent = true

    return spec
  }
}
