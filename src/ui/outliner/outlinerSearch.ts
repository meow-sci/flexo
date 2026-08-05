import { atom } from 'nanostores';

/**
 * The `⌘F` → "expand and focus the Outliner's search field" intent (design:
 * design-build-mode.md §2.5).
 *
 * A nonce, not a boolean: the hotkey fires from `src/ui/hotkeys/registry.ts`, which cannot
 * hold a ref to a component, and re-pressing ⌘F while the field already has focus must
 * still re-select its text. {@link OutlinerPanel} subscribes and acts on every increment.
 *
 * Ephemeral view state: never persisted, never an undo step. No react import, so the
 * registry can bump it from module scope.
 */
export const $outlinerSearchFocus = atom(0);

/** Requests focus for the Outliner's search field. Safe to call when no panel is mounted. */
export function focusOutlinerSearch(): void {
  $outlinerSearchFocus.set($outlinerSearchFocus.get() + 1);
}
