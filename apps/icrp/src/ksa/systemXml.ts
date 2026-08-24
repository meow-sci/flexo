/**
 * The `<System>` scenario writer (plans/ICRP_PLAN.md P7.00/P7.05): clones
 * Core's stock `SolSystem.xml` system and, for every body that hosts ICRP
 * sites, swaps its `<LoadFromLibrary>` row for a deep inline clone of the
 * body's block from `Astronomicals.xml`, with the site `<Landmark>`s and
 * `<Modifier Type="Decal">`s added (landmarkXml.ts builders).
 *
 * Schema authority: `decomp/KSA/SystemTemplate.cs` (the body-element union and
 * `LoadFromLibrary` = `AstronomicalReference`), `SystemInfo.cs` (the picker's
 * view of the same file), `AstronomicalTemplate.cs:20-24` (`Parent`/`HomeBody`
 * are attributes on every body, so a replaced row's attributes carry onto the
 * inline element). Inline bodies register into the system-local lookup and
 * never collide with Core's (`SystemTemplate.cs:43-48`; Core itself inlines
 * Titan/Neptune/Ceres/… in SolSystem.xml).
 *
 * Texture references inside inline bodies (plan P7.00, `D/KSA/FileReference.cs:42-49`):
 * an element with `Id` and empty `Path` is a pure registry reference, resolved
 * from Core's first-wins texture registry — install-location independent. So
 * every `Id`+`Path` element under an inline body loses its `Path`; every
 * anonymous `Path`-only element is re-rooted `../Core/…` (needs the mod
 * installed as `Content/<mod>/`, sibling of Core). This applies to EVERY body
 * shipped inline in the output — both the clones ICRP inlines and the ~45
 * bodies Core itself inlines in SolSystem.xml (21 `Path=` attrs there, e.g.
 * Io's Diffuse/Height at SolSystem.xml:131-132): all of them land in the mod's
 * own systems file, where a bare relative `Path` would resolve against the mod
 * directory (`D/KSA/Mod.cs:389-392`) and miss.
 */
import { XMLSerializer } from '@xmldom/xmldom';
import { prettyXml } from '../../../../src/ksa/partXmlSerializer';
import { directChildren } from '../../../../src/ksa/partXmlParser';
import { buildDecalModifierElement, buildLandmarkElement } from './landmarkXml';
import type { Site } from './siteTypes';

/**
 * Every element name `SystemTemplate.Bodies` accepts for an inline body
 * (`decomp/KSA/SystemTemplate.cs:17-27`, minus the `LoadFromLibrary` /
 * `LoadVehicleFromLibrary` references). Astronomicals.xml currently uses
 * StellarBody / PlanetaryBody / AtmosphericBody / MinorBody / PeriodicComet /
 * InterstellarComet; SolSystem.xml additionally inlines Asteroid bodies.
 */
const BODY_ELEMENT_NAMES = new Set([
  'Comet',
  'InterstellarComet',
  'PeriodicComet',
  'AtmosphericBody',
  'StellarBody',
  'MinorBody',
  'Asteroid',
  'PlanetaryBody',
  'TerrestrialBody',
]);

/** The parsed Core celestial corpus (plan P7.01). */
export interface CelestialCorpus {
  /**
   * Top-level body elements from `<Assets>` docs (Astronomicals.xml), by Id in
   * document order, first-wins. Bodies are never nested in XML
   * (`AstronomicalTemplate.Bodies` is `[XmlIgnore]`).
   */
  bodies: Map<string, Element>;
  /** The stock `<System>` element (SolSystem.xml) the writer clones. */
  stockSystem: Element;
}

/**
 * Indexes the Core corpora. `docs` order matters (first hit wins, mirroring
 * KSA's first-wins registries): pass Astronomicals.xml and SolSystem.xml.
 */
export function parseCelestialCorpus(docs: { doc: Document; file: string }[]): CelestialCorpus {
  const bodies = new Map<string, Element>();
  let stockSystem: Element | null = null;
  for (const { doc, file } of docs) {
    const root = doc.documentElement;
    if (!root) throw new Error(`${file}: empty document`);
    if (root.tagName === 'System') {
      stockSystem ??= root;
      continue;
    }
    if (root.tagName !== 'Assets') {
      throw new Error(`${file}: expected <Assets> or <System> root, got <${root.tagName}>`);
    }
    for (const child of Array.from(root.childNodes)) {
      if (child.nodeType !== 1) continue;
      const el = child as Element;
      if (!BODY_ELEMENT_NAMES.has(el.tagName)) continue;
      const id = el.getAttribute('Id');
      if (id && !bodies.has(id)) bodies.set(id, el);
    }
  }
  if (!stockSystem) {
    throw new Error('celestial corpus has no <System> document (SolSystem.xml missing?)');
  }
  return { bodies, stockSystem };
}

export interface SystemXmlResult {
  xml: string;
  /** `Id`+`Path` elements whose `Path` was dropped (pure registry references). */
  idRefs: number;
  /** Anonymous `Path`-only elements re-rooted to `../Core/…`. */
  pathRewrites: number;
}

/** Applies the P7.00 texture rules to one inline body subtree (see module doc). */
function rewriteTextureReferences(body: Element, counts: { idRefs: number; pathRewrites: number }) {
  const visit = (el: Element): void => {
    const path = el.getAttribute('Path');
    if (path !== null && path !== '') {
      if (el.getAttribute('Id')) {
        el.removeAttribute('Path');
        counts.idRefs++;
      } else {
        el.setAttribute('Path', `../Core/${path}`);
        counts.pathRewrites++;
      }
    }
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === 1) visit(child as Element);
    }
  };
  visit(body);
}

