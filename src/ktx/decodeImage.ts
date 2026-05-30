/**
 * Decodes a user-supplied image (PNG/JPG/WebP Blob, from a file picker, drag-drop
 * or clipboard paste) into raw RGBA8 pixels plus a generated mip chain, ready for
 * {@link ../ktx/encodeKtx2}. Pure browser APIs (createImageBitmap + canvas) — no
 * dependencies, runs entirely client-side.
 *
 * The base level is optionally downscaled so the longest edge is ≤ maxSize, both
 * to respect the ~6 MP WebAssembly/browser decode ceiling and to keep custom
 * texture sizes sane. Mips are produced by a simple 2×2 box filter (in sRGB space
 * — adequate for v1; offline KSA atlases are mipped by their authoring tool).
 */

export interface ImageLevel {
  width: number
  height: number
  /** Tightly packed RGBA8, length = width * height * 4. */
  rgba: Uint8Array
}

export interface DecodedImage {
  /** Base level dimensions (after any max-size downscale). */
  width: number
  height: number
  /** Full mip chain, level 0 = base, last = 1×1. */
  levels: ImageLevel[]
}

export const DEFAULT_MAX_TEXTURE_SIZE = 2048

/** Decodes a Blob to RGBA8 + mip chain. Throws on undecodable input. */
export async function decodeImage(
  source: Blob,
  maxSize = DEFAULT_MAX_TEXTURE_SIZE,
): Promise<DecodedImage> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(source)
  } catch (err) {
    throw new Error(`decodeImage: could not decode image (${source.type || 'unknown type'})`, {
      cause: err,
    })
  }
  try {
    const base = drawToRgba(bitmap, maxSize)
    const levels = buildMipChain(base)
    return { width: base.width, height: base.height, levels }
  } finally {
    bitmap.close()
  }
}

/** Draws a bitmap to a canvas (downscaled to fit maxSize) and reads back RGBA8. */
function drawToRgba(bitmap: ImageBitmap, maxSize: number): ImageLevel {
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = makeCanvas(width, height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null
  if (!ctx) throw new Error('decodeImage: 2D canvas context unavailable')
  ctx.drawImage(bitmap, 0, 0, width, height)
  const { data } = ctx.getImageData(0, 0, width, height)
  return { width, height, rgba: new Uint8Array(data.buffer.slice(0)) }
}

/** Generates the full mip chain (incl. base) down to 1×1 via 2×2 box filtering. */
export function buildMipChain(base: ImageLevel): ImageLevel[] {
  const levels: ImageLevel[] = [base]
  let cur = base
  while (cur.width > 1 || cur.height > 1) {
    cur = downsampleHalf(cur)
    levels.push(cur)
  }
  return levels
}

/** Halves dimensions (min 1) averaging each 2×2 source block per RGBA channel. */
function downsampleHalf(src: ImageLevel): ImageLevel {
  const dw = Math.max(1, src.width >> 1)
  const dh = Math.max(1, src.height >> 1)
  const out = new Uint8Array(dw * dh * 4)
  for (let y = 0; y < dh; y++) {
    const sy0 = Math.min(src.height - 1, y * 2)
    const sy1 = Math.min(src.height - 1, y * 2 + 1)
    for (let x = 0; x < dw; x++) {
      const sx0 = Math.min(src.width - 1, x * 2)
      const sx1 = Math.min(src.width - 1, x * 2 + 1)
      const i00 = (sy0 * src.width + sx0) * 4
      const i01 = (sy0 * src.width + sx1) * 4
      const i10 = (sy1 * src.width + sx0) * 4
      const i11 = (sy1 * src.width + sx1) * 4
      const o = (y * dw + x) * 4
      for (let c = 0; c < 4; c++) {
        out[o + c] = (src.rgba[i00 + c] + src.rgba[i01 + c] + src.rgba[i10 + c] + src.rgba[i11 + c] + 2) >> 2
      }
    }
  }
  return { width: dw, height: dh, rgba: out }
}

/** OffscreenCanvas when available (also works off the main thread), else a DOM canvas. */
function makeCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}
