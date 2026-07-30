import * as THREE from 'three'
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js'
import { assetBase } from '../assetBase'

/**
 * Owns the renderer-aware KTX2Loader used to load KSA's texture atlases, and
 * probes whether the GPU can upload *raw* BCn (BC7/BC5/BC4) blocks directly.
 *
 * SubPart atlases are shipped as UASTC (Basis Universal) — KTX2Loader transcodes
 * those at runtime to BC7 / ASTC / ETC2 per device, with an uncompressed RGBA8
 * fallback, so they render on every GPU/browser regardless of this probe. The
 * probe (`isBcnSupported`) now only gates the kitten `Characters/` atlases, which
 * are still raw BCn (they can be bundled verbatim into exported KSA mods, where
 * the game requires real BC7). On a GPU without BPTC/RGTC those degrade to the
 * flat material — see kittenBake.
 *
 * The transcoder worker assets live at /basis/ (public/basis/, committed); the
 * worker also runs the Zstd decoder + the Basis (UASTC) transcoder.
 */
let loader: KTX2Loader | null = null
let bcSupported = false
let maxAnisotropy = 1

/** Initialize once, after the WebGLRenderer exists. Idempotent. */
export function initTextureSupport(renderer: THREE.WebGLRenderer): void {
  if (loader) return
  loader = new KTX2Loader().setTranscoderPath(`${assetBase()}basis/`).detectSupport(renderer)

  maxAnisotropy = renderer.capabilities.getMaxAnisotropy()

  const gl = renderer.getContext()
  bcSupported =
    !!gl.getExtension('EXT_texture_compression_bptc') &&
    !!gl.getExtension('EXT_texture_compression_rgtc')

  if (!bcSupported) {
    // SubParts are UASTC and transcode fine here; only the raw-BCn kitten
    // (Characters/) atlases are affected, so keep this informational.
    console.info(
      'flexo: raw BC7/BC5 texture compression unavailable in this browser/GPU — ' +
        'SubParts still render (UASTC transcodes); only kitten character textures ' +
        'fall back to flat. (Desktop Chrome exposes BPTC/RGTC.)',
    )
  }
}

export function getKtx2Loader(): KTX2Loader {
  if (!loader) throw new Error('textureSupport: call initTextureSupport(renderer) first')
  return loader
}

/**
 * True when the GPU can upload *raw* BCn (BC7/BC5/BC4) blocks directly. Only the
 * kitten `Characters/` atlases still need this; UASTC SubPart atlases do not.
 */
export function isBcnSupported(): boolean {
  return bcSupported
}

/**
 * Max anisotropic-filtering level the GPU supports (typically 16). Applied to
 * every loaded texture so the full-resolution level-0 mip stays sharp at grazing
 * angles instead of falling back to a blurrier lower mip. 1 until init runs.
 */
export function getMaxAnisotropy(): number {
  return maxAnisotropy
}
