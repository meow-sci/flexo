/**
 * The two focus questions the scoped registry asks before it lets a binding fire
 * (design: `plans/flexo_v2/design/design-system-services.md` §4.3, §4.2).
 *
 * Lifted out of `GlobalHotkeys.tsx` so the Escape ladder can re-apply the same typing guard
 * per rung without importing a component module. {@link isTypingInField} is PRESERVED
 * VERBATIM from v1 — it is a subtle, load-bearing fix (census: ui-kit-hotkeys.md §1.3, §5).
 */

/**
 * True when the *real* focus owner is a text-editable field. react-hotkeys-hook's
 * `enableOnFormTags: false` already suppresses hotkeys for focused form fields, but
 * it decides that from the keyboard event's `target`. react-aria's Autocomplete (the
 * searchable `Select`) types with "virtual focus": it stops the input's own keydown
 * and re-dispatches a synthetic `KeyboardEvent` on the listbox, whose target is a
 * `<div role="listbox">` — not a form tag — so those leak through and WASD/Delete fire
 * while you're searching. `document.activeElement` still points at the search `<input>`,
 * so gate on that instead. Covers any react-aria virtual-focus widget, not just this one.
 */
export function isTypingInField(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * The roles a react-aria collection or menu surface puts on (or around) the focused
 * element. Focus inside one means arrow keys, letters and Delete belong to ROW NAVIGATION,
 * not to the viewport.
 */
const COLLECTION_ROLES =
  '[role="grid"],[role="gridcell"],[role="row"],[role="listbox"],[role="option"],' +
  '[role="menu"],[role="menubar"],[role="menuitem"],[role="tree"],[role="treeitem"],' +
  '[role="tab"],[role="tablist"]';

/**
 * True when focus sits inside an interactive collection / menu surface — the second half of
 * the **viewport** scope condition (foundation §11.1: "focus is not inside an interactive
 * react-aria collection/menu surface"). This is what keeps the bare spatial letters and the
 * arrow keys from fighting a focused list's own row navigation.
 *
 * It is a live DOM question, not store state, which is why it lives here and not in
 * `hotkeyStore`'s `$activeScopes`.
 */
export function isInteractiveCollectionFocus(): boolean {
  const el = document.activeElement as HTMLElement | null;
  return el?.closest?.(COLLECTION_ROLES) != null;
}
