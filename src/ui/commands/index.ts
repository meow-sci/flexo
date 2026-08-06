import { registerCommandProvider, registerCommands } from '../../state/commandStore';
import { FILE_COMMANDS } from './fileCommands';
import { EDIT_COMMANDS } from './editCommands';
import { ADD_COMMANDS } from './addCommands';
import { SELECT_COMMANDS } from './selectCommands';
import { VIEW_COMMANDS } from './viewCommands';
import { TOOLS_COMMANDS } from './toolsCommands';
import { WINDOW_COMMANDS } from './windowCommands';
import { HELP_COMMANDS } from './helpCommands';
import { MODE_COMMANDS } from './modeCommands';
import { DATA_COMMANDS } from './dataCommands';
import { SURFACE_COMMANDS } from './surfaceCommands';
import { COMMAND_PROVIDERS } from './providers';

/**
 * The one place every command and provider is registered — a module-scope side effect,
 * imported once by `src/app.tsx`. Importing this module IS the registration; there is no
 * init function to forget to call, and `registerCommand` throwing on a duplicate id means
 * a double import would fail loudly rather than silently shadow.
 *
 * Ordering here is the palette's tie-break order for equally-scored rows, and nothing else:
 * the menubar renders from `src/ui/menu/menuSpec.ts`, never from registration order.
 */
registerCommands([
  ...FILE_COMMANDS,
  ...EDIT_COMMANDS,
  ...ADD_COMMANDS,
  ...SELECT_COMMANDS,
  ...VIEW_COMMANDS,
  ...TOOLS_COMMANDS,
  ...WINDOW_COMMANDS,
  ...HELP_COMMANDS,
  ...MODE_COMMANDS,
  // Palette-only (no MENU_SPEC entry) — see dataCommands.ts / surfaceCommands.ts for why.
  ...DATA_COMMANDS,
  ...SURFACE_COMMANDS,
]);

for (const provider of COMMAND_PROVIDERS) {
  registerCommandProvider(provider.id, provider.commands);
}
