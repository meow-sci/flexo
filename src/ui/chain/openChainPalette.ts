import { $chainSession, closeChain, openChain } from '../../state/chainStore';
import { $part, $selectedIndices } from '../../state/editorStore';
import { isLayerLocked } from '../../state/layerStore';
import { toast } from '../kit';

/**
 * Opens (or cancels) an action-chain session over the current SubPart selection.
 *
 * The guards live here rather than in `chainStore` so the store stays free of UI
 * concerns (toasts): the store only knows how to hold a session, this decides whether
 * starting one makes sense. Both entry points — the `mod+K` binding and the selection
 * toolbar's Chain button — route through this single function, so they can never
 * disagree about what a legal session is.
 *
 * Only SubPart placements seed a chain (per-kind clone rules for connectors, colliders
 * and friends are deliberately out of scope), so a selection of other kinds reads as
 * "nothing to chain".
 *
 * Seeds are the selected placements' `instanceId`s in SELECTION order and are frozen
 * for the life of the session — changing the selection afterwards leaves the chain
 * alone, which is what lets the user keep working (and even nudge a seed) while the
 * preview follows.
 */
export function toggleChainPalette(): void {
  if ($chainSession.get() !== null) {
    closeChain();
    return;
  }

  const part = $part.get();
  const placements = $selectedIndices
    .get()
    .filter((i) => i >= 0 && i < part.placements.length)
    .map((i) => part.placements[i]);

  if (placements.length === 0) {
    toast({ title: 'Select SubParts to chain', variant: 'warning' });
    return;
  }
  // A chain would move or clone into a locked layer; every other transform tool refuses
  // the same way (see selectionTransform), so refuse at open instead of at Apply.
  if (placements.some((p) => isLayerLocked(p.layerId))) {
    toast({ title: 'Selection is on a locked layer', variant: 'warning' });
    return;
  }

  openChain(placements.map((p) => p.instanceId));
}
