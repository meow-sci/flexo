import * as THREE from 'three'
import type { TextureWrap } from '../ksa/types'
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

const WRAP_TO_GL: Record<TextureWrap, THREE.Wrapping> = {
  repeat: THREE.RepeatWrapping,
  mirror: THREE.MirroredRepeatWrapping,
  clamp: THREE.ClampToEdgeWrapping,
}

const wrapCache = new Map<string, Promise<THREE.Texture>>()

/**
 * Like {@link loadTexture} but returns a variant with the given UV wrap mode set,
 * so baked UVs outside 0–1 tile / mirror / clamp instead of stretching the edge.
 *
 * 'clamp' is three's default, so it returns the shared base texture untouched.
 * 'repeat' / 'mirror' return a cached clone with wrapS/wrapT set — the clone shares
 * the decoded source bytes, and three.js keys its GPU upload by wrap mode, so each
 * variant is a cheap distinct sampler over the same image (no re-decode).
 */
export function loadWrappedTexture(
  url: string,
  kind: TexKind,
  wrap: TextureWrap,
): Promise<THREE.Texture> {
  if (wrap === 'clamp') return loadTexture(url, kind)
  const key = `${url}|${kind}|${wrap}`
  let pending = wrapCache.get(key)
  if (!pending) {
    pending = loadTexture(url, kind).then((base) => {
      const tex = base.clone()
      tex.wrapS = tex.wrapT = WRAP_TO_GL[wrap]
      tex.needsUpdate = true
      return tex
    })
    wrapCache.set(key, pending)
  }
  return pending
}
