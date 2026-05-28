import * as THREE from 'three'
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js'
import { withProgress } from './trackedLoad'

const loader = new RGBELoader()
const cache = new Map<string, Promise<THREE.DataTexture>>()

/**
 * Loads an equirectangular .hdr as a (cached) DataTexture for use as a scene
 * background and PMREM input. The CPU-side texture data is shared across all
 * viewports; each renderer still uploads/PMREMs its own GPU copy, which is safe.
 */
export function loadEquirectHDR(url: string): Promise<THREE.DataTexture> {
  let pending = cache.get(url)
  if (!pending) {
    pending = withProgress(url, (onProgress) => loader.loadAsync(url, onProgress)).then((texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping
      return texture
    })
    pending.catch(() => cache.delete(url)) // allow a retry after a failed load
    cache.set(url, pending)
  }
  return pending
}
