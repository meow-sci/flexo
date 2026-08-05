import type { Command } from '../../state/commandStore';
import { openDialog } from '../../state/dialogStore';
import {
  $canRedo,
  $canUndo,
  $hasClipboard,
  $historyList,
  $selection,
  copySelected,
  cutSelected,
  duplicateSelected,
  jumpToHistory,
  pasteClipboard,
  redo,
  removeSelected,
  undo,
} from '../../state/editorStore';
import { $hasSelection, $selectionCount } from '../../state/selectors';
import { requestStatusConfirm, status, undoStatusAction } from '../../state/statusStore';
import { beginActionChain } from '../chain/openChainPalette';
import { toast } from '../toast';

/**
 * The §14.3 confirm threshold: up to this many entities delete with NO confirm and a status
 * flash carrying an inline `[Undo]`; more than this asks first, stating the count. One
 * policy for every delete entry point — hotkey, Edit menu, row menu — which is what heals
 * v1's hotkey-deletes-silently / toolbar-always-asks split (census: selection-transform
 * pain 10).
 */
const DELETE_CONFIRM_THRESHOLD = 5;

const items = (n: number): string => `${n} ${n === 1 ? 'item' : 'items'}`;

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
    // Copy + delete as ONE undo step labeled 'cut' (design-build-mode.md §7.2) — the store
    // owns the composite so ⌘Z puts the cut entities straight back in a single press. The
    // clipboard covers all six kinds since P5B.02, so the old lights-in-selection refusal
    // is gone with the gap that motivated it.
    enabled: () => $hasSelection.get(),
    run: () => {
      const n = cutSelected();
      if (n) toast({ title: `Cut ${items(n)}` });
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
      if (n) toast({ title: `Copied ${items(n)}` });
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
      if (n) toast({ title: `Pasted ${items(n)}` });
    },
  },
  {
    id: 'edit.duplicate',
    title: 'Duplicate',
    menuPath: 'Edit',
    keywords: 'copy clone repeat',
    // Duplicate-with-OFFSET (LOCKED #7): the store lands the copies one `$nudgeStep` along
    // `$nudgeAxis`, which the status nudge chip is already showing — so the offset is
    // predictable and adjustable, and a duplicate is never invisibly stacked. In-place
    // duplication stays available as ⌘C ⌘V.
    enabled: () => $hasSelection.get(),
    run: () => duplicateSelected(),
  },
  {
    id: 'edit.delete',
    title: 'Delete',
    menuPath: 'Edit',
    keywords: 'remove erase',
    // ONE confirm policy for every delete entry point (design-build-mode.md §7.3;
    // foundation §14.3). `removeSelected` pushes its own single undo step either way.
    enabled: () => $hasSelection.get(),
    run: () => {
      const n = $selectionCount.get();
      if (n === 0) return;
      if (n > DELETE_CONFIRM_THRESHOLD) {
        requestStatusConfirm({
          label: `Delete ${items(n)}?`,
          confirmLabel: 'Delete',
          onConfirm: () => deleteWithFlash(n),
        });
        return;
      }
      deleteWithFlash(n);
    },
  },
  {
    id: 'chain.begin',
    title: 'Begin Action Chain…',
    menuPath: 'Edit',
    keywords: 'array grid radial ring repeat',
    enabled: () => $selection.get().some((ref) => ref.kind === 'subpart'),
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
 * Deletes and flashes `Deleted N items [Undo]`.
 *
 * `danger` is the severity deliberately: the ONE severity→duration table (design
 * §2.2, LOCKED) is what sets the 10 s window §14.3 asks for on this flash, and inventing a
 * per-call-site timeout is exactly what v2 killed. `status()` (not `toast()`) keeps a
 * routine delete out of the notification center; `undoStatusAction` disables the button once
 * a newer step is pushed, so a lingering flash can never undo the wrong thing.
 */
function deleteWithFlash(count: number): void {
  removeSelected();
  status(`Deleted ${items(count)}`, { severity: 'danger', action: undoStatusAction() });
}

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
