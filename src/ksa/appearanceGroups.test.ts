import { describe, expect, it } from 'vitest';
import type { CatalogPart } from './partCatalog';
import { familyAppearanceGroups } from './appearanceGroups';

function member(
  head: string | null,
  ...ids: string[]
): Pick<CatalogPart, 'variantHeadId' | 'placements'> {
  return {
    variantHeadId: head,
    placements: ids.map((subPartTemplateId) => ({
      subPartTemplateId,
    })) as CatalogPart['placements'],
  };
}

describe('familyAppearanceGroups', () => {
  it('uses exclusive family placements, not suffixes alone', () => {
    const groups = familyAppearanceGroups([
      member('tank', 'CoreFuelTankA_Subpart_Skin1W1HA', 'WindowA', 'WindowB'),
      member('tank', 'CoreFuelTankA_Subpart_Skin1W1HB', 'WindowA', 'WindowB'),
      member('tank', 'CoreFuelTankA_Subpart_Skin1W1HC', 'WindowA', 'WindowB'),
      member(null, 'UnrelatedA'),
      member(null, 'UnrelatedB'),
    ]);
    expect(groups.get('CoreFuelTankA_Subpart_Skin1W1H')).toEqual([
      'CoreFuelTankA_Subpart_Skin1W1HA',
      'CoreFuelTankA_Subpart_Skin1W1HB',
      'CoreFuelTankA_Subpart_Skin1W1HC',
    ]);
    expect(groups.has('Window')).toBe(false);
    expect(groups.has('Unrelated')).toBe(false);
  });
  it('rejects a stem if any family uses two alternatives together', () => {
    expect(
      familyAppearanceGroups([
        member('one', 'SkinA'),
        member('one', 'SkinB'),
        member('two', 'SkinA', 'SkinB'),
        member('two', 'SkinC'),
      ]).has('Skin'),
    ).toBe(false);
  });
});
