import * as THREE from 'three';
import { computeMikkTSpaceTangents } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import * as MikkTSpace from 'three/addons/libs/mikktspace.module.js';
import { withProgress } from './trackedLoad';

/**
 * Loads GLB mesh atlases and extracts per-SubPart geometry by node name,
 * memoizing both the atlas GLTF and the resolved geometry. The atlas node's
 * local transform (relative to the atlas scene) is baked into the returned
 * geometry so the SubPart sits at its authored local origin.
 */
const loader = new GLTFLoader();
const atlasCache = new Map<string, Promise<GLTF>>();
const geometryCache = new Map<string, THREE.BufferGeometry>();

function loadAtlas(atlasUrl: string): Promise<GLTF> {
  let pending = atlasCache.get(atlasUrl);
  if (!pending) {
    pending = withProgress(atlasUrl, (onProgress) => loader.loadAsync(atlasUrl, onProgress));
    atlasCache.set(atlasUrl, pending);
  }
  return pending;
}

/**
 * Returns a cloned, origin-baked geometry for `nodeName` inside the atlas.
 * When `nodeName` is null, the first mesh found in the atlas scene is used.
 */
export async function getSubPartGeometry(
  atlasUrl: string,
  nodeName: string | null,
): Promise<THREE.BufferGeometry> {
  const cacheKey = `${atlasUrl}#${nodeName ?? '*'}`;
  const cached = geometryCache.get(cacheKey);
  if (cached) return cached;

  const gltf = await loadAtlas(atlasUrl);

  let node: THREE.Object3D | undefined;
  if (nodeName) {
    node = gltf.scene.getObjectByName(nodeName);
    if (!node) throw new Error(`MeshAtlasCache: node '${nodeName}' not found in ${atlasUrl}`);
  } else {
    node = gltf.scene;
  }

  const mesh = findFirstMesh(node);
  if (!mesh)
    throw new Error(`MeshAtlasCache: no mesh under '${nodeName ?? '<scene>'}' in ${atlasUrl}`);

  const geometry = mesh.geometry.clone();
  // Bake the node's transform relative to the atlas scene so placement is faithful.
  mesh.updateWorldMatrix(true, false);
  geometry.applyMatrix4(mesh.matrixWorld);

  // KSA's GLBs ship no TANGENT attribute, so three.js would fall back to a
  // screen-space derivative tangent frame — which has no per-vertex handedness
  // and inverts normal-map detail on mirrored UV islands (same artifact as OG
  // KSA's derivative cotangent_frame: detail punches outwards instead of in).
  // MikkTSpace recalculates a proper per-vertex tangent space from the UVs +
  // normals, with a handedness sign matching the normal-map baker, fixing it.
  await generateTangents(geometry);

  geometryCache.set(cacheKey, geometry);
  return geometry;
}

/** Adds a MikkTSpace tangent attribute in place (de-indexes the geometry). */
async function generateTangents(geometry: THREE.BufferGeometry): Promise<void> {
  if (!geometry.hasAttribute('normal') || !geometry.hasAttribute('uv')) return;
  await MikkTSpace.ready;
  computeMikkTSpaceTangents(geometry, MikkTSpace);
}

function findFirstMesh(root: THREE.Object3D): THREE.Mesh | null {
  if ((root as THREE.Mesh).isMesh) return root as THREE.Mesh;
  let found: THREE.Mesh | null = null;
  root.traverse((child) => {
    if (!found && (child as THREE.Mesh).isMesh) found = child as THREE.Mesh;
  });
  return found;
}
