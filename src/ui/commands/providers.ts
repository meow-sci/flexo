import type { Command } from '../../state/commandStore';
import { listProjects, loadProject } from '../../state/projectStore';
import { historyCommands } from './editCommands';
import { modsFolderCommands } from './fileCommands';
import { customMeshInstanceCommands } from './addCommands';
import { layerActivateCommands, layerSelectCommands } from './selectCommands';
import { containerAidCommands, measurementAidCommands, seatCommands } from './toolsCommands';

/**
 * Every dynamic command provider (design: foundation §4 "Dynamic providers"). Anything
 * list-shaped — layers, seats, history rows, projects, custom meshes, aids — is a provider
 * rather than N static registrations, so the rows always describe the live document.
 *
 * Providers are re-evaluated on **every** menu open and **every** palette keystroke (and
 * on any `getCommand` miss), so each one must stay cheap: a map over a store's current
 * array, no allocation-heavy work, no I/O beyond the localStorage read `projects` needs.
 *
 * Ids are stable and prefixed so palette recents can resolve a row again later.
 */
export const COMMAND_PROVIDERS: { id: string; commands: () => Command[] }[] = [
  { id: 'history', commands: historyCommands },
  { id: 'layers.select', commands: layerSelectCommands },
  { id: 'layers.activate', commands: layerActivateCommands },
  { id: 'seats', commands: seatCommands },
  { id: 'customMeshInstances', commands: customMeshInstanceCommands },
  { id: 'projects', commands: projectCommands },
  // INTERIM until P5A: both aid providers are deleted when the Outliner grows its Aids
  // section, which is where measurements and reference containers get their real home.
  { id: 'aids.measurements', commands: measurementAidCommands },
  { id: 'aids.containers', commands: containerAidCommands },
  // Not list-shaped so much as capability-shaped: the Mods Folder submenu's rows depend on
  // the File System Access grant status (see modsFolderCommands).
  { id: 'modsFolder', commands: modsFolderCommands },
];

/** Palette-only rows: "Open project: X" for every saved project except the current one. */
function projectCommands(): Command[] {
  return listProjects().map((summary) => ({
    id: `project:open:${summary.name}`,
    title: `Open project: ${summary.name}`,
    keywords: 'project open load switch',
    run: () => {
      loadProject(summary.name);
    },
  }));
}
