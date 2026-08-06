import { describe, it, expect } from 'vitest';
import { thumbSignature } from './assetThumbs';
import {
  createEmptyPart,
  createDefaultMaterial,
  type CustomMesh,
  type EditingPart,
} from '../ksa/types';

/**
 * `thumbSignature` is the CACHE KEY of the shared thumbnail renderer, so it is the one part
 * of that module that must be provably right without a GPU: too loose and a card keeps
 * showing the previous material; too tight and a 20-asset grid re-renders on every keystroke.
 *
 * Pure-function tests only — no WebGL exists in the vitest (happy-dom) environment, and the
 * renderer is built lazily precisely so importing this module stays free.
 */

function partWith(patch: Partial<EditingPart>): EditingPart {
  return { ...createEmptyPart(), ...patch };
}

function boxMesh(over: Partial<CustomMesh> = {}): CustomMesh {
  return {
    id: 'mesh_1',
    name: 'Hull Box',
    subPartId: 'flexo_HullBox_a1',
    primitive: { kind: 'box', params: { width: 1, height: 1, depth: 1 } },
    faceTextures: {},
    ...over,
  };
}

describe('thumbSignature — material', () => {
  it('is stable when nothing about the material changed', () => {
    const material = createDefaultMaterial('mat_1', 'Steel');
    const part = partWith({ customMaterials: [material] });
    expect(thumbSignature('material', 'mat_1', part)).toBe(
      thumbSignature('material', 'mat_1', part),
    );
  });

  it('changes when a channel changes', () => {
    const before = partWith({ customMaterials: [createDefaultMaterial('mat_1', 'Steel')] });
    const after = partWith({
      customMaterials: [
        { ...createDefaultMaterial('mat_1', 'Steel'), roughness: { kind: 'value', value: 0.1 } },
      ],
    });
    expect(thumbSignature('material', 'mat_1', before)).not.toBe(
      thumbSignature('material', 'mat_1', after),
    );
  });

  it('ignores a pure rename (the name is not part of the LOOK)', () => {
    const before = partWith({ customMaterials: [createDefaultMaterial('mat_1', 'Steel')] });
    const after = partWith({ customMaterials: [createDefaultMaterial('mat_1', 'Aluminium')] });
    expect(thumbSignature('material', 'mat_1', before)).toBe(
      thumbSignature('material', 'mat_1', after),
    );
  });

  it('returns a stable placeholder key for an unknown id', () => {
    const part = createEmptyPart();
    expect(thumbSignature('material', 'nope', part)).toBe(thumbSignature('material', 'nope', part));
  });
});

describe('thumbSignature — mesh', () => {
  it('changes when a primitive is resized', () => {
    const before = partWith({ customMeshes: [boxMesh()] });
    const after = partWith({
      customMeshes: [
        boxMesh({ primitive: { kind: 'box', params: { width: 2, height: 1, depth: 1 } } }),
      ],
    });
    expect(thumbSignature('mesh', 'mesh_1', before)).not.toBe(
      thumbSignature('mesh', 'mesh_1', after),
    );
  });

  it('changes when a face texture is assigned', () => {
    const before = partWith({ customMeshes: [boxMesh()] });
    const after = partWith({
      customMeshes: [
        boxMesh({
          faceTextures: {
            right: { textureId: 'tex_1', uvScale: { x: 1, y: 1 }, uvOffset: { x: 0, y: 0 } },
          },
        }),
      ],
    });
    expect(thumbSignature('mesh', 'mesh_1', before)).not.toBe(
      thumbSignature('mesh', 'mesh_1', after),
    );
  });

  it('changes when the ASSIGNED material changes underneath it', () => {
    const mesh = boxMesh({ materialId: 'mat_1' });
    const before = partWith({
      customMeshes: [mesh],
      customMaterials: [createDefaultMaterial('mat_1', 'Steel')],
    });
    const after = partWith({
      customMeshes: [mesh],
      customMaterials: [
        { ...createDefaultMaterial('mat_1', 'Steel'), metalness: { kind: 'value', value: 1 } },
      ],
    });
    expect(thumbSignature('mesh', 'mesh_1', before)).not.toBe(
      thumbSignature('mesh', 'mesh_1', after),
    );
  });

  it('is stable across an unrelated document edit', () => {
    const before = partWith({ customMeshes: [boxMesh()] });
    const after = partWith({ customMeshes: [boxMesh()], partId: 'Something/Else' });
    expect(thumbSignature('mesh', 'mesh_1', before)).toBe(thumbSignature('mesh', 'mesh_1', after));
  });

  it('changes when the glow changes', () => {
    const before = partWith({ customMeshes: [boxMesh()] });
    const after = partWith({
      customMeshes: [
        boxMesh({
          emissive: { shape: 'whole', color: { r: 1, g: 2, b: 3 }, strength: 0.3, coverage: 1 },
        }),
      ],
    });
    expect(thumbSignature('mesh', 'mesh_1', before)).not.toBe(
      thumbSignature('mesh', 'mesh_1', after),
    );
  });
});
