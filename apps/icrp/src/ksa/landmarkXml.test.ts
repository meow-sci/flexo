import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DOMImplementation, DOMParser } from '@xmldom/xmldom';
import { hasKsaAssets, ksaAsset } from '../../../../src/ksa/ksaTestAssets';
import { buildDecalModifierElement, buildLandmarkElement, sanitizeSiteId } from './landmarkXml';
import type { Site } from './siteTypes';

/** ICRP's own structural minis (NOT the byte-synced vendored Core fixtures). */
function readMiniFixture(name: string): string {
  return readFileSync(join(import.meta.dirname, '__fixtures__', name), 'utf-8');
}

function parse(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'application/xml') as unknown as Document;
}

/** A fresh element-factory document (matches the browser/@xmldom split). */
function newDoc(): Document {
  return new DOMImplementation().createDocument(null, '', null) as unknown as Document;
}

/**
 * Structural view of an element: tag name, attribute map, child order —
 * hand-authoring differences that DOMParser already normalizes (Core's
 * `Id = "…"` spacing, blank lines) drop out, every attribute byte is kept.
 */
interface ElementSnapshot {
  tag: string;
  attrs: Record<string, string>;
  children: ElementSnapshot[];
}

function snapshot(el: Element): ElementSnapshot {
  const attrs: Record<string, string> = {};
  for (const attr of Array.from(el.attributes)) attrs[attr.name] = attr.value;
  const children: ElementSnapshot[] = [];
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 1) children.push(snapshot(node as Element));
  }
  return { tag: el.tagName, attrs, children };
}

function findLandmark(doc: Document, id: string): Element {
  const hit = Array.from(doc.getElementsByTagName('Landmark')).find(
    (el) => el.getAttribute('Id') === id,
  );
  expect(hit, `<Landmark Id="${id}">`).toBeDefined();
  return hit!;
}

function findDecal(doc: Document, name: string): Element {
  const hit = Array.from(doc.getElementsByTagName('Modifier')).find(
    (el) => el.getAttribute('Name') === name,
  );
  expect(hit, `<Modifier Name="${name}">`).toBeDefined();
  return hit!;
}

/** Core's CCSFS LC-39A site (mini fixture fragments are verbatim Core copies). */
const CCSFS: Site = {
  id: 'test-ccsfs',
  landmarkId: 'CCSFS LC-39A',
  bodyId: 'Earth',
  latDeg: 28.60829876577433,
  lonDeg: -80.60412690984597,
  staticObjectId: 'CoreLaunchPadA_Prefab_LaunchPadA',
  decal: {
    radiusM: 275,
    terrainHeightM: 16.97,
    smoothFactor: 0.69,
    rotationDeg: 0,
    biomes: 'Grass,Beach',
  },
};

/** Core's VSFB LC-4 site (the plan's golden example: radius 400, 225 m mesa). */
const VSFB: Site = {
  id: 'test-vsfb',
  landmarkId: 'VSFB LC-4',
  bodyId: 'Earth',
  latDeg: 34.6320535004723,
  lonDeg: -120.6106513816658,
  staticObjectId: 'CoreLaunchPadA_Prefab_LaunchPadA',
  decal: {
    radiusM: 400,
    terrainHeightM: 225,
    smoothFactor: 0.69,
    rotationDeg: 0,
    biomes: 'Grass,Beach',
  },
};

describe('sanitizeSiteId', () => {
  it('turns spaces into dashes like Core decal names', () => {
    expect(sanitizeSiteId('CCSFS LC-39A')).toBe('CCSFS-LC-39A');
    expect(sanitizeSiteId('VSFB LC-4')).toBe('VSFB-LC-4');
    // Core hand-folds "Māhia" → "Mahia" in ITS decal name; the Location Id is
    // never looked up (DecalModifierReference.cs), so ICRP keeps non-ASCII.
    expect(sanitizeSiteId('Māhia LC-1A')).toBe('Māhia-LC-1A');
  });
});

describe('golden against the mini fixture (verbatim Core fragments)', () => {
  const mini = parse(readMiniFixture('mini-astronomicals.xml'));

  it('buildLandmarkElement reproduces the CCSFS LC-39A row', () => {
    const ours = buildLandmarkElement(newDoc(), CCSFS);
    expect(snapshot(ours)).toEqual(snapshot(findLandmark(mini, 'CCSFS LC-39A')));
  });

  it('buildDecalModifierElement reproduces the CCSFS decal, children in Core order', () => {
    const ours = buildDecalModifierElement(newDoc(), CCSFS);
    expect(snapshot(ours)).toEqual(snapshot(findDecal(mini, 'LaunchSite_CCSFS-LC-39A')));
    // The order is load-bearing for the golden: assert it explicitly too.
    expect(snapshot(ours).children.map((c) => c.tag)).toEqual([
      'Amplitude',
      'Order',
      'Radius',
      'Rotation',
      'Location',
      'AltitudeOffset',
      'SmoothFactor',
      'Additive',
      'HeightMap',
    ]);
  });

  it('throws on a site without a decal', () => {
    expect(() => buildDecalModifierElement(newDoc(), { ...CCSFS, decal: null })).toThrow(
      /no decal/,
    );
  });
});

describe.runIf(hasKsaAssets)('golden against the live Core Astronomicals.xml', () => {
  // KSA ships the file BOM-prefixed; @xmldom rejects a BOM before <?xml?>.
  const live = parse(readFileSync(ksaAsset('Astronomicals.xml'), 'utf-8').replace(/^\uFEFF/, ''));

  it('buildLandmarkElement reproduces the VSFB LC-4 row', () => {
    const ours = buildLandmarkElement(newDoc(), VSFB);
    expect(snapshot(ours)).toEqual(snapshot(findLandmark(live, 'VSFB LC-4')));
  });

  it('buildDecalModifierElement reproduces the VSFB LC-4 decal', () => {
    const ours = buildDecalModifierElement(newDoc(), VSFB);
    const core = snapshot(findDecal(live, 'LaunchSite_VSFB-LC-4'));
    // The ONE hand-authoring divergence: Core left THIS site's Location Id
    // unsanitized ("VSFB LC-4" — Astronomicals.xml:758) while sanitizing every
    // other site's ("CCSFS-LC-39A", "Starbase-OLM-A", …). The id is never
    // looked up by the game; ICRP always writes the sanitized form.
    const location = core.children.find((c) => c.tag === 'Location')!;
    expect(location.attrs.Id).toBe('VSFB LC-4');
    location.attrs.Id = 'VSFB-LC-4';
    expect(snapshot(ours)).toEqual(core);
  });
});
