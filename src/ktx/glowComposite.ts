/**
 * Pure helpers shared by the emissive (glow) editor preview AND the exporter, so what the user
 * tunes is what ships. KSA's glow is WHITE × mask × 1.25 ADDED after lighting
 * (MeshIndirect.frag:276-287) — there is no colored emission on that path at all — so the glow
 * COLOR must be baked into the DIFFUSE at the glowing texels while a grayscale mask carries
 * WHERE/how much. This module turns a "glow bitmap" (rgb = color, a = the GREYSCALE KEY) plus
 * {@link GlowComposite} settings into exactly those two textures:
 *
 *   key        = glow.a[i] / 255                              // the greyscale map
 *   color      = ramp ? sampleGlowRamp(ramp, key) : glow.rgb  // the LUT, evaluated on the CPU
 *   diffuse[i] = lerp(base[i], color, key * coverage)  → <Diffuse>  / map         (sRGB)
 *   mask[i]    = key * strength (broadcast to RGB)     → <Emissive> / emissiveMap (LINEAR, KSA reads R)
 *
 * `coverage` and `strength` are INDEPENDENT on purpose: the key alone used to drive both, which
 * made "saturated color + gentle white core" — the only setting that reads colored in-game —
 * unauthorable. See analysis/KSA_EMISSIVE_AND_LUT.md §6.
 *
 * `base` is the decoded primary diffuse, or {@link neutralBase} when the mesh has no texture
 * (e.g. a glow-only primitive, or any part-ified kitten submesh — KSA `.ktx2` can't be CPU-decoded).
 */
import type { EmissiveConfig } from '../ksa/types';
import type { ImageLevel } from './decodeImage';
import { sampleGlowRamp } from './glowRamp';

/** A glow bitmap: rgb = glow color, a = the greyscale key (all 0..255). */
export interface GlowBitmap {
  width: number;
  height: number;
  /** Tightly packed RGBA8, length = width*height*4. */
  rgba: Uint8Array;
}

/**
 * How {@link compositeGlow} interprets a bitmap's greyscale key — the subset of
 * {@link EmissiveConfig} that affects pixels (`shape` picks the bitmap, not the math).
 */
export type GlowComposite = Pick<EmissiveConfig, 'coverage' | 'strength' | 'ramp'>;

/** The composite settings of an emissive config. */
export function glowCompositeOf(e: EmissiveConfig): GlowComposite {
  return { coverage: e.coverage, strength: e.strength, ramp: e.ramp };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function lerp8(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

/**
 * A tiny solid glow bitmap for the 'whole' glow shape: one color at a FULL key everywhere.
 *
 * The key is 255 rather than the config's strength because coverage/strength are applied by
 * {@link compositeGlow} — "the whole mesh glows" means every texel is fully keyed, and how much
 * color and how much white that becomes is the caller's two sliders.
 */
export function solidGlowBitmap(color: { r: number; g: number; b: number }, size = 4): GlowBitmap {
  const rgba = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    rgba[i * 4] = color.r;
    rgba[i * 4 + 1] = color.g;
    rgba[i * 4 + 2] = color.b;
    rgba[i * 4 + 3] = 255;
  }
  return { width: size, height: size, rgba };
}

/**
 * The dimensions a synthesised base must have to preserve a glow's detail.
 *
 * {@link compositeGlow} outputs at the BASE's resolution, so compositing a 2048² painted or
 * imported glow over a 4×4 solid would collapse the whole diffuse to 4×4. A uniform base has
 * no intrinsic resolution, so it is simply generated at the glow's — same colour, no loss.
 */
export function baseSizeFor(glow: { width: number; height: number } | null | undefined): {
  width: number;
  height: number;
} {
  return { width: Math.max(4, glow?.width ?? 4), height: Math.max(4, glow?.height ?? 4) };
}

/** A neutral mid-gray opaque base (for a glow on a mesh with no decodable diffuse). */
export function neutralBase(width = 4, height = 4, value = 128): ImageLevel {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = value;
    rgba[i * 4 + 1] = value;
    rgba[i * 4 + 2] = value;
    rgba[i * 4 + 3] = 255;
  }
  return { width, height, rgba };
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
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = color.r;
    rgba[i * 4 + 1] = color.g;
    rgba[i * 4 + 2] = color.b;
    rgba[i * 4 + 3] = 255;
  }
  return { width, height, rgba };
}

/**
 * Composites a glow bitmap onto a base diffuse, producing the diffuse + emissive-mask pair KSA
 * needs. The glow is nearest-resampled to the base's dimensions (so a painted spot lands at the
 * right UV relative to the diffuse). Output dimensions = base dimensions; both RGBA8.
 *
 *  - key 0 → diffuse == base and mask == 0 (no glow at all there).
 *  - key 1 → diffuse == the glow color blended by `coverage`; mask == `strength`.
 *
 * With a `ramp`, the key indexes the ramp instead of using the bitmap's own rgb — the greyscale
 * falloff of a painted spot then runs THROUGH the gradient (dark rim → hot core) instead of
 * fading one flat color out, which is the "cleaner fading" a LUT buys you.
 */
export function compositeGlow(
  base: ImageLevel,
  glow: GlowBitmap,
  settings: GlowComposite,
): { diffuse: ImageLevel; mask: ImageLevel } {
  const { width, height } = base;
  const coverage = clamp01(settings.coverage);
  const strength = clamp01(settings.strength);
  const ramp = settings.ramp;
  const diffuse = new Uint8Array(width * height * 4);
  const mask = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const gy =
      glow.height === height
        ? y
        : Math.min(glow.height - 1, Math.floor((y * glow.height) / height));
    for (let x = 0; x < width; x++) {
      const gx =
        glow.width === width ? x : Math.min(glow.width - 1, Math.floor((x * glow.width) / width));
      const bi = (y * width + x) * 4;
      const gi = (gy * glow.width + gx) * 4;
      const key = glow.rgba[gi + 3] / 255;
      const color = ramp
        ? sampleGlowRamp(ramp, key)
        : { r: glow.rgba[gi], g: glow.rgba[gi + 1], b: glow.rgba[gi + 2] };
      const t = key * coverage;
      diffuse[bi] = lerp8(base.rgba[bi], color.r, t);
      diffuse[bi + 1] = lerp8(base.rgba[bi + 1], color.g, t);
      diffuse[bi + 2] = lerp8(base.rgba[bi + 2], color.b, t);
      diffuse[bi + 3] = 255;
      const m = Math.round(key * strength * 255);
      mask[bi] = m;
      mask[bi + 1] = m;
      mask[bi + 2] = m;
      mask[bi + 3] = 255;
    }
  }
  return { diffuse: { width, height, rgba: diffuse }, mask: { width, height, rgba: mask } };
}
