import {
  CONNECTOR_LAYER_ID,
  createEmptyGameData,
  createSubPartGameData,
  DEFAULT_LAYER_ID,
  isSubPartGameDataEmpty,
} from './types'
import type {
  CatalogAnimationModule,
  Combustor,
  Connector,
  ConnectorFlag,
  CustomCombustionProcess,
  DeLavalNozzle,
  EulerXYZ,
  Gimbal,
  Light,
  LightType,
  PartGameData,
  RawXmlNode,
  Rocket,
  RocketController,
  RocketControllerKind,
  RocketSoundAction,
  SolarPanel,
  SubPartGameData,
  SubPartIdRef,
  SubPartPlacement,
  Tank,
  TankShape,
  Transform,
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
  subPartGameData: SubPartGameData[]
  /** Parsed <KeyframeAnimationModule>s (refs in ORIGINAL instance-id space). */
  animationModules: CatalogAnimationModule[]
  /** Top-level <CombustionProcess> custom propellants (siblings of <PartGameData>). */
  customCombustionProcesses: CustomCombustionProcess[]
}

/** Parses the <KeyframeAnimationModule> children of a <PartGameData> element. */
export function animationModulesFromGameData(gd: Element): CatalogAnimationModule[] {
  const out: CatalogAnimationModule[] = []
  for (const mod of directChildren(gd, 'KeyframeAnimationModule')) {
    const kf = directChildren(mod, 'KeyframeAnimation')[0]
    const glbPath = kf?.getAttribute('Path')
    if (!glbPath) continue // a module without a GLB reference is unusable
    const st = directChildren(mod, 'SolarTracking')[0] ?? null
    out.push({
      moduleId: mod.getAttribute('Id') ?? '',
      showDeployRetract: (mod.getAttribute('ShowDeployRetract') ?? '').toLowerCase() === 'true',
      glbPath,
      glbId: kf?.getAttribute('Id') ?? '',
      solarTracking: st
        ? {
            degreesPerSecond: readNum(st, 'DegreesPerSecond') ?? 0,
            subPartOriginalId: st.getAttribute('SubPart') ?? '',
            excludeOriginalIds: directChildren(st, 'ExcludeSubPart')
              .map((e) => e.textContent?.trim() ?? '')
              .filter(Boolean),
          }
        : null,
    })
  }
  return out
}

function readNum(el: Element | null | undefined, attr: string): number | null {
  const raw = el?.getAttribute(attr)
  if (raw == null) return null
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) ? n : null
}

/**
 * KSA unit-reference token tables (attribute name → SI scale). A reference element
 * (e.g. `<MaximumCapacity J="…"/>`) may carry any of these attributes and the game
 * sums every one present (absent = ignored). Mirrors the current game's
 * `EnergyReference`/`PowerReference`/`ImpulseReference.SetValue()`.
 */
const ENERGY_TOKENS: readonly (readonly [string, number])[] = [
  ['J', 1],
  ['KJ', 1_000],
  ['MJ', 1_000_000],
  ['GJ', 1_000_000_000],
  ['TJ', 1_000_000_000_000],
  ['Ws', 1],
  ['Wh', 3_600],
  ['KWh', 3_600_000],
]
const POWER_TOKENS: readonly (readonly [string, number])[] = [
  ['W', 1],
  ['KW', 1_000],
  ['MW', 1_000_000],
  ['GW', 1_000_000_000],
  ['TW', 1_000_000_000_000],
]
const IMPULSE_TOKENS: readonly (readonly [string, number])[] = [
  ['Ns', 1],
  ['KNs', 1_000],
  ['MNs', 1_000_000],
]

/**
 * Reads a KSA reference child element (e.g. `<MaximumCapacity>` / `<Produced>` /
 * `<PushoffImpulse>`), summing each present unit token by its SI scale the way the
 * game's `*Reference.SetValue()` does. Returns 0 when the element or all tokens are absent.
 */
function sumUnitChild(
  parent: Element,
  childTag: string,
  tokens: readonly (readonly [string, number])[],
): number {
  const el = directChildren(parent, childTag)[0]
  if (!el) return 0
  let total = 0
  for (const [attr, scale] of tokens) {
    const n = readNum(el, attr)
    if (n != null) total += n * scale
  }
  return total
}

