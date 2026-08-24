import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { hasKsaAssets, ksaAsset } from '../../../../src/ksa/ksaTestAssets';
import { directChildren } from '../../../../src/ksa/partXmlParser';
import { buildSystemXml, parseCelestialCorpus, type CelestialCorpus } from './systemXml';
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

/** Direct element children of the `<System>` root, in document order. */
function systemChildren(doc: Document): Element[] {
  const root = doc.documentElement!;
  expect(root.tagName).toBe('System');
  return Array.from(root.childNodes).filter((n): n is Element => n.nodeType === 1);
}

const MEOW: Site = {
  id: 'site-meow',
  landmarkId: 'Meow LC-1',
  bodyId: 'Earth',
  latDeg: 28.5,
  lonDeg: -80.6,
  staticObjectId: 'icrp_test_pad',
  decal: { ...defaultDecal(), terrainHeightM: 17.1 },
};

describe('parseCelestialCorpus (mini fixtures)', () => {
  it('indexes top-level bodies by Id and finds the stock <System>', () => {
    const corpus = parseMiniCorpus();
    expect(Array.from(corpus.bodies.keys())).toEqual(['Sol', 'Earth']);
    expect(corpus.bodies.get('Earth')!.tagName).toBe('AtmosphericBody');
    expect(corpus.stockSystem.getAttribute('Id')).toBe('Sol');
  });

  it('throws when no <System> document is given', () => {
    expect(() =>
      parseCelestialCorpus([
        { doc: parse(readMiniFixture('mini-astronomicals.xml')), file: 'mini-astronomicals.xml' },
      ]),
    ).toThrow(/no <System>/);
  });
});

