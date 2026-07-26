/**
 * KSA color (RGB floats 0–1, the `<Color R G B/>` shape) ⇄ the "#rrggbb" hex string
 * the native `<input type="color">` speaks. Shared by every light color row (the
 * SubPart-Data LightsSection and the TransformInspector's LightHeader) — a separate
 * module because component files must only export components (fast refresh).
 */

/** A light's RGB (each 0–1) as a "#rrggbb" hex string for the native color picker. */
export function rgb01ToHex({ r, g, b }: { r: number; g: number; b: number }): string {
  const h = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

/** Inverse of {@link rgb01ToHex}: "#rrggbb" → RGB floats in 0–1. */
export function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const n = Number.parseInt(hex.slice(1), 16)
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 }
}