/** Sum of a child's energy tokens, in joules (KSA `EnergyReference`). */
function readEnergyJoules(parent: Element, childTag: string): number {
  return sumUnitChild(parent, childTag, ENERGY_TOKENS)
}
/** Sum of a child's power tokens, in watts (KSA `PowerReference`). */
function readPowerWatts(parent: Element, childTag: string): number {
  return sumUnitChild(parent, childTag, POWER_TOKENS)
}
/** Sum of a child's impulse tokens, in newton-seconds (KSA `ImpulseReference`). */
function readImpulseNs(parent: Element, childTag: string): number {
  return sumUnitChild(parent, childTag, IMPULSE_TOKENS)
}

/** Reads a child `<Transform>` into a full {@link Transform} (identity when absent). */
function readTransform(parent: Element): Transform {
  const t = directChildren(parent, 'Transform')[0] ?? null
  return {
    position: readVec(t, 'Position', 0),
    rotation: readVec(t, 'Rotation', 0) as EulerXYZ,
    scale: readVec(t, 'Scale', 1),
  }
}

/** Parses one `<SolarPanel>` element: its `<Produced W>` and orientation `<Transform>`. */
function parseSolarPanel(el: Element): SolarPanel {
  return { outputWatts: readPowerWatts(el, 'Produced'), transform: readTransform(el) }
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
 * Parses one `<Light>` element into a {@link Light}. Missing children/attributes fall
 * back to KSA's `LightModule.TemplateData` defaults (Range/Intensity 1, white color,
 * InnerAngle π/8, OuterAngle π/4, RayTracing false). The inverse of `buildLightElement`.
 */
