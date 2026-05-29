import { DOMImplementation, XMLSerializer } from '@xmldom/xmldom'
import type { Document as XmlDocument, Element as XmlElement } from '@xmldom/xmldom'
import type {
  Connector,
  ConnectorFlag,
  EditingPart,
  EulerXYZ,
  PartGameData,
  SubPartPlacement,
  Tank,
  Transform,
  Vec3,
} from './types'
import { formatG6 } from './formatG6'

/**
 * Serializes an EditingPart to KSA "Assets" Part XML, mirroring the rules in
 * space-tape's PartXmlSerializer.cs:
 *  - <Transform> omitted entirely when position=0, rotation=0, scale=1.
 *  - Each of <Position>/<Rotation>/<Scale> omitted when equal to its default
 *    (0 / 0 / 1) within EPSILON.
 *  - Each axis attribute omitted when equal to the default.
 *  - Numbers formatted with .NET "G6" semantics (see formatG6).
 *  - Rotation is stored as Euler XYZ radians.
 *
 * XML is built with @xmldom/xmldom's DOMImplementation/XMLSerializer (browser-
 * compatible, also runs in node tests), then pretty-printed with 4-space
 * indentation to match the Core XML style.
 *
 * The <Part> emits SubPart placements and Connector transforms (+ <Flags>).
 * Editor tags and all other GameData (display name, mass, tanks, power,
 * coupling) live on the separate <PartGameData> document — see
 * {@link serializeGameData}. (Connector <Flags> are emitted in BOTH documents,
 * matching space-tape's serializers.)
 */

const EPSILON = 1e-9

/** ", "-joined flag list (e.g. "Internal, ToSurface"), or null when empty. */
function flagsString(flags: readonly ConnectorFlag[]): string | null {
  return flags.length > 0 ? flags.join(', ') : null
}

export function serializePart(part: EditingPart): string {
  const doc = new DOMImplementation().createDocument(null, 'Assets', null)
  const assets = doc.documentElement! // 'Assets' root, created above
  const partEl = doc.createElement('Part')
  partEl.setAttribute('Id', part.partId)

  for (const placement of part.placements) {
    partEl.appendChild(buildSubPartElement(doc, placement))
  }

  for (const connector of part.connectors) {
    partEl.appendChild(buildConnectorElement(doc, connector))
  }

  assets.appendChild(partEl)

  const body = new XMLSerializer().serializeToString(doc)
  return '<?xml version="1.0" encoding="utf-8"?>\n' + prettyXml(body) + '\n'
}

/**
 * Serializes the <PartGameData> document — the per-part metadata KSA reads
 * separately from the geometry <Part>. Mirrors space-tape's
 * GameDataXmlSerializer.cs: DisplayName attribute, editor tags, custom mass,
 * tanks, batteries/generators/power-consumers, every connector's id (with
 * <Flags> only when set), and the optional decoupler/docking-port/EVA-door.
 * Each piece is omitted entirely when empty/default.
 */
export function serializeGameData(part: EditingPart): string {
  const doc = new DOMImplementation().createDocument(null, 'Assets', null)
  const assets = doc.documentElement!
  const gd = doc.createElement('PartGameData')
  gd.setAttribute('Id', part.partId)
  const game: PartGameData = part.gameData

  if (game.displayName.trim()) gd.setAttribute('DisplayName', game.displayName)

  for (const tag of part.editorTags) {
    if (!tag.trim()) continue
    const el = doc.createElement('EditorTag')
    el.setAttribute('Value', tag)
    gd.appendChild(el)
  }

  if (game.customMass != null && game.customMass > 0) {
    const custom = doc.createElement('CustomMass')
    custom.appendChild(elWithAttr(doc, 'Mass', 'Kg', formatG6(game.customMass)))
    gd.appendChild(custom)
  }

  for (const tank of game.tanks) gd.appendChild(buildTankElement(doc, tank))

  for (const b of game.batteries) {
    const el = doc.createElement('Battery')
    el.appendChild(elWithAttr(doc, 'MaximumCapacity', 'KWh', formatG6(b.capacityKWh)))
    gd.appendChild(el)
  }
  for (const g of game.generators) {
    const el = doc.createElement('Generator')
    el.appendChild(elWithAttr(doc, 'Produced', 'W', formatG6(g.outputWatts)))
    gd.appendChild(el)
  }
  for (const pc of game.powerConsumers) {
    const el = doc.createElement('PowerConsumer')
    el.appendChild(elWithAttr(doc, 'Consumed', 'W', formatG6(pc.consumedWatts)))
    gd.appendChild(el)
  }

  for (const connector of part.connectors) {
    const el = doc.createElement('Connector')
    el.setAttribute('Id', connector.id)
    const flags = flagsString(connector.flags)
    if (flags) {
      const flagsEl = doc.createElement('Flags')
      flagsEl.appendChild(doc.createTextNode(flags))
      el.appendChild(flagsEl)
    }
    gd.appendChild(el)
  }

  if (game.decoupler) {
    const el = doc.createElement('Decoupler')
    el.setAttribute('ConnectorId', game.decoupler.connectorId)
    el.setAttribute('Force', formatG6(game.decoupler.force))
    gd.appendChild(el)
  }
  if (game.dockingPort) {
    const el = doc.createElement('DockingPort')
    el.setAttribute('ConnectorId', game.dockingPort.connectorId)
    el.setAttribute('Force', formatG6(game.dockingPort.force))
    gd.appendChild(el)
  }
  if (game.evaDoor) {
    const el = doc.createElement('EVADoor')
    el.setAttribute('ConnectorId', game.evaDoor.connectorId)
    gd.appendChild(el)
  }

  assets.appendChild(gd)

  const body = new XMLSerializer().serializeToString(doc)
  return '<?xml version="1.0" encoding="utf-8"?>\n' + prettyXml(body) + '\n'
}

