import { describe, it, expect, beforeEach } from 'vitest';
import {
  $canUndo,
  $colliderEditContext,
  $part,
  newPart,
  select,
  type PlacementTransform,
} from '../state/editorStore';
import { setLayerLocked } from '../state/layerStore';
import { DEFAULT_LAYER_ID, createEmptyPart } from '../ksa/types';
import type { EditingPart, PartCollider, PartLight, SubPartPlacement } from '../ksa/types';
import { colliderWorld, lightWorld } from './coords';
import { applySelectionTransform, liftedSelectionRefs } from './selectionTransform';
import { translatedTransform } from './bulkTransform';

/**
 * The **owner-frame lift** (census: selection-transform.md pain 4). A SubPart-owned collider
 * or light stores its transform in its owner's frame; before this, the gizmo lifted those
 * into Part space and the keyboard tools did not — so "nudge +1 m on X" moved an owned
 * entity along the OWNER's X, silently differently from dragging it.
 *
 * Every case below asks the same question: does a keyboard nudge land the entity where a
 * gizmo drag would, i.e. exactly +1 m on PART-space X?
 */

const HALF_PI = Math.PI / 2;

function placement(overrides: Partial<SubPartPlacement> = {}): SubPartPlacement {
  return {
    instanceId: 'hull_1',
    subPartTemplateId: 'Core.Hull',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    layerId: DEFAULT_LAYER_ID,
    ...overrides,
  };
}

function collider(overrides: Partial<PartCollider> = {}): PartCollider {
  return {
    id: '_collider1',
    shape: 'Box',
    ownerTemplateId: null,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    layerId: DEFAULT_LAYER_ID,
    ...overrides,
  };
}

function light(overrides: Partial<PartLight> = {}): PartLight {
  return {
    id: '_light1',
    type: 'Spot',
    ownerTemplateId: null,
    rangeM: 10,
    intensity: 1,
    color: { r: 1, g: 1, b: 1 },
    innerAngleRad: 0.3,
    outerAngleRad: 0.6,
    rayTracing: false,
    ksaId: null,
    disableInIva: false,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    layerId: DEFAULT_LAYER_ID,
    ...overrides,
  };
}

function setPart(mutate: (part: EditingPart) => void): void {
  const part = createEmptyPart();
  mutate(part);
  $part.set(part);
}

/** The +1 m world-X nudge every case performs. */
function nudgeXByOne(): void {
  applySelectionTransform('nudge', (current: PlacementTransform) =>
    translatedTransform(current, { x: 1, y: 0, z: 0 }),
  );
}

function near(a: number, b: number): void {
  expect(a).toBeCloseTo(b, 10);
}

beforeEach(() => {
  newPart();
  localStorage.clear();
  $colliderEditContext.set({});
});

describe('owner-frame lift', () => {
  it('nudges an owned collider along PART X even when the owner is rotated 90° about Y', () => {
    setPart((part) => {
      part.placements.push(
        placement({ instanceId: 'hull_1', rotation: { x: 0, y: HALF_PI, z: 0 } }),
      );
      part.colliders.push(
        collider({ ownerTemplateId: 'Core.Hull', position: { x: 0.5, y: 0, z: 0 } }),
      );
    });
    const before = liftedSelectionRefs();
    expect(before).toHaveLength(0); // nothing selected yet

    select([{ kind: 'collider', id: '_collider1' }]);
    const lifted = liftedSelectionRefs()[0].transform.position;
    // The owner's 90° Y turn maps the collider's local +X onto world −Z.
    near(lifted.x, 0);
    near(lifted.z, -0.5);

    nudgeXByOne();

    const stored = $part.get().colliders[0];
    const owner = $part.get().placements[0];
    const world = colliderWorld(stored, owner).position;
    near(world.x, lifted.x + 1);
    near(world.y, lifted.y);
    near(world.z, lifted.z);
    // ... which in the OWNER's frame is a move along local −Z, not local +X.
    near(stored.position.x, 0.5);
    near(stored.position.z, 1);
  });

  it('nudges an owned light along PART X under a scaled owner (scale hits the offset only)', () => {
    setPart((part) => {
      part.placements.push(
        placement({
          instanceId: 'hull_1',
          rotation: { x: 0, y: HALF_PI, z: 0 },
          scale: { x: 2, y: 2, z: 2 },
        }),
      );
      part.lights.push(light({ ownerTemplateId: 'Core.Hull', position: { x: 0.5, y: 0, z: 0 } }));
    });
    select([{ kind: 'light', id: '_light1' }]);

    const lifted = liftedSelectionRefs()[0].transform.position;
    // lightWorld scales the offset (unlike a collider): 0.5 × 2 = 1 m, turned onto −Z.
    near(lifted.x, 0);
    near(lifted.z, -1);

    nudgeXByOne();

    const stored = $part.get().lights[0];
    const owner = $part.get().placements[0];
    const world = lightWorld(stored, owner);
    near(world.position.x, 1);
    near(world.position.z, -1);
    // Owner-local: the world +1 m X came back divided by the owner's scale.
    near(stored.position.x, 0.5);
    near(stored.position.z, 0.5);
  });

  it('uses the edit-context instance when the owner template is placed more than once', () => {
    setPart((part) => {
      part.placements.push(placement({ instanceId: 'hull_1', position: { x: 0, y: 0, z: 0 } }));
      part.placements.push(placement({ instanceId: 'hull_2', position: { x: 10, y: 0, z: 0 } }));
      part.colliders.push(collider({ ownerTemplateId: 'Core.Hull' }));
    });
    select([{ kind: 'collider', id: '_collider1' }]);
    near(liftedSelectionRefs()[0].transform.position.x, 0);

    $colliderEditContext.set({ _collider1: 1 });
    near(liftedSelectionRefs()[0].transform.position.x, 10);

    // Out-of-range context clamps to the last instance rather than dropping the frame.
    $colliderEditContext.set({ _collider1: 99 });
    near(liftedSelectionRefs()[0].transform.position.x, 10);
  });

  it('leaves part-level entities exactly as they were stored', () => {
    setPart((part) => {
      part.placements.push(placement({ instanceId: 'hull_1' }));
      part.colliders.push(collider({ position: { x: 3, y: 0, z: 0 } }));
      part.lights.push(light({ position: { x: 0, y: 4, z: 0 } }));
    });
    select([
      { kind: 'subpart', id: 'hull_1' },
      { kind: 'collider', id: '_collider1' },
      { kind: 'light', id: '_light1' },
    ]);
    const lifted = liftedSelectionRefs();
    expect(lifted.map((r) => r.transform.position)).toEqual([
      { x: 0, y: 0, z: 0 },
      { x: 3, y: 0, z: 0 },
      { x: 0, y: 4, z: 0 },
    ]);

    nudgeXByOne();
    const part = $part.get();
    near(part.placements[0].position.x, 1);
    near(part.colliders[0].position.x, 4);
    near(part.lights[0].position.x, 1);
  });

  it('is a whole-selection no-op — and pushes no undo — when any layer is locked', () => {
    setPart((part) => {
      part.placements.push(placement({ instanceId: 'hull_1' }));
    });
    select([{ kind: 'subpart', id: 'hull_1' }]);
    setLayerLocked(DEFAULT_LAYER_ID, true);

    nudgeXByOne();

    expect($part.get().placements[0].position).toEqual({ x: 0, y: 0, z: 0 });
    expect($canUndo.get()).toBe(false);
    setLayerLocked(DEFAULT_LAYER_ID, false);
  });
});
