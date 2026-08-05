import { useStore } from '@nanostores/react';
import { CirclePlus, FolderOpen, Menu as MenuIcon, Redo, Undo } from 'lucide-react';
import { MenuTrigger, Toolbar, ToolbarButton, ToolbarSeparator } from './kit';
import { MenuSpecMenu } from './menu/MenuSpecMenu';
import { MENU_SPEC, type MenuEntry } from './menu/menuSpec';
import { $canRedo, $canUndo } from '../state/editorStore';
import { $projectName } from '../state/projectStore';
import { runCommand } from '../state/commandStore';

/**
 * INTERIM phone-only top toolbar, now rendered entirely from `MENU_SPEC` — the phone has
 * no parallel menu wiring left (design: foundation §12). The phone shell phase replaces
 * this file with `PhoneTopBar` + the drill-down `MenuSheet`; until then the ☰ opens the
 * same eight menus as a popover drill-down, so every menubar item is reachable here.
 *
 * Primary actions stay visible: project chip, Add, undo/redo.
 */

/** The Add menu on its own trigger — the phone's one always-visible authoring action. */
const ADD_ENTRIES: MenuEntry[] = MENU_SPEC.find((menu) => menu.id === 'add')?.entries ?? [];

/** The eight menus as one drill-down, identical to the narrow-desktop `☰` collapse. */
const ALL_ENTRIES: MenuEntry[] = MENU_SPEC.map((menu) => ({
  kind: 'submenu',
  id: menu.id,
  label: menu.label,
  entries: menu.entries,
}));

export function MobileTopBar() {
  const canUndo = useStore($canUndo);
  const canRedo = useStore($canRedo);
  const projectName = useStore($projectName);

  return (
    <Toolbar aria-label="Editor actions" className="rounded-none border-x-0 border-t-0 px-2">
      <ToolbarButton
        aria-label={`Project: ${projectName}`}
        onPress={() => runCommand('file.projects')}
      >
        <FolderOpen size={16} />
        <span className="max-w-[14ch] truncate">{projectName}</span>
      </ToolbarButton>

      <div className="flex-1" />

      <MenuTrigger>
        <ToolbarButton aria-label="Add">
          <CirclePlus size={16} />
          Add
        </ToolbarButton>
        <MenuSpecMenu entries={ADD_ENTRIES} placement="bottom end" ariaLabel="Add" />
      </MenuTrigger>

      <ToolbarSeparator />

      <ToolbarButton
        isDisabled={!canUndo}
        aria-label="Undo"
        onPress={() => runCommand('edit.undo')}
      >
        <Undo size={16} />
      </ToolbarButton>
      <ToolbarButton
        isDisabled={!canRedo}
        aria-label="Redo"
        onPress={() => runCommand('edit.redo')}
      >
        <Redo size={16} />
      </ToolbarButton>

      <MenuTrigger>
        <ToolbarButton aria-label="Menu">
          <MenuIcon size={16} />
        </ToolbarButton>
        <MenuSpecMenu entries={ALL_ENTRIES} placement="bottom end" ariaLabel="Menu" />
      </MenuTrigger>
    </Toolbar>
  );
}
