import type { AnimRig } from './animationRig';

/**
 * Serializes an {@link AnimRig} into a binary glTF/GLB that KSA's
 * KeyframeAnimationData loader reads (node hierarchy + one animation; geometry and
 * materials are deliberately absent — KSA ignores them in the animation file).
 *
 * Hand-rolled rather than via three.js GLTFExporter because (a) KSA matches SubParts
 * by exact node name and needs every named leaf node present — GLTFExporter prunes
 * empty, non-animated nodes — and (b) the structure is tiny and fully deterministic.
 * Chunk packing mirrors {@link nameMeshesFromNodes} in exportGlb.ts (4-byte aligned
 * JSON padded with spaces, BIN padded with zeros).
 */

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const COMPONENT_FLOAT = 5126;

interface GltfAccessor {
  bufferView: number;
  byteOffset: number;
  componentType: number;
  count: number;
  type: 'SCALAR' | 'VEC3' | 'VEC4';
  min?: number[];
  max?: number[];
}

export function buildAnimationGlb(rig: AnimRig): Uint8Array {
  const blobs: Float32Array[] = [];
  const bufferViews: { buffer: number; byteOffset: number; byteLength: number }[] = [];
  const accessors: GltfAccessor[] = [];
  let byteOffset = 0;

  /** Appends a float blob as a bufferView + accessor; returns the accessor index. */
  function addAccessor(values: number[], type: GltfAccessor['type'], withMinMax: boolean): number {
    const comps = type === 'SCALAR' ? 1 : type === 'VEC4' ? 4 : 3;
    const data = Float32Array.from(values);
    bufferViews.push({ buffer: 0, byteOffset, byteLength: data.byteLength });
    blobs.push(data);
    byteOffset += data.byteLength; // Float32 arrays are inherently 4-byte aligned
    const count = values.length / comps;
    const acc: GltfAccessor = {
      bufferView: bufferViews.length - 1,
      byteOffset: 0,
      componentType: COMPONENT_FLOAT,
      count,
      type,
    };
    if (withMinMax) {
      const min = new Array<number>(comps).fill(Infinity);
      const max = new Array<number>(comps).fill(-Infinity);
      for (let i = 0; i < count; i++) {
        for (let c = 0; c < comps; c++) {
          const v = values[i * comps + c];
          if (v < min[c]) min[c] = v;
          if (v > max[c]) max[c] = v;
        }
      }
      acc.min = min;
      acc.max = max;
    }
    accessors.push(acc);
    return accessors.length - 1;
  }

  // Channels share keyframe-time (input) accessors when identical.
  const inputCache = new Map<string, number>();
  const inputAccessor = (times: number[]): number => {
    const key = times.join(',');
    let idx = inputCache.get(key);
    if (idx === undefined) {
      idx = addAccessor(times, 'SCALAR', true);
      inputCache.set(key, idx);
    }
    return idx;
  };

  const samplers: { input: number; output: number; interpolation: 'LINEAR' }[] = [];
  const channels: { sampler: number; target: { node: number; path: string } }[] = [];
  for (const ch of rig.channels) {
    const input = inputAccessor(ch.times);
    const output = addAccessor(ch.values, ch.path === 'rotation' ? 'VEC4' : 'VEC3', false);
    samplers.push({ input, output, interpolation: 'LINEAR' });
    channels.push({ sampler: samplers.length - 1, target: { node: ch.node, path: ch.path } });
  }

  const gltf: Record<string, unknown> = {
    asset: { version: '2.0', generator: 'flexo' },
    scene: 0,
    scenes: [{ nodes: rig.roots }],
    nodes: rig.nodes.map((n) => {
      const node: Record<string, unknown> = {
        name: n.name,
        translation: n.translation,
        rotation: n.rotation,
        scale: n.scale,
      };
      if (n.children.length) node.children = n.children;
      return node;
    }),
  };
  if (channels.length > 0) {
    gltf.animations = [{ name: 'All Animations', channels, samplers }];
    gltf.accessors = accessors;
    gltf.bufferViews = bufferViews;
    gltf.buffers = [{ byteLength: byteOffset }];
  }

  // Concatenate the binary buffer.
  const bin = new Uint8Array(byteOffset);
  let off = 0;
  for (const b of blobs) {
    bin.set(new Uint8Array(b.buffer, b.byteOffset, b.byteLength), off);
    off += b.byteLength;
  }
  return packGlb(gltf, bin);
}

/** Packs a glTF JSON object + binary buffer into a 2-chunk binary GLB. */
function packGlb(gltf: Record<string, unknown>, bin: Uint8Array): Uint8Array {
  let jsonBytes = new TextEncoder().encode(JSON.stringify(gltf));
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  if (jsonPad) {
    const padded = new Uint8Array(jsonBytes.length + jsonPad);
    padded.set(jsonBytes);
    padded.fill(0x20, jsonBytes.length); // ASCII space, per the GLB spec
    jsonBytes = padded;
  }

  const hasBin = bin.length > 0;
  const binPad = hasBin ? (4 - (bin.length % 4)) % 4 : 0;
  const binLen = bin.length + binPad;

  const total = 12 + 8 + jsonBytes.length + (hasBin ? 8 + binLen : 0);
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, GLB_MAGIC, true);
  dv.setUint32(4, 2, true); // glTF version
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonBytes.length, true);
  dv.setUint32(16, CHUNK_JSON, true);
  out.set(jsonBytes, 20);
  if (hasBin) {
    const binStart = 20 + jsonBytes.length;
    dv.setUint32(binStart, binLen, true);
    dv.setUint32(binStart + 4, CHUNK_BIN, true);
    out.set(bin, binStart + 8); // trailing pad bytes stay zero
  }
  return out;
}
