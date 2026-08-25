/**
 * The `<System>` scenario writer (plans/ICRP_PLAN.md P7.00/P7.05): clones
 * Core's stock `SolSystem.xml` system and, for every body that hosts ICRP
 * sites, swaps its `<LoadFromLibrary>` row for a deep inline clone of the
 * body's block from `Astronomicals.xml`, with the site `<Landmark>`s and
 * `<Modifier Type="Decal">`s added (landmarkXml.ts builders).
 *
 * WHY THE CLONE LIVES IN AN ASSETS FILE, NOT INLINE IN THE SYSTEM (in-game
 * verified failure): `StaticObject.ResolveAll` (StaticObject.cs:47-66) links
 * `<Landmark StaticObject=…>` to its static object ONLY for bodies in
 * `ModLibrary.TemplateLookup` — and bodies inlined in a `<System>` never enter
 * it (they live in the system-local lookup, SystemTemplate.cs:43-48). An
 * inline body's landmark therefore keeps a NULL static forever: blank pad, no
 * collider, no spawn bump. So the site-hosting body ships as a TOP-LEVEL body
 * in the mod's own `<Assets>` file under a mod-suffixed id (a second "Earth"
 * would lose first-wins to Core's, AssetBundle.cs:86-92), and the system
 * references it via `<LoadFromLibrary Id="Earth_<mod>">` — the cartoon-moon
 * route, which registers into TemplateLookup when the scenario is selected
 * (`SystemLibrary.Default.Requires`, AssetBundle.cs:86).
 *
 * Schema authority: `decomp/KSA/SystemTemplate.cs` (the body-element union and
 * `LoadFromLibrary` = `AstronomicalReference`), `SystemInfo.cs` (the picker's
 * view of the same file), `AstronomicalTemplate.cs:20-24` (`Parent`/`HomeBody`
 * are attributes on every body, so a replaced row's attributes carry onto the
 * inline element). Inline bodies register into the system-local lookup and
 * never collide with Core's (`SystemTemplate.cs:43-48`; Core itself inlines
 * Titan/Neptune/Ceres/… in SolSystem.xml).
 *
 * Texture references (user-verified in game): a mod under `Documents/mods`
 * cannot reach Core's textures by relative Path, and Id-only references did
 * NOT work in practice — the reliable form is an ABSOLUTE Path into the game
 * install (`<install>/Content/Core/<path>`; .NET Path.Combine keeps an
 * absolute second argument). Every relative `Path=` under a cloned or inline
 * body is rewritten (authored `Id=`s are kept); `'core-relative'` mode writes
 * `../Core/<path>` instead for mods installed as `Content/<mod>/`. This covers
 * the ~45 bodies Core itself inlines in SolSystem.xml (21 `Path=` attrs, e.g.
 * Io's Diffuse/Height at SolSystem.xml:131-132) — they land in the mod's own
 * systems file where a bare relative Path resolves against the mod dir
 * (`D/KSA/Mod.cs:389-392`) and misses.
 */
import { XMLSerializer } from '@xmldom/xmldom';
import type { Node as XmldomNode } from '@xmldom/xmldom';
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

/** How Core texture paths are made reachable from the mod (see module doc). */
export type TexturePathMode = { mode: 'absolute'; installPath: string } | { mode: 'core-relative' };

export interface SystemXmlResult {
  /** The `systems/…` scenario. */
  xml: string;
  /**
   * `<Assets>` document declaring the CLONED site-hosting bodies (top-level,
   * mod-suffixed ids — the TemplateLookup route ResolveAll needs). Null when
   * the project has no sites.
   */
  bodiesXml: string | null;
  /** original body id → mod-suffixed clone id. */
  renamedBodies: Map<string, string>;
  /** Relative texture `Path=` attributes rewritten (clone + inline bodies). */
  texturesRewritten: number;
  /** Landmarks ADDED as new sites. */
  addedLandmarks: number;
  /** Existing (stock) landmarks RETARGETED at an ICRP object (matched by Id). */
  retargetedLandmarks: number;
}

/**
 * Rewrites every RELATIVE `Path=` under a body subtree so it resolves from the
 * mod's install location (module doc). Authored `Id=`s are preserved.
 */
function rewriteTexturePaths(
  body: Element,
  paths: TexturePathMode,
  counts: { texturesRewritten: number },
): void {
  const prefix =
    paths.mode === 'absolute'
      ? `${paths.installPath.replace(/[\\/]+$/, '')}/Content/Core/`
      : '../Core/';
  const visit = (el: Element): void => {
    const path = el.getAttribute('Path');
    if (path && !/^([A-Za-z]:[\\/]|[\\/])/.test(path) && !path.startsWith('../')) {
      el.setAttribute('Path', prefix + path);
      counts.texturesRewritten++;
    }
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === 1) visit(child as Element);
    }
  };
  visit(body);
}

/**
 * Adds the site's `<Landmark>` — or RETARGETS an existing one. Landmark ids are
 * first-wins per body (`CelestialTemplate` `_locationLookup`), so a duplicate
 * would be silently dropped in-game; a site whose `landmarkId` matches an
 * existing landmark therefore REPLACES that landmark's `StaticObject` (and
 * IsLaunchPad + coordinates) in place — the "put my pad at CCSFS LC-39A" path.
 * Returns whether it retargeted (caller counts + typically skips the decal:
 * stock sites already ship one).
 */
