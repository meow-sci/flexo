import { describe, expect, it } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { readVendoredAsset } from '../../../../src/ksa/ksaTestAssets';
import {
  indexStaticPieces,
  mergeStaticGameData,
  parseStaticCatalog,
  type StaticCatalog,
} from './staticCatalog';

// Runs against the committed fixtures (src/ksa/__fixtures__/), so it exercises the
// REAL Core static-object data of the current KSA baseline without the private tree.
const FIXTURES = [
  'CoreLaunchPadAAssets.xml',
  'CoreLaunchPadBAssets.xml',
  'CoreLaunchPadCAssets.xml',
  'CoreLaunchPadAGameData.xml',
];

function parseFixtures(): StaticCatalog {
  const parser = new DOMParser();
  const docs = FIXTURES.map((file) => ({
    doc: parser.parseFromString(readVendoredAsset(file), 'application/xml') as unknown as Document,
    file,
  }));
  return parseStaticCatalog(docs);
}

describe('parseStaticCatalog (Core launch pad fixtures)', () => {
  const catalog = parseFixtures();

  it('loads the 10 pieces across the three asset files', () => {
    expect(catalog.pieces).toHaveLength(10);
    const index = indexStaticPieces(catalog.pieces);
    expect(index.has('CoreLaunchPadA_Subpart_FootpathA')).toBe(true);
    expect(index.has('CoreLaunchPadB_Subpart_GravelTrimA')).toBe(true);
    expect(index.has('CoreLaunchPadC_Subpart_BaseGrassA')).toBe(true);
  });

  it('resolves each piece to its own file’s default atlas + the global material', () => {
    const index = indexStaticPieces(catalog.pieces);
    const footpath = index.get('CoreLaunchPadA_Subpart_FootpathA')!;
    expect(footpath.atlasUrl).toContain('Meshes/CoreLaunchPadA_MeshAtlas.glb');
    expect(footpath.meshNodeName).toBe('CoreLaunchPadA_Subpart_FootpathA');
    expect(footpath.materialId).toBe('CoreLaunchPadA_Material');
    expect(footpath.diffuseUrl).toContain('CoreLaunchPadA_TextureAtlas_Diffuse.ktx2');
    expect(footpath.alphaUrl).toBeUndefined();
    expect(footpath.terrain).toBe(false);
  });

  it('reads the <Alpha> slot on the GravelTrim material (fact F7 — Blended bucket)', () => {
    const gravel = indexStaticPieces(catalog.pieces).get('CoreLaunchPadB_Subpart_GravelTrimA')!;
    expect(gravel.alphaUrl).toContain('CoreLaunchPadB_TextureAtlas_Alpha.ktx2');
    expect(gravel.colliders).toHaveLength(0);
  });

  it('reads <Terrain>true</Terrain> on BaseGrass (fact F6)', () => {
    const grass = indexStaticPieces(catalog.pieces).get('CoreLaunchPadC_Subpart_BaseGrassA')!;
    expect(grass.terrain).toBe(true);
    // 48 Box + 1 Cylinder in the fixture.
    expect(grass.colliders).toHaveLength(49);
  });

  it('reads piece colliders with the piece as owner (FootpathA: 49 boxes)', () => {
    const footpath = indexStaticPieces(catalog.pieces).get('CoreLaunchPadA_Subpart_FootpathA')!;
    expect(footpath.colliders).toHaveLength(49);
    expect(footpath.colliders[0].shape).toBe('Box');
    expect(footpath.colliders[0].ownerTemplateId).toBe('CoreLaunchPadA_Subpart_FootpathA');
  });

  it('parses the prefab: 16 placements incl. cross-file InstanceOf refs (fact F3)', () => {
    expect(catalog.objects).toHaveLength(1);
    const pad = catalog.objects[0];
    expect(pad.id).toBe('CoreLaunchPadA_Prefab_LaunchPadA');
    expect(pad.placements).toHaveLength(16);
    const instanceOfs = new Set(pad.placements.map((p) => p.instanceOf));
    // 10 distinct pieces; two come from the B/C files (cross-file references).
    expect(instanceOfs.size).toBe(10);
    expect(instanceOfs.has('CoreLaunchPadB_Subpart_GravelTrimA')).toBe(true);
    expect(instanceOfs.has('CoreLaunchPadC_Subpart_BaseGrassA')).toBe(true);
    // The shipped prefab authors no object-level colliders.
    expect(pad.colliders).toHaveLength(0);
  });

  it('reads placement transforms in KSA raw units (metres / XYZ radians)', () => {
    const pad = catalog.objects[0];
    const ramp = pad.placements.find(
      (p) => p.instanceId === 'CoreLaunchPadA_Subpart_CrawlerRampA1',
    )!;
    expect(ramp.transform.position.x).toBeCloseTo(0.6366, 6);
    expect(ramp.transform.position.z).toBeCloseTo(32.6905, 6);
    expect(ramp.transform.rotation.x).toBeCloseTo(-1.5708, 6);
    expect(ramp.transform.scale).toEqual({ x: 1, y: 1, z: 1 });
  });

  it('merges the GameData metres onto the prefab (fact F10)', () => {
    const pad = catalog.objects[0];
    expect(pad.groundOffsetM).toBeCloseTo(0.2, 9);
    expect(pad.surfaceHeightM).toBeCloseTo(1.5537, 9);
    expect(pad.footprintRadiusM).toBeCloseTo(108.3, 9);
  });
});

describe('mergeStaticGameData (ApplyGameData semantics)', () => {
  it('appends lists and overrides only the SET distances', () => {
    const obj = {
      id: 'X',
      placements: [],
      colliders: [],
      groundOffsetM: 1,
      surfaceHeightM: 2,
      footprintRadiusM: null,
      sourceFile: 'a.xml',
    };
    mergeStaticGameData(
      [obj],
      [
        {
          id: 'X',
          placements: [
            {
              instanceId: 'p1',
              instanceOf: 'P',
              transform: {
                position: { x: 0, y: 0, z: 0 },
                rotation: { x: 0, y: 0, z: 0 },
                scale: { x: 1, y: 1, z: 1 },
              },
            },
          ],
          colliders: [],
          groundOffsetM: null, // unset → keeps 1
          surfaceHeightM: 9, // set → overrides 2
          footprintRadiusM: 50,
        },
      ],
    );
    expect(obj.placements).toHaveLength(1);
    expect(obj.groundOffsetM).toBe(1);
    expect(obj.surfaceHeightM).toBe(9);
    expect(obj.footprintRadiusM).toBe(50);
  });
});
