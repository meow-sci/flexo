import {
  $part,
  $selection,
  clearSelection,
  KIND_ORDER,
  select,
  type SelectionRef,
} from './editorStore';
import { isLayerListed, isLayerLocked, isLayerVisible } from './layerStore';

/**
 * The Select-menu bulk operations (design: foundation §3 "Select"; design-build-mode.md
 * §1.1 `selectAll()` / `invertSelection()`).
 *
 * **Why its own module**: `layerStore` already imports `editorStore` (for `deselectLayer`),
 * so anything needing BOTH — and layer eligibility does — cannot live in `editorStore`
 * without closing a module cycle. Zero react / three imports, like every `src/state/`
 * module.
 *
 * **Undo enrollment: NONE.** Selection is view state (editorStore's invariant block).
 */

/**
 * Layers whose entities may be swept up in bulk: **listed AND visible AND unlocked**.
 *
 * - *locked* is the hard guard — a locked layer's entities must never end up under the
 *   gizmo (`setLayerLocked` prunes them from the selection for the same reason);
 * - *hidden* matches the 3D "hidden ⇒ unselectable" invariant every click path enforces,
 *   and v1's own list select-all (`if (s.locked || s.hidden) continue`);
 * - *unlisted* means the user has hidden the layer from the entity list, so a blind
 *   select-all should not drag it back in.
 *
 * Read live on every call — a layer unlocked mid-session is eligible immediately.
 */
function eligibleLayer(layerId: string): boolean {
  return isLayerListed(layerId) && isLayerVisible(layerId) && !isLayerLocked(layerId);
}

/** Every entity on an eligible layer, in the fixed kind order. */
function allEligibleRefs(): SelectionRef[] {
  const part = $part.get();
  const refs: SelectionRef[] = [];
  for (const kind of KIND_ORDER) {
    switch (kind) {
      case 'subpart':
        for (const p of part.placements)
          if (eligibleLayer(p.layerId)) refs.push({ kind, id: p.instanceId });
        break;
      case 'connector':
        for (const c of part.connectors)
          if (eligibleLayer(c.layerId)) refs.push({ kind, id: c.id });
        break;
      case 'collider':
        for (const c of part.colliders) if (eligibleLayer(c.layerId)) refs.push({ kind, id: c.id });
        break;
      case 'ivaSeat':
        for (const s of part.ivaSeats) if (eligibleLayer(s.layerId)) refs.push({ kind, id: s.id });
        break;
      case 'kitten':
        for (const k of part.kittens) if (eligibleLayer(k.layerId)) refs.push({ kind, id: k.id });
        break;
      case 'light':
        for (const l of part.lights) if (eligibleLayer(l.layerId)) refs.push({ kind, id: l.id });
        break;
    }
  }
  return refs;
}

/** Select ▸ All — every entity on listed, visible, unlocked layers. */
export function selectAll(): void {
  select(allEligibleRefs());
}

/**
 * Select ▸ Invert — the complement WITHIN the {@link selectAll} population, so inverting
 * an empty selection selects everything eligible and inverting that clears it. Entities on
 * ineligible layers are never pulled in, and one already selected there is dropped (it can
 * only have got there before the layer was locked/hidden).
 */
export function invertSelection(): void {
  const current = new Set($selection.get().map((r) => `${r.kind}:${r.id}`));
  select(allEligibleRefs().filter((r) => !current.has(`${r.kind}:${r.id}`)));
}

/** Select ▸ Deselect. */
export function deselectAll(): void {
  clearSelection();
}

/** True when the document holds at least one entity — the All/Invert enabled predicate. */
export function hasAnyEntity(): boolean {
  const part = $part.get();
  return (
    part.placements.length > 0 ||
    part.connectors.length > 0 ||
    part.colliders.length > 0 ||
    part.ivaSeats.length > 0 ||
    part.kittens.length > 0 ||
    part.lights.length > 0
  );
}
