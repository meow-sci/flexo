import * as THREE from 'three'
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js'

/**
 * Owns the renderer-aware KTX2Loader used to load KSA's BCn (BC7/BC5/BC4) +
 * Zstd-supercompressed texture atlases, and probes whether the GPU can actually
 * upload those compressed formats. If not (e.g. Safari on Apple Silicon),
 * texturing degrades gracefully to the flat material — see MaterialFactory.
 *
 * The transcoder worker assets live at /basis/ (public/basis/, committed); the
 * worker also runs the Zstd decoder, so it is required even though these files
 * are not Basis Universal.
 */
let loader: KTX2Loader | null = null
let bcSupported = false

/** Initialize once, after the WebGLRenderer exists. Idempotent. */
export function initTextureSupport(renderer: THREE.WebGLRenderer): void {
  if (loader) return
  loader = new KTX2Loader().setTranscoderPath('/basis/').detectSupport(renderer)

  const gl = renderer.getContext()
  bcSupported =
    !!gl.getExtension('EXT_texture_compression_bptc') &&
    !!gl.getExtension('EXT_texture_compression_rgtc')

  if (!bcSupported) {
    console.warn(
      'flexo: BC7/BC5 texture compression unavailable in this browser/GPU — ' +
        'SubParts will render untextured. Use Chrome, or add an offline conversion ' +
        'step (see plans/FLEXO_TEXTURING.md Appendix).',
    )
  }
}

export function getKtx2Loader(): KTX2Loader {
  if (!loader) throw new Error('textureSupport: call initTextureSupport(renderer) first')
  return loader
}

export function isTextureSupported(): boolean {
  return bcSupported
}
