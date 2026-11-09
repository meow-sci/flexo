import { describe, expect, it } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { catalogFromContent, indexCatalog } from './catalog';
import { resolveContent } from './contentXml';
import { buildMultiCustomBundle, buildMultiModContent, partExportNs } from './modExport';
import {
  createEmptyPart,
  createPartLight,
  createSubPartGameData,
  identityTransform,
} from './types';

const parse = (xml: string) =>
  new DOMParser().parseFromString(xml, 'application/xml') as unknown as Document;
const stock = `<Assets>
  <Texture Id="D" Path="Textures/d.ktx2" Category="Vessel"/>
  <Texture Id="N" Path="Textures/n.ktx2" Category="Vessel"/>
  <Texture Id="O" Path="Textures/o.ktx2" Category="Vessel"/>
  <PbrMaterial Id="Mat"><Diffuse Ref="D"/><Normal Ref="N"/><AoRoughMetal Ref="O"/><ThinFilm Ref="O"/><Alpha Ref="D"/></PbrMaterial>
  <SubPart Id="Stock" DisplayName="Original">
    <Components>
      <PartModel Key="Opaque"><Mesh Ref="A"/><Material Ref="Mat"/><RayTracing>ShadowProxy</RayTracing><ShadowCaster>false</ShadowCaster></PartModel>
      <PartModelGlass Key="Glass"><Mesh Ref="B"/><Material Ref="Mat"/></PartModelGlass>
      <MeshView><Mesh Ref="View"/></MeshView>
      <Tank Key="OldTank"><SphericalTank><OuterRadius M="1"/><WallThickness Mm="4"/><Material Ref="Aluminum.2014" Phase="Solid"/></SphericalTank></Tank>
    </Components>
  </SubPart>
</Assets>`;

describe('5801 mod export', () => {
  it('resolves definitions and patches in order, preserving every render component while deleting an inherited module', async () => {
    const core = resolveContent([{ file: 'core.xml', doc: parse(stock) }]);
    const catalog = indexCatalog(
      catalogFromContent(core, { a: 'Meshes/stock.glb', b: 'Meshes/stock.glb' }),
    );
    const parts = ['First', 'Second'].map((name) => {
      const part = createEmptyPart();
      part.partId = name;
      part.placements.push({
        instanceId: 'body',
        subPartTemplateId: 'Stock',
        ...identityTransform(),
        layerId: 'default',
      });
      part.subPartGameData.push(createSubPartGameData('Stock'));
      if (name === 'First') {
        part.internalFlags.Stock = true;
        part.lights.push(createPartLight('Stock', 'lamp'));
      }
      return { entryId: name, name, ns: partExportNs(name), part };
    });
    const content = buildMultiModContent(parts, 'Fleet', catalog);
    const bundle = await buildMultiCustomBundle(content);
    const resolved = resolveContent([
      { file: 'core.xml', doc: parse(stock) },
      { file: content.partFile, doc: parse(content.partXml) },
      { file: bundle.assetsFile!, doc: parse(bundle.assetsXml!) },
      { file: content.gameDataFile, doc: parse(content.gameDataXml) },
    ]);
    const subs = Array.from(resolved.doc.getElementsByTagName('SubPart'));
    const first = subs.find((s) => s.getAttribute('Id') === 'flexo_Fleet_First_Stock')!;
    const second = subs.find((s) => s.getAttribute('Id') === 'flexo_Fleet_Second_Stock')!;
    for (const sub of [first, second]) {
      expect(sub.getAttribute('DisplayName')).toBe('Original');
      expect(sub.getElementsByTagName('PartModel')).toHaveLength(1);
      expect(sub.getElementsByTagName('PartModelGlass')).toHaveLength(1);
      expect(
        sub.getElementsByTagName('MeshView')[0].getElementsByTagName('Mesh')[0].getAttribute('Ref'),
      ).toBe('View');
      expect(sub.getElementsByTagName('RayTracing')[0].textContent).toBe('ShadowProxy');
      expect(sub.getElementsByTagName('ShadowCaster')[0].textContent).toBe('false');
      expect(sub.getElementsByTagName('Tank')).toHaveLength(0);
    }
    expect(first.getElementsByTagName('Internal')[0].textContent).toBe('true');
    expect(first.getElementsByTagName('Light')).toHaveLength(1);
    expect(second.getElementsByTagName('Light')).toHaveLength(0);
    expect(
      subs.find((s) => s.getAttribute('Id') === 'Stock')!.getElementsByTagName('Tank'),
    ).toHaveLength(1);
  });
});