describe('buildSystemXml (mini fixtures)', () => {
  it('with zero sites clones the stock system: only LoadFromLibrary rows, Id/DisplayName swapped', () => {
    const corpus = parseMiniCorpus();
    const result = buildSystemXml({
      systemId: 'icrp_test_sol',
      displayName: 'ICRP Test System',
      corpus,
      sites: [],
    });
    expect(result.idRefs).toBe(0);
    expect(result.pathRewrites).toBe(0);
    expect(result.xml.startsWith('<?xml version="1.0" encoding="utf-8"?>\n')).toBe(true);

    const doc = parse(result.xml);
    const root = doc.documentElement!;
    expect(root.getAttribute('Id')).toBe('icrp_test_sol');
    expect(directChildren(root, 'DisplayName')[0]!.getAttribute('Value')).toBe('ICRP Test System');

    // The stock body list survives as LoadFromLibrary rows with attributes intact.
    const rows = directChildren(root, 'LoadFromLibrary');
    expect(rows.map((r) => r.getAttribute('Id'))).toEqual(['Sol', 'Earth']);
    const earthRow = rows[1]!;
    expect(earthRow.getAttribute('Parent')).toBe('Sol');
    expect(earthRow.getAttribute('HomeBody')).toBe('true');
    expect(directChildren(root, 'AtmosphericBody')).toHaveLength(0);

    // Unmodeled children are copied wholesale.
    expect(directChildren(root, 'GalacticPlane')).toHaveLength(1);
    const vehicle = directChildren(root, 'LoadVehicleFromLibrary')[0]!;
    expect(vehicle.getAttribute('Id')).toBe('Rocket');
    expect(directChildren(vehicle, 'SituationRef')[0]!.getAttribute('InstanceOf')).toBe(
      'RocketStartingSituation',
    );
  });

  it('with one Earth site inlines Earth at the row position with landmarks/decals added', () => {
    const corpus = parseMiniCorpus();
    const result = buildSystemXml({
      systemId: 'icrp_test_sol',
      displayName: 'ICRP Test System',
      corpus,
      sites: [MEOW],
    });
    const doc = parse(result.xml);
    const root = doc.documentElement!;

    // Earth is inline at the position of its LoadFromLibrary row, carrying the
    // row's Parent/HomeBody attributes (AstronomicalTemplate.cs:20-24).
    expect(directChildren(root, 'LoadFromLibrary').map((r) => r.getAttribute('Id'))).toEqual([
      'Sol',
    ]);
    const children = systemChildren(doc);
    const solIndex = children.findIndex((el) => el.tagName === 'LoadFromLibrary');
    const earth = children[solIndex + 1]!;
    expect(earth.tagName).toBe('AtmosphericBody');
    expect(earth.getAttribute('Id')).toBe('Earth');
    expect(earth.getAttribute('Parent')).toBe('Sol');
    expect(earth.getAttribute('HomeBody')).toBe('true');

    // The new landmark is appended after the existing landmark run,
    // attribute-exact; the stock landmarks and the city survive.
    const landmarks = directChildren(earth, 'Landmark');
    expect(landmarks.map((l) => l.getAttribute('Id'))).toEqual([
      'CCSFS LC-39A',
      'VSFB LC-4',
      'Meow LC-1',
    ]);
    const meow = landmarks[2]!;
    expect(meow.getAttribute('IsLaunchPad')).toBe('true');
    expect(meow.getAttribute('StaticObject')).toBe('icrp_test_pad');
    expect(directChildren(meow, 'Latitude')[0]!.getAttribute('Degrees')).toBe('28.5');
    expect(directChildren(meow, 'Longitude')[0]!.getAttribute('Degrees')).toBe('-80.6');
    expect(directChildren(earth, 'City')).toHaveLength(1);

    // The decal lands at the END of the existing <Terrain><ProceduralModifiers>.
    const modifiers = directChildren(
      directChildren(earth, 'Terrain')[0]!,
      'ProceduralModifiers',
    )[0]!;
    expect(directChildren(modifiers, 'GradientScale')).toHaveLength(1);
    const decals = directChildren(modifiers, 'Modifier');
    expect(decals.map((d) => d.getAttribute('Name'))).toEqual([
      'LaunchSite_CCSFS-LC-39A',
      'LaunchSite_Meow-LC-1',
    ]);
    const ourDecal = decals[1]!;
    expect(directChildren(ourDecal, 'Radius')[0]!.getAttribute('Value')).toBe('300');
    expect(directChildren(ourDecal, 'AltitudeOffset')[0]!.getAttribute('Km')).toBe('17.1');
    expect(directChildren(ourDecal, 'Location')[0]!.getAttribute('Id')).toBe('Meow-LC-1');

    // Texture rules (P7.00): Id+Path elements become pure Id references, the
    // anonymous WindTexture is re-rooted, our decal's HeightMap collapses too.
    const diffuse = earth.getElementsByTagName('Diffuse')[0]!;
    expect(diffuse.getAttribute('Id')).toBe('Earth_Diffuse');
    expect(diffuse.hasAttribute('Path')).toBe(false);
    const wind = earth.getElementsByTagName('WindTexture')[0]!;
    expect(wind.getAttribute('Path')).toBe('../Core/Textures/Earth_Ocean_Wind.png');
    for (const decal of decals) {
      const heightMap = directChildren(decal, 'HeightMap')[0]!;
      expect(heightMap.getAttribute('Id')).toBe('Circle');
      expect(heightMap.hasAttribute('Path')).toBe(false);
      expect(heightMap.getAttribute('Category')).toBe('TerrainHeight');
    }
    // Mini Earth: Diffuse/Normal/Height + the stock decal HeightMap + ours = 5.
    expect(result.idRefs).toBe(5);
    expect(result.pathRewrites).toBe(1);
  });

  it('never mutates the corpus: a re-run produces identical output', () => {
    const corpus = parseMiniCorpus();
    const input = {
      systemId: 'icrp_test_sol',
      displayName: 'ICRP Test System',
      corpus,
      sites: [MEOW],
    };
    const first = buildSystemXml(input);
    const second = buildSystemXml(input);
    expect(second.xml).toBe(first.xml);
    expect(second.idRefs).toBe(first.idRefs);

    // And the corpus DOM still holds the untouched Core block.
    const earth = corpus.bodies.get('Earth')!;
    expect(earth.getElementsByTagName('Diffuse')[0]!.getAttribute('Path')).toBe(
      'Textures/Earth_Diffuse.ktx2',
    );
    expect(directChildren(earth, 'Landmark')).toHaveLength(2);
  });

  it('throws for a site on a body outside the corpus', () => {
    const corpus = parseMiniCorpus();
    expect(() =>
      buildSystemXml({
        systemId: 'icrp_test_sol',
        displayName: 'ICRP Test System',
        corpus,
        sites: [{ ...MEOW, bodyId: 'Krypton' }],
      }),
    ).toThrow(/Krypton/);
  });
});

