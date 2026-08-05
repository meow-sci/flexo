import { atom } from 'nanostores';

/**
 * The **mode machine** (design: `plans/flexo_v2/design/foundation.md` §2; DECISIONS.md #1).
 * One atom for the editor's posture, one slot for the armed transient tool, and the single
 * place that runs mode-switch choreography.
 *
 * **Layering (constitution).** Zero react / three imports — plain atoms + plain functions,
 * callable from anywhere (`src/state/`, `src/ui/`, `src/three/`).
 *
 * **Undo enrollment: NONE, ever.** A mode switch touches no document state, so it must
 * never create an undo step (foundation §2.3 "Mode switches are never undo steps", §13).
 * The choreography below is likewise forbidden from touching `$part`, undo history, the
 * selection, the camera, layer view state or the active layer.
 *
 * **Who owns what.** Per-mode SUB-state (`$activeAnimationId`/`$activeJointId`,
 * `$activeEngineEntry`, the future `$dataScope`, the picked surface mesh) stays in the
 * feature store that owns it — that is what makes it survive a round trip out of a mode and
 * back (foundation §2.4). This module orchestrates those stores through the hook registries
 * only; it never imports them (they import IT, for `$mode` + hook registration).
 *
 * **DEVIATION (logged)**: foundation §13's `modeStore` row lists "per-mode sub-state
 * re-exports clamped vs `$part`". Re-exporting the feature atoms from here would make
 * `modeStore ↔ animationStore/engineStore` a cycle. Sub-state stays in its owning store;
 * the semantics are identical.
 */

export type Mode = 'build' | 'animation' | 'data' | 'engine' | 'surface';

export type Tool = 'measure' | 'seat-view' | 'exhaust' | 'marquee' | 'member-paint' | 'pivot-pick';

/**
 * Every tool id, for the consumers that must ENUMERATE them rather than switch on one — the
 * hotkey registry's conflict validator walks `tool:*` scopes, and the Help dialog groups by
 * them. Kept beside the type so the two can never disagree.
 */
export const TOOLS: readonly Tool[] = [
  'measure',
  'seat-view',
  'exhaust',
  'marquee',
  'member-paint',
  'pivot-pick',
];

/**
 * The five modes in switcher/palette/status-menu display order, with their labels. ONE
 * dataset (foundation Law 4) — the menubar switcher, the status-bar chip, the phone mode
 * sheet and the palette's "Modes" section all render from this, and the `mode.<id>`
 * commands are keyed off the same ids.
 *
 * Labels only: icons are a UI concern and live in `src/ui/status/statusTokens.ts`.
 */
export const MODES: readonly { id: Mode; label: string }[] = [
  { id: 'build', label: 'Build' },
  { id: 'animation', label: 'Animation' },
  { id: 'data', label: 'Data' },
  { id: 'engine', label: 'Engine' },
  { id: 'surface', label: 'Surface' },
];

/**
 * The active mode. **Ephemeral** — boots to `'build'` on every reload, like the v1 sidebar
 * mode atom it replaces. Never persisted, never undoable (foundation §2.1).
 */
export const $mode = atom<Mode>('build');

/**
 * The single-slot transient pointer tool (foundation §2.6). Arming one **cancels** the
 * previous — tools layer on top of modes and never co-exist with each other. The action
 * chain session is deliberately NOT in this slot: it is a parallel, non-modal session that
 * legitimately co-exists with a tool (LOCKED).
 *
 * The slot is created here; the tools themselves route through it in later phases
 * (measure / seat-view / exhaust, then marquee / member-paint / pivot-pick).
 */
export const $activeTool = atom<Tool | null>(null);

// ── mode enter/exit hooks ────────────────────────────────────────────────────

export interface ModeHooks {
  /** Runs AFTER `$mode` is set to this mode. `payload` = cross-mode jump context (§2.5). */
  onEnter?: (payload?: unknown) => void;
  /** Runs BEFORE `$mode` leaves this mode. */
  onExit?: () => void;
}

const modeHooks = new Map<Mode, ModeHooks[]>();

/**
 * Registers one area's entry/exit choreography for `mode`. Called at module scope by the
 * store that owns the behavior (animationStore, engineStore, …) or from boot wiring; hooks
 * accumulate, and there is deliberately no unregister — registrations live for the session.
 */
export function registerModeHooks(mode: Mode, hooks: ModeHooks): void {
  const existing = modeHooks.get(mode);
  if (existing) existing.push(hooks);
  else modeHooks.set(mode, [hooks]);
}

