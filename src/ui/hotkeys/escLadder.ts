import { $openDialog } from '../../state/dialogStore';
import { isTypingInField } from './typingGuard';

/**
 * **The Escape ladder** — one ordered dispatcher for a key that eight different things want
 * (design: `plans/flexo_v2/design/foundation.md` §11.4, the single documented order;
 * `design-system-services.md` §4.6, ownership + preventDefault table).
 *
 * v1 layered Escape by convention: a registry binding for seat view, a local `useHotkeys`
 * pair in the chain palette, a raw `window` keydown listener in the animation panel, and a
 * comment in each explaining why it didn't collide with the others (census:
 * ui-kit-hotkeys.md §1.3, §5). All three are gone; each is a rung below.
 *
 * The nine rungs, top wins, each firing only if the previous did not:
 *
 * | # | Rung | Owner |
 * |---|---|---|
 * | 1 | numeric-field dirty revert | `useNumberDraft`, field-local (preventDefault + stopPropagation only when dirty) |
 * | 2 | popover / menu / dialog-view / dialog dismiss | react-aria + the kit `DialogViewStack` |
 * | 3 | command palette close | registered rung |
 * | 4 | gizmo drag cancel | registered rung (`TransformControls.reset()`) |
 * | 5 | armed transient tool cancel | registered rung |
 * | 6 | chain session cancel | registered rung (**never** preventDefault — v1 contract) |
 * | 7 | animation unwind: keyframe → joint | registered rung |
 * | 8 | seat view exit | registered rung (**never** preventDefault — v1 contract) |
 * | 9 | nothing | Escape never clears the selection and is never globally preventDefault'ed |
 *
 * Rungs 1 and 2 are not registered here and cannot be: they run inside the field / the
 * react-aria overlay before this dispatcher ever sees the event. {@link dispatchEsc} detects
 * them instead — rung 1 by `defaultPrevented`, rung 2 by an open dialog — which is what
 * keeps a dirty numeric field's revert from ALSO cancelling the chain session behind it, and
 * a dismissed discard-confirm from throwing away the very session it protects.
 *
 * **Undo enrollment: NONE.** Every rung cancels ephemeral state.
 */

export interface EscRung {
  /** Position in the ladder above. Unique — {@link registerEscRung} throws otherwise. */
  rung: number;
  /** Command-style id, for Help's "What Esc does, in order" list. */
  id: string;
  /** Help row text. */
  label: string;
  /** Applicability — a cheap store predicate. */
  when: () => boolean;
  run: () => void;
  /** Per-rung contract (rungs 6 and 8 are `false`, preserved from v1). */
  preventDefault: boolean;
  /** Rung 6: the chain cancels from inside its own text fields (v1 `enableOnFormTags`). */
  enableWhileTyping?: boolean;
}

const rungs: EscRung[] = [];

/**
 * Registers one rung, keeping the list sorted by {@link EscRung.rung}. Registration is a
 * module-scope act (see `registry.ts`); a duplicate rung number means two features silently
 * competing for the same position, so it throws.
 */
export function registerEscRung(rung: EscRung): void {
  if (rungs.some((existing) => existing.rung === rung.rung)) {
    throw new Error(`escLadder: duplicate Esc rung ${rung.rung} ("${rung.id}")`);
  }
  rungs.push(rung);
  rungs.sort((a, b) => a.rung - b.rung);
}

/** The registered rungs in ladder order (Help renders these; the validator asserts them). */
export function escRungs(): readonly EscRung[] {
  return rungs;
}

/**
 * Runs the ladder for one Escape press. Mounted as the single `esc.ladder` registry
 * binding, which sets `preventDefault: false` so each rung can honor its own contract.
 */
export function dispatchEsc(event: KeyboardEvent): void {
  // Rung 1 (numberDraft's dirty revert) and rung 2 (react-aria's popover/menu/dialog
  // dismiss, the kit DialogViewStack's view pop) both preventDefault what they consume, so
  // a defaulted-prevented event means something above already won.
  if (event.defaultPrevented) return;

  // Rung 2, the half that leaves no trace on the event: an overlay dialog is up but its
  // Escape landed somewhere react-aria did not preventDefault. The dialog still owns the
  // key — no flexo rung may fire underneath it. (The ⌘K palette is NOT an `$openDialog`
  // dialog; it is rung 3 below.)
  if ($openDialog.get() !== null) return;

  for (const rung of rungs) {
    if (!rung.enableWhileTyping && isTypingInField()) continue;
    if (!rung.when()) continue;
    if (rung.preventDefault) event.preventDefault();
    rung.run();
    return;
  }

  // Rung 9: nothing. Escape never clears the selection and the event is left untouched.
}
