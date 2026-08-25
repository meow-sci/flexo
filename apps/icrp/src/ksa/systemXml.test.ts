import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { hasKsaAssets, ksaAsset } from '../../../../src/ksa/ksaTestAssets';
import { directChildren } from '../../../../src/ksa/partXmlParser';
import {
  buildSystemXml,
  parseCelestialCorpus,
  type CelestialCorpus,
  type SystemXmlInput,
} from './systemXml';
import { defaultDecal, type Site } from './siteTypes';

/** ICRP's own structural minis (NOT the byte-synced vendored Core fixtures). */
function readMiniFixture(name: string): string {
  return readFileSync(join(import.meta.dirname, '__fixtures__', name), 'utf-8');
}

function parse(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'application/xml') as unknown as Document;
}

function parseMiniCorpus(): CelestialCorpus {
  return parseCelestialCorpus([
    { doc: parse(readMiniFixture('mini-astronomicals.xml')), file: 'mini-astronomicals.xml' },
    { doc: parse(readMiniFixture('mini-solsystem.xml')), file: 'mini-solsystem.xml' },
  ]);
}

const INSTALL = 'C:/Program Files/Kitten Space Agency';

function input(corpus: CelestialCorpus, sites: Site[]): SystemXmlInput {
  return {
    systemId: 'testmod_sol',
    displayName: 'Sol — Test',
    modId: 'testmod',
    corpus,
    sites,
    texturePaths: { mode: 'absolute', installPath: INSTALL },
  };
}

const EARTH_SITE: Site = {
  id: 's1',
  landmarkId: 'Meow LC-1',
  bodyId: 'Earth',
  latDeg: 28.5,
  lonDeg: -80.6,
  staticObjectId: 'icrp_test_object',
  decal: defaultDecal(),
};

/** Direct element children of a parsed document's `<System>` root. */
function systemChildren(doc: Document): Element[] {
  const root = doc.documentElement!;
  return Array.from(root.childNodes).filter((n): n is Element => n.nodeType === 1);
}

