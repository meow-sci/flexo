import { $chainSession, closeChain, openChain } from '../../state/chainStore';
import { $part, $selection } from '../../state/editorStore';
import { isLayerLocked } from '../../state/layerStore';
import { openDialog } from '../../state/dialogStore';
import { $mode, registerModeHooks, setMode } from '../../state/modeStore';
import { status } from '../../state/statusStore';

/** Shared selection guard for the command, inspector buttons, and session opener. */
export function chainSelectionError(): string | null {
  const selection = $selection.get();
  if (selection.length === 0) return 'Select SubParts or colliders to chain';
  const kind = selection[0].kind;
  if ((kind !== 'subpart' && kind !== 'collider') || selection.some((ref) => ref.kind !== kind)) {
    return 'Select only SubParts or only colliders to chain';
  }
  const part = $part.get();
  const seeds = selection.map((ref) =>
    kind === 'collider'
      ? part.colliders.find((c) => c.id === ref.id)
      : part.placements.find((p) => p.instanceId === ref.id),
  );
  if (seeds.some((seed) => !seed)) return 'Seeds no longer exist';
  if (seeds.some((seed) => seed && isLayerLocked(seed.layerId))) {
    return 'Selection is on a locked layer';
  }
  if (kind === 'collider') {
    const owners = new Set(
      selection.map((ref) => part.colliders.find((c) => c.id === ref.id)!.ownerTemplateId),
    );
    if (owners.size !== 1) return 'Select colliders with the same owner';
  }
  return null;
}

/** Freeze a homogeneous selection in its common Part or owner-local frame. */
function tryOpenChain(): void {
  const error = chainSelectionError();
  if (error) {
    status(error, { severity: 'warning' });
    return;
  }
  const selection = $selection.get();
  openChain(
    selection.map((ref) => ref.id),
    selection[0].kind === 'collider' ? 'collider' : 'subpart',
  );
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
