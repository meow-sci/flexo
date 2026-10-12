import type { Command } from '../../state/commandStore';
import { $part, addAdvancedEngineModule } from '../../state/editorStore';
import {
  $activeEngineEntry,
  engineModuleCount,
  focusModule,
  activateEngine,
  type EngineEntry,
} from '../../state/engineStore';
import { setMode } from '../../state/modeStore';

/** Current-build propulsion authoring uses the same commands in the tree and palette. */
export const ENGINE_COMMANDS: Command[] = (
  [
    ['thermalCore', 'Thermal core'],
    ['antimatterRamCore', 'Antimatter ram core'],
    ['magneticNozzle', 'Magnetic nozzle'],
    ['magneticScoop', 'Magnetic scoop'],
  ] as const
).map(([group, title]) => ({
  id: `engine.add:${group}`,
  title: `Add ${title.toLowerCase()}`,
  menuPath: 'Engine ▸ Modules',
  keywords: 'engine propulsion thermal fusion antimatter magnetic scoop',
  run: (params) => {
    const entry = (params as EngineEntry | undefined) ??
      $activeEngineEntry.get() ?? { kind: 'part' };
    const scope = entry.kind === 'part' ? 'part' : 'sub';
    const index = engineModuleCount($part.get(), entry, group, scope);
    addAdvancedEngineModule(group, entry.kind === 'subpart' ? entry.templateId : null);
    setMode('engine');
    activateEngine(entry);
    focusModule({ group, scope, index });
  },
}));