/** Creates an element with a single attribute, e.g. <Mass Kg="100"/>. */
function elWithAttr(doc: XmlDocument, name: string, attr: string, value: string): XmlElement {
  const el = doc.createElement(name)
  el.setAttribute(attr, value)
  return el
}

/** <CylindricalTank>/<SphericalTank> with Material/Length/OuterRadius/WallThickness. */
function buildTankElement(doc: XmlDocument, tank: Tank): XmlElement {
  const el = doc.createElement(tank.shape === 'Cylindrical' ? 'CylindricalTank' : 'SphericalTank')
  if (tank.wallMaterialId.trim()) {
    el.appendChild(elWithAttr(doc, 'Material', 'Id', tank.wallMaterialId))
  }
  if (tank.shape === 'Cylindrical') {
    el.appendChild(elWithAttr(doc, 'Length', 'M', formatG6(tank.lengthM)))
  }
  el.appendChild(elWithAttr(doc, 'OuterRadius', 'M', formatG6(tank.outerRadiusM)))
  el.appendChild(elWithAttr(doc, 'WallThickness', 'Mm', formatG6(tank.wallThicknessMm)))
  return el
}

function buildSubPartElement(doc: XmlDocument, placement: SubPartPlacement): XmlElement {
  const el = doc.createElement('SubPart')
  el.setAttribute('Id', placement.instanceId)
  el.setAttribute('InstanceOf', placement.subPartTemplateId)
  const transform = buildTransformElement(doc, placement)
  if (transform) el.appendChild(transform)
  return el
}

function buildConnectorElement(doc: XmlDocument, connector: Connector): XmlElement {
  const el = doc.createElement('Connector')
  el.setAttribute('Id', connector.id)
  const transform = buildTransformElement(doc, connector)
  if (transform) el.appendChild(transform)
  const flags = flagsString(connector.flags)
  if (flags) {
    const flagsEl = doc.createElement('Flags')
    flagsEl.appendChild(doc.createTextNode(flags))
    el.appendChild(flagsEl)
  }
  return el
}

/** Returns a <Transform> element, or null if the transform is identity. */
function buildTransformElement(doc: XmlDocument, t: Transform): XmlElement | null {
  const pos = buildVectorElement(doc, 'Position', t.position, 0)
  const rot = buildRotationElement(doc, t.rotation)
  const scale = buildVectorElement(doc, 'Scale', t.scale, 1)

  if (!pos && !rot && !scale) return null

  const transform = doc.createElement('Transform')
  if (pos) transform.appendChild(pos)
  if (rot) transform.appendChild(rot)
  if (scale) transform.appendChild(scale)
  return transform
}

/** Builds e.g. <Position X="1.5" Z="-0.5"/>, omitting axes equal to `def`. */
function buildVectorElement(
  doc: XmlDocument,
  name: string,
  v: Vec3,
  def: number,
): XmlElement | null {
  const xDiff = Math.abs(v.x - def) > EPSILON
  const yDiff = Math.abs(v.y - def) > EPSILON
  const zDiff = Math.abs(v.z - def) > EPSILON
  if (!xDiff && !yDiff && !zDiff) return null

  const el = doc.createElement(name)
  if (xDiff) el.setAttribute('X', formatG6(v.x))
  if (yDiff) el.setAttribute('Y', formatG6(v.y))
  if (zDiff) el.setAttribute('Z', formatG6(v.z))
  return el
}

/** Rotation is exported as Euler XYZ radians; default is 0 on every axis. */
function buildRotationElement(doc: XmlDocument, rot: EulerXYZ): XmlElement | null {
  return buildVectorElement(doc, 'Rotation', rot, 0)
}

/**
 * Re-indents the flat XMLSerializer output with 4-space indentation. Safe here
 * because the document contains only elements/attributes (no mixed text nodes).
 */
function prettyXml(xml: string): string {
  const lines = xml.replace(/></g, '>\n<').split('\n')
  const out: string[] = []
  let depth = 0
  for (const line of lines) {
    const isClosing = /^<\//.test(line)
    if (isClosing) depth = Math.max(0, depth - 1)
    out.push('    '.repeat(depth) + line)
    const isOpening =
      /^<[^/!?]/.test(line) && !/\/>$/.test(line) && !/<\/[^>]+>$/.test(line)
    if (isOpening) depth++
  }
  return out.join('\n')
}
