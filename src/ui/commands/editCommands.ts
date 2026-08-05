import type { Command } from '../../state/commandStore';
import { openDialog } from '../../state/dialogStore';
import {
  $canRedo,
  $canUndo,
  $hasClipboard,
  $historyList,
  $selectedIndices,
  $selectedLightIndices,
  copySelected,
  duplicateSelected,
  jumpToHistory,
  pasteClipboard,
  redo,
  removeSelected,
  undo,
} from '../../state/editorStore';
import { $hasSelection } from '../../state/selectors';
import { beginActionChain } from '../chain/openChainPalette';
import { toast } from '../toast';

/**
 * Edit menu commands (design: foundation §3 "Edit").
 *
 * `edit.undo` / `edit.redo` are THE single site that flashes the step label — v1 built that
 * string in four places (toolbar, mobile bar, history popover, hotkey registry) and they
 * drifted (design §4.4). Every other surface runs the command.
 *
 * Undo enrollment: none of these push undo themselves; `removeSelected`,
 * `duplicateSelected` and `pasteClipboard` each own their discrete `pushUndo`
 * (`src/state/editorStore.ts` invariant block).
 */
export const EDIT_COMMANDS: Command[] = [
  {
    id: 'edit.undo',
    title: 'Undo',
    menuPath: 'Edit',
    keywords: 'revert step back history',
    enabled: () => $canUndo.get(),
    run: () => {
      const description = undo();
      if (description) toast({ title: `Undo: ${description}` });
    },
  },
  {
    id: 'edit.redo',
    title: 'Redo',
    menuPath: 'Edit',
    keywords: 'repeat forward history',
    enabled: () => $canRedo.get(),
    run: () => {
      const description = redo();
      if (description) toast({ title: `Redo: ${description}` });
    },
  },
  {
    id: 'edit.cut',
    title: 'Cut',
    menuPath: 'Edit',
    keywords: 'clipboard move',
    // The trivial composite the design asks for (foundation §3 Edit menu: "Cut — copy +
    // delete"). ONE undo step: `copySelected` pushes none and `removeSelected` pushes the
    // single 'delete', so ⌘Z puts the cut entities straight back.
    // Lights are not in the clipboard yet, so cutting a selection containing one would
    // DELETE it with no way to paste it back — refuse instead of destroying.
    enabled: () => $hasSelection.get() && $selectedLightIndices.get().length === 0,
    run: () => {
      const n = copySelected();
      removeSelected();
      if (n) toast({ title: `Cut ${n} ${n === 1 ? 'item' : 'items'}` });
    },
  },
  {
    id: 'edit.copy',
    title: 'Copy',
    menuPath: 'Edit',
    keywords: 'clipboard duplicate',
    enabled: () => $hasSelection.get(),
    run: () => {
      const n = copySelected();
      if (n) toast({ title: `Copied ${n} ${n === 1 ? 'item' : 'items'}` });
    },
  },
  {
    id: 'edit.paste',
    title: 'Paste',
    menuPath: 'Edit',
    keywords: 'clipboard in place',
    enabled: () => $hasClipboard.get(),
    run: () => {
      const n = pasteClipboard();
      if (n) toast({ title: `Pasted ${n} ${n === 1 ? 'item' : 'items'}` });
    },
  },
  {
    id: 'edit.duplicate',
    title: 'Duplicate',
    menuPath: 'Edit',
    keywords: 'copy clone repeat',
    // INTERIM: v1 copies land in place. Duplicate-with-offset (LOCKED #7) is the Build
    // phase's re-point of this same command.
    enabled: () => $hasSelection.get(),
    run: () => duplicateSelected(),
  },
  {
    id: 'edit.delete',
    title: 'Delete',
    menuPath: 'Edit',
    keywords: 'remove erase',
    // v1 parity: no confirm. The §14.3 confirm policy (>5 entities) lands with Build mode.
    enabled: () => $hasSelection.get(),
    run: () => removeSelected(),
  },
  {
    id: 'chain.begin',
    title: 'Begin Action Chain…',
    menuPath: 'Edit',
    keywords: 'array grid radial ring repeat',
    enabled: () => $selectedIndices.get().length > 0,
    run: () => beginActionChain(),
  },
  {
    id: 'edit.scaleEverything',
    title: 'Scale Everything…',
    menuPath: 'Edit',
    keywords: 'resize scale all uniform',
    run: () => openDialog({ id: 'scale-everything' }),
  },
  {
    id: 'edit.settings',
    title: 'Settings…',
    menuPath: 'Edit',
    keywords: 'preferences options config',
    run: () => openDialog({ id: 'settings' }),
  },
];

/**
 * `Edit ▸ History` rows — the v1 HistoryButton popover as commands, in its exact order:
 * redo rows first, then a disabled "current" marker, then undo rows (that is already the
 * order `$historyList` publishes).
 */
export function historyCommands(): Command[] {
  return $historyList.get().map((item) => {
    if (item.stepsFromCurrent === 0) {
      return {
        id: 'history:current',
        title: '→ current',
        menuPath: 'Edit ▸ History',
        enabled: () => false,
        run: () => {},
      };
    }
    const verb = item.stepsFromCurrent < 0 ? 'Undo' : 'Redo';
    const detail = item.detail ? ` · ${item.detail}` : '';
    return {
      id: `history:jump:${item.stepsFromCurrent}`,
      title: `${verb}: ${item.description}${detail}`,
      menuPath: 'Edit ▸ History',
      keywords: 'history jump step',
      run: () => {
        const label = jumpToHistory(item.stepsFromCurrent);
        toast({ title: `${verb}: ${label}` });
      },
    };
  });
}
