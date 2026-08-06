import type { KittenInstance, SubPartPlacement } from '../ksa/types';
import type { LayerViewState } from '../state/layerStore';
import type { InactivePartDoc } from '../state/partsStore';

/**
 * The inclusion rules for GHOST rendering, as a pure function of one inactive part's parked
 * document (`plans/MULTI_PART_PLAN.md` Phase 5). Renderer-free on purpose — no three.js here —
 * so "what shows up in a ghost" is unit-testable without a WebGL context.
 *
 * A ghost draws an inactive part's SUBPART PLACEMENTS and KITTENS with real geometry and real
 * materials, and deliberately excludes every piece of editor furniture: connectors, colliders,
 * IVA seats, light markers, joint markers and aids are the active part's authoring surface, not
 * a scale reference. It honors the part's OWN parked `layerView` (hidden layers stay hidden,
 * per-layer opacity multiplies in) and ignores the global interior/kind-visibility toggles,
 * which belong to the active part.
 */
export interface GhostItemPlan {
  kind: 'placement' | 'kitten';
  placement?: SubPartPlacement;
  kitten?: KittenInstance;
  /** That layer's opacity (default 1), multiplied into the part's own ghost opacity. */
  layerFactor: number;
}

/**
 * The layer's ghost opacity factor, or `null` when the layer is hidden in THIS part's view
 * state. A layer with no stored state is visible at full opacity, matching `DEFAULT_LAYER_STATE`.
 */
function layerFactorFor(layerView: Record<string, LayerViewState>, layerId: string): number | null {
  const state = layerView[layerId];
  if (state?.visible === false) return null;
  return state?.opacity ?? 1;
}

/** Which entities of an inactive part render as ghost, honoring the part's OWN layerView. */
export function planGhostItems(doc: InactivePartDoc): GhostItemPlan[] {
  const items: GhostItemPlan[] = [];
  for (const placement of doc.part.placements) {
    const layerFactor = layerFactorFor(doc.layerView, placement.layerId);
    if (layerFactor === null) continue;
    items.push({ kind: 'placement', placement, layerFactor });
  }
  // Kittens live on the built-in KITTEN_LAYER_ID, so the identical check applies — hiding the
  // Kittens layer in that part hides its ghost kittens too.
  for (const kitten of doc.part.kittens) {
    const layerFactor = layerFactorFor(doc.layerView, kitten.layerId);
    if (layerFactor === null) continue;
    items.push({ kind: 'kitten', kitten, layerFactor });
  }
  return items;
}
