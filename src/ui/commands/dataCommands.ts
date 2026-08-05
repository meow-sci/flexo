import type { Command } from '../../state/commandStore';
import { openDialog } from '../../state/dialogStore';

/**
 * Part-level GameData commands.
 *
 * **Palette-only, deliberately** (design: foundation §3 has no Part Data item — Data mode
 * replaces the dialog wholesale in its own phase). The v1 toolbar button was Part Data's
 * primary entry point and died with the toolbar, so parity demands a discoverable home now:
 * this command is that home until Data mode exists. It is intentionally absent from
 * `MENU_SPEC` — inventing a menubar placement the authoritative tree does not have would be
 * a tree change, not a parity fix.
 *
 * Undo enrollment: NONE — opening a dialog is not a document mutation. `PartDataDialog`
 * itself pushes undo on field focus (see the `setPartId` note in `editorStore.ts`).
 */
export const DATA_COMMANDS: Command[] = [
  {
    id: 'data.partData',
    title: 'Part Data…',
    keywords: 'gamedata tanks mass part data drag resources',
    run: () => openDialog({ id: 'part-data' }),
  },
];
