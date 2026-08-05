import { openPalette, type Command } from '../../state/commandStore';
import { openDialog } from '../../state/dialogStore';

/** The repository link, kept identical to the one AboutDialog renders. */
const GITHUB_URL = 'https://github.com/meow-sci/flexo';

/** Help menu commands (design: foundation §3 "Help"). */
export const HELP_COMMANDS: Command[] = [
  {
    id: 'palette.open',
    title: 'Search Commands…',
    menuPath: 'Help',
    keywords: 'command palette search run action',
    run: () => openPalette(),
  },
  {
    id: 'help.shortcuts',
    title: 'Keyboard Shortcuts…',
    menuPath: 'Help',
    keywords: 'keyboard shortcuts hotkeys keys help',
    run: () => openDialog({ id: 'help' }),
  },
  {
    id: 'help.about',
    title: 'About flexo…',
    menuPath: 'Help',
    keywords: 'about license credits version attribution',
    run: () => openDialog({ id: 'about' }),
  },
  {
    id: 'help.github',
    title: 'flexo on GitHub',
    menuPath: 'Help',
    keywords: 'github source repository issues',
    run: () => window.open(GITHUB_URL, '_blank'),
  },
];
