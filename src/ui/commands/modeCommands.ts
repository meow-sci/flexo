import type { Command } from '../../state/commandStore';
import { $mode, MODES, setMode } from '../../state/modeStore';
import { enterEngineMode } from '../../state/engineStore';

/**
 * The five mode switches (design: foundation §2, LOCKED #1). They are not MenuSpec items —
 * the menubar renders them as the centered mode switcher and the palette lists them in its
 * "Modes" section — but they are ordinary commands so every surface that switches modes
 * (switcher, status chip, phone sheet, palette, and the `1`–`5` chords) shares ONE dataset.
 *
 * The ids are canonical and registered exactly once: to change what a mode switch DOES,
 * re-point the `run` below — never register a second command with the same id
 * (`registerCommand` throws on a duplicate).
 *
 * Engine goes through `enterEngineMode()` rather than `setMode('engine')` so the designer
 * re-opens on its retained engine entry; every other mode is a plain switch. Leaving Engine
 * needs no special casing — the exhaust-gizmo teardown is a registered mode exit hook, so
 * it runs on every route out (engineStore).
 *
 * Undo enrollment: NONE — mode is view state (foundation §13).
 */
export const MODE_COMMANDS: Command[] = MODES.map((mode) => ({
  id: `mode.${mode.id}`,
  // The palette's phrasing (design: system-services §3.2). Surfaces that render a mode
  // ROW — the switcher chips, the status-chip menu, the phone sheet — use `MODES[].label`
  // instead, so the bare name shows where the context already says "mode".
  title: `Go to ${mode.label} mode`,
  menuPath: 'Mode',
  keywords: `mode switch ${mode.label.toLowerCase()}`,
  checked: () => $mode.get() === mode.id,
  run: () => {
    if (mode.id === 'engine') enterEngineMode();
    else setMode(mode.id);
  },
}));