/**
 * Runs every hook, isolating failures: a broken area hook must never strand the UI halfway
 * between two modes.
 */
function runHooks(mode: Mode, phase: 'onEnter' | 'onExit', payload?: unknown): void {
  for (const hooks of modeHooks.get(mode) ?? []) {
    try {
      if (phase === 'onEnter') hooks.onEnter?.(payload);
      else hooks.onExit?.();
    } catch (err) {
      console.error(`flexo: mode ${phase} hook failed for '${mode}'`, err);
    }
  }
}

// ── the transient tool slot ──────────────────────────────────────────────────

export interface ToolDef {
  /** Modes this tool may be armed in; `undefined` = all modes. */
  allowedModes?: Mode[];
  /**
   * Seat view survives mode switches (foundation §2.6 row 2 — it is a camera state, not a
   * mode-local affordance); everything else is cancelled by a switch.
   */
  survivesModeSwitch?: boolean;
  /** Tears the tool's own feature-store state down. MUST be idempotent. */
  onCancel?: () => void;
}

const toolDefs = new Map<Tool, ToolDef>();

/** Declares a tool's mode rules + teardown. Registered at module scope by the tool's owner. */
export function registerTool(tool: Tool, def: ToolDef): void {
  toolDefs.set(tool, def);
}

function toolAllowedIn(tool: Tool, mode: Mode): boolean {
  const allowed = toolDefs.get(tool)?.allowedModes;
  return !allowed || allowed.includes(mode);
}

function cancelArmedTool(): void {
  const current = $activeTool.get();
  if (!current) return;
  try {
    toolDefs.get(current)?.onCancel?.();
  } catch (err) {
    console.error(`flexo: tool cancel failed for '${current}'`, err);
  }
  $activeTool.set(null);
}

/**
 * Arms `tool`, cancelling whatever occupied the slot (the single-slot invariant). A tool
 * whose `allowedModes` exclude the current mode is refused — the caller is responsible for
 * switching modes first (`setMode` then `armTool`).
 */
export function armTool(tool: Tool): void {
  if ($activeTool.get() === tool) return;
  if (!toolAllowedIn(tool, $mode.get())) return;
  cancelArmedTool();
  $activeTool.set(tool);
}

/**
 * Disarms the armed tool, running its `onCancel`. With `tool` given it is a no-op unless
 * that exact tool holds the slot, so a tool can safely disarm itself without stomping a
 * successor that already took over.
 */
export function disarmTool(tool?: Tool): void {
  const current = $activeTool.get();
  if (!current || (tool && current !== tool)) return;
  cancelArmedTool();
}

// ── the choreography point ───────────────────────────────────────────────────

/** Reentrancy guard: choreography is strictly single-entry (see {@link setMode}). */
let switching = false;

/**
 * **THE single mode-switch choreography point** (foundation §2.3): no component ever sets
 * other stores as a side effect of switching. Order:
 *
 * 1. no-op when already in `next`;
 * 2. run the OUTGOING mode's exit hooks;
 * 3. cancel the armed tool unless its def says `survivesModeSwitch` (and the new mode
 *    still allows it);
 * 4. set `$mode`;
 * 5. run the INCOMING mode's enter hooks with `payload` (the cross-mode jump context, §2.5).
 *
 * **Never touches** the document, `$part`, undo history, the selection, the camera, layer
 * view state or the active layer — and is never an undo step.
 */
export function setMode(next: Mode, payload?: unknown): void {
  if ($mode.get() === next) return;
  if (switching) {
    // A hook that switches modes again would interleave two choreographies and leave the
    // stores in an order-dependent state. Warn rather than throw: every hook call is
    // already wrapped in try/catch, so a throw here would be swallowed and invisible.
    console.error(`flexo: setMode('${next}') called re-entrantly from a mode hook — ignored`);
    return;
  }

  switching = true;
  try {
    const previous = $mode.get();
    runHooks(previous, 'onExit');

    const tool = $activeTool.get();
    if (tool) {
      const def = toolDefs.get(tool);
      if (!def?.survivesModeSwitch || !toolAllowedIn(tool, next)) cancelArmedTool();
    }

    $mode.set(next);
    runHooks(next, 'onEnter', payload);
  } finally {
    switching = false;
  }
}

/**
 * Project load/switch: the mode returns to Build and the tool slot is cleared (foundation
 * §2.4). Called by `projectStore.applyProjectSnapshot`; the chain session and open dialogs
 * are closed by their own owners at the same site.
 */
export function resetModeForProjectLoad(): void {
  disarmTool();
  if ($mode.get() !== 'build') setMode('build');
}
