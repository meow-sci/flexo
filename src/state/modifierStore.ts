import { atom, computed } from 'nanostores';
import { $hasSelection } from './selectors';
import { $openDialog } from './dialogStore';

/**
 * Live modifier-key tracking and the status bar's modifier-hint pipeline (design:
 * `plans/flexo_v2/design/design-system-services.md` §1.4; foundation §5 segment 7, §13
 * modifierStore row).
 *
 * The point: flexo's power gestures (⌥-drag duplicate, ⇧ add-to-selection, ⌃ snap invert)
 * are invisible in v1. The status bar shows what the keys you are HOLDING — or could hold
 * — would do right now, for the surface under the pointer.
 *
 * **Layering (constitution)**: zero react / three imports; the listeners are plain DOM.
 * **Undo enrollment: NONE. Persistence: NONE** — entirely ephemeral (foundation §13).
 */

export interface HeldModifiers {
  alt: boolean;
  shift: boolean;
  ctrl: boolean;
  meta: boolean;
}

const NONE_HELD: HeldModifiers = { alt: false, shift: false, ctrl: false, meta: false };

/** Which modifiers are physically down right now. */
export const $heldModifiers = atom<HeldModifiers>(NONE_HELD);

/**
 * Coarse regions only — set by `pointerenter`/`pointerleave` on the hosting surfaces, NOT
 * per-row. A hint provider keys off this to say what a modifier means *here*.
 */
export type HoverContext =
  | 'none'
  | 'viewport'
  | 'viewport-entity'
  | 'gizmo'
  | 'timeline-track'
  | 'timeline-key'
  | 'outliner-row'
  | 'list';

export const $hoverContext = atom<HoverContext>('none');

export function setHoverContext(ctx: HoverContext): void {
  if ($hoverContext.get() !== ctx) $hoverContext.set(ctx);
}

// ─────────────────────────────────────────────────────────────────────────────
// Held-key tracking
// ─────────────────────────────────────────────────────────────────────────────

