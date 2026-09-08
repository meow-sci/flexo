import { describe, expect, it } from 'vitest';
import {
  createCombustor,
  createEmptyPart,
  createNozzle,
  createRocket,
  createSubPartGameData,
  identityTransform,
  DEFAULT_LAYER_ID,
} from '../../ksa/types';
import { referenceModuleIds } from './rocketReferenceOptions';

describe('rocket reference options', () => {
  it('resolves module choices by both owner and selected instance', () => {
    const part = createEmptyPart();
    part.gameData.combustors.push(createCombustor('RootCore'));
    for (const id of ['A', 'B']) {
      const spd = createSubPartGameData(id);
      spd.combustors.push(createCombustor(id + 'Core'));
      spd.nozzles.push(createNozzle(id + 'Nozzle'));
      spd.rockets.push(createRocket(id + 'Rocket', id + 'Core', [id + 'Nozzle']));
      part.subPartGameData.push(spd);
      part.placements.push({
        ...identityTransform(),
        instanceId: id + '1',
        subPartTemplateId: id,
        layerId: DEFAULT_LAYER_ID,
      });
    }
    expect(referenceModuleIds(part, null, null, 'core')).toEqual(['RootCore']);
    expect(referenceModuleIds(part, null, 'B1', 'core')).toEqual(['BCore']);
    expect(referenceModuleIds(part, null, 'A1', 'nozzle')).toEqual(['ANozzle']);
    expect(referenceModuleIds(part, 'A', null, 'rocket')).toEqual(['ARocket']);
    expect(referenceModuleIds(part, 'A', 'B1', 'rocket')).toEqual([]);
    expect(referenceModuleIds(part, null, 'missing', 'rocket')).toEqual([]);
  });
});
