/**
 * Detects an Apple platform so key chips render the platform-correct glyphs
 * (⌘ vs Ctrl). Guarded for non-browser/SSR contexts. `navigator.platform` is
 * deprecated but still the most reliable signal across current browsers, with
 * `userAgent` as a fallback.
 */
export const IS_APPLE: boolean =
  typeof navigator !== 'undefined' &&
  /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent || '');

/**
 * A display token rendered as a single <kbd> chip. `mod` is the platform-agnostic
 * "command-or-control" key (the one react-hotkeys-hook binds via the `mod` alias);
 * every other token renders verbatim. Resolved to a glyph/label at render time so
 * the registry stays platform-neutral.
 *
 * `alt` / `ctrl` / `meta` are the modifier-hint vocabulary (`modifierStore.ModifierHint.mod`
 * — the four physical flags an event carries). `meta` renders as **Ctrl** off Apple by
 * design (design-system-services §1.4 "⌘/Ctrl"): the gestures it labels accept ⌘ or ⌃, and
 * a Windows-key glyph would name a key none of them bind.
 */
export function keyLabel(token: string): string {
  if (token === 'mod' || token === 'meta') return IS_APPLE ? '⌘' : 'Ctrl';
  if (token === 'shift') return IS_APPLE ? '⇧' : 'Shift';
  if (token === 'alt') return IS_APPLE ? '⌥' : 'Alt';
  if (token === 'ctrl') return IS_APPLE ? '⌃' : 'Ctrl';
  return token;
}
