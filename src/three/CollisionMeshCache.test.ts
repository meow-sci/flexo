import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { hasKsaAssets, ksaAsset } from '../ksa/ksaTestAssets';
import { hullCoverage, parseCollisionAtlas } from './CollisionMeshCache';
import { evaluateCoverage } from '../measure/colliderCoverage';
import { DEFAULT_LAYER_ID, identityTransform, type PartCollider } from '../ksa/types';

/** KSA GlbCollisionAtlas.Write writes meshes and binary accessors, with no scene graph. */
function collisionGlb(): ArrayBuffer {
  const coordinates: number[] = [];
  for (const x of [2, 4])
    for (const y of [-1, 1]) for (const z of [-1, 1]) coordinates.push(x, y, z);
  const binary = new Float32Array(coordinates);
  const json = new TextEncoder().encode(
    JSON.stringify({
      asset: { version: '2.0' },
      buffers: [{ byteLength: binary.byteLength, uri: null }],
      bufferViews: [{ buffer: 0, byteLength: binary.byteLength }],
      accessors: [
        {
          bufferView: 0,
          componentType: 5126,
          count: 8,
          type: 'Vec3',
          sparse: null,
          min: [2, -1, -1],
          max: [4, 1, 1],
        },
      ],
      meshes: [{ name: '_ColMesh_Test_1', primitives: [{ attributes: { POSITION: 0 }, mode: 0 }] }],
    }),
  );
  const paddedLength = Math.ceil(json.length / 4) * 4;
  const buffer = new ArrayBuffer(12 + 8 + paddedLength + 8 + binary.byteLength);
  const view = new DataView(buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, buffer.byteLength, true);
  view.setUint32(12, paddedLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(buffer, 20, paddedLength).fill(0x20);
  new Uint8Array(buffer, 20, json.length).set(json);
  view.setUint32(20 + paddedLength, binary.byteLength, true);
  view.setUint32(24 + paddedLength, 0x004e4942, true);
  new Uint8Array(buffer, 28 + paddedLength).set(new Uint8Array(binary.buffer));
  return buffer;
}

describe('collision mesh geometry', () => {
  it('loads a mesh-only atlas by mesh name, keeps the authored offset and scales coverage exactly', async () => {
    const atlas = await parseCollisionAtlas(collisionGlb());
    const geometry = atlas.get('_ColMesh_Test_1')!;
    geometry.computeBoundingBox();
    expect(geometry.boundingBox!.min.toArray()).toEqual([2, -1, -1]);
    expect(geometry.boundingBox!.max.toArray()).toEqual([4, 1, 1]);
    const collider: PartCollider = {
      id: '_collider1',
      shape: 'ConvexHull',
      meshId: '_ColMesh_Test_1',
      ownerTemplateId: null,
      layerId: DEFAULT_LAYER_ID,
      ...identityTransform(),
      scale: { x: 2, y: 3, z: 4 },
    };
    const hull = hullCoverage(geometry, collider.scale);
    expect(hull.volumeM3).toBeCloseTo(192);
    const report = evaluateCoverage(
      [
        { x: 6, y: 0, z: 0 },
        { x: 3, y: 0, z: 0 },
      ],
      [
        {
          collider,
          hull,
          position: collider.position,
          quaternion: [0, 0, 0, 1],
        },
      ],
    );
    expect(report.covered).toBe(1);
    expect(report.uncovered).toEqual([{ x: 3, y: 0, z: 0 }]);
    expect(report.colliderVolumeM3).toBeCloseTo(192);
  });

  it.skipIf(!hasKsaAssets || !existsSync(ksaAsset('Meshes/CoreCommandA_CollisionAtlas.glb')))(
    'loads the current stock capsule collision mesh without scene nodes',
    async () => {
      const bytes = readFileSync(ksaAsset('Meshes/CoreCommandA_CollisionAtlas.glb'));
      const atlas = await parseCollisionAtlas(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      );
      const geometry = atlas.get('_ColMesh_CoreCommandA_Prefab_MediumCapsuleVariantA_1')!;
      expect(geometry).toBeDefined();
      expect(hullCoverage(geometry, { x: 1, y: 1, z: 1 }).volumeM3).toBeGreaterThan(0);
    },
  );
});