/** Every event we read is only ever asked for its four modifier flags. */
interface ModifierFlags {
  altKey: boolean;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

/**
 * Diff-before-set: writes the atom ONLY when a flag actually changed, which keeps React
 * churn at exactly zero while typing or mousing normally (design §1.4).
 */
function applyFlags(e: ModifierFlags): void {
  const held = $heldModifiers.get();
  if (
    held.alt === e.altKey &&
    held.shift === e.shiftKey &&
    held.ctrl === e.ctrlKey &&
    held.meta === e.metaKey
  ) {
    return;
  }
  $heldModifiers.set({ alt: e.altKey, shift: e.shiftKey, ctrl: e.ctrlKey, meta: e.metaKey });
}

function resetHeld(): void {
  applyFlags({ altKey: false, shiftKey: false, ctrlKey: false, metaKey: false });
}

/** Latest pointermove flags, applied once per animation frame. */
let pendingMove: ModifierFlags | null = null;
let moveFrame = 0;

function onPointerMove(e: PointerEvent): void {
  pendingMove = { altKey: e.altKey, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey };
  if (moveFrame !== 0) return;
  moveFrame = requestAnimationFrame(() => {
    moveFrame = 0;
    if (pendingMove) {
      applyFlags(pendingMove);
      pendingMove = null;
    }
  });
}

function onModifierEvent(e: Event): void {
  applyFlags(e as unknown as ModifierFlags);
}

function onVisibilityChange(): void {
  if (document.visibilityState === 'hidden') resetHeld();
}

let listenersInstalled = false;

/**
 * Installs the window listeners. Idempotent (StrictMode double-invoke safe); called once
 * from boot in `src/main.tsx`.
 *
 * The contract, verbatim from design §1.4:
 * - Capture-phase, **passive** listeners on `window`. Every handler reads ONLY the event's
 *   modifier FLAGS, never key identity — so a right-hand ⌥ and a left-hand ⌥ are the same
 *   thing and no `location` handling is needed.
 * - **Mouse events are the correction channel**: on macOS, while ⌘ is held the `keyup` for
 *   other keys is suppressed, and ⌘-tabbing away loses the ⌘ `keyup` entirely. Pointer and
 *   wheel events re-sync the truth on the next movement.
 * - `blur` / `visibilitychange`→hidden reset all four: we cannot know what was released
 *   while unfocused. On `focus` we deliberately do NOT guess — flags stay false until the
 *   next event that carries them, so hints under-show rather than lie.
 * - We never `preventDefault` a bare Alt keydown/keyup here: Windows browsers focus their
 *   menu bar on Alt keyUP, and swallowing it globally breaks that a11y path. The
 *   ⌥-drag-duplicate gesture consumes Alt inside its own pointer handlers only.
 */
export function initModifierListeners(): void {
  if (listenersInstalled) return;
  listenersInstalled = true;

  const options = { capture: true, passive: true } as const;
  window.addEventListener('keydown', onModifierEvent, options);
  window.addEventListener('keyup', onModifierEvent, options);
  window.addEventListener('pointerdown', onModifierEvent, options);
  window.addEventListener('pointermove', onPointerMove, options);
  window.addEventListener('pointerup', onModifierEvent, options);
  window.addEventListener('wheel', onModifierEvent, options);
  window.addEventListener('blur', resetHeld);
  document.addEventListener('visibilitychange', onVisibilityChange);
}

// ─────────────────────────────────────────────────────────────────────────────
// Hint pipeline
// ─────────────────────────────────────────────────────────────────────────────

/** One "holding this key would do that" line. */
export interface ModifierHint {
  /**
   * Which held modifier brightens the row. `'none'` is for a live gesture that has NO
   * modifier key — the pose gizmo's per-gesture `X`/`Y`/`Z` axis lock (design-animation-mode
   * §9.2) is one, and the roster's rule is that only real gestures may be advertised, so the
   * segment has to be able to say it without inventing a modifier for it.
   */
  mod: keyof HeldModifiers | 'none';
  /** Key tokens rendered instead of the modifier glyph. Required when `mod === 'none'`. */
  keys?: string[];
  label: string;
  /** Ascending — the segment renders the lowest few. */
  priority: number;
}

/** What a provider gets to decide with. */
export interface HintContext {
  hover: HoverContext;
  hasSelection: boolean;
  dialogOpen: boolean;
}

export type HintProvider = (ctx: HintContext) => ModifierHint[];

const providers = new Map<string, HintProvider>();

/**
 * Registry nonce. `$modifierHints` is a `computed`, so it only recomputes when a DEPENDENCY
 * changes — a provider registered after the first read would otherwise stay invisible
 * until the hover context next flipped. Bumping this atom on registration makes the
 * registry itself a dependency, which is the honest fix (the plan sanctions exactly this
 * over silently living with the staleness).
 */
const $providerNonce = atom(0);

/**
 * Registers a hint provider — hints are registered DATA, not components, so a feature can
 * teach the status bar about its gestures without importing any UI (design §1.4).
 *
 * Re-registering an id REPLACES it (unlike `commandStore.registerCommand`, which throws):
 * hint ids are internal, and replacement is what keeps a hot-reloaded feature module from
 * throwing on its second evaluation.
 */
export function registerModifierHints(id: string, fn: HintProvider): void {
  providers.set(id, fn);
  $providerNonce.set($providerNonce.get() + 1);
}

/**
 * The hints for the current context, ascending by priority. The segment caps how many it
 * renders (design §1.4: up to 3) and brightens the ones whose modifier is HELD — held
 * state is a render concern, which is why `$heldModifiers` is deliberately NOT a
 * dependency here (the hint LIST does not change when you press a key).
 *
 * No hints while a dialog is open (design §1.4).
 */
export const $modifierHints = computed(
  [$hoverContext, $hasSelection, $openDialog, $providerNonce],
  // The nonce parameter is intentionally not read — its only job is to be a dependency.
  (hover, hasSelection, openDialog): ModifierHint[] => {
    if (openDialog) return [];
    const ctx: HintContext = { hover, hasSelection, dialogOpen: false };
    const hints: ModifierHint[] = [];
    for (const provider of providers.values()) hints.push(...provider(ctx));
    return hints.sort((a, b) => a.priority - b.priority);
  },
);
