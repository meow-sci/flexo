import { describe, it, expect } from 'vitest';
import { planGhostItems } from './ghostPlan';
import {
  createEmptyPart,
  DEFAULT_LAYER_ID,
  IVA_SEAT_LAYER_ID,
  KITTEN_LAYER_ID,
  type EditingPart,
} from '../ksa/types';
import { DEFAULT_LAYER_STATE, type LayerViewState } from '../state/layerStore';
import type { InactivePartDoc } from '../state/partsStore';

/**
 * The ghost inclusion rules (MULTI_PART_PLAN.md P5.02). Pure planning — no WebGL, no scene —
 * so the two things that make a ghost wrong (drawing editor furniture, ignoring the part's OWN
 * layer view) are provable without a renderer.
 */

const WING_LAYER_ID = 'wings';

const zero = { x: 0, y: 0, z: 0 };
const one = { x: 1, y: 1, z: 1 };
const transform = { position: zero, rotation: zero, scale: one };

const view = (over: Partial<LayerViewState> = {}): LayerViewState => ({
  ...DEFAULT_LAYER_STATE,
  ...over,
});

/** A part carrying one of EVERY layered entity kind, so exclusions are observable. */
function partWithEverything(): EditingPart {
  return {
    ...createEmptyPart(),
    placements: [
      { ...transform, instanceId: 'hull_1', subPartTemplateId: 'Hull', layerId: DEFAULT_LAYER_ID },
      { ...transform, instanceId: 'fin_1', subPartTemplateId: 'Fin', layerId: WING_LAYER_ID },
    ],
    kittens: [{ ...transform, id: 'kitten_1', kind: 'hunter', layerId: KITTEN_LAYER_ID }],
    connectors: [
      {
        ...transform,
        id: '_connector1',
        flags: [],
        capabilities: [],
        siblingIds: [],
        layerId: DEFAULT_LAYER_ID,
      },
    ],
    colliders: [
      {
        ...transform,
        id: '_collider1',
        shape: 'Box',
        ownerTemplateId: null,
        layerId: DEFAULT_LAYER_ID,
      },
    ],
    ivaSeats: [{ ...transform, id: '_seat1', ksaId: null, layerId: IVA_SEAT_LAYER_ID }],
    lights: [
      {
        ...transform,
        id: '_light1',
        type: 'Spot',
        ownerTemplateId: null,
        rangeM: 10,
        intensity: 1,
        color: { r: 1, g: 1, b: 1 },
        innerAngleRad: 0.2,
        outerAngleRad: 0.5,
        rayTracing: false,
        layerId: DEFAULT_LAYER_ID,
      },
    ],
  };
}

function docWith(layerView: Record<string, LayerViewState> = {}): InactivePartDoc {
  return { part: partWithEverything(), layerView, activeLayerId: DEFAULT_LAYER_ID };
}

describe('planGhostItems', () => {
  it('includes placements and kittens ONLY — never connectors, colliders, seats or lights', () => {
    const items = planGhostItems(docWith());

    // Six layered entities in the document, three of them renderable as a ghost.
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.kind)).toEqual(['placement', 'placement', 'kitten']);
    expect(items.map((i) => i.placement?.instanceId ?? i.kitten?.id)).toEqual([
      'hull_1',
      'fin_1',
      'kitten_1',
    ]);
    // A placement plan carries no kitten and vice versa — the two are never conflated.
    expect(items.filter((i) => i.kind === 'placement').every((i) => !i.kitten)).toBe(true);
    expect(items.filter((i) => i.kind === 'kitten').every((i) => !i.placement)).toBe(true);
  });

  it('defaults every layer to visible at full opacity when the part stored no view state', () => {
    expect(planGhostItems(docWith()).every((i) => i.layerFactor === 1)).toBe(true);
  });

  it("excludes the placements of a layer hidden in THIS part's own view state", () => {
    const items = planGhostItems(docWith({ [WING_LAYER_ID]: view({ visible: false }) }));

    expect(items.map((i) => i.placement?.instanceId ?? i.kitten?.id)).toEqual([
      'hull_1',
      'kitten_1',
    ]);
  });

  it('flows per-layer opacity through as layerFactor, per layer', () => {
    const items = planGhostItems(
      docWith({
        [DEFAULT_LAYER_ID]: view({ opacity: 0.25 }),
        [WING_LAYER_ID]: view({ opacity: 0.5 }),
      }),
    );

    expect(items.map((i) => i.layerFactor)).toEqual([0.25, 0.5, 1]);
  });

  it('hides ghost kittens when the part hid its Kittens layer', () => {
    const items = planGhostItems(docWith({ [KITTEN_LAYER_ID]: view({ visible: false }) }));

    expect(items.map((i) => i.kind)).toEqual(['placement', 'placement']);
  });

  it('applies the Kittens layer opacity to kittens', () => {
    const items = planGhostItems(docWith({ [KITTEN_LAYER_ID]: view({ opacity: 0.4 }) }));

    expect(items.find((i) => i.kind === 'kitten')?.layerFactor).toBe(0.4);
  });
});
