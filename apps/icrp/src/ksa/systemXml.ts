/** Build a current KSA System asset and site-hosting body definitions. */
import { XMLSerializer } from '@xmldom/xmldom';
import type { Node as XmldomNode } from '@xmldom/xmldom';
import { prettyXml } from '../../../../src/ksa/partXmlSerializer';
import { directChildren } from '../../../../src/ksa/partXmlParser';
import { buildDecalModifierElement, buildLandmarkElement } from './landmarkXml';
import type { Site } from './siteTypes';

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
export interface CelestialCorpus {
  bodies: Map<string, Element>;
  stockSystem: Element;
  vehicles: Map<string, Element>;
}
export function parseCelestialCorpus(docs: { doc: Document; file: string }[]): CelestialCorpus {
  const bodies = new Map<string, Element>();
  const vehicles = new Map<string, Element>();
  let stockSystem: Element | null = null;
  for (const { doc, file } of docs) {
    const root = doc.documentElement;
    if (!root || root.tagName !== 'Assets') throw new Error(`${file}: expected <Assets>`);
    for (const child of Array.from(root.childNodes)) {
      if (child.nodeType !== 1) continue;
      const el = child as Element;
      const id = el.getAttribute('Id');
      if (el.tagName === 'System' && id === 'Sol') stockSystem = el;
      else if (id && BODY_ELEMENT_NAMES.has(el.tagName)) bodies.set(id, el);
      else if (id && el.tagName === 'Vehicle') vehicles.set(id, el);
    }
  }
  if (!stockSystem) throw new Error('celestial corpus has no Sol system');
  return { bodies, stockSystem, vehicles };
}
export interface SystemXmlResult {
  xml: string;
  bodiesXml: string | null;
  renamedBodies: Map<string, string>;
  addedLandmarks: number;
  retargetedLandmarks: number;
}
function child(doc: Document, parent: Element, tag: string): Element {
  const existing = directChildren(parent, tag)[0];
  if (existing) return existing;
  const result = doc.createElement(tag);
  parent.appendChild(result);
  return result;
}
function appendLandmark(doc: Document, body: Element, site: Site): boolean {
  const landmarks = child(doc, body, 'Landmarks');
  const old = directChildren(landmarks, 'Landmark').find(
    (e) => e.getAttribute('Key') === site.landmarkId,
  );
  const replacement = buildLandmarkElement(doc, site);
  if (old) landmarks.replaceChild(replacement, old);
  else landmarks.appendChild(replacement);
  return !!old;
}
function appendDecal(doc: Document, body: Element, site: Site): void {
  const terrain = child(doc, body, 'Terrain');
  const modifiers = child(doc, terrain, 'ProceduralModifiers');
  modifiers.appendChild(buildDecalModifierElement(doc, site));
}
function serialize(doc: Document): string {
  const strip = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3 && /^\s*$/.test(child.nodeValue ?? '')) node.removeChild(child);
      else strip(child);
    }
  };
  strip(doc);
  return (
    '<?xml version="1.0" encoding="utf-8"?>\n' +
    prettyXml(new XMLSerializer().serializeToString(doc as unknown as XmldomNode)) +
    '\n'
  );
}
export interface SystemXmlInput {
  systemId: string;
  displayName: string;
  modId: string;
  corpus: CelestialCorpus;
  sites: Site[];
}
export function buildSystemXml({
  systemId,
  displayName,
  modId,
  corpus,
  sites,
}: SystemXmlInput): SystemXmlResult {
  const sourceDoc = corpus.stockSystem.ownerDocument!;
  const doc = sourceDoc.implementation.createDocument(null, 'Assets', null);
  const system = doc.importNode(corpus.stockSystem, true);
  doc.documentElement.appendChild(system);
  system.setAttribute('Id', systemId);
  child(doc, system, 'DisplayName').setAttribute('Value', displayName);
  const bodyRows = directChildren(child(doc, system, 'Bodies'), 'Body');
  const systemBodies = new Set(bodyRows.map((row) => row.getAttribute('Ref')));
  const sitesByBody = new Map<string, Site[]>();
  for (const site of sites) {
    if (!corpus.bodies.has(site.bodyId) || !systemBodies.has(site.bodyId))
      throw new Error(`Unknown system body ${site.bodyId}`);
    const list = sitesByBody.get(site.bodyId) ?? [];
    list.push(site);
    sitesByBody.set(site.bodyId, list);
  }
  // A child body must refer to the cloned parent in the selected system.
  const renamedBodies = new Map<string, string>();
  for (const id of sitesByBody.keys()) renamedBodies.set(id, `${id}_${modId}`);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [id, body] of corpus.bodies) {
      const parent = directChildren(body, 'ParentBody')[0]?.getAttribute('Ref');
      if (systemBodies.has(id) && parent && renamedBodies.has(parent) && !renamedBodies.has(id)) {
        renamedBodies.set(id, `${id}_${modId}`);
        changed = true;
      }
    }
  }
  const bodiesDoc = sourceDoc.implementation.createDocument(null, 'Assets', null);
  let addedLandmarks = 0;
  let retargetedLandmarks = 0;
  for (const [oldId, newId] of renamedBodies) {
    const clone = bodiesDoc.importNode(corpus.bodies.get(oldId)!, true);
    clone.setAttribute('Id', newId);
    const parent = directChildren(clone, 'ParentBody')[0];
    const parentId = parent?.getAttribute('Ref');
    if (parent && parentId && renamedBodies.has(parentId))
      parent.setAttribute('Ref', renamedBodies.get(parentId)!);
    for (const site of sitesByBody.get(oldId) ?? []) {
      const retargeted = appendLandmark(bodiesDoc, clone, site);
      if (retargeted) retargetedLandmarks++;
      else addedLandmarks++;
      if (site.decal && !retargeted) appendDecal(bodiesDoc, clone, site);
    }
    bodiesDoc.documentElement.appendChild(clone);
  }
  const vehicleRows = directChildren(child(doc, system, 'Vehicles'), 'Vehicle');
  for (const row of vehicleRows) {
    const id = row.getAttribute('Ref');
    const source = id && corpus.vehicles.get(id);
    const parent = source && directChildren(source, 'ParentBody')[0]?.getAttribute('Ref');
    if (!id || !source || !parent || !renamedBodies.has(parent)) continue;
    const clone = bodiesDoc.importNode(source, true);
    const newId = `${id}_${modId}`;
    clone.setAttribute('Id', newId);
    directChildren(clone, 'ParentBody')[0].setAttribute('Ref', renamedBodies.get(parent)!);
    bodiesDoc.documentElement.appendChild(clone);
    row.setAttribute('Ref', newId);
  }
  for (const row of bodyRows) {
    const id = row.getAttribute('Ref');
    if (id && renamedBodies.has(id)) row.setAttribute('Ref', renamedBodies.get(id)!);
  }
  return {
    xml: serialize(doc),
    bodiesXml: renamedBodies.size ? serialize(bodiesDoc) : null,
    renamedBodies,
    addedLandmarks,
    retargetedLandmarks,
  };
}
