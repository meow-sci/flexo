import { useSyncExternalStore } from 'react';

/**
 * Phones are < 640px wide (Tailwind's `sm`) — **or short and touch-driven**, which is the
 * same phone rotated.
 *
 * The second arm exists because the width-only test sent a landscape phone into the DESKTOP
 * shell, and the desktop shell does not fit there. It needs ~880px (left sidebar 300 + the
 * viewport cell's 240px minimum + right sidebar 340), so at 844×390 the right sidebar renders
 * PAST the window edge inside a `fixed inset-0` frame with nothing to scroll: 11 controls
 * unreachable on an iPhone 14, 23 on an SE — including the Outliner search and every layer's
 * hide / lock / opacity / ⋮, which is the only touch route to Rename, Duplicate, Delete and
 * Move Layer. Rotating also unmounted any open phone sheet and swapped the mode tabs for a
 * menubar advertising ⌘K.
 *
 * `pointer: coarse` is what keeps this off desktops — a 1400×450 browser window stays on the
 * desktop shell. The 520px height bound is what keeps it off tablets: a landscape phone is
 * 375–430px tall (SE 375, 14 → 390, Pro Max 430) while the shortest iPad orientation is 820.
 */
const QUERY = '(max-width: 639px), ((max-height: 520px) and (pointer: coarse))';

function matches(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(QUERY).matches;
}

function subscribe(callback: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

/** True on phone-sized viewports. Drives the bottom-sheet / overflow layout. */
export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, matches, () => false);
}

/**
 * The same test for code that is not a React component — command `run`/`enabled` bodies and
 * store actions, which need it to decide whether to also open a phone sheet. Read it at call
 * time; never cache it, since a rotation flips it.
 */
export function isPhoneViewport(): boolean {
  return matches();
}
