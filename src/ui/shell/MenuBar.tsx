import { useSyncExternalStore } from 'react';
import { useStore } from '@nanostores/react';
import { ChevronDown, FolderOpen, Menu as MenuIcon, Redo, Search, Undo } from 'lucide-react';
import {
  Button,
  Kbd,
  keyLabel,
  MenuBar as KitMenuBar,
  MenuTrigger,
  Tooltip,
  type MenuBarMenu,
} from '../kit';
import { MenuSpecMenu } from '../menu/MenuSpecMenu';
import { MENU_SPEC, type MenuEntry } from '../menu/menuSpec';
import { ModeSwitcher } from './ModeSwitcher';
import { runCommand } from '../../state/commandStore';
import { $canRedo, $canUndo, $redoDescription, $undoDescription } from '../../state/editorStore';
import { $projectName } from '../../state/projectStore';

/**
 * The docked shell's fixed slim top row (foundation.md §1: content height = `text-xs` line
 * + 2 × `--bar-py` + 1px border). Never collapses, never resizes — see the §1.1
 * region-rules table.
 *
 * Layout (foundation §3, FINAL_DESIGN_INDEX "Consolidated menubar tree"):
 * `[File … Help] ··center·· [mode switcher] ··right·· [project chip ▾] [↶] [↷] [⌘K]`.
 * Nothing else lives here — no burger, no Save (S12; autosave-only).
 *
 * The eight menus come straight from `MENU_SPEC`; below ~900px they collapse into a single
 * `☰ Menu` trigger rendering that same tree as one drill-down of submenus. The phone runs
 * the identical data through its own bar.
 *
 * Undo enrollment: NONE. Every action here is a `runCommand` into the registry, and the
 * commands are thin dispatchers over mutators that already own their `pushUndo`.
 */

const MENUS: MenuBarMenu[] = MENU_SPEC.map((menu) => ({
  id: menu.id,
  label: menu.label,
  // A fresh element tree per open — that is what re-evaluates enabled/checked (foundation §4).
  renderMenu: () => <MenuSpecMenu entries={menu.entries} ariaLabel={menu.label} />,
}));

/** The same eight menus as one collapsed drill-down (narrow desktop `☰`). */
const COLLAPSED_ENTRIES: MenuEntry[] = MENU_SPEC.map((menu) => ({
  kind: 'submenu',
  id: menu.id,
  label: menu.label,
  entries: menu.entries,
}));

/** Below this the eight triggers do not fit beside the mode switcher (foundation §3). */
const NARROW_QUERY = '(max-width: 899px)';

function subscribeNarrow(callback: () => void) {
  const mql = window.matchMedia(NARROW_QUERY);
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

function useIsNarrow(): boolean {
  return useSyncExternalStore(
    subscribeNarrow,
    () => window.matchMedia(NARROW_QUERY).matches,
    () => false,
  );
}

export function MenuBar() {
  const narrow = useIsNarrow();

  return (
    <div className="grid flex-none grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-border bg-panel px-1 py-(--bar-py) text-xs text-fg">
      <div className="flex min-w-0 items-center">
        {narrow ? (
          <MenuTrigger>
            <Button size="xs" variant="ghost" className="px-2" aria-label="Menu">
              <MenuIcon size={14} />
              Menu
            </Button>
            <MenuSpecMenu entries={COLLAPSED_ENTRIES} ariaLabel="Menu" />
          </MenuTrigger>
        ) : (
          <KitMenuBar menus={MENUS} />
        )}
      </div>

      <ModeSwitcher />

      <div className="flex items-center justify-end gap-0.5">
        <ProjectChip />
        <UndoRedo />
        <Button
          size="xs"
          variant="ghost"
          className="gap-1 px-1.5"
          aria-label="Search commands"
          onPress={() => runCommand('palette.open')}
        >
          <Search size={13} />
          <Kbd>{`${keyLabel('mod')}K`}</Kbd>
        </Button>
      </div>
    </div>
  );
}

/** Current project name → the Project Manager (foundation §3 right cluster). */
function ProjectChip() {
  const name = useStore($projectName);
  return (
    <Button
      size="xs"
      variant="ghost"
      className="min-w-0 gap-1 px-1.5"
      aria-label={`Project: ${name}`}
      onPress={() => runCommand('file.projects')}
    >
      <FolderOpen size={13} className="shrink-0" />
      <span className="max-w-[20ch] truncate">{name}</span>
      <ChevronDown size={12} className="shrink-0 text-fg-subtle" />
    </Button>
  );
}

/**
 * The compact ↶ ↷ pair. The step label is the tooltip, and the label FLASH on activation
 * belongs to `edit.undo` / `edit.redo` themselves — v1 built that string in four places
 * and they drifted (design §4.4).
 */
function UndoRedo() {
  const canUndo = useStore($canUndo);
  const canRedo = useStore($canRedo);
  const undoDescription = useStore($undoDescription);
  const redoDescription = useStore($redoDescription);

  return (
    <>
      <Tooltip content={undoDescription ? `Undo ${undoDescription}` : 'Undo'}>
        <Button
          size="xs"
          iconOnly
          variant="ghost"
          isDisabled={!canUndo}
          aria-label="Undo"
          onPress={() => runCommand('edit.undo')}
        >
          <Undo size={13} />
        </Button>
      </Tooltip>
      <Tooltip content={redoDescription ? `Redo ${redoDescription}` : 'Redo'}>
        <Button
          size="xs"
          iconOnly
          variant="ghost"
          isDisabled={!canRedo}
          aria-label="Redo"
          onPress={() => runCommand('edit.redo')}
        >
          <Redo size={13} />
        </Button>
      </Tooltip>
    </>
  );
}
