import { ALL_BINDINGS } from '../hotkeys/registry';
import { escRungs } from '../hotkeys/escLadder';

/**
 * The ONE way any surface looks up a keyboard chord (design: foundation §4 — "Menu items
 * look up their shortcut chip in the hotkey registry by commandId — labels can never drift
 * from bindings"; Law 4; design-system-services §4.7).
 *
 * Menu shortcut chips, palette rows and status-bar key hints all call this, so a rebind in
 * the registry moves every chip with it and nothing has to be kept in sync by hand.
 *
 * Returns display-token chords (`[['mod','K']]` — `keyLabel` resolves ⌘ vs Ctrl at render),
 * or `null` when the command has no binding. Several commands are deliberately unbound for
 * now: the viewport-scoped `select.*` family and the mode digits get their chords in the
 * binding-table wave.
 *
 * **Escape rungs count as bindings here.** Escape is a single registry binding running the
 * ordered ladder, so a rung's action (Exit Seat View, say) would otherwise lose the `Esc`
 * chip its menu item showed in v1. Looking the rung up by id restores it from the same
 * single source of truth.
 */
export function chordsFor(commandId: string): string[][] | null {
  const binding = ALL_BINDINGS.find((b) => b.id === commandId);
  if (binding) return binding.chords;
  const rung = escRungs().find((r) => r.id === commandId);
  return rung ? [['Escape']] : null;
}
