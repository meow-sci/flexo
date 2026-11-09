import { expect, it } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { catalogFromContent } from './catalog';
import { resolveContent } from './contentXml';

it('resolves all render components and cross-file texture references', () => {
  const parse = (xml: string) =>
    new DOMParser().parseFromString(xml, 'application/xml') as unknown as Document;
  const content = resolveContent([
    {
      file: 'a',
      doc: parse(
        `<Assets><SubPart Id="p"><Components><PartModel Key="a"><Mesh Ref="mesh"/><Material Ref="mat"/></PartModel><PartModelGlass Key="b"><Mesh Ref="mesh"/><Material Ref="mat"/></PartModelGlass><MeshView><Mesh Ref="view"/></MeshView></Components></SubPart></Assets>`,
      ),
    },
    {
      file: 'b',
      doc: parse(
        `<Assets><Texture Id="tex" Path="Textures/test.ktx2"/><PbrMaterial Id="mat"><Diffuse Ref="tex"/></PbrMaterial></Assets>`,
      ),
    },
  ]);
  const [entry] = catalogFromContent(content, { mesh: 'Meshes/test.glb' });
  expect(entry.diffuseUrl).toContain('Textures/test.ktx2');
  expect(entry.models?.map((m) => m.kind)).toEqual(['PartModel', 'PartModelGlass']);
  expect(entry.renderComponents?.map((m) => m.tag)).toEqual([
    'PartModel',
    'PartModelGlass',
    'MeshView',
  ]);
  expect(entry.raw?.attrs.Id).toBe('p');
});

it('retains a metadata-only SubPart without manufacturing a render model', () => {
  const doc = new DOMParser().parseFromString(
    `<Assets><SubPart Id="hidden"><RocketThrusterControllers><RocketThrusterController Key="rcs"/></RocketThrusterControllers></SubPart></Assets>`,
    'application/xml',
  ) as unknown as Document;
  const [entry] = catalogFromContent(resolveContent([{ file: 'test', doc }]), {});
  expect(entry).toMatchObject({ id: 'hidden', atlasUrl: '', meshNodeName: null, models: [] });
  expect(entry.raw?.tag).toBe('SubPart');
  expect(entry.data?.gameData?.rocketControllers[0].id).toBe('rcs');
});
