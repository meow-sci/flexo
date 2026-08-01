import { useHotkeys } from 'react-hotkeys-hook';
import { ALL_BINDINGS, type HotkeyBinding } from './registry';

/**
 * Mounts every global hotkey from the registry. Rendered once near the app root.
 * Each binding gets its own child so `useHotkeys` is called unconditionally in a
 * stable order (Rules of Hooks), even though the binding list is a module constant.
 *
 * react-hotkeys-hook disables hotkeys while a form element is focused by default
 * (`enableOnFormTags: false`), so WASD / Delete / ⌘Z don't hijack typing in the
 * inspector's text and number fields, and the browser's native field-level undo
 * keeps working.
 */
export function GlobalHotkeys() {
  return (
    <>
      {ALL_BINDINGS.map((binding) => (
        <BindingMount key={binding.id} binding={binding} />
      ))}
    </>
  );
}

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
function isTypingInField(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function BindingMount({ binding }: { binding: HotkeyBinding }) {
  useHotkeys(binding.keys, (e) => binding.run(e), {
    preventDefault: true,
    ignoreEventWhen: isTypingInField,
    ...binding.options,
  });
  return null;
}
