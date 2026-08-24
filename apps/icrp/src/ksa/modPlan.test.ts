import { describe, expect, it } from 'vitest';
import { buildModPlan, serializeIcrpModToml } from './modPlan';
import type { CatalogStaticPiece } from './staticCatalog';
import type { IcrpProjectDoc } from '../state/docStore';
import { identityTransform } from './types';

function piece(overrides: Partial<CatalogStaticPiece> & { id: string }): CatalogStaticPiece {
  return {
    origin: 'core-static',
    atlasUrl: 'x',
    meshNodeName: overrides.id,
    materialId: 'M',
    terrain: false,
    colliders: [],
    sourceFile: 't.xml',
    ...overrides,
  };
}

function project(overrides: Partial<IcrpProjectDoc> = {}): IcrpProjectDoc {
  return {
    schemaVersion: 1,
    modName: 'MyPad',
    objects: [
      {
        id: 'icrp_object_1',
        name: 'Pad',
        placements: [
          {
            instanceId: 'a1',
            pieceId: 'CoreLaunchPadA_Subpart_PadA',
            transform: identityTransform(),
            layerId: 'default',
          },
          {
            instanceId: 't1',
            pieceId: 'CoreFuelTankA_Subpart_Tank',
            transform: identityTransform(),
            layerId: 'default',
          },
        ],
        objectColliders: [],
        groundOffsetM: 0.2,
        surfaceHeightM: 1.5,
        footprintRadiusM: 100,
      },
    ],
    activeObjectId: 'icrp_object_1',
    sites: [],
    ...overrides,
  };
}

const INDEX = new Map<string, CatalogStaticPiece>([
  [
    'CoreLaunchPadA_Subpart_PadA',
    piece({
      id: 'CoreLaunchPadA_Subpart_PadA',
      colliders: [
        {
          id: 'BoxCollider1',
          shape: 'Box',
          ownerTemplateId: 'CoreLaunchPadA_Subpart_PadA',
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 2, z: 3 },
          layerId: 'default',
        },
      ],
    }),
  ],
  [
    'CoreFuelTankA_Subpart_Tank',
    piece({
      id: 'CoreFuelTankA_Subpart_Tank',
      origin: 'core-subpart',
      materialId: 'CoreFuelTankA_Material',
    }),
  ],
]);

describe('buildModPlan', () => {
  it('references Core static pieces and declares vessel-derived ones (fact F12)', () => {
    const plan = buildModPlan(project(), INDEX);
    expect(plan.modId).toBe('MyPad');
    expect(plan.vesselPieceIds).toEqual(['icrp_MyPad_CoreFuelTankA_Subpart_Tank']);
    const assets = plan.files.find((f) => f.path === 'MyPadAssets.xml')!.data;
    // Vessel piece declared, referencing Core mesh/material ids, no MeshAtlas.
    expect(assets).toContain('<StaticSubObject Id="icrp_MyPad_CoreFuelTankA_Subpart_Tank">');
    expect(assets).toContain('<Mesh Id="CoreFuelTankA_Subpart_Tank"/>');
    expect(assets).toContain('<Material Id="CoreFuelTankA_Material"/>');
    expect(assets).not.toContain('<MeshAtlas');
    // Core static piece referenced, never declared.
    expect(assets).toContain('InstanceOf="CoreLaunchPadA_Subpart_PadA"');
    expect(assets).not.toContain('<StaticSubObject Id="CoreLaunchPadA_Subpart_PadA">');
    // GameData split.
    const gd = plan.files.find((f) => f.path === 'MyPadGameData.xml')!.data;
    expect(gd).toContain('<StaticObjectGameData Id="icrp_object_1">');
    expect(gd).toContain('<GroundOffset M="0.2"/>');
    // mod.toml lists exactly the two files.
    const toml = plan.files.find((f) => f.path === 'mod.toml')!.data;
    expect(toml).toBe('name = "MyPad"\nassets = [ "MyPadAssets.xml", "MyPadGameData.xml" ]\n');
  });

  it('flags unknown pieces as errors', () => {
    const p = project();
    p.objects[0].placements.push({
      instanceId: 'x',
      pieceId: 'Nope',
      transform: identityTransform(),
      layerId: 'default',
    });
    const plan = buildModPlan(p, INDEX);
    expect(plan.issues.some((i) => i.severity === 'error' && i.message.includes('Nope'))).toBe(
      true,
    );
  });

  it('warns on scaled placements with colliders (I3) and missing FootprintRadius', () => {
    const p = project();
    p.objects[0].placements[0].transform.scale = { x: 2, y: 1, z: 1 };
    p.objects[0].footprintRadiusM = null;
    const plan = buildModPlan(p, INDEX);
    expect(plan.issues.some((i) => i.message.includes('never scales'))).toBe(true);
    expect(plan.issues.some((i) => i.message.includes('FootprintRadius'))).toBe(true);
  });

  it('warns when an object has no colliders at all (I4)', () => {
    const p = project();
    p.objects[0].placements = [p.objects[0].placements[1]]; // only the collider-less tank
    const plan = buildModPlan(p, INDEX);
    expect(plan.issues.some((i) => i.message.includes('fall through'))).toBe(true);
  });

  it('serializes systems into mod.toml when provided', () => {
    expect(serializeIcrpModToml('X', ['A.xml'], ['systems/x_system.xml'])).toBe(
      'name = "X"\nassets = [ "A.xml" ]\nsystems = [ "systems/x_system.xml" ]\n',
    );
  });
});
