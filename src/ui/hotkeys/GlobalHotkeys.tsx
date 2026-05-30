import { useHotkeys } from 'react-hotkeys-hook'
import { ALL_BINDINGS, type HotkeyBinding } from './registry'

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
  )
}

function BindingMount({ binding }: { binding: HotkeyBinding }) {
  useHotkeys(binding.keys, (e) => binding.run(e), { preventDefault: true, ...binding.options })
  return null
}
