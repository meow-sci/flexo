import type { Command } from '../../state/commandStore';
import { $interimMode, INTERIM_MODES, setInterimMode } from './interimMode';

/**
 * The five mode switches (design: foundation §2, LOCKED #1). They are not MenuSpec items —
 * the menubar renders them as the centered mode switcher and the palette lists them in its
 * empty state — but they are ordinary commands so all three surfaces share one dataset.
 *
 * **INTERIM wiring**: `setInterimMode` maps onto v1's `$inspectorMode`. The mode phase
 * deletes `interimMode.ts` and RE-POINTS these five `run`/`enabled`/`checked` at
 * `modeStore.setMode` — the ids below are canonical and must not be re-registered
 * (`registerCommand` throws on a duplicate id). Their `1`–`5` chords are scope-sensitive
 * and land with the scoped registry, not here.
 */
export const MODE_COMMANDS: Command[] = INTERIM_MODES.map((mode) => ({
  id: `mode.${mode.id}`,
  title: mode.label,
  menuPath: 'Mode',
  keywords: `mode switch ${mode.label.toLowerCase()}`,
  // Data and Surface have no mode to switch to yet: they render disabled, never hidden.
  enabled: () => mode.available,
  ...(mode.available ? {} : { disabledReason: `${mode.label} mode arrives with its own phase` }),
  checked: () => $interimMode.get() === mode.id,
  run: () => setInterimMode(mode.id),
}));
