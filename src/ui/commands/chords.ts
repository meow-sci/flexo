import { ALL_BINDINGS } from '../hotkeys/registry';

/**
 * The ONE way any surface looks up a keyboard chord (design: foundation §4 — "Menu items
 * look up their shortcut chip in the hotkey registry by commandId — labels can never drift
 * from bindings"; Law 4).
 *
 * Menu shortcut chips, palette rows and status-bar key hints all call this, so a rebind in
 * the registry moves every chip with it and nothing has to be kept in sync by hand.
 *
 * Returns display-token chords (`[['mod','K']]` — `keyLabel` resolves ⌘ vs Ctrl at render),
 * or `null` when the command has no binding. Several bindings are deliberately unbound for
 * now: the viewport-scoped commands (`select.*`, `view.frameSelection`, `tool.*`, `1`–`5`)
 * get their chords when the scoped registry lands, and this function's SIGNATURE is what
 * survives that swap.
 */
export function chordsFor(commandId: string): string[][] | null {
  const binding = ALL_BINDINGS.find((b) => b.id === commandId);
  return binding ? binding.chords : null;
}
