/**
 * Pure helpers shared by the emissive (glow) editor preview AND the exporter, so what the user
 * tunes is what ships. KSA's glow is WHITE × mask × 1.25 ADDED after lighting (MeshIndirect.frag),
 * so the glow COLOR cannot come from a uniform — it must be baked into the DIFFUSE at the glowing
 * texels, with a grayscale mask controlling WHERE/how much. This module turns a "glow bitmap"
 * (rgb = color, a = intensity) into exactly those two textures:
 *
 *   diffuse[i] = lerp(base[i], glow.rgb[i], glow.a[i])     → <Diffuse> / map        (sRGB)
 *   mask[i]    = glow.a[i]  (broadcast to RGB; KSA reads R) → <Emissive> / emissiveMap (LINEAR)
 *
 * `base` is the decoded primary diffuse, or {@link neutralBase} when the mesh has no texture
 * (e.g. a glow-only primitive, or any part-ified kitten submesh — KSA `.ktx2` can't be CPU-decoded).
 */
import type { ImageLevel } from './decodeImage'

/** A glow bitmap: rgb = glow color, a = glow intensity/mask (all 0..255). */
export interface GlowBitmap {
  width: number
  height: number
  /** Tightly packed RGBA8, length = width*height*4. */
  rgba: Uint8Array
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

function lerp8(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t)
}

/** A tiny solid glow bitmap from a color (0..255) + strength (0..1) — for the 'whole' glow shape. */
export function solidGlowBitmap(
  color: { r: number; g: number; b: number },
  strength: number,
  size = 4,
): GlowBitmap {
  const a = Math.round(clamp01(strength) * 255)
  const rgba = new Uint8Array(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    rgba[i * 4] = color.r
    rgba[i * 4 + 1] = color.g
    rgba[i * 4 + 2] = color.b
    rgba[i * 4 + 3] = a
  }
  return { width: size, height: size, rgba }
}

/**
 * The dimensions a synthesised base must have to preserve a glow's detail.
 *
 * {@link compositeGlow} outputs at the BASE's resolution, so compositing a 2048² painted or
 * imported glow over a 4×4 solid would collapse the whole diffuse to 4×4. A uniform base has
 * no intrinsic resolution, so it is simply generated at the glow's — same colour, no loss.
 */
export function baseSizeFor(glow: { width: number; height: number } | null | undefined): {
  width: number
  height: number
} {
  return { width: Math.max(4, glow?.width ?? 4), height: Math.max(4, glow?.height ?? 4) }
}

/** A neutral mid-gray opaque base (for a glow on a mesh with no decodable diffuse). */
export function neutralBase(width = 4, height = 4, value = 128): ImageLevel {
  const rgba = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = value
    rgba[i * 4 + 1] = value
    rgba[i * 4 + 2] = value
    rgba[i * 4 + 3] = 255
  }
  return { width, height, rgba }
}

/**
 * A solid opaque base of the given sRGB color (a material's picked base color). Defaults to
 * 4×4; pass {@link baseSizeFor}'s dimensions when a glow will be composited over it.
 */
export function solidBase(
  color: { r: number; g: number; b: number },
  width = 4,
  height = width,
): ImageLevel {
  const rgba = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = color.r
    rgba[i * 4 + 1] = color.g
    rgba[i * 4 + 2] = color.b
    rgba[i * 4 + 3] = 255
  }
  return { width, height, rgba }
}

/**
 * Composites a glow bitmap onto a base diffuse, producing the diffuse + emissive-mask pair KSA
 * needs. The glow is nearest-resampled to the base's dimensions (so a painted spot lands at the
 * right UV relative to the diffuse). Output dimensions = base dimensions; both RGBA8.
 *
 *  - `mask=0`  → diffuse == base (no glow there).
 *  - `mask=255`→ diffuse == glow.rgb (full glow color; in-game the white emissive washes it bright).
 */
export function compositeGlow(
  base: ImageLevel,
  glow: GlowBitmap,
): { diffuse: ImageLevel; mask: ImageLevel } {
  const { width, height } = base
  const diffuse = new Uint8Array(width * height * 4)
  const mask = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    const gy =
      glow.height === height ? y : Math.min(glow.height - 1, Math.floor((y * glow.height) / height))
    for (let x = 0; x < width; x++) {
      const gx =
        glow.width === width ? x : Math.min(glow.width - 1, Math.floor((x * glow.width) / width))
      const bi = (y * width + x) * 4
      const gi = (gy * glow.width + gx) * 4
      const t = glow.rgba[gi + 3] / 255
      diffuse[bi] = lerp8(base.rgba[bi], glow.rgba[gi], t)
      diffuse[bi + 1] = lerp8(base.rgba[bi + 1], glow.rgba[gi + 1], t)
      diffuse[bi + 2] = lerp8(base.rgba[bi + 2], glow.rgba[gi + 2], t)
      diffuse[bi + 3] = 255
      const m = glow.rgba[gi + 3]
      mask[bi] = m
      mask[bi + 1] = m
      mask[bi + 2] = m
      mask[bi + 3] = 255
    }
  }
  return { diffuse: { width, height, rgba: diffuse }, mask: { width, height, rgba: mask } }
}
