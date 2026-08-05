import { $chainSession, closeChain, openChain } from '../../state/chainStore';
import { $part, $selection } from '../../state/editorStore';
import { isLayerLocked } from '../../state/layerStore';
import { openDialog } from '../../state/dialogStore';
import { $mode, registerModeHooks, setMode } from '../../state/modeStore';
import { status } from '../../state/statusStore';

/**
 * Opens, re-seeds and closes an action-chain session over the current SubPart selection.
 *
 * The guards live here rather than in `chainStore` so the store stays free of UI
 * concerns: the store only knows how to hold a session, this decides whether starting one
 * makes sense. Every entry point — the `⇧⌘K` binding, the `chain.begin` command (and
 * therefore the ⌘K palette and the Edit menu) and the multi-select panel's Chain button —
 * routes through this file, so they can never disagree about what a legal session is.
 *
 * Only SubPart placements seed a chain (per-kind clone rules for connectors, colliders
 * and friends are deliberately out of scope), so a selection of other kinds reads as
 * "nothing to chain".
 *
 * Seeds are the selected placements' `instanceId`s in SELECTION order and are frozen
 * for the life of the session — changing the selection afterwards leaves the chain
 * alone, which is what lets the user keep working (and even nudge a seed) while the
 * preview follows. That non-modality is LOCKED (DECISIONS.md), which is exactly why every
 * exit below CONFIRMS instead of silently discarding a session that has steps.
 *
 * Refusals are status flashes, not toasts: a guard message is high-frequency posture
 * feedback and must never accrue in the notification center (design-system-services §2.2).
 */
function tryOpenChain(): void {
  const part = $part.get();
  // Selection ORDER is the seed order and is frozen at open (design-build-mode §9.1) —
  // the ordered `$selection` makes that exact.
  const placements = $selection.get().flatMap((ref) => {
    if (ref.kind !== 'subpart') return [];
    const placement = part.placements.find((p) => p.instanceId === ref.id);
    return placement ? [placement] : [];
  });

  if (placements.length === 0) {
    status('Select SubParts to chain', { severity: 'warning' });
    return;
  }
  // A chain would move or clone into a locked layer; every other transform tool refuses
  // the same way (see selectionTransform), so refuse at open instead of at Apply.
  if (placements.some((p) => isLayerLocked(p.layerId))) {
    status('Selection is on a locked layer', { severity: 'warning' });
    return;
  }

  openChain(placements.map((p) => p.instanceId));
}

/**
 * The `chain.begin` command's behavior (design: design-build-mode.md §9.1) — the v2
 * replacement for "⇧⌘K toggles", which used to throw away a 12-step session without a
 * word (census: chains-misc.md pain 7).
 *
 * - **from another mode**: switch to Build first (foundation §2.6 — the chain session is
 *   Build-only), then open;
 * - no session ⇒ open one over the selection (guards above);
 * - a session with NO steps ⇒ silently re-seed from the current selection;
 * - a session with ≥1 step ⇒ ask first (dialog id `'chain-discard-confirm'`, hosted by
 *   `DialogRoot`, which calls {@link discardChainAndRestart} on confirm).
 */
export function beginActionChain(): void {
  // Before anything else: the window, the ghosts and the Build-only focus slot all assume
  // Build. Doing it first also means the mode-exit hook below sees the session it is about
  // to be asked about, rather than one opened a line later.
  if ($mode.get() !== 'build') setMode('build');

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

/**
 * Cancel — the ✕, the footer Cancel button and Escape-ladder rung 6 all land here.
 * Confirm when there are steps (LOCKED), close silently when the session is empty.
 *
 * Cancelling is unconditionally document-safe: the session never touches `$part` and is
 * never in undo, so the confirm protects only the user's typing.
 */
export function cancelChainSession(): void {
  const session = $chainSession.get();
  if (session === null) return;
  if (session.ops.length === 0) {
    closeChain();
    return;
  }
  openDialog({ id: 'chain-discard-confirm', params: { steps: session.ops.length, close: true } });
}

/** Confirm handler for `'chain-discard-confirm'`: drop the session, re-seed from selection. */
export function discardChainAndRestart(): void {
  closeChain();
  tryOpenChain();
}

/** Confirm handler for the cancel/leave-Build flavours: drop the session, open nothing. */
export function discardChainSession(): void {
  closeChain();
}

/** Cancel handler for the leave-Build flavour: the chain stays, so the mode goes back. */
export function keepChainInBuild(): void {
  if ($mode.get() !== 'build') setMode('build');
}

/**
 * **Leaving Build with a session open** (foundation §2.6: "Build mode only; switching modes
 * with ≥1 step prompts the discard-confirm (LOCKED); an empty session closes silently").
 *
 * A mode-exit hook cannot veto the switch (`setMode` is a one-way choreography), so the
 * prompt resolves it afterwards: **Discard** drops the session and leaves you in the new
 * mode, **Cancel** puts you back in Build with the chain intact. Either answer restores the
 * invariant that a session only ever exists in Build.
 */
registerModeHooks('build', {
  onExit: () => {
    const session = $chainSession.get();
    if (session === null) return;
    if (session.ops.length === 0) {
      closeChain();
      return;
    }
    openDialog({
      id: 'chain-discard-confirm',
      params: { steps: session.ops.length, close: true, leavingBuild: true },
    });
  },
});
