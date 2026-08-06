import type { Command } from '../../state/commandStore';
import { openDialog } from '../../state/dialogStore';
import {
  $activePartId,
  $partEntries,
  createPart,
  duplicatePart,
  switchPart,
} from '../../state/partsStore';
import { toast } from '../toast';

/**
 * Part-registry commands — the ONE dataset behind the File ▸ part section, the PartSwitcher
 * popover's buttons, the ⌘K palette rows and the ⌥-chord hotkeys (plan:
 * `plans/MULTI_PART_PLAN.md` P4.01; shell law 1 "commands, not ad-hoc buttons").
 *
 * Thin dispatchers, like every other command module: each one either calls a `partsStore`
 * action or opens a root-hosted dialog by `dialogStore` id. **All user feedback lives here** —
 * `partsStore` is deliberately toast-free (it never imports `src/ui`), so a part action that
 * reports nothing is a bug in THIS file, not in the store.
 *
 * **Undo enrollment: NONE** (invariant I6): part create / duplicate / rename / delete / switch
 * are lifecycle + view state, never document mutations.
 */
export const PART_COMMANDS: Command[] = [
  {
    id: 'part.new',
    title: 'New Part',
    menuPath: 'File',
    keywords: 'part create add empty another',
    // Always enabled: a project can hold any number of parts.
    run: () => {
      const id = createPart();
      toast({ title: `New part: ${partName(id)}` });
    },
  },
  {
    id: 'part.duplicate',
    title: 'Duplicate Part',
    menuPath: 'File',
    keywords: 'part copy clone',
    // The one async registry action (the copy's custom assets are re-minted, blobs and all),
    // so the toast waits for the entry to exist. `null` ⇒ the source vanished mid-flight.
    run: () => {
      void duplicatePart($activePartId.get()).then((id) => {
        if (id) toast({ title: `Duplicated: ${partName(id)}` });
      });
    },
  },
  {
    id: 'part.rename',
    title: 'Rename Part…',
    menuPath: 'File',
    keywords: 'part name label title',
    // Targets the ACTIVE part — the dialog reads `$activePartMeta` itself, so there are no
    // params to go stale between the menu opening and the command running.
    run: () => openDialog({ id: 'part-rename' }),
  },
  {
    id: 'part.delete',
    title: 'Delete Part…',
    menuPath: 'File',
    keywords: 'part remove destroy',
    // A project always has at least one part; `deletePart` refuses too, authoritatively.
    enabled: () => $partEntries.get().length > 1,
    run: () => openDialog({ id: 'part-delete-confirm' }),
  },
  {
    id: 'part.next',
    title: 'Next Part',
    // Palette-only, so NO `menuPath` (same idiom as `data.scopePart`): `File ▸ Switch Part`
    // holds the provider rows and nothing else, which is what lets it hide itself in a
    // single-part project — a `menuPath` naming it would only mis-subtitle the palette row.
    keywords: 'part switch cycle forward next',
    enabled: () => $partEntries.get().length > 1,
    run: () => cycleActivePart(1),
  },
  {
    id: 'part.prev',
    title: 'Previous Part',
    // Palette-only — see `part.next`.
    keywords: 'part switch cycle back previous prior',
    enabled: () => $partEntries.get().length > 1,
    run: () => cycleActivePart(-1),
  },
];

/**
 * `File ▸ Switch Part ▸` — one row per part, the palette's part switcher, and the reason the
 * submenu hides itself in a single-part project (the renderer drops an empty submenu, so the
 * empty array IS the hide). Same idiom as `customMeshInstanceCommands`.
 *
 * Rows are minted from the live registry on every menu open / palette keystroke, so the titles
 * and the ✓ always describe the current state.
 */
export function partSwitchCommands(): Command[] {
  const entries = $partEntries.get();
  // One part = nothing to switch to. Hiding beats a permanently-checked single row.
  if (entries.length < 2) return [];
  return entries.map((entry) => ({
    id: `part:switch:${entry.id}`,
    title: `Switch to part: ${entry.name}`,
    menuPath: 'File ▸ Switch Part',
    keywords: 'part switch activate edit',
    checked: () => entry.id === $activePartId.get(),
    run: () => activatePart(entry.id),
  }));
}

/**
 * Positional activation, for the `⌥1`…`⌥9` chords (P4.05): slot `index` in `$partEntries`
 * order, or nothing at all when the project holds fewer parts than that.
 *
 * It lives HERE rather than in the hotkey registry because the toast is the command layer's
 * job (this module's header rule) — the chords are just another surface onto the same
 * switch-and-report as the `File ▸ Switch Part` rows.
 */
export function activatePartAtIndex(index: number): void {
  const entry = $partEntries.get()[index];
  if (entry) activatePart(entry.id);
}

/** The display name of a part entry — for feedback only, never an identity. */
function partName(id: string): string {
  return $partEntries.get().find((entry) => entry.id === id)?.name ?? 'Part';
}

/**
 * Switches and reports. `switchPart` returns false for the already-active part (the checked
 * provider row) and for an id that no longer exists, and neither deserves an "Editing:" flash.
 */
function activatePart(id: string): void {
  if (switchPart(id)) toast({ title: `Editing: ${partName(id)}` });
}

/** Next (`1`) / previous (`-1`) in `$partEntries` order, wrapping at both ends. */
function cycleActivePart(step: 1 | -1): void {
  const entries = $partEntries.get();
  if (entries.length < 2) return;
  const index = entries.findIndex((entry) => entry.id === $activePartId.get());
  if (index === -1) return;
  activatePart(entries[(index + step + entries.length) % entries.length].id);
}
