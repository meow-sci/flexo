import { atom } from 'nanostores'

/**
 * Ephemeral open/closed state for the keyboard-shortcuts help overlay. Lives in a
 * store (not React local state) so it can be opened from several disconnected
 * places — the global `?` hotkey, the Settings dialog, the mobile overflow menu —
 * without threading props or lifting state. Not persisted.
 */
export const $helpOpen = atom(false)

export function openHelp(): void {
  $helpOpen.set(true)
}

export function closeHelp(): void {
  $helpOpen.set(false)
}

export function toggleHelp(): void {
  $helpOpen.set(!$helpOpen.get())
}