function lightFromElement(el: Element): Light {
  const type: LightType =
    directChildren(el, 'Type')[0]?.textContent?.trim() === 'Point' ? 'Point' : 'Spot'
  const colorEl = directChildren(el, 'Color')[0]
  return {
    type,
    transform: readTransform(el),
    rangeM: readNum(directChildren(el, 'Range')[0], 'Value') ?? 1,
    intensity: readNum(directChildren(el, 'Intensity')[0], 'Value') ?? 1,
    color: {
      r: readNum(colorEl, 'R') ?? 1,
      g: readNum(colorEl, 'G') ?? 1,
      b: readNum(colorEl, 'B') ?? 1,
    },
    innerAngleRad: readNum(directChildren(el, 'InnerAngle')[0], 'Value') ?? Math.PI / 8,
    outerAngleRad: readNum(directChildren(el, 'OuterAngle')[0], 'Value') ?? Math.PI / 4,
    rayTracing: directChildren(el, 'RayTracing')[0]?.textContent?.trim().toLowerCase() === 'true',
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

  // <Diameter M/> — a DistanceReference; null when the element is absent.
  game.diameterM = readDistanceM(directChildren(gd, 'Diameter')[0])
  // <Control/> — a bare command-capability marker (ControlTemplate has no fields).
  game.controllable = directChildren(gd, 'Control').length > 0

  // Battery capacity is an EnergyReference (`J`); the model holds Wh.
  // Generator/Solar/Consumer rates are a PowerReference (`W`).
  for (const el of directChildren(gd, 'Battery'))
    game.batteries.push({ capacityWh: readEnergyJoules(el, 'MaximumCapacity') / 3600 })
  for (const el of directChildren(gd, 'Generator'))
    game.generators.push({ outputWatts: readPowerWatts(el, 'Produced') })
  for (const el of directChildren(gd, 'SolarPanel')) game.solarPanels.push(parseSolarPanel(el))
  // KSA has a single Part.LightSwitch slot, so flexo keeps ONE consumer per part:
  // prefer the first LightSwitch=true (the one KSA would actually wire up), else the
  // first. No shipped part has >1, so the >1 branch is purely defensive.
  const consumers = directChildren(gd, 'PowerConsumer').map((el) => ({
    consumedWatts: readPowerWatts(el, 'Consumed'),
    lightSwitch: el.getAttribute('LightSwitch')?.trim().toLowerCase() === 'true',
    lightIsActive: el.getAttribute('LightIsActive')?.trim().toLowerCase() === 'true',
  }))
  if (consumers.length > 1) {
    console.warn(
      `flexo import: <PartGameData Id="${gd.getAttribute('Id') ?? ''}"> has ${consumers.length} <PowerConsumer>; ` +
        `keeping one (KSA wires only a single Part.LightSwitch).`,
    )
  }
  game.powerConsumer = consumers.find((c) => c.lightSwitch) ?? consumers[0] ?? null

  const connectorFlags = new Map<string, ConnectorFlag[]>()
  for (const conn of directChildren(gd, 'Connector')) {
    const connId = conn.getAttribute('Id')
    if (!connId) continue
    const flags = parseConnectorFlags(directChildren(conn, 'Flags')[0]?.textContent)
    if (flags.length > 0) connectorFlags.set(connId, flags)
  }

  const dec = directChildren(gd, 'Decoupler')[0]
  if (dec)
    game.decoupler = {
      connectorId: dec.getAttribute('ConnectorId') ?? '',
      force: readNum(dec, 'Force') ?? 0,
    }
  const dp = directChildren(gd, 'DockingPort')[0]
  if (dp) {
    // <DockingPort><ConnectorId Value/><LatchingKineticEnergy J/><PushoffImpulse Ns/></DockingPort>.
    game.dockingPort = {
      connectorId: directChildren(dp, 'ConnectorId')[0]?.getAttribute('Value') ?? '',
      latchingKineticEnergyJ: readEnergyJoules(dp, 'LatchingKineticEnergy'),
      pushoffImpulseNs: readImpulseNs(dp, 'PushoffImpulse'),
    }
  }
  const eva = directChildren(gd, 'EVADoor')[0]
  if (eva) game.evaDoor = { connectorId: eva.getAttribute('ConnectorId') ?? '' }

  // Engine modules: part-level rockets/combustors/nozzles (gas generators), controllers,
  // and per-instance gimbal overlays.
  parseEngineModules(gd, game)
  for (const c of directChildren(gd, 'RocketEngineController'))
    game.rocketControllers.push(controllerFromElement(c, 'engine'))
  for (const c of directChildren(gd, 'RocketThrusterController'))
    game.rocketControllers.push(controllerFromElement(c, 'thruster'))
  game.gimbals = gimbalsFromGameData(gd)

  // Preserve anything flexo doesn't model so import → export doesn't silently drop it.
  game.unknownAttrs = captureUnknownAttrs(gd, KNOWN_PART_GAMEDATA_ATTRS)
  game.unknownChildren = captureUnknownChildren(gd, KNOWN_PART_GAMEDATA_CHILDREN)

  return {
    editorTags,
    connectorFlags,
    gameData: game,
    subPartGameData: [],
    animationModules: animationModulesFromGameData(gd),
    customCombustionProcesses: [],
  }
}

/** Parses top-level `<CombustionProcess>` (custom propellants) from an Assets document root. */
export function combustionProcessesFromRoot(root: Element): CustomCombustionProcess[] {
  const out: CustomCombustionProcess[] = []
  for (const proc of directChildren(root, 'CombustionProcess')) {
    const id = proc.getAttribute('Id')
    if (!id) continue
    const name = directChildren(proc, 'Name')[0]?.getAttribute('Value')?.trim() || id
    const reactants = directChildren(proc, 'Reactant')
      .map((r) => ({
        phaseId: r.getAttribute('Id') ?? '',
        massShare: readNum(r, 'MassShare') ?? 0,
      }))
      .filter((r) => r.phaseId)
    const lut = directChildren(proc, 'CombustionCondition').map((c) => ({
      lnPressure: readNum(directChildren(c, 'LnPressure')[0], 'Value') ?? 0,
      temperatureK: readNum(directChildren(c, 'Temperature')[0], 'K') ?? 0,
      gamma: readNum(directChildren(c, 'Gamma')[0], 'Value') ?? 0,
      molarMassGPerMol: readNum(directChildren(c, 'MolarMass')[0], 'GPerMol') ?? 0,
    }))
    out.push({ id, name, reactants, lut })
  }
  return out
}

/** Parses all top-level <SubPartGameData> elements from a parsed GameData document. */
export function subPartGameDataFromDoc(doc: Document): SubPartGameData[] {
  return subPartGameDataFromRoot(doc.documentElement as Element)
}

/** Parses all top-level <SubPartGameData> elements from an Assets document root. */
function subPartGameDataFromRoot(root: Element): SubPartGameData[] {
  const out: SubPartGameData[] = []
  for (const spEl of directChildren(root, 'SubPartGameData')) {
    const subPartTemplateId = spEl.getAttribute('Id')
    if (!subPartTemplateId) continue
    const spd = createSubPartGameData(subPartTemplateId)
    for (const tankEl of directChildren(spEl, 'Tank')) {
      const cylEl = directChildren(tankEl, 'CylindricalTank')[0]
      const sphEl = directChildren(tankEl, 'SphericalTank')[0]
      if (cylEl) spd.tanks.push(tankFromElement(cylEl, 'Cylindrical'))
      else if (sphEl) spd.tanks.push(tankFromElement(sphEl, 'Spherical'))
    }
    spd.solarPanels = directChildren(spEl, 'SolarPanel').map(parseSolarPanel)
    spd.lights = directChildren(spEl, 'Light').map(lightFromElement)
    // Reusable thrust-chamber modules (rocket/combustor/nozzle) that travel with the mesh.
    parseEngineModules(spEl, spd)
    // Preserve unmodeled attrs (e.g. Core's `DisplayName`) + child elements verbatim.
    spd.unknownAttrs = captureUnknownAttrs(spEl, KNOWN_SUBPART_GAMEDATA_ATTRS)
    spd.unknownChildren = captureUnknownChildren(spEl, KNOWN_SUBPART_GAMEDATA_CHILDREN)
    if (!isSubPartGameDataEmpty(spd)) out.push(spd)
  }
  return out
}

/**
 * Parses the <PartGameData Id="partId"> entry out of an Assets document, and
 * also collects all top-level <SubPartGameData> entries (tank data). Returns
 * null when no matching PartGameData entry exists.
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
  if (!gd) return null
  const parsed = parseGameDataElement(gd)
  parsed.subPartGameData = subPartGameDataFromRoot(doc.documentElement as Element)
  parsed.customCombustionProcesses = combustionProcessesFromRoot(doc.documentElement as Element)
  return parsed
}

export function directChildren(parent: Element, tag: string): Element[] {
  const out: Element[] = []
  for (const node of Array.from(parent.childNodes)) {
    if (node.nodeType === 1 && (node as Element).tagName === tag) out.push(node as Element)
  }
  return out
}

/** All direct child *elements* of `parent` (any tag), in document order. */
function childElements(parent: Element): Element[] {
  const out: Element[] = []
  for (const node of Array.from(parent.childNodes)) {
    if (node.nodeType === 1) out.push(node as Element)
  }
  return out
}

// --- Unmodeled-XML passthrough (round-trip fidelity for elements flexo doesn't model) ---
//
// flexo reads a fixed allow-list and rebuilds a fresh DOM, so any element it doesn't model
// is normally dropped on import → export. These sets enumerate exactly what flexo models as
// direct children / root attributes of <PartGameData> / <SubPartGameData>; everything else is
// captured verbatim into `unknownChildren`/`unknownAttrs` and re-emitted by the serializer.

/** `<PartGameData>` child tags flexo models (read and/or emit). Everything else is passthrough. */
const KNOWN_PART_GAMEDATA_CHILDREN: ReadonlySet<string> = new Set([
  'EditorTag',
  'Diameter',
  'KeyframeAnimationModule',
  'CustomMass',
  'Control',
  'Battery',
  'Generator',
  'SolarPanel',
  'PowerConsumer',
  'Connector',
  'Decoupler',
  'DockingPort',
  'EVADoor',
  'RocketEngineController',
  'RocketThrusterController',
  'Rocket',
  'Combustor',
  'DeLavalNozzle',
  'SubPart',
])
/** `<SubPartGameData>` child tags flexo models. Everything else is passthrough. */
const KNOWN_SUBPART_GAMEDATA_CHILDREN: ReadonlySet<string> = new Set([
  'Tank',
  'SolarPanel',
  'Light',
  'Rocket',
  'Combustor',
  'DeLavalNozzle',
])
/** `<PartGameData>` attributes flexo models (`DisplayName` is read; `Id` keys the entry). */
const KNOWN_PART_GAMEDATA_ATTRS: ReadonlySet<string> = new Set(['Id', 'DisplayName'])
/** `<SubPartGameData>` attributes flexo models (only `Id`; Core also authors an unmodeled `DisplayName`). */
const KNOWN_SUBPART_GAMEDATA_ATTRS: ReadonlySet<string> = new Set(['Id'])

/** Recursively snapshots an element into a JSON {@link RawXmlNode} (attrs + child elements + leaf text). */
function elementToRawNode(el: Element): RawXmlNode {
  const attrs: Record<string, string> = {}
  for (const attr of Array.from(el.attributes)) attrs[attr.name] = attr.value
  const kids = childElements(el)
  const node: RawXmlNode = { tag: el.tagName, attrs, children: kids.map(elementToRawNode) }
  if (kids.length === 0) {
    const text = el.textContent?.trim()
    if (text) node.text = text
  }
  return node
}

/** Captures every direct child element whose tag is NOT in `known` as a verbatim {@link RawXmlNode}. */
export function captureUnknownChildren(parent: Element, known: ReadonlySet<string>): RawXmlNode[] {
  return childElements(parent)
    .filter((el) => !known.has(el.tagName))
    .map(elementToRawNode)
}

/** Captures every attribute whose name is NOT in `known` as a verbatim name→value entry. */
export function captureUnknownAttrs(
  el: Element,
  known: ReadonlySet<string>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const attr of Array.from(el.attributes)) {
    if (!known.has(attr.name)) out[attr.name] = attr.value
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

// --- Engine module parsing (inverse of partXmlSerializer's engine builders) ---

/** Reads X/Y/Z attributes directly off an element (engine vectors, unlike <Transform> children). */
function readVec3Attrs(el: Element | null | undefined, def: Vec3): Vec3 {
  if (!el) return { ...def }
  return {
    x: readNum(el, 'X') ?? def.x,
    y: readNum(el, 'Y') ?? def.y,
    z: readNum(el, 'Z') ?? def.z,
  }
}

/** Sums a `PressureReference`'s unit attributes into Pa; null when none are set. */
function readPressurePa(el: Element | null | undefined): number | null {
  if (!el) return null
  const parts: [string, number][] = [
    ['Pa', 1],
    ['KPa', 1e3],
    ['MPa', 1e6],
    ['MBar', 100],
    ['Bar', 1e5],
    ['Atm', 101325],
  ]
  let value: number | null = null
  for (const [attr, scale] of parts) {
    const n = readNum(el, attr)
    if (n != null) value = (value ?? 0) + n * scale
  }
  return value
}

/** Sums a `DistanceReference`'s unit attributes into meters; null when none are set. */
function readDistanceM(el: Element | null | undefined): number | null {
  if (!el) return null
  const parts: [string, number][] = [
    ['Mm', 0.001],
    ['Cm', 0.01],
    ['M', 1],
    ['Km', 1000],
  ]
  let value: number | null = null
  for (const [attr, scale] of parts) {
    const n = readNum(el, attr)
    if (n != null) value = (value ?? 0) + n * scale
  }
  return value
}

/** Reads a `TimeSpanReference` (Seconds/Minutes/Hours) into seconds; null when absent. */
function readSeconds(el: Element | null | undefined): number | null {
  if (!el) return null
  const parts: [string, number][] = [
    ['Seconds', 1],
    ['Minutes', 60],
    ['Hours', 3600],
  ]
  let value: number | null = null
  for (const [attr, scale] of parts) {
    const n = readNum(el, attr)
    if (n != null) value = (value ?? 0) + n * scale
  }
  return value
}

/** Reads a `RadianReference` as degrees (Radians takes priority over Degrees, like KSA); 0 when absent. */
function readDegrees(el: Element | null | undefined): number {
  const radians = readNum(el, 'Radians')
  if (radians != null) return (radians * 180) / Math.PI
  return readNum(el, 'Degrees') ?? 0
}

/** Reads a `BoolReference` Value attribute; null when absent. */
function readBoolValue(el: Element | null | undefined): boolean | null {
  const raw = el?.getAttribute('Value')
  if (raw == null) return null
  return raw.trim().toLowerCase() === 'true'
}

/** Parses a `<Core>`/`<Nozzle>`/`<RocketReference>` into a {@link SubPartIdRef}. */
function refFromElement(el: Element | null | undefined): SubPartIdRef {
  return {
    id: el?.getAttribute('Id') ?? '',
    subPartInstanceId: el?.getAttribute('SubPartId') || null,
  }
}

/** Parses one `<Combustor>` element. Missing fields fall back to CombustorTemplate defaults. */
function combustorFromElement(el: Element): Combustor {
  return {
    id: el.getAttribute('Id') ?? '',
    combustionId: directChildren(el, 'Combustion')[0]?.getAttribute('Id') ?? '',
    maxPressurePa: readPressurePa(directChildren(el, 'MaxPressure')[0]) ?? 5_000_000,
    thermalEfficiency: readNum(directChildren(el, 'ThermalEfficiency')[0], 'Value') ?? 1,
    minimumThrottle: readNum(directChildren(el, 'MinimumThrottle')[0], 'Value') ?? 1,
    minimumPulseTimeS: readSeconds(directChildren(el, 'MinimumPulseTime')[0]),
  }
}

/** Parses one `<DeLavalNozzle>` element. Missing fields fall back to nozzle template defaults. */
function nozzleFromElement(el: Element): DeLavalNozzle {
  const fxDia = readDistanceM(directChildren(el, 'FxExitDiameter')[0])
  const fxLoc = directChildren(el, 'FxExhaustLocation')[0]
  const fxDir = directChildren(el, 'FxExhaustDirection')[0]
  const soundEl = directChildren(el, 'SoundEvent')[0]
  return {
    id: el.getAttribute('Id') ?? '',
    exitDiameterM: readDistanceM(directChildren(el, 'ExitDiameter')[0]) ?? 1,
    fxExitDiameterM: fxDia,
    // KSA's AreaRatio default is NaN (a broken engine); preserve that so validation can flag it.
    areaRatio: readNum(directChildren(el, 'AreaRatio')[0], 'Value') ?? Number.NaN,
    flowEfficiency: readNum(directChildren(el, 'FlowEfficiency')[0], 'Value') ?? 1,
    expansionEfficiency: readNum(directChildren(el, 'ExpansionEfficiency')[0], 'Value') ?? 1,
    exhaustLocation: readVec3Attrs(directChildren(el, 'ExhaustLocation')[0], { x: 0, y: 0, z: 0 }),
    exhaustDirection: readVec3Attrs(directChildren(el, 'ExhaustDirection')[0], {
      x: -1,
      y: 0,
      z: 0,
    }),
    fxExhaustLocation: fxLoc ? readVec3Attrs(fxLoc, { x: 0, y: 0, z: 0 }) : null,
    fxExhaustDirection: fxDir ? readVec3Attrs(fxDir, { x: -1, y: 0, z: 0 }) : null,
    volumetricExhaustId: directChildren(el, 'VolumetricExhaust')[0]?.getAttribute('Id') ?? null,
    exhaustLight: readBoolValue(directChildren(el, 'ExhaustLight')[0]) ?? true,
    sound: soundEl
      ? {
          action: (soundEl.getAttribute('Action') as RocketSoundAction) || 'On',
          soundId: soundEl.getAttribute('SoundId') ?? '',
        }
      : null,
  }
}

/** Parses one `<Rocket>` element (core + nozzle references). */
function rocketFromElement(el: Element): Rocket {
  return {
    id: el.getAttribute('Id') ?? '',
    core: refFromElement(directChildren(el, 'Core')[0]),
    nozzles: directChildren(el, 'Nozzle').map(refFromElement),
  }
}

/** Parses a `<RocketEngineController>`/`<RocketThrusterController>` element. */
function controllerFromElement(el: Element, kind: RocketControllerKind): RocketController {
  const controlMapEl = directChildren(el, 'ControlMap')[0]
  const csv = controlMapEl?.getAttribute('CSV')
  return {
    id: el.getAttribute('Id') ?? '',
    kind,
    rocketRefs: directChildren(el, 'RocketReference').map(refFromElement),
    controlMapFlags: csv
      ? csv
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : null,
  }
}

/** Parses the `<Gimbal>` overlays from a GameData element's `<SubPart Id>` children. */
function gimbalsFromGameData(gd: Element): Gimbal[] {
  const out: Gimbal[] = []
  for (const sub of directChildren(gd, 'SubPart')) {
    const instanceId = sub.getAttribute('Id')
    if (!instanceId) continue
    const gel = directChildren(sub, 'Gimbal')[0]
    if (!gel) continue
    out.push({
      subPartInstanceId: instanceId,
      maxAngleYDeg: readDegrees(directChildren(gel, 'MaxAngleY')[0]),
      maxAngleZDeg: readDegrees(directChildren(gel, 'MaxAngleZ')[0]),
      constrainToCircle: readBoolValue(directChildren(gel, 'ConstrainToCircle')[0]) ?? true,
    })
  }
  return out
}

/** Parses all engine modules of a `<PartGameData>`/`<SubPartGameData>` element into `target`. */
function parseEngineModules(
  el: Element,
  target: {
    combustors: Combustor[]
    nozzles: DeLavalNozzle[]
    rockets: Rocket[]
  },
): void {
  for (const r of directChildren(el, 'Rocket')) target.rockets.push(rocketFromElement(r))
  for (const c of directChildren(el, 'Combustor')) target.combustors.push(combustorFromElement(c))
  for (const n of directChildren(el, 'DeLavalNozzle')) target.nozzles.push(nozzleFromElement(n))
}