function appendLandmark(doc: Document, body: Element, site: Site): boolean {
  const existing = directChildren(body, 'Landmark');
  const match = existing.find((l) => l.getAttribute('Id') === site.landmarkId);
  if (match) {
    match.setAttribute('IsLaunchPad', 'true');
    match.setAttribute('StaticObject', site.staticObjectId);
    const lat = directChildren(match, 'Latitude')[0];
    const lon = directChildren(match, 'Longitude')[0];
    lat?.setAttribute('Degrees', String(site.latDeg));
    lon?.setAttribute('Degrees', String(site.lonDeg));
    return true;
  }
  const landmark = buildLandmarkElement(doc, site);
  const last = existing[existing.length - 1];
  if (last) body.insertBefore(landmark, last.nextSibling);
  else body.appendChild(landmark);
  return false;
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
  /** Sanitized mod id — suffixes cloned body ids (`Earth_<modId>`). */
  modId: string;
  corpus: CelestialCorpus;
  sites: Site[];
  texturePaths: TexturePathMode;
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
  const { systemId, displayName, modId, corpus, sites, texturePaths } = input;

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

  // Body elements Core itself ships inline in the stock system, by Id.
  const inlineBodies = new Map<string, Element>();
  for (const node of Array.from(system.childNodes)) {
    if (node.nodeType !== 1) continue;
    const child = node as Element;
    const id = child.getAttribute('Id');
    if (id && BODY_ELEMENT_NAMES.has(child.tagName)) inlineBodies.set(id, child);
  }

  // --- Site-hosting bodies: CLONE into a separate <Assets> doc (TemplateLookup
  // route — see module doc) under a mod-suffixed id, and swap the system's
  // reference to a <LoadFromLibrary> row pointing at the clone.
  const bodiesDoc = doc.implementation.createDocument(null, null, null);
  const bodiesRoot = bodiesDoc.createElement('Assets');
  bodiesDoc.appendChild(bodiesRoot);
  const renamedBodies = new Map<string, string>();
  let addedLandmarks = 0;
  let retargetedLandmarks = 0;
  const counts = { texturesRewritten: 0 };

  for (const [bodyId, bodySites] of sitesByBody) {
    const source = corpus.bodies.get(bodyId) ?? inlineBodies.get(bodyId);
    if (!source) {
      throw new Error(
        `launch site body "${bodyId}" is not in the celestial corpus ` +
          '(no such top-level body in Astronomicals.xml or inline in SolSystem.xml)',
      );
    }
    const newId = `${bodyId}_${modId}`;
    renamedBodies.set(bodyId, newId);

    const clone = bodiesDoc.importNode(source, true);
    clone.setAttribute('Id', newId);

    // Locate the system's reference to this body: a LoadFromLibrary row, or a
    // Core-inlined element.
    const row = directChildren(system, 'LoadFromLibrary').find(
      (el) => el.getAttribute('Id') === bodyId,
    );
    const inline = inlineBodies.get(bodyId) ?? null;
    // Parent/HomeBody ride the reference row (AstronomicalTemplate.cs:20-24;
    // SolSystem.xml:39 marks Earth HomeBody="true" on the row only) — carry
    // them onto BOTH the clone and the replacement row.
    const refEl = row ?? inline;
    if (refEl) {
      for (const attr of Array.from(refEl.attributes)) {
        if (attr.name !== 'Id' && !clone.hasAttribute(attr.name)) {
          clone.setAttribute(attr.name, attr.value);
        }
      }
    }
    const replacement = doc.createElement('LoadFromLibrary');
    replacement.setAttribute('Id', newId);
    for (const name of ['Parent', 'HomeBody']) {
      const value = refEl?.getAttribute(name) ?? clone.getAttribute(name);
      if (value) replacement.setAttribute(name, value);
    }
    if (refEl) {
      system.insertBefore(replacement, refEl);
      system.removeChild(refEl);
      if (inline) inlineBodies.delete(bodyId);
    } else {
      system.appendChild(replacement);
    }

    for (const site of bodySites) {
      const retargeted = appendLandmark(bodiesDoc, clone, site);
      if (retargeted) retargetedLandmarks++;
      else addedLandmarks++;
      // A retargeted stock site already ships Core's terrain decal.
      if (site.decal && !retargeted) appendDecal(bodiesDoc, clone, site);
    }
    // Texture pass AFTER the decal insertion so ICRP's own decal
    // `<HeightMap Path="Textures/Planets/_Decals/circle.dds">` is rewritten too.
    rewriteTexturePaths(clone, texturePaths, counts);
    bodiesRoot.appendChild(clone);
  }

  // Every reference to a renamed body follows it: LoadFromLibrary rows,
  // Core-inlined bodies, and <LoadVehicleFromLibrary Parent="Earth"> starting
  // vehicles (their situations are pure orbits — the row's Parent is the
  // celestial binding).
  for (const [oldId, newId] of renamedBodies) {
    for (const node of Array.from(system.childNodes)) {
      if (node.nodeType !== 1) continue;
      const child = node as Element;
      if (child.getAttribute('Parent') === oldId) child.setAttribute('Parent', newId);
    }
  }

  // Core's remaining inline bodies carry 21 relative texture Paths — same rule.
  for (const body of inlineBodies.values()) rewriteTexturePaths(body, texturePaths, counts);

  stripWhitespaceText(doc);
  // @xmldom's serializer walks the generic DOM interface, so it serializes
  // browser-DOM documents too (the cast bridges the two type worlds only).
  const serialize = (d: Document): string => {
    const text = new XMLSerializer().serializeToString(d as unknown as XmldomNode);
    return '<?xml version="1.0" encoding="utf-8"?>\n' + prettyXml(text) + '\n';
  };
  let bodiesXml: string | null = null;
  if (renamedBodies.size > 0) {
    stripWhitespaceText(bodiesDoc);
    bodiesXml = serialize(bodiesDoc);
  }
  return {
    xml: serialize(doc),
    bodiesXml,
    renamedBodies,
    texturesRewritten: counts.texturesRewritten,
    addedLandmarks,
    retargetedLandmarks,
  };
}
