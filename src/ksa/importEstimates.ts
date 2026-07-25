import type { ImportWarning, ImportWarningCode } from './importPlan'

/**
 * The numbers and labels the import dialog puts in front of the user before anything touches
 * the document: what the model will COST in-game, and how to read its warnings. Pure and
 * dependency-free (no three, no DOM) so every claim here is unit-tested.
 *
 * THE VRAM NUMBER IS THE POINT. flexo writes uncompressed RGBA8 + Zstd KTX2 (see
 * docs/custom-assets.md — there is no turnkey in-browser BC7 encoder), so a texture costs
 * `w · h · 4` bytes of VRAM plus a third again for its mip chain, EVERY time it is resident.
 * A 4096² map is ~85 MB. Nothing else in flexo can blow a GPU budget that fast, and the only
 * lever the user has is the max-size cap — so the estimate is shown live beside it.
 */

/** A full mip chain adds 1/4 + 1/16 + … ≈ 1/3 on top of the base level. */
export const MIP_OVERHEAD = 4 / 3

/** Bytes per texel of an uncompressed RGBA8 KTX2 level (the format flexo writes). */
export const BYTES_PER_TEXEL = 4

/**
 * Rough Zstd ratio for RGBA8 texture payloads, used ONLY for the "estimated mod size" line.
 * Photographic maps land around 0.5–0.7 of the raw bytes; flat/painted ones far better. It is
 * labelled an estimate in the UI for exactly this reason — VRAM (above) is the exact number.
 */
export const ZSTD_RATIO_ESTIMATE = 0.6

/**
 * Interleaved bytes per exported vertex: POSITION (3×f32) + NORMAL (3×f32) + TEXCOORD_0
 * (2×f32) — the only attributes KSA reads (decomp/KSA/MeshReference.cs:83).
 */
export const GLB_BYTES_PER_VERTEX = 32

/** Bytes per exported triangle: 3 × uint32 indices. */
export const GLB_BYTES_PER_TRIANGLE = 12

export interface ImageSize {
  width: number
  height: number
}

/**
 * Intrinsic pixel size read straight out of an encoded image's header — PNG, JPEG, GIF and
 * WebP, i.e. everything a glTF may legally embed. Header-only on purpose: the dialog costs
 * every texture of a model live while the user changes the cap, and decoding megapixels
 * through a canvas for a number we are about to divide down would be absurd.
 *
 * Returns null for anything unrecognised or truncated; callers treat that as "assume the cap"
 * so an unknown image never silently reads as free.
 */
export function imageSizeOf(bytes: Uint8Array): ImageSize | null {
  return pngSize(bytes) ?? jpegSize(bytes) ?? gifSize(bytes) ?? webpSize(bytes)
}

function u16be(b: Uint8Array, i: number): number {
  return (b[i]! << 8) | b[i + 1]!
}

function u32be(b: Uint8Array, i: number): number {
  return ((b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!) >>> 0
}

function u16le(b: Uint8Array, i: number): number {
  return b[i]! | (b[i + 1]! << 8)
}

function ascii(b: Uint8Array, i: number, length: number): string {
  return String.fromCharCode(...b.subarray(i, i + length))
}

/** PNG: 8-byte signature, then the IHDR chunk whose payload starts at byte 16. */
function pngSize(b: Uint8Array): ImageSize | null {
  if (b.length < 24 || b[0] !== 0x89 || ascii(b, 1, 3) !== 'PNG') return null
  return { width: u32be(b, 16), height: u32be(b, 20) }
}

/** JPEG: walk the marker segments to the first SOFn (0xC0–0xCF, excluding DHT/DAC/RSTn). */
function jpegSize(b: Uint8Array): ImageSize | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null
  let i = 2
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++ // resync past padding bytes
      continue
    }
    const marker = b[i + 1]!
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2
      continue
    }
    const length = u16be(b, i + 2)
    if (length < 2) return null
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xcc
    if (isSof) return { height: u16be(b, i + 5), width: u16be(b, i + 7) }
    i += 2 + length
  }
  return null
}

