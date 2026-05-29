import { CONNECTOR_LAYER_ID, createEmptyGameData, DEFAULT_LAYER_ID } from './types'
import type {
  Connector,
  ConnectorFlag,
  EulerXYZ,
  PartGameData,
  SubPartPlacement,
  Tank,
  TankShape,
  Vec3,
} from './types'

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
      // KSA XML has no layers; placements load into the Default layer. Importing
      // into the editor reassigns them to the active layer (see addPart).
      layerId: DEFAULT_LAYER_ID,
    })
  }
  return placements
}

const CONNECTOR_FLAG_SET = new Set<ConnectorFlag>(['Internal', 'ToSurface', 'FromSurface'])

/**
 * Parses a comma-separated <Flags> body (e.g. "Internal, ToSurface") into the
 * recognized {@link ConnectorFlag}s, preserving order and dropping unknowns.
 */
export function parseConnectorFlags(raw: string | null | undefined): ConnectorFlag[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim() as ConnectorFlag)
    .filter((f) => CONNECTOR_FLAG_SET.has(f))
}

/**
 * Extracts the connector attachment points from a single <Part> element, with
 * their relative transforms. Core Assets <Part> definitions carry connector
 * transforms but not <Flags> (those live on <PartGameData>), so flags default to
 * [] unless a <Flags> child is present inline.
 */
export function connectorsFromPartElement(part: Element): Connector[] {
  const connectors: Connector[] = []
  for (const conn of directChildren(part, 'Connector')) {
    const id = conn.getAttribute('Id')
    if (!id) continue
    const transform = directChildren(conn, 'Transform')[0] ?? null
    connectors.push({
      id,
      position: readVec(transform, 'Position', 0),
      rotation: readVec(transform, 'Rotation', 0) as EulerXYZ,
      scale: readVec(transform, 'Scale', 1),
      flags: parseConnectorFlags(directChildren(conn, 'Flags')[0]?.textContent),
      // Connectors live in the built-in Connectors layer (managed separately from
      // SubPart meshes); importing into the editor keeps them there.
      layerId: CONNECTOR_LAYER_ID,
    })
  }
  return connectors
}

/** The full GameData payload read back from a <PartGameData> element. */
export interface ParsedGameData {
  editorTags: string[]
  /** connector id → its flags (only connectors that carry <Flags>). */
  connectorFlags: Map<string, ConnectorFlag[]>
  gameData: PartGameData
}

function readNum(el: Element | null | undefined, attr: string): number | null {
  const raw = el?.getAttribute(attr)
  if (raw == null) return null
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) ? n : null
}

function tankFromElement(el: Element, shape: TankShape): Tank {
  return {
    shape,
    wallMaterialId: directChildren(el, 'Material')[0]?.getAttribute('Id') ?? '',
    lengthM: readNum(directChildren(el, 'Length')[0], 'M') ?? 0,
    outerRadiusM: readNum(directChildren(el, 'OuterRadius')[0], 'M') ?? 0,
    wallThicknessMm: readNum(directChildren(el, 'WallThickness')[0], 'Mm') ?? 0,
  }
}

/**
 * Parses a single <PartGameData> element into its editor tags, connector flags
 * (by id) and {@link PartGameData} block. The inverse of
 * {@link serializeGameData}; missing children/attributes fall back to defaults.
 */
export function parseGameDataElement(gd: Element): ParsedGameData {
  const game = createEmptyGameData()
  game.displayName = gd.getAttribute('DisplayName') ?? ''

  const editorTags: string[] = []
  for (const tag of directChildren(gd, 'EditorTag')) {
    const v = tag.getAttribute('Value')
    if (v && !editorTags.includes(v)) editorTags.push(v)
  }

  const mass = readNum(directChildren(directChildren(gd, 'CustomMass')[0] ?? gd, 'Mass')[0], 'Kg')
  game.customMass = mass != null && mass > 0 ? mass : null

  for (const el of directChildren(gd, 'CylindricalTank')) game.tanks.push(tankFromElement(el, 'Cylindrical'))
  for (const el of directChildren(gd, 'SphericalTank')) game.tanks.push(tankFromElement(el, 'Spherical'))

  for (const el of directChildren(gd, 'Battery'))
    game.batteries.push({ capacityKWh: readNum(directChildren(el, 'MaximumCapacity')[0], 'KWh') ?? 0 })
  for (const el of directChildren(gd, 'Generator'))
    game.generators.push({ outputWatts: readNum(directChildren(el, 'Produced')[0], 'W') ?? 0 })
  for (const el of directChildren(gd, 'PowerConsumer'))
    game.powerConsumers.push({ consumedWatts: readNum(directChildren(el, 'Consumed')[0], 'W') ?? 0 })

  const connectorFlags = new Map<string, ConnectorFlag[]>()
  for (const conn of directChildren(gd, 'Connector')) {
    const connId = conn.getAttribute('Id')
    if (!connId) continue
    const flags = parseConnectorFlags(directChildren(conn, 'Flags')[0]?.textContent)
    if (flags.length > 0) connectorFlags.set(connId, flags)
  }

  const dec = directChildren(gd, 'Decoupler')[0]
  if (dec) game.decoupler = { connectorId: dec.getAttribute('ConnectorId') ?? '', force: readNum(dec, 'Force') ?? 0 }
  const dp = directChildren(gd, 'DockingPort')[0]
  if (dp) game.dockingPort = { connectorId: dp.getAttribute('ConnectorId') ?? '', force: readNum(dp, 'Force') ?? 0 }
  const eva = directChildren(gd, 'EVADoor')[0]
  if (eva) game.evaDoor = { connectorId: eva.getAttribute('ConnectorId') ?? '' }

  return { editorTags, connectorFlags, gameData: game }
}

/**
 * Parses the <PartGameData Id="partId"> entry out of an Assets document. Returns
 * null when no matching entry exists. The inverse of {@link serializeGameData}.
 */
export function gameDataFromAssets(
  xmlText: string,
  partId: string,
  parserImpl: DomParserLike = new DOMParser(),
): ParsedGameData | null {
  const doc = parserImpl.parseFromString(xmlText, 'application/xml') as Document
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error(`partXmlParser: parse error parsing PartGameData '${partId}'`)
  }
  const gd = Array.from(doc.getElementsByTagName('PartGameData')).find(
    (g) => g.getAttribute('Id') === partId,
  )
  return gd ? parseGameDataElement(gd) : null
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
