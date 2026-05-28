import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { withProgress } from './trackedLoad'

/**
 * Loads GLB mesh atlases and extracts per-SubPart geometry by node name,
 * memoizing both the atlas GLTF and the resolved geometry. The atlas node's
 * local transform (relative to the atlas scene) is baked into the returned
 * geometry so the SubPart sits at its authored local origin.
 */
const loader = new GLTFLoader()
const atlasCache = new Map<string, Promise<GLTF>>()
const geometryCache = new Map<string, THREE.BufferGeometry>()

function loadAtlas(atlasUrl: string): Promise<GLTF> {
  let pending = atlasCache.get(atlasUrl)
  if (!pending) {
    pending = withProgress(atlasUrl, (onProgress) => loader.loadAsync(atlasUrl, onProgress))
    atlasCache.set(atlasUrl, pending)
  }
  return pending
}

/**
 * Returns a cloned, origin-baked geometry for `nodeName` inside the atlas.
 * When `nodeName` is null, the first mesh found in the atlas scene is used.
 */
export async function getSubPartGeometry(
  atlasUrl: string,
  nodeName: string | null,
): Promise<THREE.BufferGeometry> {
  const cacheKey = `${atlasUrl}#${nodeName ?? '*'}`
  const cached = geometryCache.get(cacheKey)
  if (cached) return cached

  const gltf = await loadAtlas(atlasUrl)

  let node: THREE.Object3D | undefined
  if (nodeName) {
    node = gltf.scene.getObjectByName(nodeName)
    if (!node) throw new Error(`MeshAtlasCache: node '${nodeName}' not found in ${atlasUrl}`)
  } else {
    node = gltf.scene
  }

  const mesh = findFirstMesh(node)
  if (!mesh) throw new Error(`MeshAtlasCache: no mesh under '${nodeName ?? '<scene>'}' in ${atlasUrl}`)

  const geometry = mesh.geometry.clone()
  // Bake the node's transform relative to the atlas scene so placement is faithful.
  mesh.updateWorldMatrix(true, false)
  geometry.applyMatrix4(mesh.matrixWorld)

  geometryCache.set(cacheKey, geometry)
  return geometry
}

function findFirstMesh(root: THREE.Object3D): THREE.Mesh | null {
  if ((root as THREE.Mesh).isMesh) return root as THREE.Mesh
  let found: THREE.Mesh | null = null
  root.traverse((child) => {
    if (!found && (child as THREE.Mesh).isMesh) found = child as THREE.Mesh
  })
  return found
}