/** GIF: "GIF87a"/"GIF89a" then the logical screen descriptor (little-endian). */
function gifSize(b: Uint8Array): ImageSize | null {
  if (b.length < 10 || ascii(b, 0, 3) !== 'GIF') return null
  return { width: u16le(b, 6), height: u16le(b, 8) }
}

/** WebP: RIFF container, then VP8 (lossy), VP8L (lossless) or VP8X (extended). */
function webpSize(b: Uint8Array): ImageSize | null {
  if (b.length < 30 || ascii(b, 0, 4) !== 'RIFF' || ascii(b, 8, 4) !== 'WEBP') return null
  const chunk = ascii(b, 12, 4)
  if (chunk === 'VP8 ') return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff }
  if (chunk === 'VP8L') {
    // 14 bits of (width-1) then 14 bits of (height-1), little-endian bit order after the
    // 0x2f signature byte at 20.
    const raw = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24)
    return { width: (raw & 0x3fff) + 1, height: ((raw >>> 14) & 0x3fff) + 1 }
  }
  if (chunk === 'VP8X') {
    const w = b[24]! | (b[25]! << 8) | (b[26]! << 16)
    const h = b[27]! | (b[28]! << 8) | (b[29]! << 16)
    return { width: w + 1, height: h + 1 }
  }
  return null
}

/**
 * The size an image will actually be stored at: `decodeImage` downscales so the LONGEST edge
 * is ≤ the cap, preserving aspect (src/ktx/decodeImage.ts `drawToRgba`). A null/unknown size
 * costs a full cap-square, which is the pessimistic (and honest) assumption.
 */
export function cappedSize(size: ImageSize | null, maxSize: number): ImageSize {
  if (!size || size.width <= 0 || size.height <= 0) return { width: maxSize, height: maxSize }
  const scale = Math.min(1, maxSize / Math.max(size.width, size.height))
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  }
}

/** Resident VRAM for one texture, mip chain included. */
export function textureVramBytes(size: ImageSize): number {
  return Math.round(size.width * size.height * BYTES_PER_TEXEL * MIP_OVERHEAD)
}

/** Uncompressed size of the geometry a set of meshes contributes to the mod's mesh atlas. */
export function geometryBytes(vertices: number, triangles: number): number {
  return vertices * GLB_BYTES_PER_VERTEX + triangles * GLB_BYTES_PER_TRIANGLE
}

export interface ImportCostInput {
  /** Intrinsic size per texture the import will create; null where it couldn't be read. */
  textureSizes: (ImageSize | null)[]
  maxTextureSize: number
  /** Totals AFTER any merge, i.e. what actually ships (see `plannedTotals`). */
  triangles: number
  vertices: number
  subParts: number
  /**
   * Per-SubPart `<MeshView>` triangle budget, or undefined when decimation is off. Decimation
   * rewrites the INDEX buffer over the same vertex arrays, so only triangles shrink.
   */
  viewMeshBudget?: number
}

export interface ImportCost {
  textureCount: number
  /** Sum of resident texture VRAM in-game, in bytes — the number that matters most. */
  vramBytes: number
  /** Rough on-disk size of the mod's new binaries (atlas GLB + .ktx2 files), in bytes. */
  modBytes: number
  /** The capped size of each texture, in input order (for a per-texture breakdown). */
  sizes: ImageSize[]
}

/**
 * Costs an import: VRAM (exact, given the cap) and mod size (estimated). The `_VM` picking
 * meshes are counted too — they are real bytes in the shipped atlas, capped by the view-mesh
 * budget when decimation is on.
 */
export function estimateImportCost(input: ImportCostInput): ImportCost {
  const sizes = input.textureSizes.map((s) => cappedSize(s, input.maxTextureSize))
  const vramBytes = sizes.reduce((n, s) => n + textureVramBytes(s), 0)
  const viewTriangles =
    input.viewMeshBudget == null
      ? input.triangles
      : Math.min(input.triangles, input.viewMeshBudget * Math.max(1, input.subParts))
  const modBytes = Math.round(
    geometryBytes(input.vertices, input.triangles) +
      geometryBytes(input.vertices, viewTriangles) +
      vramBytes * ZSTD_RATIO_ESTIMATE,
  )
  return { textureCount: sizes.length, vramBytes, modBytes, sizes }
}

