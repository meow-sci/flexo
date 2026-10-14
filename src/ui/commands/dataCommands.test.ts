import { beforeEach, describe, expect, it } from 'vitest';
import { DATA_COMMANDS, massDefinitionCommands, massRemoveCommandId } from './dataCommands';
import { $part } from '../../state/editorStore';
import { $dataScopeRaw, $dataSectionJump } from '../../state/dataModeStore';
import { $catalog } from '../../state/catalogStore';
import { createEmptyPart, DEFAULT_LAYER_ID, identityTransform } from '../../ksa/types';

beforeEach(() => {
  $part.set(createEmptyPart());
  $dataScopeRaw.set({ kind: 'part' });
  $dataSectionJump.set(null);
  $catalog.set([]);
});

describe('mass Data commands', () => {
  it('adds a shape to the current template scope and jumps to its Mass section', () => {
    const part = createEmptyPart();
    part.placements.push({
      instanceId: 'battery_1',
      subPartTemplateId: 'BatteryB',
      ...identityTransform(),
      layerId: DEFAULT_LAYER_ID,
    });
    $part.set(part);
    $dataScopeRaw.set({ kind: 'template', templateId: 'BatteryB' });
    DATA_COMMANDS.find((command) => command.id === 'data.massAdd:SolidCuboidMass')!.run();
    expect($part.get().gameData.massDefinitions).toHaveLength(0);
    expect($part.get().subPartGameData[0].massDefinitions[0].shape).toBe('SolidCuboidMass');
    expect($part.get().subPartGameData[0].massDefinitionsOverride).toBe(true);
    expect($dataSectionJump.get()?.sectionId).toBe('mass');
  });

  it('provides stable Remove commands for the focused scope', () => {
    DATA_COMMANDS.find((command) => command.id === 'data.massAdd:SolidSphereMass')!.run();
    const definition = $part.get().gameData.massDefinitions[0];
    const [remove] = massDefinitionCommands();
    expect(remove.id).toBe(massRemoveCommandId(null, definition.id));
    remove.run();
    expect($part.get().gameData.massDefinitions).toHaveLength(0);
  });

  it('keeps the supplied owner when an Add button targets another scope', () => {
    DATA_COMMANDS.find((command) => command.id === 'data.massAdd:CustomMass')!.run({ owner: null });
    expect($part.get().gameData.massDefinitions[0].shape).toBe('CustomMass');
  });
});