describe.runIf(hasKsaAssets)('buildSystemXml (live Core tree)', () => {
  // KSA ships these files BOM-prefixed; @xmldom rejects a BOM before <?xml?>.
  const readLive = (name: string) => readFileSync(ksaAsset(name), 'utf-8').replace(/^\uFEFF/, '');

  it('one Earth site: stock body list survives, Earth inline, stock decals intact', () => {
    const stockSystemDoc = parse(readLive('SolSystem.xml'));
    const corpus = parseCelestialCorpus([
      { doc: parse(readLive('Astronomicals.xml')), file: 'Astronomicals.xml' },
      { doc: stockSystemDoc, file: 'SolSystem.xml' },
    ]);
    const stockEarth = corpus.bodies.get('Earth')!;
    const stockLandmarkCount = directChildren(stockEarth, 'Landmark').length;
    const stockModifierNames = directChildren(
      directChildren(directChildren(stockEarth, 'Terrain')[0]!, 'ProceduralModifiers')[0]!,
      'Modifier',
    ).map((m) => m.getAttribute('Name'));
    const stockRows = directChildren(stockSystemDoc.documentElement!, 'LoadFromLibrary').map((r) =>
      r.getAttribute('Id'),
    );
    const stockInlineIds = Array.from(stockSystemDoc.documentElement!.childNodes)
      .filter((n): n is Element => n.nodeType === 1)
      .filter((el) => el.tagName !== 'LoadFromLibrary' && el.hasAttribute('Id'))
      .filter((el) => el.tagName !== 'LoadVehicleFromLibrary')
      .map((el) => el.getAttribute('Id'));

    const result = buildSystemXml({
      systemId: 'icrp_test_sol',
      displayName: 'ICRP Test System',
      corpus,
      sites: [MEOW],
    });
    const doc = parse(result.xml);
    const root = doc.documentElement!;
    const outRows = directChildren(root, 'LoadFromLibrary').map((r) => r.getAttribute('Id'));
    const outInline = new Map(
      Array.from(root.childNodes)
        .filter((n): n is Element => n.nodeType === 1)
        .filter((el) => el.tagName !== 'LoadFromLibrary' && el.tagName !== 'LoadVehicleFromLibrary')
        .filter((el) => el.hasAttribute('Id'))
        .map((el) => [el.getAttribute('Id'), el] as const),
    );

    // Every stock body survives: Earth becomes inline, everything else keeps
    // its row; Core's own inline bodies (Titan, Neptune, Ceres, …) come along.
    for (const id of stockRows) {
      if (id === 'Earth') expect(outRows).not.toContain(id);
      else expect(outRows).toContain(id);
    }
    for (const id of stockInlineIds) expect(outInline.has(id)).toBe(true);

    const earth = outInline.get('Earth')!;
    expect(earth.tagName).toBe('AtmosphericBody');
    expect(earth.getAttribute('HomeBody')).toBe('true');
    expect(directChildren(earth, 'Landmark')).toHaveLength(stockLandmarkCount + 1);

    // The real stock decal modifiers are intact, ours appended last.
    const outModifierNames = directChildren(
      directChildren(directChildren(earth, 'Terrain')[0]!, 'ProceduralModifiers')[0]!,
      'Modifier',
    ).map((m) => m.getAttribute('Name'));
    expect(outModifierNames).toEqual([...stockModifierNames, 'LaunchSite_Meow-LC-1']);

    // P7.00's census of the current build: Earth has 83 Id'd + 3 anonymous
    // Path= elements; ICRP's decal HeightMap adds 1 Id ref; SolSystem.xml's
    // inline bodies carry 21 more Id'd Path= elements (0 anonymous).
    expect(result.pathRewrites).toBe(3);
    expect(result.idRefs).toBe(83 + 1 + 21);
  });
});
