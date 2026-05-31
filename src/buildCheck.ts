import { atom } from 'nanostores'

const STORAGE_KEY = 'flexo_build_id'

/** True when a prod build ID mismatch is detected on startup. */
export const $buildMismatch = atom(false)

/**
 * On prod builds: compare the embedded VITE_BUILD_ID against the last-seen
 * value in localStorage. If they differ, sets $buildMismatch so the UI can
 * prompt the user to reset their data.
 *
 * Skipped entirely in dev (import.meta.env.DEV).
 */
export function checkBuildId(): void {
  if (import.meta.env.DEV) return

  const current = import.meta.env.VITE_BUILD_ID
  if (!current) return

  const previous = localStorage.getItem(STORAGE_KEY)
  localStorage.setItem(STORAGE_KEY, current)

  if (previous !== null && previous !== current) {
    $buildMismatch.set(true)
  }
}
