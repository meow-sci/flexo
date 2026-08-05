import type { Command } from '../../state/commandStore';
import { $layout, resetLayout, toggleSidebar } from '../../state/layoutStore';
import { openDialog } from '../../state/dialogStore';

/**
 * Window menu commands (design: foundation §3 "Window").
 *
 * Layout is persisted view state and never undoable (foundation §13).
 */
export const WINDOW_COMMANDS: Command[] = [
  {
    id: 'window.toggleLeft',
    title: 'Left Sidebar',
    menuPath: 'Window',
    keywords: 'left sidebar panel collapse focus editor',
    checked: () => !$layout.get().left.collapsed,
    keepOpen: true,
    run: () => toggleSidebar('left'),
  },
  {
    id: 'window.toggleRight',
    title: 'Right Sidebar',
    menuPath: 'Window',
    keywords: 'right sidebar panel collapse inspector outliner',
    checked: () => !$layout.get().right.collapsed,
    keepOpen: true,
    run: () => toggleSidebar('right'),
  },
  {
    id: 'window.timeline',
    title: 'Timeline',
    menuPath: 'Window',
    keywords: 'timeline dopesheet animation dock',
    enabled: () => false,
    disabledReason: 'The timeline dock arrives with the Animation-mode rework',
    run: () => {},
  },
  {
    id: 'window.toolbar',
    title: 'Tool Bar',
    menuPath: 'Window',
    keywords: 'tool bar gizmo float window',
    enabled: () => false,
    disabledReason: 'The floating Tool bar arrives with the Build-mode rework',
    run: () => {},
  },
  {
    id: 'window.resetLayout',
    title: 'Reset Window Layout',
    menuPath: 'Window',
    keywords: 'reset layout widths panels defaults',
    run: () => resetLayout(),
  },
  {
    id: 'window.assetManager',
    title: 'Asset Manager…',
    menuPath: 'Window',
    keywords: 'assets textures meshes materials custom manager',
    // INTERIM: the v1 CustomAssetsModal. The Surface/assets phase replaces the dialog's
    // guts behind this same command id.
    run: () => openDialog({ id: 'custom-assets' }),
  },
  {
    id: 'window.notifications',
    title: 'Notifications…',
    menuPath: 'Window',
    keywords: 'notifications bell center alerts',
    enabled: () => false,
    disabledReason: 'The notification center arrives with the status-bar phase',
    run: () => {},
  },
];
