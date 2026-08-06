import type { Command } from '../../state/commandStore';
import { openProject } from '../../state/projectStore';
import { $currentProjectId, $projectIndex } from '../../state/projectIndexStore';
import { historyCommands } from './editCommands';
import { modsFolderCommands } from './fileCommands';
import { customMeshInstanceCommands } from './addCommands';
import { layerActivateCommands, layerSelectCommands } from './selectCommands';
import { seatCommands } from './toolsCommands';
import { dataScopeCommands } from './dataCommands';
import { surfacePickCommands } from './surfaceCommands';
import { animationClipCommands } from './animationCommands';

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
  // The two interim `aids.*` providers are gone: the Outliner's Aids section
  // (`src/ui/outliner/AidsSection.tsx`) is the real home for the measurement and
  // reference-container lists, so a second copy under Tools would be a duplicate surface.
  // Not list-shaped so much as capability-shaped: the Mods Folder submenu's rows depend on
  // the File System Access grant status (see modsFolderCommands).
  { id: 'modsFolder', commands: modsFolderCommands },
  // One "Edit data: <template>" row per data-capable SubPart template (design §A9).
  { id: 'data.scopeTemplate', commands: dataScopeCommands },
  // One "Edit surface: <mesh>" row per custom mesh, kitten submeshes included (D6).
  { id: 'surface.pickMesh', commands: surfacePickCommands },
  // One "Open clip: <name>" row per animation clip (design-animation-mode.md §13).
  { id: 'animation.openClip', commands: animationClipCommands },
];

/**
 * Palette-only rows: "Open project: X" for every saved project except the current one. Rows
 * come from the reactive `$projectIndex` (an in-memory array), so this provider is a pure map
 * with no I/O at all — v1's `listProjects()` re-parsed every localStorage snapshot here.
 */
function projectCommands(): Command[] {
  const currentId = $currentProjectId.get();
  return $projectIndex
    .get()
    .filter((meta) => meta.id !== currentId)
    .map((meta) => ({
      id: `project:open:${meta.id}`,
      title: `Open project: ${meta.name}`,
      keywords: 'project open load switch',
      run: () => {
        void openProject(meta.id);
      },
    }));
}
