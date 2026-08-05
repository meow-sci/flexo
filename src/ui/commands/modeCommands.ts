import type { Command } from '../../state/commandStore';
import { $mode, MODES, setMode } from '../../state/modeStore';

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
 * Every mode is a plain `setMode`, Engine included: restoring the designer's retained engine
 * entry is Engine mode's own ENTRY HOOK (`initEngineMode`), not a special caller — which is
 * what makes `4`, the switcher, the status chip and the palette land in the same place. The
 * exit side needs no case either: `setMode` cancels the exhaust tool through its `registerTool`
 * def and `EditorScene` disposes the nozzle handles on `$mode`.
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
  run: () => setMode(mode.id),
}));