describe('buildSystemXml (mini corpus) — TemplateLookup architecture', () => {
  it('zero sites: a faithful stock clone, no bodies file', () => {
    const corpus = parseMiniCorpus();
    const result = buildSystemXml(input(corpus, []));
    expect(result.bodiesXml).toBeNull();
    expect(result.renamedBodies.size).toBe(0);
    const out = parse(result.xml);
    expect(out.documentElement!.getAttribute('Id')).toBe('testmod_sol');
    const rows = systemChildren(out).filter((el) => el.tagName === 'LoadFromLibrary');
    expect(rows.map((r) => r.getAttribute('Id'))).toEqual(['Sol', 'Earth']);
  });

  it('a site body is CLONED into the bodies file (mod-suffixed id) and the system row swaps to LoadFromLibrary', () => {
    const corpus = parseMiniCorpus();
    const result = buildSystemXml(input(corpus, [EARTH_SITE]));
    expect(result.renamedBodies.get('Earth')).toBe('Earth_testmod');

    // System: NO inline Earth (an inline body's landmarks never resolve —
    // StaticObject.ResolveAll walks TemplateLookup only), row swapped in place
    // with Parent + HomeBody carried, vehicle Parent follows the rename.
    const out = parse(result.xml);
    const children = systemChildren(out);
    expect(children.some((el) => el.tagName === 'AtmosphericBody')).toBe(false);
    const rows = children.filter((el) => el.tagName === 'LoadFromLibrary');
    expect(rows.map((r) => r.getAttribute('Id'))).toEqual(['Sol', 'Earth_testmod']);
    const earthRow = rows[1];
    expect(earthRow.getAttribute('Parent')).toBe('Sol');
    expect(earthRow.getAttribute('HomeBody')).toBe('true');
    const vehicle = children.find((el) => el.tagName === 'LoadVehicleFromLibrary')!;
    expect(vehicle.getAttribute('Parent')).toBe('Earth_testmod');

    // Bodies file: the full Earth clone under the new id, with the added
    // landmark, the stock landmarks/city/decal preserved, and Parent carried.
    const bodies = parse(result.bodiesXml!);
    expect(bodies.documentElement!.tagName).toBe('Assets');
    const clone = directChildren(bodies.documentElement!, 'AtmosphericBody')[0];
    expect(clone.getAttribute('Id')).toBe('Earth_testmod');
    expect(clone.getAttribute('Parent')).toBe('Sol');
    const landmarks = directChildren(clone, 'Landmark');
    expect(landmarks.map((l) => l.getAttribute('Id'))).toEqual([
      'CCSFS LC-39A',
      'VSFB LC-4',
      'Meow LC-1',
    ]);
    const added = landmarks[2];
    expect(added.getAttribute('IsLaunchPad')).toBe('true');
    expect(added.getAttribute('StaticObject')).toBe('icrp_test_object');
    // The new site's decal joined the existing ProceduralModifiers.
    expect(result.bodiesXml).toContain('LaunchSite_Meow-LC-1');
    expect(result.bodiesXml).toContain('LaunchSite_CCSFS-LC-39A'); // stock kept
  });

  it('texture paths: every relative Path= becomes absolute into the install; Ids preserved', () => {
    const corpus = parseMiniCorpus();
    const result = buildSystemXml(input(corpus, [EARTH_SITE]));
    const bodies = result.bodiesXml!;
    expect(bodies).toContain(
      `Id="Earth_Diffuse" Path="${INSTALL}/Content/Core/Textures/Earth_Diffuse.ktx2"`,
    );
    // The anonymous WindTexture too.
    expect(bodies).toContain(`Path="${INSTALL}/Content/Core/Textures/Earth_Ocean_Wind.png"`);
    // ICRP's own decal height map is rewritten as well.
    expect(bodies).toContain(`Path="${INSTALL}/Content/Core/Textures/Planets/_Decals/circle.dds"`);
    // No relative Textures/ path survives anywhere in the bodies file.
    expect(/Path="Textures\//.test(bodies)).toBe(false);
    expect(result.texturesRewritten).toBeGreaterThanOrEqual(6);
  });

  it("'core-relative' mode writes ../Core/ prefixes instead", () => {
    const corpus = parseMiniCorpus();
    const result = buildSystemXml({
      ...input(corpus, [EARTH_SITE]),
      texturePaths: { mode: 'core-relative' },
    });
    expect(result.bodiesXml).toContain('Path="../Core/Textures/Earth_Diffuse.ktx2"');
  });

  it('is repeatable: the corpus is never mutated', () => {
    const corpus = parseMiniCorpus();
    const first = buildSystemXml(input(corpus, [EARTH_SITE]));
    const second = buildSystemXml(input(corpus, [EARTH_SITE]));
    expect(second.xml).toBe(first.xml);
    expect(second.bodiesXml).toBe(first.bodiesXml);
  });

  it('throws on a site body missing from the corpus', () => {
    const corpus = parseMiniCorpus();
    expect(() => buildSystemXml(input(corpus, [{ ...EARTH_SITE, bodyId: 'Nope' }]))).toThrow(
      /not in the celestial corpus/,
    );
  });
});

describe('stock-site retargeting (matched landmark Id)', () => {
  const retarget: Site = {
    ...EARTH_SITE,
    landmarkId: 'CCSFS LC-39A',
    latDeg: 11.5,
    lonDeg: -22.25,
  };

  it('retargets the CLONE in place: no duplicate, StaticObject + coords replaced, decal skipped', () => {
    const corpus = parseMiniCorpus();
    const result = buildSystemXml(input(corpus, [retarget]));
    expect(result.retargetedLandmarks).toBe(1);
    expect(result.addedLandmarks).toBe(0);
    const bodies = parse(result.bodiesXml!);
    const clone = directChildren(bodies.documentElement!, 'AtmosphericBody')[0];
    const landmarks = directChildren(clone, 'Landmark');
    expect(landmarks).toHaveLength(2); // replaced, not appended
    const target = landmarks.find((l) => l.getAttribute('Id') === 'CCSFS LC-39A')!;
    expect(target.getAttribute('StaticObject')).toBe('icrp_test_object');
    expect(directChildren(target, 'Latitude')[0].getAttribute('Degrees')).toBe('11.5');
    // ICRP's decal is NOT appended — the stock one (already present) is kept.
    expect((result.bodiesXml!.match(/LaunchSite_CCSFS-LC-39A/g) ?? []).length).toBe(1);
  });
});

describe.runIf(hasKsaAssets)('buildSystemXml (live Core tree)', () => {
  function parseLiveCorpus(): CelestialCorpus {
    const read = (name: string) =>
      parse(readFileSync(ksaAsset(name), 'utf-8').replace(/^\uFEFF/, ''));
    return parseCelestialCorpus([
      { doc: read('Astronomicals.xml'), file: 'Astronomicals.xml' },
      { doc: read('SolSystem.xml'), file: 'SolSystem.xml' },
    ]);
  }

  it('clones the REAL Earth into the bodies file and keeps the whole stock system', () => {
    const corpus = parseLiveCorpus();
    const stockRowIds = directChildren(corpus.stockSystem, 'LoadFromLibrary').map((el) =>
      el.getAttribute('Id'),
    );
    const result = buildSystemXml(input(corpus, [EARTH_SITE]));

    const out = parse(result.xml);
    const rows = systemChildren(out)
      .filter((el) => el.tagName === 'LoadFromLibrary')
      .map((el) => el.getAttribute('Id'));
    // Every stock row survives, with Earth swapped for the clone.
    for (const id of stockRowIds) {
      if (id === 'Earth') expect(rows).toContain('Earth_testmod');
      else expect(rows).toContain(id);
    }
    expect(rows).not.toContain('Earth');
    // No inline Earth in the system; Core's other inline bodies survive.
    expect(systemChildren(out).some((el) => el.getAttribute('Id') === 'Earth')).toBe(false);

    // The clone carries the REAL Earth block: stock landmark count + 1.
    const bodies = parse(result.bodiesXml!);
    const clone = directChildren(bodies.documentElement!, 'AtmosphericBody')[0];
    expect(clone.getAttribute('Id')).toBe('Earth_testmod');
    expect(clone.getAttribute('HomeBody')).toBe('true');
    const stockEarth = corpus.bodies.get('Earth')!;
    const stockLandmarkCount = directChildren(stockEarth, 'Landmark').length;
    expect(directChildren(clone, 'Landmark')).toHaveLength(stockLandmarkCount + 1);

    // No relative texture path survives in either file's inline/cloned bodies.
    expect(/Path="Textures\//.test(result.bodiesXml!)).toBe(false);
    expect(/Path="Textures\//.test(result.xml)).toBe(false);
    // Earth's ~86 paths + the decal + SolSystem's ~21 inline paths.
    expect(result.texturesRewritten).toBeGreaterThanOrEqual(100);

    // Every LoadVehicleFromLibrary that parented to Earth follows the clone.
    const vehicles = systemChildren(out).filter((el) => el.tagName === 'LoadVehicleFromLibrary');
    expect(vehicles.length).toBeGreaterThan(0);
    for (const v of vehicles) {
      expect(v.getAttribute('Parent')).not.toBe('Earth');
    }
  });
});
