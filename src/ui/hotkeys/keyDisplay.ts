/**
 * Detects an Apple platform so key chips render the platform-correct glyphs
 * (⌘ vs Ctrl). Guarded for non-browser/SSR contexts. `navigator.platform` is
 * deprecated but still the most reliable signal across current browsers, with
 * `userAgent` as a fallback.
 */
export const IS_APPLE: boolean =
  typeof navigator !== 'undefined' &&
  /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent || '')

/**
 * A display token rendered as a single <kbd> chip. `mod` is the platform-agnostic
 * "command-or-control" key (the one react-hotkeys-hook binds via the `mod` alias);
 * every other token renders verbatim. Resolved to a glyph/label at render time so
 * the registry stays platform-neutral.
 */
export function keyLabel(token: string): string {
  if (token === 'mod') return IS_APPLE ? '⌘' : 'Ctrl'
  if (token === 'shift') return IS_APPLE ? '⇧' : 'Shift'
  return token
}
