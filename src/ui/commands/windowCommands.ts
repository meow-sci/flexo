import type { Command } from '../../state/commandStore';
import {
  $layout,
  resetLayout,
  setFloatHidden,
  setTimelineHidden,
  toggleSidebar,
} from '../../state/layoutStore';
import { $mode } from '../../state/modeStore';
import { openDialog } from '../../state/dialogStore';
import { openNotificationCenter } from '../../state/notificationStore';

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
    keywords: 'timeline dopesheet animation dock keyframes',
    // ✓ = shown. The dock ALSO self-gates on Animation mode, so an item checked here still
    // renders nothing in Build — hence the mode gate on `enabled` (design-animation-mode
    // §5.1; the `window.toolbar` `floatHidden` precedent).
    enabled: () => $mode.get() === 'animation',
    disabledReason: 'The timeline lives in Animation mode',
    checked: () => !$layout.get().timeline.hidden,
    keepOpen: true,
    run: () => setTimelineHidden(!$layout.get().timeline.hidden),
  },
  {
    id: 'window.toolbar',
    title: 'Tool Bar',
    menuPath: 'Window',
    keywords: 'tool bar gizmo snap move rotate scale float window',
    // `'toolbar'` is `ToolBarWindow`'s FloatingWindow id. Hidden-ness is the persisted
    // `floatHidden` list; the window ALSO self-gates on having a gizmo target, so a checked
    // item can still show nothing while the selection is empty.
    checked: () => !$layout.get().floatHidden.includes('toolbar'),
    keepOpen: true,
    run: () => setFloatHidden('toolbar', !$layout.get().floatHidden.includes('toolbar')),
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
    // The ⇧⌘A chord and the Window-menu row both resolve through this one command id, so
    // re-pointing it here was the whole migration off the v1 custom-assets modal.
    run: () => openDialog({ id: 'asset-manager' }),
  },
  {
    id: 'window.notifications',
    title: 'Notifications…',
    menuPath: 'Window',
    keywords: 'notifications bell center alerts',
    // The same surface the status-bar bell opens — the open state is a store precisely so
    // this command, the bell and a status-message click-through cannot disagree.
    run: () => openNotificationCenter(),
  },
];
