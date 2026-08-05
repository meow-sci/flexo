import { persistentJSON } from '@nanostores/persistent';
import { openDialog } from './dialogStore';

/**
 * First-use bookkeeping for the "About" overlay. The overlay's own open/closed state
 * lives in `dialogStore` under the id `'about'` (foundation §10.1 — every dialog is
 * root-hosted and opened by writing `$openDialog`); what stays here is the persisted
 * "have we greeted this user yet" flag and the share-link suppression, both of which
 * are behaviour rather than open state.
 */

/**
 * Persisted flag: has the About overlay been auto-shown at least once? Drives the
 * "show on first use" behaviour ({@link showAboutOnFirstUse}). Stored in localStorage,
 * so it's wiped — and the intro shows again — when "Reset Everything" clears storage
 * (see {@link ../ui/nukeAndReload}).
 */
export const $aboutSeen = persistentJSON<boolean>('flexo:aboutSeen', false);

/**
 * Session-only flag: suppress the first-use auto-open for this page load. Set at boot
 * when the app is launched from a `?load=` share link — opening someone's shared project
 * shouldn't be interrupted by the intro overlay, and (unlike a normal first visit) we
 * deliberately leave {@link $aboutSeen} untouched so the intro still shows on the user's
 * next ordinary visit. Not persisted; in-memory only.
 */
let suppressFirstUse = false;

/** Suppress the About first-use auto-open for this session (see {@link suppressFirstUse}). */
export function suppressAboutFirstUse(): void {
  suppressFirstUse = true;
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
  if (suppressFirstUse) return;
  if ($aboutSeen.get()) return;
  $aboutSeen.set(true);
  openDialog({ id: 'about' });
}
