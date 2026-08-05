import { atom, computed } from 'nanostores';
import { $activeTool, $mode } from './modeStore';
import { $chainSession } from './chainStore';
import { $openDialog } from './dialogStore';
import { $paletteOpen } from './commandStore';

/**
 * The data layer the **scoped hotkey registry** gates on (design:
 * `plans/flexo_v2/design/foundation.md` §11.1; `design-system-services.md` §4.2): which
 * surface owns focus, and which scopes are therefore active right now.
 *
 * v1 had no scoping at all — every binding was global and each one hand-gated inside its
 * own `run` (census: ui-kit-hotkeys.md §1.3, pain 1). v2 turns that into data: a binding
 * declares ONE scope string, and `GlobalHotkeys` enables it iff that string is in
 * {@link $activeScopes}.
 *
 * **Layering (constitution).** Zero react / three imports. The DOM listener installed by
 * {@link initHotkeyStore} is the one exception the store layer already makes for
 * `modifierStore` — a window-level input listener, not a component.
 *
 * **Undo enrollment: NONE.** Focus and scope state are ephemeral view state (foundation
 * §13); nothing here is persisted either.
 */

/**
 * Every surface that can own the `surface:*` scope. A surface stamps `data-surface="<id>"`
 * on its root element and the focusin listener below resolves it; the ids are closed on
 * purpose so a typo in a stamp reads as "no surface" rather than minting a scope no binding
 * can ever name.
 *
 * Stamped today: `chain` (the action-chain card), `palette` (the ⌘K dialog body). The rest
 * stamp when their surface is built (timeline: Animation phase; outliner/data-navigator/
 * engine-tree/members/glow-paint: their own mode phases).
 */
export const SURFACE_IDS = [
  'chain',
  'palette',
  'timeline',
  'outliner',
  'data-navigator',
  'engine-tree',
  'members',
  'glow-paint',
] as const;

export type SurfaceId = (typeof SURFACE_IDS)[number];

const SURFACE_ID_SET: ReadonlySet<string> = new Set(SURFACE_IDS);

/**
 * The surface that currently owns keyboard focus, or null when focus sits on the viewport
 * host, the body or plain chrome. Maintained by {@link initHotkeyStore}'s focusin/focusout
 * listeners — never written by components.
 */
export const $focusedSurface = atom<SurfaceId | null>(null);

/**
 * True while ANY overlay is up: a root-hosted dialog or the command palette. The palette is
 * not a `dialogStore` dialog (it owns its own atom), but it suppresses the viewport exactly
 * the same way, so scope activation asks this one question.
 */
export const $dialogOpen = computed(
  [$openDialog, $paletteOpen],
  (dialog, palette) => dialog !== null || palette,
);

/**
 * The active scope set — the single input to every binding's enabled predicate.
 *
 * - `global` is ALWAYS present: dialogs suppress the viewport, not global (v1 parity —
 *   ⌘Z must keep working with a dialog open). The typing guard, not this set, is what
 *   silences global bindings while a field has focus.
 * - `viewport` drops out while an overlay is up. The *other* half of the viewport
 *   condition — focus not inside an interactive react-aria collection — is a live DOM
 *   question rather than store state, so it is applied at dispatch time by
 *   `isInteractiveCollectionFocus()` (`src/ui/hotkeys/typingGuard.ts`).
 * - `surface:chain` is active while the chain SESSION exists, not only while its window has
 *   focus (design §4.2): the chain card is deliberately non-modal, and ⌘↩/Esc must reach it
 *   from the viewport mid-drag.
 *
 * Duplicate adds are harmless by construction (a focused surface and the chain session can
 * name the same scope) — it is a `Set`.
 */
export const $activeScopes = computed(
  [$mode, $activeTool, $chainSession, $focusedSurface, $dialogOpen],
  (mode, tool, chain, surface, dialogOpen): ReadonlySet<string> => {
    const scopes = new Set<string>(['global']);
    if (!dialogOpen) scopes.add('viewport');
    scopes.add(`mode:${mode}`);
    if (tool) scopes.add(`tool:${tool}`);
    if (surface) scopes.add(`surface:${surface}`);
    if (chain) scopes.add('surface:chain');
    return scopes;
  },
);

/** Resolves an element to the surface it lives in, or null. */
function surfaceOf(target: EventTarget | null): SurfaceId | null {
  const element = target as Element | null;
  const host = element?.closest?.('[data-surface]');
  const id = host?.getAttribute('data-surface') ?? null;
  return id !== null && SURFACE_ID_SET.has(id) ? (id as SurfaceId) : null;
}

function onFocusIn(event: FocusEvent): void {
  $focusedSurface.set(surfaceOf(event.target));
}

function onFocusOut(): void {
  // Deferred: `focusout` fires BEFORE the new element takes focus, so moving between two
  // controls of one surface would otherwise flap the atom to null and back. A microtask
  // later `document.activeElement` is already the new owner (or `<body>` when focus really
  // did leave), which is the honest answer.
  queueMicrotask(() => {
    $focusedSurface.set(surfaceOf(document.activeElement));
  });
}

let listening = false;

/**
 * Installs the focus tracking. Idempotent — StrictMode's double boot and a hot reload are
 * both harmless (the same guard `initModifierListeners` / `initToolStatusWiring` use). The
 * listeners are never removed: focus tracking lives for the life of the app.
 */
export function initHotkeyStore(): void {
  if (listening) return;
  listening = true;
  document.addEventListener('focusin', onFocusIn);
  document.addEventListener('focusout', onFocusOut);
}
