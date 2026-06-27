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
 * Session-only flag: suppress the first-use auto-open for this page load. Set at boot
 * when the app is launched from a `?load=` share link — opening someone's shared project
 * shouldn't be interrupted by the intro overlay, and (unlike a normal first visit) we
 * deliberately leave {@link $aboutSeen} untouched so the intro still shows on the user's
 * next ordinary visit. Not persisted; in-memory only.
 */
let suppressFirstUse = false

/** Suppress the About first-use auto-open for this session (see {@link suppressFirstUse}). */
export function suppressAboutFirstUse(): void {
  suppressFirstUse = true
}

/**
 * Open the About overlay exactly once — the first time the app is used — then
 * remember that so it never auto-opens again (until storage is reset). Marking it
 * seen up front keeps this idempotent under React Strict Mode's double-invoked effects.
 *
 * No-op when {@link suppressAboutFirstUse} was called this session (share-link launch):
 * neither opens the overlay nor marks it seen.
 */
export function showAboutOnFirstUse(): void {
  if (suppressFirstUse) return
  if ($aboutSeen.get()) return
  $aboutSeen.set(true)
  $aboutOpen.set(true)
}
