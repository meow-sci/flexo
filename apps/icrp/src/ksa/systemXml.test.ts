import { readFileSync } from 'node:fs';
import { DOMParser } from '@xmldom/xmldom';
import { describe, expect, it } from 'vitest';
import { buildSystemXml, parseCelestialCorpus } from './systemXml';
import { defaultDecal, type Site } from './siteTypes';

const parse = (name: string) => ({
  file: name,
  doc: new DOMParser().parseFromString(
    readFileSync(`apps/icrp/src/ksa/__fixtures__/${name}`, 'utf8'),
    'application/xml',
  ) as unknown as Document,
});
const corpus = () =>
  parseCelestialCorpus([parse('mini-astronomicals.xml'), parse('mini-solsystem.xml')]);
const site: Site = {
  id: 'x',
  landmarkId: 'New Pad',
  bodyId: 'Earth',
  latDeg: 1,
  lonDeg: 2,
  staticObjectId: 'Pad',
  decal: defaultDecal(),
};
const build = (sites: Site[]) =>
  buildSystemXml({
    systemId: 'Test',
    displayName: 'Test System',
    modId: 'test',
    corpus: corpus(),
    sites,
  });
describe('system export', () => {
  it('preserves the system and vehicles and redirects the site body and its child', () => {
    const out = build([site]);
    expect(out.xml).toContain('<System Id="Test">');
    expect(out.xml).toContain('<Body Ref="Earth_test" HomeBody="true"/>');
    expect(out.xml).toContain('<Body Ref="Luna_test"/>');
    expect(out.xml).toContain('<Vehicle Ref="Rocket_test"/>');
    expect(out.bodiesXml).toContain('<Vehicle Id="Rocket_test">');
    expect(out.bodiesXml).toContain('<Situation Ref="Start"/>');
    expect(out.bodiesXml).toContain('<ParentBody Ref="Earth_test"/>');
    expect(out.bodiesXml).toContain('<Landmark Key="New Pad" IsLaunchPad="true">');
    expect(out.bodiesXml).toContain('<HeightMap Ref="Circle"/>');
    expect(out.addedLandmarks).toBe(1);
  });
  it('retargets an existing landmark once', () => {
    const out = build([{ ...site, landmarkId: 'Stock' }]);
    expect(out.retargetedLandmarks).toBe(1);
    expect(out.bodiesXml!.match(/Landmark Key="Stock"/g)).toHaveLength(1);
    expect(out.bodiesXml).toContain('<StaticObject Ref="Pad"/>');
  });
  it('keeps the stock system when there are no sites', () => {
    const out = build([]);
    expect(out.bodiesXml).toBeNull();
    expect(out.xml).toContain('<Body Ref="Earth" HomeBody="true"/>');
  });
});

import { hasKsaAssets, ksaAsset } from '../../../../src/ksa/ksaTestAssets';
import { resolveContent } from '../../../../src/ksa/contentXml';
it.runIf(hasKsaAssets)('resolves the shipped Sol corpus and redirects starting vehicles', () => {
  const files = ['Astronomicals.xml', 'SolSystem.xml'];
  const parser = new DOMParser();
  const astro = {
    file: files[0],
    doc: parser.parseFromString(
      readFileSync(ksaAsset(files[0]), 'utf8').replace(/^\uFEFF/, ''),
      'application/xml',
    ) as unknown as Document,
  };
  const sol = {
    file: files[1],
    doc: parser.parseFromString(
      readFileSync(ksaAsset(files[1]), 'utf8').replace(/^\uFEFF/, ''),
      'application/xml',
    ) as unknown as Document,
  };
  const content = resolveContent([
    astro,
    parse('SolSystemAstronomicals.xml'),
    parse('SolSystemVehicles.xml'),
    sol,
  ]);
  const current = parseCelestialCorpus([{ file: 'Core', doc: content.doc }]);
  const out = buildSystemXml({
    systemId: 'Test',
    displayName: 'Test',
    modId: 'test',
    corpus: current,
    sites: [site],
  });
  expect(out.xml).toContain('<Vehicle Ref="Gemini7_test"/>');
  expect(out.xml).toContain('<Vehicle Ref="Rocket_test"/>');
  expect(out.bodiesXml).toContain('<ParentBody Ref="Earth_test"/>');
});
