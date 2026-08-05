import { useHotkeys } from 'react-hotkeys-hook';
import { ALL_BINDINGS, isBindingActive, type HotkeyBinding } from './registry';
import { isTypingInField } from './typingGuard';

/**
 * Mounts every binding from the scoped registry. Rendered once near the app root.
 * Each binding gets its own child so `useHotkeys` is called unconditionally in a
 * stable order (Rules of Hooks), even though the binding list is a module constant.
 *
 * **Bindings stay MOUNTED; gating is data-driven** (design:
 * `plans/flexo_v2/design/design-system-services.md` §4.2). Nothing here re-renders when the
 * mode, the armed tool, the focused surface or the open dialog changes — the gate is a
 * predicate evaluated per keyboard event against the stores, so there is exactly one
 * listener per binding for the life of the app.
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
 * The gate, as react-hotkeys-hook's `ignoreEventWhen` rather than its `enabled` option.
 *
 * Both accept a per-event callback in 5.3.3, but the library applies `preventDefault`
 * BEFORE it consults `enabled` (`x(n, a, M.current), !S(n, a, j.current)` in its dispatch),
 * so a disabled binding would still swallow the browser's default action — a viewport ⌘C
 * eating a copy while a list has focus, say. `ignoreEventWhen` runs first and returns
 * before both, which is the behavior the scope model needs.
 *
 * The typing guard is folded in here for the same reason it was v1's shared
 * `ignoreEventWhen`: `enableOnFormTags` and `ignoreEventWhen` are independent options in
 * this library, so a binding that opts into firing while typing (the Escape ladder, which
 * re-applies the guard per rung) has to be exempted explicitly rather than by setting
 * `enableOnFormTags` alone.
 */
function isEventIgnored(binding: HotkeyBinding): boolean {
  if (!binding.options?.enableOnFormTags && isTypingInField()) return true;
  return !isBindingActive(binding);
}

function BindingMount({ binding }: { binding: HotkeyBinding }) {
  useHotkeys(binding.keys, (e) => binding.run(e), {
    preventDefault: true,
    ignoreEventWhen: () => isEventIgnored(binding),
    ...binding.options,
  });
  return null;
}