/**
 * Appends the site's `<Landmark>` adjacent to the body's existing landmark run
 * (Core keeps them last before the body's close tag, Astronomicals.xml:1869-1888),
 * or at the end of the body when it has none.
 */
function appendLandmark(doc: Document, body: Element, site: Site): void {
  const landmark = buildLandmarkElement(doc, site);
  const existing = directChildren(body, 'Landmark');
  const last = existing[existing.length - 1];
  if (last) body.insertBefore(landmark, last.nextSibling);
  else body.appendChild(landmark);
}

/**
 * Appends the site's decal at the END of `<Terrain><ProceduralModifiers>`,
 * creating the wrappers only when genuinely absent (Earth has both; modifier
 * order inside is irrelevant — the game sorts by `<Order>`).
 */
function appendDecal(doc: Document, body: Element, site: Site): void {
  let terrain = directChildren(body, 'Terrain')[0];
  if (!terrain) {
    terrain = doc.createElement('Terrain');
    body.appendChild(terrain);
  }
  let modifiers = directChildren(terrain, 'ProceduralModifiers')[0];
  if (!modifiers) {
    modifiers = doc.createElement('ProceduralModifiers');
    terrain.appendChild(modifiers);
  }
  modifiers.appendChild(buildDecalModifierElement(doc, site));
}

/** Removes whitespace-only text nodes so `prettyXml` re-indents uniformly. */
function stripWhitespaceText(node: Node): void {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 3 && /^\s*$/.test(child.nodeValue ?? '')) node.removeChild(child);
    else stripWhitespaceText(child);
  }
}

export interface SystemXmlInput {
  /** The `<System Id>` — the mod's own scenario id (e.g. `<mod>_sol`). */
  systemId: string;
  /** `<DisplayName Value>` shown in the system picker. */
  displayName: string;
  corpus: CelestialCorpus;
  sites: Site[];
}

/**
 * Writes the mod's `systems/…` scenario. The stock system is copied wholesale
 * (every attribute/child ICRP doesn't model survives verbatim — VesselTextures
 * VRAM summaries, GalacticPlane, `<LoadVehicleFromLibrary>` starting vehicles);
 * only the `Id`, the `<DisplayName>` and the site-hosting bodies change. The
 * corpus documents are never mutated: everything is deep-cloned via
 * `importNode` into a fresh output document.
 */
export function buildSystemXml(input: SystemXmlInput): SystemXmlResult {
  const { systemId, displayName, corpus, sites } = input;

  const sitesByBody = new Map<string, Site[]>();
  for (const site of sites) {
    const list = sitesByBody.get(site.bodyId) ?? [];
    list.push(site);
    sitesByBody.set(site.bodyId, list);
  }

  const sourceDoc = corpus.stockSystem.ownerDocument;
  if (!sourceDoc) throw new Error('stock <System> element has no owner document');
  const doc = sourceDoc.implementation.createDocument(null, null, null);
  const system = doc.importNode(corpus.stockSystem, true);
  doc.appendChild(system);

  system.setAttribute('Id', systemId);
  let displayNameEl = directChildren(system, 'DisplayName')[0];
  if (!displayNameEl) {
    displayNameEl = doc.createElement('DisplayName');
    system.insertBefore(displayNameEl, system.firstChild);
  }
  displayNameEl.setAttribute('Value', displayName);

  // Body elements shipped inline in the output, by Id (Core's own inline
  // bodies now, ICRP's clones as rows are replaced below).
  const inlineBodies = new Map<string, Element>();
  for (const node of Array.from(system.childNodes)) {
    if (node.nodeType !== 1) continue;
    const child = node as Element;
    const id = child.getAttribute('Id');
    if (id && BODY_ELEMENT_NAMES.has(child.tagName)) inlineBodies.set(id, child);
  }

  for (const bodyId of sitesByBody.keys()) {
    if (inlineBodies.has(bodyId)) continue; // already inline in the stock system
    const source = corpus.bodies.get(bodyId);
    if (!source) {
      throw new Error(
        `launch site body "${bodyId}" is not in the celestial corpus ` +
          '(no such top-level body in Astronomicals.xml or inline in SolSystem.xml)',
      );
    }
    const clone = doc.importNode(source, true);
    const row = directChildren(system, 'LoadFromLibrary').find(
      (el) => el.getAttribute('Id') === bodyId,
    );
    if (row) {
      // Carry the row's Parent/HomeBody/… onto the inline element when the
      // body block doesn't declare them itself (AstronomicalTemplate.cs:20-24;
      // Core's SolSystem.xml:39 marks Earth `HomeBody="true"` on the row only).
      for (const attr of Array.from(row.attributes)) {
        if (!clone.hasAttribute(attr.name)) clone.setAttribute(attr.name, attr.value);
      }
      system.insertBefore(clone, row);
      system.removeChild(row);
    } else {
      system.appendChild(clone);
    }
    inlineBodies.set(bodyId, clone);
  }

  for (const [bodyId, bodySites] of sitesByBody) {
    const body = inlineBodies.get(bodyId)!;
    for (const site of bodySites) appendLandmark(doc, body, site);
    for (const site of bodySites) {
      if (site.decal) appendDecal(doc, body, site);
    }
  }

  // Texture pass LAST so ICRP's own decal `<HeightMap Id="Circle" Path=…>`
  // also collapses to a pure Id reference (Core registers "Circle" first).
  const counts = { idRefs: 0, pathRewrites: 0 };
  for (const body of inlineBodies.values()) rewriteTextureReferences(body, counts);

  stripWhitespaceText(doc);
  const body = new XMLSerializer().serializeToString(doc as never);
  return {
    xml: '<?xml version="1.0" encoding="utf-8"?>\n' + prettyXml(body) + '\n',
    idRefs: counts.idRefs,
    pathRewrites: counts.pathRewrites,
  };
}