/** Human byte size, 1 decimal past KB ("12.3 MB"). Binary units, as GPUs and files are sized. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}

// ── warnings ─────────────────────────────────────────────────────────────────

/**
 * How loudly to say it. 'error' = the model will be visibly wrong or unusable in-game unless
 * the user acts; 'warning' = something was silently dropped or is a real in-game cost;
 * 'info' = flexo already handled it and is only telling you what it did.
 */
export type WarningSeverity = 'error' | 'warning' | 'info'

const SEVERITY: Readonly<Record<ImportWarningCode, WarningSeverity>> = {
  // Nothing to import, or a texture path that cannot produce pixels at all.
  noMeshes: 'error',
  noUv: 'error',
  basisuImage: 'error',
  imageDecode: 'error',
  alphaMask: 'error',
  mergeFailed: 'error',
  // Data was dropped, or the result costs something real in-game.
  doubleSided: 'warning',
  alphaBlend: 'warning',
  vertexColors: 'warning',
  morphTargets: 'warning',
  animations: 'warning',
  heavyMesh: 'warning',
  materialExtension: 'warning',
  samplerWrap: 'warning',
  textureTransform: 'warning',
  textureUv1: 'warning',
  uv1: 'warning',
  // Handled automatically; shown so the result is never a surprise.
  multiMaterial: 'info',
  noNormals: 'info',
  skinned: 'info',
  mirrored: 'info',
}

export function warningSeverity(code: ImportWarningCode): WarningSeverity {
  return SEVERITY[code] ?? 'warning'
}

/** One subject (an object, material or the file) and everything the importer said about it. */
export interface WarningGroup {
  subject: string
  /** The loudest severity in {@link items} — what the group's heading is styled as. */
  severity: WarningSeverity
  items: ImportWarning[]
}

const SEVERITY_RANK: Record<WarningSeverity, number> = { error: 0, warning: 1, info: 2 }

/**
 * Groups warnings by subject so a single problem object reads as one block instead of five
 * scattered lines, and sorts the blocks loudest-first. Subjects that name a channel
 * ("Paint:normal") group under their object, since that IS the thing the user has to fix.
 * Within a group and within a severity, the original (analysis) order is preserved.
 */
export function groupWarnings(warnings: readonly ImportWarning[]): WarningGroup[] {
  const groups = new Map<string, WarningGroup>()
  for (const warning of warnings) {
    const subject = warning.subject.split(':')[0] || warning.subject
    const severity = warningSeverity(warning.code)
    const existing = groups.get(subject)
    if (existing) {
      existing.items.push(warning)
      if (SEVERITY_RANK[severity] < SEVERITY_RANK[existing.severity]) existing.severity = severity
    } else {
      groups.set(subject, { subject, severity, items: [warning] })
    }
  }
  return [...groups.values()].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
}

/**
 * A typed scale factor, or 1 while the field is mid-edit ("", "0", "1.", "-"). The import
 * multiplies every vertex and placement by this, so it must never be NaN, zero or negative:
 * a zero scale collapses the model to a point and a negative one mirrors it.
 */
export function parseScale(text: string): number {
  const value = Number.parseFloat(text)
  return Number.isFinite(value) && value > 0 ? value : 1
}

/** Unit-scale presets for models authored in something other than metres. */
export interface ScalePreset {
  label: string
  value: number
  /** What the preset means, for the button's tooltip. */
  hint: string
}

export const SCALE_PRESETS: readonly ScalePreset[] = [
  { label: '×0.01', value: 0.01, hint: 'Authored in centimetres' },
  { label: '×0.0254', value: 0.0254, hint: 'Authored in inches' },
  { label: '×1', value: 1, hint: 'Authored in metres (KSA units)' },
]
