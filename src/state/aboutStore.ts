import { atom } from 'nanostores'
import { persistentJSON } from '@nanostores/persistent'

/**
 * Ephemeral open/closed state for the "About" overlay. Lives in a store (not React
 * local state) so it can be opened from several disconnected places — the desktop
 * overflow menu and the mobile overflow menu — without threading props or lifting
 * state. Not persisted. Mirrors {@link ../state/helpStore}.
 */
export const $aboutOpen = atom(false)

/**
 * Persisted flag: has the About overlay been auto-shown at least once? Drives the
 * "show on first use" behaviour ({@link showAboutOnFirstUse}). Stored in localStorage,
 * so it's wiped — and the intro shows again — when "Reset Everything" clears storage
 * (see {@link ../ui/nukeAndReload}).
 */
export const $aboutSeen = persistentJSON<boolean>('flexo:aboutSeen', false)

export function openAbout(): void {
  $aboutOpen.set(true)
}

export function closeAbout(): void {
  $aboutOpen.set(false)
}

/**
 * Open the About overlay exactly once — the first time the app is used — then
 * remember that so it never auto-opens again (until storage is reset). Marking it
 * seen up front keeps this idempotent under React Strict Mode's double-invoked effects.
 */
export function showAboutOnFirstUse(): void {
  if ($aboutSeen.get()) return
  $aboutSeen.set(true)
  $aboutOpen.set(true)
}
