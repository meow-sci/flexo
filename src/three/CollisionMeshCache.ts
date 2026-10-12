import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { ASSET_FILES, fetchXmlFile, toUrl } from '../ksa/catalog';
import { collisionMeshAtlasPaths } from '../ksa/collisionAtlas';
import type { HullCoverage } from '../measure/colliderCoverage';
import type { Vec3 } from '../ksa/types';
import { parseGlb } from '../ksa/animationImport';

let sources: Promise<Map<string, string>> | null = null;
const atlases = new Map<string, Promise<Map<string, THREE.BufferGeometry>>>();

interface CollisionGltf {
  meshes: { name?: string; primitives: { attributes: { POSITION: number } }[] }[];
  accessors: {
    bufferView: number;
    byteOffset?: number | null;
    componentType: number;
    count: number;
    type: string;
  }[];
  bufferViews: { byteOffset?: number | null; byteStride?: number | null }[];
}

/** KSA's collision GLBs have meshes but no scenes/nodes. Resolve meshes[i].name directly. */
export function parseCollisionAtlas(buffer: ArrayBuffer): Map<string, THREE.BufferGeometry> {
  const { json, bin } = parseGlb(buffer);
  const gltf = json as unknown as CollisionGltf;
  const out = new Map<string, THREE.BufferGeometry>();
  for (const definition of gltf.meshes) {
    if (!definition.name) continue;
    const accessor = gltf.accessors[definition.primitives[0].attributes.POSITION];
    if (accessor.componentType !== 5126 || accessor.type.toUpperCase() !== 'VEC3') {
      throw new Error(`Collision mesh "${definition.name}" must carry FLOAT VEC3 positions.`);
    }
    const view = gltf.bufferViews[accessor.bufferView];
    const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const stride = view.byteStride ?? 12;
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < accessor.count; i++) {
      const offset = base + i * stride;
      points.push(
        new THREE.Vector3(
          bin.getFloat32(offset, true),
          bin.getFloat32(offset + 4, true),
          bin.getFloat32(offset + 8, true),
        ),
      );
    }
    const hull = new ConvexGeometry(points);
    if (hull.getAttribute('position').count === 0) {
      throw new Error(`Collision mesh "${definition.name}" has no convex volume.`);
    }
    out.set(definition.name, hull);
  }
  return out;
}

async function loadSources(): Promise<Map<string, string>> {
  const results = await Promise.all(ASSET_FILES.map((file) => fetchXmlFile(file)));
  const out = new Map<string, string>();
  for (const result of results) {
    if (result.kind !== 'ok') continue;
    for (const [id, path] of collisionMeshAtlasPaths(result.doc)) {
      if (!out.has(id)) out.set(id, toUrl(path));
    }
  }
  return out;
}

/** Shared, unscaled convex geometry in the collision mesh's authored coordinates. */
export async function getCollisionMeshGeometry(meshId: string): Promise<THREE.BufferGeometry> {
  sources ??= loadSources();
  const url = (await sources).get(meshId);
  if (!url) throw new Error(`Collision mesh "${meshId}" is absent from the current Core catalog.`);
  let pending = atlases.get(url);
  if (!pending) {
    pending = (async () => {
      const response = await fetch(url);
      if (!response.ok)
        throw new Error(`Failed to load collision atlas: ${response.status} ${url}`);
      return parseCollisionAtlas(await response.arrayBuffer());
    })();
    atlases.set(url, pending);
  }
  const geometry = (await pending).get(meshId);
  if (!geometry) throw new Error(`Collision mesh "${meshId}" is missing from ${url}.`);
  return geometry;
}

/** Scaled hull planes and volume for the pure coverage evaluator; transform stays external. */
export function hullCoverage(geometry: THREE.BufferGeometry, scale: Vec3): HullCoverage {
  const position = geometry.getAttribute('position');
  const planes: HullCoverage['planes'] = [];
  let volume = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const multiplier = new THREE.Vector3(scale.x, scale.y, scale.z);
  for (let i = 0; i < position.count; i += 3) {
    a.fromBufferAttribute(position, i).multiply(multiplier);
    b.fromBufferAttribute(position, i + 1).multiply(multiplier);
    c.fromBufferAttribute(position, i + 2).multiply(multiplier);
    const plane = new THREE.Plane().setFromCoplanarPoints(a, b, c);
    planes.push({
      normal: { x: plane.normal.x, y: plane.normal.y, z: plane.normal.z },
      constant: plane.constant,
    });
    volume += a.dot(new THREE.Vector3().crossVectors(b, c)) / 6;
  }
  return { planes, volumeM3: Math.abs(volume) };
}
