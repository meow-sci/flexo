import type { Connector, ConnectorFlag, EulerXYZ, SubPartPlacement, Vec3 } from './types'

/**
 * Parses SubPart placements out of a KSA Assets <Part> definition — the inverse
 * of partXmlSerializer. Used for the coordinate calibration step (loading a known
 * Core Part) and, later, for Part import. Uses the browser DOMParser.
 *
 * <Transform> rotation is Euler XYZ radians; missing axes/elements default to
 * 0 (position/rotation) or 1 (scale).
 *
 * In the browser this uses the global DOMParser; tests can inject
 * @xmldom/xmldom's DOMParser via `parserImpl` for a node-side round-trip.
 */
interface DomParserLike {
  parseFromString(text: string, type: string): unknown
}

export function parsePartPlacements(
  xmlText: string,
  partId: string,
  parserImpl: DomParserLike = new DOMParser(),
): SubPartPlacement[] {
  const doc = parserImpl.parseFromString(xmlText, 'application/xml') as Document
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error(`partXmlParser: parse error parsing Part '${partId}'`)
  }

  const part = Array.from(doc.getElementsByTagName('Part')).find(
    (p) => p.getAttribute('Id') === partId,
  )
  if (!part) throw new Error(`partXmlParser: Part '${partId}' not found`)

  return placementsFromPartElement(part)
}

/**
 * Extracts the SubPart instance placements from a single <Part> element. Only
 * children carrying an InstanceOf are placements (skin/structure metadata
 * children without it are ignored). Shared by the single-Part parser and the
 * Part catalog loader.
 */
export function placementsFromPartElement(part: Element): SubPartPlacement[] {
  const placements: SubPartPlacement[] = []
  for (const sub of directChildren(part, 'SubPart')) {
    const instanceOf = sub.getAttribute('InstanceOf')
    if (!instanceOf) continue // skip non-instance entries
    const transform = directChildren(sub, 'Transform')[0] ?? null
    placements.push({
      instanceId: sub.getAttribute('Id') ?? instanceOf,
      subPartTemplateId: instanceOf,
      position: readVec(transform, 'Position', 0),
      rotation: readVec(transform, 'Rotation', 0) as EulerXYZ,
      scale: readVec(transform, 'Scale', 1),
    })
  }
  return placements
}

const CONNECTOR_FLAG_SET = new Set<ConnectorFlag>(['None', 'Internal', 'ToSurface', 'FromSurface'])

/**
 * Extracts the connector attachment points from a single <Part> element, with
 * their relative transforms. Core Assets <Part> definitions carry connector
 * transforms but not <Flags> (those live on <PartGameData>), so flags default to
 * 'None' unless a <Flags> child is present inline.
 */
export function connectorsFromPartElement(part: Element): Connector[] {
  const connectors: Connector[] = []
  for (const conn of directChildren(part, 'Connector')) {
    const id = conn.getAttribute('Id')
    if (!id) continue
    const transform = directChildren(conn, 'Transform')[0] ?? null
    const rawFlags = directChildren(conn, 'Flags')[0]?.textContent?.trim() as ConnectorFlag | undefined
    connectors.push({
      id,
      position: readVec(transform, 'Position', 0),
      rotation: readVec(transform, 'Rotation', 0) as EulerXYZ,
      scale: readVec(transform, 'Scale', 1),
      flags: rawFlags && CONNECTOR_FLAG_SET.has(rawFlags) ? rawFlags : 'None',
    })
  }
  return connectors
}

export function directChildren(parent: Element, tag: string): Element[] {
  const out: Element[] = []
  for (const node of Array.from(parent.childNodes)) {
    if (node.nodeType === 1 && (node as Element).tagName === tag) out.push(node as Element)
  }
  return out
}

function readVec(transform: Element | null, tag: string, def: number): Vec3 {
  const v: Vec3 = { x: def, y: def, z: def }
  if (!transform) return v
  const el = directChildren(transform, tag)[0]
  if (!el) return v
  const read = (attr: string) => {
    const raw = el.getAttribute(attr)
    return raw === null ? def : Number.parseFloat(raw)
  }
  return { x: read('X'), y: read('Y'), z: read('Z') }
}
