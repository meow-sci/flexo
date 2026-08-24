/**
 * Pure DOM builders for the per-site XML fragments ICRP adds to an inline
 * celestial body (plans/ICRP_PLAN.md P7.03/P7.05):
 *
 *  - `<Landmark Id IsLaunchPad="true" StaticObject>` + lat/lon children
 *    (`decomp/KSA/LandmarkReference.cs`, `LocationReference.cs:15-22`);
 *  - `<Modifier Type="Decal" Name="LaunchSite_…">` with children exactly in
 *    Core's order — Core Astronomicals.xml:752-768 (VSFB LC-4) is the golden
 *    reference, enforced by landmarkXml.test.ts.
 *
 * Builders take the target `Document` as a factory, so they work with both the
 * browser DOM and @xmldom (tests) — nothing is appended here; systemXml.ts
 * places the elements inside the cloned body.
 */
import type { Site } from './siteTypes';

/**
 * Degrees formatted like Core's hand-authored landmark rows
 * (Astronomicals.xml:1869-1888): shortest round-trip decimal, full precision.
 */
function degrees(n: number): string {
  return String(n);
}

/**
 * Sanitizes a landmark id for the decal `Name`/`Location Id` slots the way
 * Core does: spaces become dashes ("CCSFS LC-39A" → "CCSFS-LC-39A",
 * Astronomicals.xml:734/740 vs :1869). The `<Location Id>` is never looked up
 * by the game (`decomp/KSA/DecalModifierReference.cs:11-16` — the decal is
 * tied to a site only by sharing coordinates), so Core's own inconsistencies
 * (unsanitized "VSFB LC-4" at :758, ASCII-folded "Mahia-LC-1A" at :806) are
 * harmless; ICRP always sanitizes.
 */
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
    Id: site.landmarkId,
    IsLaunchPad: 'true',
    StaticObject: site.staticObjectId,
  });
  appendLatLon(doc, landmark, site);
  return landmark;
}

/**
 * Builds the site's `<Modifier Type="Decal">` terrain flattener (plan P7.03).
 * Child order and element set mirror Core's launch-site decals byte for byte
 * (Astronomicals.xml:752-768), including `<Additive Value="false"/>` — Core
 * writes the default explicitly at every site.
 */
export function buildDecalModifierElement(doc: Document, site: Site): Element {
  const decal = site.decal;
  if (!decal) {
    throw new Error(`site "${site.landmarkId}" has no decal — nothing to build`);
  }
  const sanitized = sanitizeSiteId(site.landmarkId);
  const modifier = el(doc, 'Modifier', {
    Type: 'Decal',
    Name: `LaunchSite_${sanitized}`,
    Biomes: decal.biomes,
  });
  modifier.appendChild(el(doc, 'Amplitude', { Value: '0' }));
  modifier.appendChild(el(doc, 'Order', { Value: '9999' }));
  modifier.appendChild(el(doc, 'Radius', { Value: String(decal.radiusM) }));
  modifier.appendChild(el(doc, 'Rotation', { Degrees: String(decal.rotationDeg) }));
  const location = el(doc, 'Location', { Id: sanitized });
  appendLatLon(doc, location, site);
  modifier.appendChild(location);
  // The attribute says Km but the game consumes METRES (plan fact L7): the
  // terrain height buffer is metres, so terrainHeightM is written verbatim —
  // exactly how Core writes Km="225" for Vandenberg's 225 m mesa.
  modifier.appendChild(el(doc, 'AltitudeOffset', { Km: String(decal.terrainHeightM) }));
  modifier.appendChild(el(doc, 'SmoothFactor', { Value: String(decal.smoothFactor) }));
  modifier.appendChild(el(doc, 'Additive', { Value: 'false' }));
  modifier.appendChild(
    el(doc, 'HeightMap', {
      Id: 'Circle',
      Path: 'Textures/Planets/_Decals/circle.dds',
      Category: 'TerrainHeight',
    }),
  );
  return modifier;
}
