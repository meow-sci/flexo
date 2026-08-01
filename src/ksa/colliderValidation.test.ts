import { describe, it, expect } from 'vitest';
import { validateColliders } from './colliderValidation';
import { COLLIDER_COMPONENT_ID } from './partXmlSerializer';
import {
  DEFAULT_LAYER_ID,
  createEmptyPart,
  createTank,
  identityTransform,
  type ColliderShape,
  type EditingPart,
  type PartCollider,
} from './types';

function collider(over: Partial<PartCollider> = {}): PartCollider {
  return {
    id: '_collider1',
    shape: 'Cylinder' as ColliderShape,
    ownerTemplateId: null,
    ...identityTransform(),
    layerId: DEFAULT_LAYER_ID,
    ...over,
  };
}

function placed(
  templateId: string,
  scale = { x: 1, y: 1, z: 1 },
): EditingPart['placements'][number] {
  return {
    instanceId: 'inst_1',
    subPartTemplateId: templateId,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale,
    layerId: DEFAULT_LAYER_ID,
  };
}

const codes = (part: EditingPart) => validateColliders(part).map((i) => i.code);

describe('validateColliders', () => {
  it('is silent for a healthy part-level collider', () => {
    const part = createEmptyPart();
    part.placements.push(placed('T'));
    part.colliders.push(collider());
    expect(validateColliders(part)).toEqual([]);
  });

  it('warns when a part with geometry has NO collider at all', () => {
    const part = createEmptyPart();
    part.placements.push(placed('T'));
    expect(codes(part)).toContain('collider-none');
  });

  it('does not nag about an empty part', () => {
    expect(validateColliders(createEmptyPart())).toEqual([]);
  });

  it('warns that a docking port without a collider never docks', () => {
    const part = createEmptyPart();
    part.placements.push(placed('T'));
    part.gameData.dockingPort = {
      connectorId: '_connector1',
      latchingKineticEnergyJ: 50,
      pushoffImpulseNs: 7000,
    };
    expect(codes(part)).toContain('collider-docking-port');
  });

  it('warns when a collider is owned by a template with a non-unit placement scale', () => {
    const part = createEmptyPart();
    part.placements.push(placed('T', { x: 2, y: 2, z: 2 }));
    part.colliders.push(collider({ ownerTemplateId: 'T' }));
    // KSA composes only position + rotation, so the shape would be half the visual size.
    expect(codes(part)).toContain('collider-owner-scaled');
  });

  it('warns when a collider is owned by a template that is not placed', () => {
    const part = createEmptyPart();
    part.placements.push(placed('T'));
    part.colliders.push(collider({ ownerTemplateId: 'Gone' }));
    expect(codes(part)).toContain('collider-owner-unplaced');
  });

  it('warns about a capsule shorter than its diameter (it is a sphere)', () => {
    const part = createEmptyPart();
    part.placements.push(placed('T'));
    part.colliders.push(collider({ shape: 'Capsule', scale: { x: 2, y: 0.5, z: 2 } }));
    expect(codes(part)).toContain('collider-capsule-degenerate');
  });

  it('BLOCKS a degenerate dimension (KSA would build a NaN/zero Bepu shape)', () => {
    const part = createEmptyPart();
    part.placements.push(placed('T'));
    part.colliders.push(collider({ scale: { x: 1, y: Number.NaN, z: 1 } }));
    const issue = validateColliders(part).find((i) => i.code === 'collider-degenerate');
    expect(issue?.severity).toBe('block');
  });

  it('BLOCKS a <Tank Id> that collides with the emitted collider component id', () => {
    // The component id shares the namespace <FeedsFrom Container> resolves against.
    const part = createEmptyPart();
    part.placements.push(placed('T'));
    part.colliders.push(collider());
    part.gameData.tanks.push({ ...createTank(), id: COLLIDER_COMPONENT_ID });
    const issue = validateColliders(part).find((i) => i.code === 'collider-id-collides-with-tank');
    expect(issue?.severity).toBe('block');
  });

  it('warns past the compound-rebuild count threshold', () => {
    const part = createEmptyPart();
    part.placements.push(placed('T'));
    for (let i = 0; i < 40; i++) part.colliders.push(collider({ id: `_collider${i}` }));
    expect(codes(part)).toContain('collider-count');
  });
});
