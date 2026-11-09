import { describe, expect, it } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { serializeAssets } from './assetsXmlSerializer';
import { resolveContent } from './contentXml';

const parse = (xml: string) =>
  new DOMParser().parseFromString(xml, 'application/xml') as unknown as Document;

describe('5801 custom asset definitions', () => {
  it('defines file-backed textures once and references them from materials and model components', () => {
    const xml = serializeAssets([
      {
        meshAtlasPath: 'Meshes/pack.glb',
        materials: [
          {
            id: 'mat',
            diffusePath: 'Textures/a.ktx2',
            normalPath: 'Textures/n.ktx2',
            aoRoughMetalPath: 'Textures/orm.ktx2',
            emissivePath: 'Textures/e.ktx2',
          },
          {
            id: 'glass',
            diffusePath: 'Textures/a.ktx2',
            normalPath: 'Textures/n.ktx2',
            aoRoughMetalPath: 'Textures/orm.ktx2',
          },
        ],
        subParts: [
          { subPartId: 'body', materialId: 'mat', internal: true },
          { subPartId: 'window', materialId: 'glass', glass: true, internal: true },
        ],
      },
    ]);
    const content = resolveContent([{ file: 'assets.xml', doc: parse(xml) }]);
    const root = content.doc.documentElement;
    const atlas = root.getElementsByTagName('MeshAtlas')[0];
    expect(atlas.getAttribute('Id')).toBeTruthy();
    expect(atlas.getAttribute('Path')).toBe('Meshes/pack.glb');
    const textures = Array.from(root.getElementsByTagName('Texture'));
    expect(textures).toHaveLength(4);
    for (const texture of textures) {
      expect(texture.getAttribute('Id')).toBeTruthy();
      expect(texture.getAttribute('Path')).toMatch(/^Textures\//);
      expect(texture.getAttribute('Category')).toBe('Vessel');
    }
    const materials = Array.from(root.getElementsByTagName('PbrMaterial'));
    for (const material of materials)
      for (const slot of Array.from(material.childNodes).filter(
        (n): n is Element => n.nodeType === 1,
      )) {
        expect(textures.some((t) => t.getAttribute('Id') === slot.getAttribute('Ref'))).toBe(true);
        expect(slot.hasAttribute('Path')).toBe(false);
      }
    const body = Array.from(root.getElementsByTagName('SubPart')).find(
      (s) => s.getAttribute('Id') === 'body',
    )!;
    expect(body.getElementsByTagName('PartModel')[0].getAttribute('Key')).toBe('body_Model');
    expect(body.getElementsByTagName('Mesh')[0].getAttribute('Ref')).toBe('body');
    expect(body.getElementsByTagName('Material')[0].getAttribute('Ref')).toBe('mat');
    expect(body.getElementsByTagName('Internal')[0].textContent).toBe('true');
    expect(body.getElementsByTagName('Mesh')[1].getAttribute('Ref')).toBe('body_VM');
    const glass = root.getElementsByTagName('PartModelGlass')[0];
    expect(glass.getElementsByTagName('Internal')).toHaveLength(0);
  });

  it('rejects case-insensitive duplicate definitions', () => {
    expect(() =>
      serializeAssets([
        {
          subParts: [
            { subPartId: 'Body', materialId: 'm' },
            { subPartId: 'body', materialId: 'm' },
          ],
        },
      ]),
    ).toThrow(/duplicate/);
  });
});
