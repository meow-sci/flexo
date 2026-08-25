import { describe, expect, it } from 'vitest';
import { preparePartImport } from './partImport';
import { colliderWorld } from '../../../../src/three/coords';
import type { CatalogPart } from '../../../../src/ksa/partCatalog';

const PART = {
  id: 'P',
  placements: [
    {
      instanceId: 'skip_1',
      subPartTemplateId: 'NoPiece',
      position: { x: 9, y: 9, z: 9 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      layerId: 'default',
    },
    {
      instanceId: 'tank_1',
      subPartTemplateId: 'Tank',
      position: { x: 0.5, y: 1, z: 0 },
      rotation: { x: 0.3, y: -0.7, z: 1.1 },
      scale: { x: 1, y: 1, z: 1 },
      layerId: 'default',
    },
  ],
  colliders: [
    {
      id: 'CylinderCollider1',
      shape: 'Cylinder',
      ownerTemplateId: null, // part-level (the tank case)
      position: { x: 0.25, y: -0.5, z: 0.75 },
      rotation: { x: 0.2, y: 0.4, z: -0.6 },
      scale: { x: 1, y: 2, z: 1 },
      layerId: 'default',
    },
    {
      id: 'BoxCollider1',
      shape: 'Box',
      ownerTemplateId: 'Tank', // template-owned: rides the piece, not the anchor
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      layerId: 'default',
    },
  ],
} as unknown as CatalogPart;

describe('preparePartImport', () => {
  it('localizes part-level colliders onto the FIRST importable placement, round-tripping exactly', () => {
    const prepared = preparePartImport(PART, (id) => id === 'Tank');
    expect(prepared.anchorColliders).toHaveLength(1); // template-owned excluded
    expect(prepared.droppedPartColliders).toBe(0);
    const local = prepared.anchorColliders[0];
    // Round trip: composing the localized collider back with the anchor's
    // transform must reproduce the original part-frame pose (export does this
    // composition with the placement's CURRENT transform).
    const anchor = PART.placements[1];
    const world = colliderWorld(
      { position: local.position, rotation: local.rotation, scale: local.scale },
      { position: anchor.position, rotation: anchor.rotation, scale: anchor.scale },
    );
    const orig = PART.colliders[0];
    expect(world.position.x).toBeCloseTo(orig.position.x, 9);
    expect(world.position.y).toBeCloseTo(orig.position.y, 9);
    expect(world.position.z).toBeCloseTo(orig.position.z, 9);
    expect(world.rotation.x).toBeCloseTo(orig.rotation.x, 9);
    expect(world.rotation.y).toBeCloseTo(orig.rotation.y, 9);
    expect(world.rotation.z).toBeCloseTo(orig.rotation.z, 9);
    // Size is never composed (fact F4/I3).
    expect(local.scale).toEqual(orig.scale);
  });

  it('reports dropped part colliders when no placement is importable', () => {
    const prepared = preparePartImport(PART, () => false);
    expect(prepared.anchorColliders).toHaveLength(0);
    expect(prepared.droppedPartColliders).toBe(1);
  });
});

describe('preparePartImport connectors (magnetic snap points)', () => {
  it('localizes part-frame connectors onto the anchor so composing back is exact', async () => {
    const { connectorWorld } = await import('./snapEngine');
    const anchor = {
      instanceId: 'skin',
      subPartTemplateId: 'Tank_Skin',
      position: { x: 1, y: 2, z: 3 },
      rotation: { x: 0, y: 0, z: Math.PI / 2 },
      scale: { x: 1, y: 1, z: 1 },
    };
    const part = {
      id: 'P',
      editorTags: [],
      placements: [anchor],
      colliders: [],
      // A tank-style pair: top node facing +X, bottom rotated to face −X.
      connectors: [
        {
          id: '_c1',
          position: { x: 0.5, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          flags: [],
        },
        {
          id: '_c2',
          position: { x: -0.5, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: Math.PI },
          scale: { x: 1, y: 1, z: 1 },
          flags: [],
        },
      ],
    };
    const prepared = preparePartImport(part as never, () => true);
    expect(prepared.anchorConnectors).toHaveLength(2);
    // Round-trip: the anchor placement carries its part-frame transform
    // verbatim on import, so composing the localized connector back must land
    // on the PART-frame authoring position (0.5, 0, 0), facing +X.
    const w = connectorWorld(prepared.anchorConnectors[0], {
      position: anchor.position,
      rotation: anchor.rotation,
      scale: anchor.scale,
    });
    expect(w.position.x).toBeCloseTo(0.5);
    expect(w.position.y).toBeCloseTo(0);
    expect(w.position.z).toBeCloseTo(0);
    expect(w.facing.x).toBeCloseTo(1);
    const w2 = connectorWorld(prepared.anchorConnectors[1], {
      position: anchor.position,
      rotation: anchor.rotation,
      scale: anchor.scale,
    });
    expect(w2.facing.x).toBeCloseTo(-1);
  });

  it('no importable anchor → connectors dropped, not crashed', () => {
    const part = {
      id: 'P',
      editorTags: [],
      placements: [
        {
          instanceId: 'x',
          subPartTemplateId: 'Missing',
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        },
      ],
      colliders: [],
      connectors: [],
    };
    const prepared = preparePartImport(part as never, () => false);
    expect(prepared.anchorConnectors).toEqual([]);
  });
});
