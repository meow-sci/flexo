import { describe, expect, it } from 'vitest';
import { collectGameDataColliders, vesselPieceFromSubPart } from './catalogStore';
import type { CatalogPart } from '../../../../src/ksa/partCatalog';
import type { PartCollider } from '../ksa/types';

function collider(id: string, ownerTemplateId: string | null): PartCollider {
  return {
    id,
    shape: 'Box',
    ownerTemplateId,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    layerId: 'default',
  };
}

describe('collectGameDataColliders', () => {
  it('gathers SubPartGameData colliders per template, first part wins', () => {
    const parts = [
      { colliders: [collider('a', 'T1'), collider('b', 'T1'), collider('p', null)] },
      { colliders: [collider('stale', 'T1'), collider('c', 'T2')] },
    ] as unknown as CatalogPart[];
    const map = collectGameDataColliders(parts);
    // Part-level (null-owner) colliders never enter the template map.
    expect(map.get('T1')!.map((c) => c.id)).toEqual(['a', 'b']);
    expect(map.get('T2')!.map((c) => c.id)).toEqual(['c']);
  });
});

describe('vesselPieceFromSubPart', () => {
  const entry = {
    id: 'T1',
    atlasUrl: 'a.glb',
    meshNodeName: 'T1',
    materialId: 'M',
    colliders: [collider('geo', 'T1')],
    sourceFile: 'x.xml',
  };

  it('merges geometry-template colliders with the GameData set (vessels must not fall through)', () => {
    const piece = vesselPieceFromSubPart(entry as never, [collider('gd', 'T1')])!;
    expect(piece.colliders.map((c) => c.id)).toEqual(['geo', 'gd']);
    expect(piece.origin).toBe('core-subpart');
  });

  it('includes Internal interior props (KSA ignores the flag for statics, fact F6)', () => {
    const piece = vesselPieceFromSubPart({ ...entry, internal: true } as never)!;
    expect(piece).not.toBeNull();
    expect(piece.internal).toBe(true);
  });

  it('still rejects templates without a mesh node or material', () => {
    expect(vesselPieceFromSubPart({ ...entry, meshNodeName: null } as never)).toBeNull();
    expect(vesselPieceFromSubPart({ ...entry, materialId: undefined } as never)).toBeNull();
  });
});
