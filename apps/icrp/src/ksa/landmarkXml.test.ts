import { DOMImplementation, XMLSerializer } from '@xmldom/xmldom';
import { describe, expect, it } from 'vitest';
import { buildDecalModifierElement, buildLandmarkElement } from './landmarkXml';
import { defaultDecal, type Site } from './siteTypes';

const doc = new DOMImplementation().createDocument(null, 'Assets', null) as unknown as Document;
const site: Site = {
  id: 'x',
  landmarkId: 'New Pad',
  bodyId: 'Earth',
  latDeg: 1,
  lonDeg: 2,
  staticObjectId: 'Pad',
  decal: { ...defaultDecal(), radiusM: 300, terrainHeightM: 225 },
};
const xml = (el: Element) => new XMLSerializer().serializeToString(el as never);
describe('current landmark and decal XML', () => {
  it('uses keyed landmarks and references', () => {
    expect(xml(buildLandmarkElement(doc, site))).toContain(
      '<Landmark Key="New Pad" IsLaunchPad="true"><StaticObject Ref="Pad"/>',
    );
  });
  it('uses keyed biome refs and kilometre units', () => {
    const result = xml(buildDecalModifierElement(doc, site));
    expect(result).toContain('<Decal Key="LaunchSite_New-Pad">');
    expect(result).toContain('<Biome KeyRef="Grass"/>');
    expect(result).toContain('<Radius Value="0.3"/>');
    expect(result).toContain('<AltitudeOffset Km="0.225"/>');
    expect(result).toContain('<HeightMap Ref="Circle"/>');
  });
});
