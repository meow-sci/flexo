import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { loadModelFile } from './loadModelFile';

/**
 * These tests exist for ONE reason: three's `GLTFLoader` does not put the glTF NODE name on
 * the objects it returns for every shape of file, and the importer's provenance, display
 * names and replace-matching all key on that name. Anything that asserts it has to go
 * through the real loader — a hand-built three scene would prove nothing about how three
 * flattens a glTF document.
 *
 * The `.glb` is assembled here rather than committed: it is 4 accessors and a JSON chunk, and
 * the point is the DOCUMENT SHAPE (a mesh with two primitives, a mesh referenced by two
 * nodes), which is exactly what would rot silently in a binary blob.
 */

const FLOAT = 5126;
const USHORT = 5123;

function pad4(n: number): number {
  return (4 - (n % 4)) % 4;
}

/** Minimal glTF 2.0 binary: one triangle's worth of accessors, reused by every primitive. */
function buildGlb(json: Record<string, unknown>, bin: Uint8Array): Uint8Array<ArrayBuffer> {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPad = new Uint8Array(jsonBytes.length + pad4(jsonBytes.length)).fill(0x20);
  jsonPad.set(jsonBytes);
  const binPad = new Uint8Array(bin.length + pad4(bin.length));
  binPad.set(bin);

  const total = 12 + 8 + jsonPad.length + 8 + binPad.length;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonPad.length, true);
  dv.setUint32(16, 0x4e4f534a, true); // 'JSON'
  out.set(jsonPad, 20);
  const binStart = 20 + jsonPad.length;
  dv.setUint32(binStart, binPad.length, true);
  dv.setUint32(binStart + 4, 0x004e4942, true); // 'BIN\0'
  out.set(binPad, binStart + 8);
  return out;
}

/**
 * A document with the two shapes that matter:
 *   mesh "HullMesh"  — TWO primitives (two material slots on one Blender object),
 *                      referenced by ONE node named "Hull"
 *   mesh "StrutMesh" — one primitive, referenced by TWO nodes, "Strut" and "StrutMirror"
 */
function twoShapeGlb(): Uint8Array<ArrayBuffer> {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const indices = new Uint16Array([0, 1, 2, 0, 0, 0]); // padded to 4-byte alignment
  const bin = new Uint8Array(positions.byteLength + indices.byteLength);
  bin.set(new Uint8Array(positions.buffer), 0);
  bin.set(new Uint8Array(indices.buffer), positions.byteLength);

  const primitive = { attributes: { POSITION: 0 }, indices: 1 };
  return buildGlb(
    {
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: [0, 1, 2] }],
      nodes: [
        { name: 'Hull', mesh: 0 },
        { name: 'Strut', mesh: 1, translation: [1, 0, 0] },
        { name: 'StrutMirror', mesh: 1, translation: [-1, 0, 0], scale: [-1, 1, 1] },
      ],
      meshes: [
        {
          name: 'HullMesh',
          primitives: [
            { ...primitive, material: 0 },
            { ...primitive, material: 1 },
          ],
        },
        { name: 'StrutMesh', primitives: [{ ...primitive, material: 0 }] },
      ],
      materials: [{ name: 'PaintedMetal' }, { name: 'GlowStrip' }],
      accessors: [
        {
          bufferView: 0,
          componentType: FLOAT,
          count: 3,
          type: 'VEC3',
          min: [0, 0, 0],
          max: [1, 1, 0],
        },
        { bufferView: 1, componentType: USHORT, count: 3, type: 'SCALAR' },
      ],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
        { buffer: 0, byteOffset: positions.byteLength, byteLength: 6 },
      ],
      buffers: [{ byteLength: bin.length }],
    },
    bin,
  );
}

function meshesOf(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
  });
  return out;
}

describe('loadModelFile — ModelSource.nodeName', () => {
  it('reports the glTF NODE name even when three names the object after the glTF MESH', async () => {
    // A Blender object with two material slots exports as ONE glTF mesh with two primitives,
    // and GLTFLoader splits it into one three `Mesh` per primitive, each named after the MESH
    // data-block ("HullMesh", "HullMesh_1") and nested under a Group carrying the node name.
    // The object name is what the user authored, what the provenance block shows, and half of
    // the (sourceNode, sourceMaterial) key a re-import matches on — so it has to survive.
    const model = await loadModelFile([new File([twoShapeGlb()], 'rig.glb')]);
    const meshes = meshesOf(model.scene);
    const source = model.source!;

    const hull = meshes.filter((m) => m.name.startsWith('HullMesh'));
    expect(hull).toHaveLength(2);
    expect(hull.map((m) => m.name)).toEqual(['HullMesh', 'HullMesh_1']);
    expect(hull.map((m) => source.nodeName(m))).toEqual(['Hull', 'Hull']);
  });

  it('reports each instance node separately for a mesh referenced by several nodes', async () => {
    const model = await loadModelFile([new File([twoShapeGlb()], 'rig.glb')]);
    const source = model.source!;
    const struts = meshesOf(model.scene).filter((m) => !m.name.startsWith('HullMesh'));

    expect(struts.map((m) => source.nodeName(m)).sort()).toEqual(['Strut', 'StrutMirror']);
  });
});
