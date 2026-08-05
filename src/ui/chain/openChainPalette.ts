import { $chainSession, closeChain, openChain } from '../../state/chainStore';
import { $part, $selectedIndices } from '../../state/editorStore';
import { isLayerLocked } from '../../state/layerStore';
import { openDialog } from '../../state/dialogStore';
import { toast } from '../toast';

/**
 * Opens an action-chain session over the current SubPart selection.
 *
 * The guards live here rather than in `chainStore` so the store stays free of UI
 * concerns (toasts): the store only knows how to hold a session, this decides whether
 * starting one makes sense. Every entry point — the `⇧⌘K` binding, the `chain.begin`
 * command (and therefore the ⌘K palette) and the selection toolbar's Chain button —
 * routes through this file, so they can never disagree about what a legal session is.
 *
 * Only SubPart placements seed a chain (per-kind clone rules for connectors, colliders
 * and friends are deliberately out of scope), so a selection of other kinds reads as
 * "nothing to chain".
 *
 * Seeds are the selected placements' `instanceId`s in SELECTION order and are frozen
 * for the life of the session — changing the selection afterwards leaves the chain
 * alone, which is what lets the user keep working (and even nudge a seed) while the
 * preview follows. That non-modality is LOCKED (DECISIONS.md), which is exactly why
 * {@link beginActionChain} confirms instead of silently discarding a session with steps.
 */
function tryOpenChain(): void {
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

/**
 * The `chain.begin` command's behavior (design: design-system-services.md §3.5) — the v2
 * replacement for "⇧⌘K toggles", which used to throw away a 12-step session without a
 * word (census: chains-misc.md).
 *
 * - no session ⇒ open one over the selection (guards above);
 * - a session with NO steps ⇒ silently re-seed from the current selection;
 * - a session with ≥1 step ⇒ ask first (dialog id `'chain-discard-confirm'`, hosted by
 *   `DialogRoot`, which calls {@link discardChainAndRestart} on confirm).
 */
export function beginActionChain(): void {
  const session = $chainSession.get();
  if (session === null) {
    tryOpenChain();
    return;
  }
  if (session.ops.length === 0) {
    closeChain();
    tryOpenChain();
    return;
  }
  openDialog({ id: 'chain-discard-confirm', params: { steps: session.ops.length } });
}

/** Confirm handler for `'chain-discard-confirm'`: drop the session, re-seed from selection. */
export function discardChainAndRestart(): void {
  closeChain();
  tryOpenChain();
}

/**
 * v1 toggle semantics, still used by the SelectionToolbar's Chain button until the
 * Build-mode rework replaces that toolbar. Prefer {@link beginActionChain}.
 */
export function toggleChainPalette(): void {
  if ($chainSession.get() !== null) {
    closeChain();
    return;
  }
  tryOpenChain();
}
