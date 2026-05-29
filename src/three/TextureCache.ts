import * as THREE from 'three'
import { getKtx2Loader, getMaxAnisotropy } from './textureSupport'
import { withProgress } from './trackedLoad'

/**
 * Loads and caches KSA texture atlases (one per URL, shared across every SubPart
 * of a category). Tags color space correctly: diffuse = sRGB, everything else
 * (normal / AO-rough-metal / emissive) = linear.
 *
 * Cached textures are owned for the app lifetime — never dispose them from a
 * per-instance SubPartObject.
 */
type TexKind = 'srgb' | 'linear'

const cache = new Map<string, Promise<THREE.Texture>>()

export function loadTexture(url: string, kind: TexKind): Promise<THREE.Texture> {
  const key = `${url}|${kind}`
  let pending = cache.get(key)
  if (!pending) {
    pending = withProgress(url, (onProgress) => getKtx2Loader().loadAsync(url, onProgress)).then(
      (tex) => {
        tex.colorSpace = kind === 'srgb' ? THREE.SRGBColorSpace : THREE.NoColorSpace
        // KSA samples Vulkan-style (top-left origin); KTX2Loader leaves flipY=false
        // (compressed textures can't be CPU-flipped). GLB UVs are authored to match.
        tex.anisotropy = getMaxAnisotropy()
        tex.needsUpdate = true
        return tex
      },
    )
    cache.set(key, pending)
  }
  return pending
}
