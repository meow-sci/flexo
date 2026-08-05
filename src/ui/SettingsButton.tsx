import { Menu as MenuIcon } from 'lucide-react';
import { MenuTrigger, Menu, MenuItem, MenuSeparator, Popover, ToolbarButton } from './kit';
import { openDialog } from '../state/dialogStore';

/**
 * INTERIM v1 toolbar "☰" overflow menu. Every entry now just names a root-hosted dialog
 * (`dialogStore` ids); "Reset Everything" moved into Settings → Danger zone, which is its
 * only home. The menubar replaces this button and this whole file is deleted with the old
 * toolbar.
 */
export function SettingsButton() {
  return (
    <MenuTrigger>
      <ToolbarButton aria-label="Menu">
        <MenuIcon size={16} />
        <span className="sm:hidden">Menu</span>
      </ToolbarButton>
      <Popover placement="bottom end" className="w-44">
        <Menu
          onAction={(key) => {
            if (key === 'scale') openDialog({ id: 'scale-everything' });
            else if (key === 'settings') openDialog({ id: 'settings' });
            else if (key === 'shortcuts') openDialog({ id: 'help' });
            else if (key === 'about') openDialog({ id: 'about' });
          }}
        >
          <MenuItem id="scale">Scale Everything</MenuItem>
          <MenuSeparator />
          <MenuItem id="settings">Settings</MenuItem>
          <MenuItem id="shortcuts">Shortcuts</MenuItem>
          <MenuItem id="about">About</MenuItem>
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
