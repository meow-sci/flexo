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
 * Reads a KSA `JoulesReference` child (e.g. `<MaximumCapacity>` / `<Produced>` /
 * `<Consumed>`), summing its `Joules` + `Watts` + `KWh` attributes exactly the way
 * the game's JoulesReference does (`KWh` is scaled by 3,600,000). Returns 0 when the
 * element or all three attributes are absent. The unit of the result is contextual:
 * Joules for an energy capacity (battery), Watts for a power rate (generator/panel/
 * consumer). NOTE: the game does NOT recognize a bare `W` attribute — only `Watts`.
 */
function readJoulesValue(parent: Element, childTag: string): number {
  const el = directChildren(parent, childTag)[0]
  if (!el) return 0
  return (
    (readNum(el, 'Joules') ?? 0) +
    (readNum(el, 'Watts') ?? 0) +
    (readNum(el, 'KWh') ?? 0) * 3_600_000
  )
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

/** Parses one `<SolarPanel>` element: its `<Produced Watts>` and orientation `<Transform>`. */
function parseSolarPanel(el: Element): SolarPanel {
  return { outputWatts: readJoulesValue(el, 'Produced'), transform: readTransform(el) }
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

  // Battery capacity is a JoulesReference (Joules in Core data); the model holds Wh.
  for (const el of directChildren(gd, 'Battery'))
    game.batteries.push({ capacityWh: readJoulesValue(el, 'MaximumCapacity') / 3600 })
  for (const el of directChildren(gd, 'Generator'))
    game.generators.push({ outputWatts: readJoulesValue(el, 'Produced') })
  for (const el of directChildren(gd, 'SolarPanel')) game.solarPanels.push(parseSolarPanel(el))
  for (const el of directChildren(gd, 'PowerConsumer'))
    game.powerConsumers.push({ consumedWatts: readJoulesValue(el, 'Consumed') })

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
    // Legacy GameData used a single Force attribute; new GameData splits it into
    // LatchingImpulse + PushoffForce. Fall back to Force for both when reading old files.
    const legacyForce = readNum(dp, 'Force')
    game.dockingPort = {
      connectorId: dp.getAttribute('ConnectorId') ?? '',
      latchingImpulse: readNum(dp, 'LatchingImpulse') ?? legacyForce ?? 0,
      pushoffForce: readNum(dp, 'PushoffForce') ?? legacyForce ?? 0,
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
