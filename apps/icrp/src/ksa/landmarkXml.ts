/** DOM builders for current KSA landmark and terrain-decal references. */
import type { Site } from './siteTypes';

/**
 * Degrees formatted like Core's hand-authored landmark rows
 * (Astronomicals.xml:1869-1888): shortest round-trip decimal, full precision.
 */
function degrees(n: number): string {
  return String(n);
}

/** Sanitize spaces in a landmark Key for the decal Key. */
export function sanitizeSiteId(landmarkId: string): string {
  return landmarkId.replace(/\s+/g, '-');
}

function el(doc: Document, name: string, attrs?: Record<string, string>): Element {
  const node = doc.createElement(name);
  if (attrs) for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

/** `<Latitude Degrees/>` + `<Longitude Degrees/>` appended to `parent`. */
function appendLatLon(doc: Document, parent: Element, site: Site): void {
  parent.appendChild(el(doc, 'Latitude', { Degrees: degrees(site.latDeg) }));
  parent.appendChild(el(doc, 'Longitude', { Degrees: degrees(site.lonDeg) }));
}

/** Builds the site's `<Landmark>` row (plan P7.05; `IsLaunchPad` always true, L11). */
export function buildLandmarkElement(doc: Document, site: Site): Element {
  const landmark = el(doc, 'Landmark', {
    Key: site.landmarkId,
    IsLaunchPad: 'true',
  });
  landmark.appendChild(el(doc, 'StaticObject', { Ref: site.staticObjectId }));
  appendLatLon(doc, landmark, site);
  return landmark;
}

/** Build a keyed decal, converting the editor's metres into kilometres. */
export function buildDecalModifierElement(doc: Document, site: Site): Element {
  const decal = site.decal;
  if (!decal) {
    throw new Error(`site "${site.landmarkId}" has no decal — nothing to build`);
  }
  const sanitized = sanitizeSiteId(site.landmarkId);
  const modifier = el(doc, 'Decal', { Key: `LaunchSite_${sanitized}` });
  const biomes = el(doc, 'Biomes');
  for (const biome of decal.biomes
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)) {
    biomes.appendChild(el(doc, 'Biome', { KeyRef: biome }));
  }
  if (biomes.childNodes.length) modifier.appendChild(biomes);
  modifier.appendChild(el(doc, 'Amplitude', { Value: '0' }));
  modifier.appendChild(el(doc, 'Order', { Value: '9999' }));
  modifier.appendChild(el(doc, 'Radius', { Value: String(decal.radiusM / 1000) }));
  modifier.appendChild(el(doc, 'Rotation', { Degrees: String(decal.rotationDeg) }));
  const location = el(doc, 'Location', { Key: sanitized });
  appendLatLon(doc, location, site);
  modifier.appendChild(location);
  modifier.appendChild(el(doc, 'AltitudeOffset', { Km: String(decal.terrainHeightM / 1000) }));
  modifier.appendChild(el(doc, 'SmoothFactor', { Value: String(decal.smoothFactor) }));
  modifier.appendChild(el(doc, 'Additive', { Value: 'false' }));
  modifier.appendChild(el(doc, 'HeightMap', { Ref: 'Circle' }));
  return modifier;
}
