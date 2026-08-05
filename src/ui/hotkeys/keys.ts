import type { Keys } from 'react-hotkeys-hook';
import type { Mode, Tool } from '../../state/modeStore';
import type { SurfaceId } from '../../state/hotkeyStore';

/**
 * Scope vocabulary + key-string normalization for the scoped hotkey registry (design:
 * `plans/flexo_v2/design/foundation.md` §11.1; `design-system-services.md` §4.1/§4.2).
 *
 * Its own module so both `registry.ts` (precedence) and `validateRegistry.ts` (conflict
 * detection) can use it without importing each other.
 */

/**
 * Where a binding is allowed to fire. One string per binding — the registry never
 * enumerates conditions, it asks whether this string is in `hotkeyStore.$activeScopes`.
 */
export type Scope =
  | 'global'
  | 'viewport'
  | `mode:${Mode}`
  | `tool:${Tool}`
  | `surface:${SurfaceId}`;

/**
 * Precedence on conflict: **surface > tool > mode > viewport > global** (foundation §11.1).
 * Two bindings that share a key and can be active together are resolved by this rank —
 * a timeline-focused `←` beats the viewport nudge arrow without a preventDefault fight.
 */
export function scopeRank(scope: Scope): number {
  if (scope === 'global') return 0;
  if (scope === 'viewport') return 1;
  if (scope.startsWith('mode:')) return 2;
  if (scope.startsWith('tool:')) return 3;
  return 4; // surface:*
}

const MODIFIER_TOKENS: ReadonlySet<string> = new Set(['mod', 'meta', 'ctrl', 'alt', 'shift']);

/**
 * Spelling variants react-hotkeys-hook accepts, folded to one token each so
 * `['up']` and `['arrowup']` can never look like two different bindings to the validator.
 */
const ALIASES: Readonly<Record<string, string>> = {
  cmd: 'meta',
  command: 'meta',
  control: 'ctrl',
  option: 'alt',
  esc: 'escape',
  del: 'delete',
  return: 'enter',
  up: 'arrowup',
  down: 'arrowdown',
  left: 'arrowleft',
  right: 'arrowright',
  spacebar: 'space',
};

/**
 * One binding's key string(s) as a canonical, comparable list: lowercased, alias-folded,
 * `,`-alternatives split out, and modifier tokens sorted so `mod+shift+z` ≡ `shift+mod+z`.
 *
 * `,` is the library's own alternatives delimiter, which is why a literal comma key is
 * written `'mod+comma'` (as the Settings binding does) rather than `'mod+,'`.
 */
export function normalizeKeys(keys: Keys): string[] {
  const raw = typeof keys === 'string' ? [keys] : [...keys];
  return raw
    .flatMap((entry) => entry.split(','))
    .map(normalizeChord)
    .filter((chord) => chord.length > 0);
}

function normalizeChord(chord: string): string {
  const tokens = chord
    .split('+')
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 0)
    .map((token) => ALIASES[token] ?? token);
  const modifiers = tokens.filter((token) => MODIFIER_TOKENS.has(token)).sort();
  const rest = tokens.filter((token) => !MODIFIER_TOKENS.has(token)).sort();
  return [...modifiers, ...rest].join('+');
}

/** True for a chord that is a single unmodified letter or digit (the C5-fix assertion). */
export function isBareLetterOrDigit(chord: string): boolean {
  return /^[a-z0-9]$/.test(chord);
}
