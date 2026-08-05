import { computed } from 'nanostores';
import { $inspectorMode, setInspectorMode } from '../../state/uiStore';
import { enterEngineMode, exitEngineMode } from '../../state/engineStore';

/**
 * **INTERIM — delete this file when `modeStore` lands.**
 *
 * The five v2 modes (design: `plans/flexo_v2/design/foundation.md` §2) mapped onto the v1
 * three-way `$inspectorMode`, so the menubar mode switcher, the status-bar mode chip and
 * the `mode.*` commands all share ONE mapping while the real mode machine is still
 * unbuilt.
 *
 * **How the mode-machine phase retires this**: delete this file and RE-POINT the existing
 * `mode.*` commands in `src/ui/commands/modeCommands.ts` at `modeStore.setMode` — the
 * command ids stay exactly as they are (`registerCommand` throws on a duplicate id, so
 * re-registering them is not an option), and the ModeSwitcher / status chip swap
 * `$interimMode` → `$mode` and `INTERIM_MODES` → the real mode table. Nothing else imports
 * this module; keep it that way.
 *
 * Ephemeral and not undoable, exactly like the `$inspectorMode` it wraps (v1 parity: mode
 * resets to Build on reload).
 */

export type InterimMode = 'build' | 'animation' | 'data' | 'engine' | 'surface';

/**
 * The switcher's five chips in display order. `available: false` renders the chip
 * DISABLED (never hidden) — Data and Surface have no mode to switch to until their own
 * phases build them.
 */
export const INTERIM_MODES: { id: InterimMode; label: string; available: boolean }[] = [
  { id: 'build', label: 'Build', available: true },
  { id: 'animation', label: 'Animation', available: true },
  { id: 'data', label: 'Data', available: false },
  { id: 'engine', label: 'Engine', available: true },
  { id: 'surface', label: 'Surface', available: false },
];

/** The current mode, projected from v1's `$inspectorMode` ('assets' ⇒ Build). */
export const $interimMode = computed(
  $inspectorMode,
  (mode): InterimMode => (mode === 'anim' ? 'animation' : mode === 'engine' ? 'engine' : 'build'),
);

/**
 * Switches mode. Entering Engine goes through `enterEngineMode()` so the designer keeps
 * its active-engine entry; LEAVING Engine must go through `exitEngineMode()` so the
 * exhaust gizmo is disarmed (a v1 invariant — see `exitEngineMode` in
 * `src/state/engineStore.ts`). Unavailable modes (data/surface) fall through to Build,
 * matching their disabled chips.
 */
export function setInterimMode(mode: InterimMode): void {
  if (mode === 'engine') {
    enterEngineMode();
    return;
  }
  if ($inspectorMode.get() === 'engine') exitEngineMode();
  setInspectorMode(mode === 'animation' ? 'anim' : 'assets');
}
