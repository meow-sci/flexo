import { describe, expect, it } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { parseStaticCatalog } from './staticCatalog';
import { serializeStaticAssetsXml, serializeStaticGameDataXml } from './staticXmlSerializer';
import { identityTransform } from './types';

const parse = (xml: string) =>
  new DOMParser().parseFromString(xml, 'application/xml') as unknown as Document;

describe('static XML export', () => {
  it('uses global textures, keyed models, and resolvable static patches', () => {
    const assets = serializeStaticAssetsXml({
      meshAtlasPath: 'Meshes/custom.glb',
      materials: [
        { id: 'Mat', diffusePath: 'D.ktx2', normalPath: 'N.ktx2', aoRoughMetalPath: 'O.ktx2' },
      ],
      pieces: [{ id: 'Piece', meshId: 'Mesh', materialId: 'Mat' }],
      objects: [
        {
          id: 'Pad',
          placements: [{ instanceId: 'one', instanceOf: 'Piece', transform: identityTransform() }],
        },
      ],
    });
    const game = serializeStaticGameDataXml([
      {
        id: 'Pad',
        groundOffsetM: 0.2,
        surfaceHeightM: null,
        footprintRadiusM: null,
        placements: [{ instanceId: 'two', instanceOf: 'Piece', transform: identityTransform() }],
      },
    ]);
    expect(assets).toContain('<MeshAtlas Id="Icrp_MeshAtlas" Path="Meshes/custom.glb"/>');
    expect(assets).toContain('<Texture Id="Mat_Diffuse" Path="D.ktx2" Category="Vessel"/>');
    expect(assets).toContain('<Diffuse Ref="Mat_Diffuse"/>');
    expect(game).toContain('<StaticObject Id="Pad" Modify="Patch">');
    expect(game).toContain('<SubObjects Modify="Extend">');
    const catalog = parseStaticCatalog(
      [
        { file: 'assets.xml', doc: parse(assets) },
        { file: 'game.xml', doc: parse(game) },
      ],
      { mesh: 'Meshes/custom.glb' },
    );
    expect(catalog.pieces[0]).toMatchObject({
      id: 'Piece',
      meshNodeName: 'Mesh',
      materialId: 'Mat',
    });
    expect(catalog.objects[0].placements.map((p) => p.instanceId)).toEqual(['one', 'two']);
    expect(catalog.objects[0].groundOffsetM).toBe(0.2);
  });
});
