import { describe, expect, it } from 'vitest';
import type { CatalogPart } from '../../ksa/partCatalog';
import { exactCatalogId, partBrowserRowId, partBrowserRows } from './browserModels';

function part(id: string, variantIds: string[] = []): CatalogPart {
  return {
    id,
    variantIds,
    variantHeadId: variantIds[0] ?? null,
    variantIndex: Math.max(0, variantIds.indexOf(id)),
    editorTags: ['Structural'],
    placements: [],
  } as unknown as CatalogPart;
}

describe('Part browser families', () => {
  const ids = [
    'CoreStructuralA_Prefab_PanelAA',
    'CoreStructuralA_Prefab_PanelAB',
    'CoreStructuralA_Prefab_PanelAC',
    'CoreStructuralA_Prefab_PanelAD',
  ];
  const parts = [
    ...ids.map((id) => part(id, ids)),
    part('CoreLifeSupportA_Prefab_SupplyLockerA'),
    part('CoreLifeSupportA_Prefab_SupplyLockerB'),
    part('CoreCommandA_Prefab_MediumCapsuleVariantA'),
  ];

  it('groups only explicitly related families', () => {
    expect(partBrowserRows(parts, '', []).map(partBrowserRowId)).toEqual([
      ids[0],
      ...parts.slice(4).map((p) => p.id),
    ]);
  });
  it('finds and selects an exact non-head member', () => {
    expect(partBrowserRows(parts, ids[2], [])[0].id).toBe(ids[2]);
    expect(exactCatalogId(parts, ids[2].toLowerCase())).toBe(ids[2]);
    expect(exactCatalogId(parts, 'not a part')).toBeNull();
  });
});
