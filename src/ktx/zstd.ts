import { init, compress } from '@bokuweb/zstd-wasm'

/**
 * Lazy wrapper around @bokuweb/zstd-wasm's Zstandard compressor, used to apply
 * KTX2 supercompressionScheme = 2 (Zstd) to each mip level — matching the Zstd
 * supercompression KSA's own .ktx2 atlases use. The WASM module is initialised
 * once on first use; callers just `await compressZstd(bytes)`.
 *
 * Only compression lives here; KTX2 *decompression* at load time is handled by
 * three's KTX2Loader worker (see textureSupport.ts), which bundles its own Zstd
 * decoder.
 */

let ready: Promise<void> | null = null

function ensureInit(): Promise<void> {
  if (!ready) ready = init()
  return ready
}

/** Default Zstd level — a balance of ratio vs. in-browser speed for textures. */
export const DEFAULT_ZSTD_LEVEL = 10

export async function compressZstd(data: Uint8Array, level = DEFAULT_ZSTD_LEVEL): Promise<Uint8Array> {
  await ensureInit()
  const out = compress(data, level)
  return out instanceof Uint8Array ? out : new Uint8Array(out)
}
