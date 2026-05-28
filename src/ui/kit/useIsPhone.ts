import { useSyncExternalStore } from 'react'

// Matches Tailwind's `sm` breakpoint: phones are < 640px.
const QUERY = '(max-width: 639px)'

function subscribe(callback: () => void) {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener('change', callback)
  return () => mql.removeEventListener('change', callback)
}

/** True on phone-sized viewports. Drives the bottom-sheet / overflow layout. */
export function useIsPhone(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  )
}
