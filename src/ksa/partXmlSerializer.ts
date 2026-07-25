import { DOMImplementation, XMLSerializer } from '@xmldom/xmldom'
import type { Document as XmlDocument, Element as XmlElement } from '@xmldom/xmldom'
import type {
  Combustor,
  Connector,
  ConnectorFlag,
  ConsumerFeedWiring,
  CustomReaction,
  DeLavalNozzle,
  EditingPart,
  EulerXYZ,
  FeedSource,
  Gimbal,
  Light,
  PartAnimation,
  PartGameData,
  RawXmlNode,
  Rocket,
  RocketController,
  SolarPanel,
  SolidGrainSegment,
  SolidMotor,
  SolidMotorNozzle,
  SubPartIdRef,
  SubPartPlacement,
  Tank,
  Transform,
  Vec3,
} from './types'
import { isCustomReactionExportable, isFeedSourceValid, isSubPartGameDataEmpty } from './types'
import { formatG6 } from './formatG6'
import { animGlbPath, animModuleId, isAnimationExportable } from './animationNaming'

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

/**
 * Space-joined flag list (e.g. "Internal ToSurface"), or null when empty.
 *
 * MUST be spaces, not commas: KSA deserializes with .NET's `XmlSerializer`, whose
 * `XmlSerializationReader.ToEnum` splits a `[Flags]` enum body with `value.Split(null)`
 * — i.e. on WHITESPACE — and throws `CreateUnknownConstantException` on any token it
 * doesn't recognize. A comma-joined body ("Internal, ToSurface") therefore yields the
 * token "Internal," and fails KSA's mod load outright. Single-flag bodies (all Core
 * authors) are unaffected either way, which is why this went unnoticed until
 * `<Capabilities>` doubled the exposure.
 */
function flagsString(flags: readonly ConnectorFlag[]): string | null {
  return flags.length > 0 ? flags.join(' ') : null
}

/**
 * Appends `<Flags>` / `<Capabilities>` to a `<Connector>` element. Shared by the
 * geometry `<Part>` and the `<PartGameData>` emitters so the two documents can never
 * drift — KSA merges the connector's capabilities across both with `|=`
 * (`PartTemplate.ApplyGameData`), so emitting the same list in both is idempotent.
 */
function appendConnectorTokens(doc: XmlDocument, el: XmlElement, connector: Connector): void {
  const flags = flagsString(connector.flags)
  if (flags) {
    const flagsEl = doc.createElement('Flags')
    flagsEl.appendChild(doc.createTextNode(flags))
    el.appendChild(flagsEl)
  }
  if (connector.capabilities.length > 0) {
    const capsEl = doc.createElement('Capabilities')
    capsEl.appendChild(doc.createTextNode(connector.capabilities.join(' ')))
    el.appendChild(capsEl)
  }
}

/**
 * Optional `originalTemplateId → exported variant id` remap. Points placements (and the
 * matching SubPartGameData) at a fresh built-in-SubPart export variant instead of the
 * built-in id (see buildExportVariantMap in modExport.ts) — for de-IVA'd props AND for
 * built-in SubParts that carry GameData (so we never redefine the shared built-in template).
 * A template not in the map keeps its own id (the common case).
 */
export type TemplateRemap = ReadonlyMap<string, string>

const NO_REMAP: TemplateRemap = new Map()

export function serializePart(part: EditingPart, templateRemap: TemplateRemap = NO_REMAP): string {
  const doc = new DOMImplementation().createDocument(null, 'Assets', null)
  const assets = doc.documentElement! // 'Assets' root, created above
  const partEl = doc.createElement('Part')
  partEl.setAttribute('Id', part.partId)

  for (const placement of part.placements) {
    partEl.appendChild(buildSubPartElement(doc, placement, templateRemap))
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
export function serializeGameData(
  part: EditingPart,
  base = '',
  templateRemap: TemplateRemap = NO_REMAP,
): string {
  const doc = new DOMImplementation().createDocument(null, 'Assets', null)
  const assets = doc.documentElement!
  const gd = doc.createElement('PartGameData')
  gd.setAttribute('Id', part.partId)
  const game: PartGameData = part.gameData

  if (game.displayName.trim()) gd.setAttribute('DisplayName', game.displayName)
  applyUnknownAttrs(gd, game.unknownAttrs)

  for (const tag of part.editorTags) {
    if (!tag.trim()) continue
    const el = doc.createElement('EditorTag')
    el.setAttribute('Value', tag)
    gd.appendChild(el)
  }

  // <Diameter M/> — the VAB size-class filter (DistanceReference). Core authors plain
  // M (e.g. M="1"), so emit M unconditionally rather than flexo's Cm-under-1m style.
  // Repeatable since KSA 2026.7: emit the primary then any preserved adapter sizes.
  if (game.diameterM != null) {
    gd.appendChild(elWithAttr(doc, 'Diameter', 'M', formatG6(game.diameterM)))
    for (const extra of game.extraDiametersM) {
      gd.appendChild(elWithAttr(doc, 'Diameter', 'M', formatG6(extra)))
    }
  }

  for (const anim of part.animations) {
    if (!isAnimationExportable(anim)) continue
    gd.appendChild(buildAnimationModuleElement(doc, anim, base))
  }

  if (game.customMass != null && game.customMass > 0) {
    const custom = doc.createElement('CustomMass')
    custom.appendChild(elWithAttr(doc, 'Mass', 'Kg', formatG6(game.customMass)))
    // Preserved unmodeled CustomMass children (<MassSpecificInertia>, offsets) — verbatim.
    for (const node of game.customMassExtras) custom.appendChild(buildRawNode(doc, node))
    gd.appendChild(custom)
  }

  // <Control/> — bare command-capability marker (ControlTemplate has no fields).
  if (game.controllable) gd.appendChild(doc.createElement('Control'))

  // Part-level <Tank>s — Core authors its prefab tank data here, and a part-level tank
  // id is what an engine's <FeedsFrom Container> addresses without a SubPart= scope.
  for (const tank of game.tanks) gd.appendChild(buildTankWrapperElement(doc, tank))

  for (const b of game.batteries) {
    const el = doc.createElement('Battery')
    // Model holds Wh; KSA's MaximumCapacity is an EnergyReference in joules (1 Wh = 3600 J).
    el.appendChild(elWithAttr(doc, 'MaximumCapacity', 'J', formatG6(b.capacityWh * 3600)))
    gd.appendChild(el)
  }
  for (const g of game.generators) {
    const el = doc.createElement('Generator')
    el.appendChild(elWithAttr(doc, 'Produced', 'W', formatG6(g.outputWatts)))
    gd.appendChild(el)
  }
  for (const sp of game.solarPanels) gd.appendChild(buildSolarPanelElement(doc, sp))
  // One consumer per part (KSA's single Part.LightSwitch slot — see PowerConsumer docs).
  if (game.powerConsumer) {
    const pc = game.powerConsumer
    const el = doc.createElement('PowerConsumer')
    el.appendChild(elWithAttr(doc, 'Consumed', 'W', formatG6(pc.consumedWatts)))
    // KSA defaults both flags to false, so emit each only when set (LightIsActive
    // is meaningless without LightSwitch, but round-tripped independently).
    if (pc.lightSwitch) el.setAttribute('LightSwitch', 'true')
    if (pc.lightIsActive) el.setAttribute('LightIsActive', 'true')
    gd.appendChild(el)
  }

  for (const connector of part.connectors) {
    const el = doc.createElement('Connector')
    el.setAttribute('Id', connector.id)
    appendConnectorTokens(doc, el, connector)
    gd.appendChild(el)
  }

  if (game.decoupler) {
    const el = doc.createElement('Decoupler')
    el.setAttribute('ConnectorId', game.decoupler.connectorId)
    el.setAttribute('Force', formatG6(game.decoupler.force))
    gd.appendChild(el)
  }
  if (game.dockingPort) {
    // KSA 4750+ child-element form: <ConnectorId Value/> (StringReference),
    // <LatchingKineticEnergy J/> (EnergyReference), <PushoffImpulse Ns/> (ImpulseReference).
    const el = doc.createElement('DockingPort')
    el.appendChild(elWithAttr(doc, 'ConnectorId', 'Value', game.dockingPort.connectorId))
    el.appendChild(
      elWithAttr(
        doc,
        'LatchingKineticEnergy',
        'J',
        formatG6(game.dockingPort.latchingKineticEnergyJ),
      ),
    )
    el.appendChild(
      elWithAttr(doc, 'PushoffImpulse', 'Ns', formatG6(game.dockingPort.pushoffImpulseNs)),
    )
    gd.appendChild(el)
  }
  if (game.evaDoor) {
    const el = doc.createElement('EVADoor')
    el.setAttribute('ConnectorId', game.evaDoor.connectorId)
    gd.appendChild(el)
  }

  // Engine modules at the part level: controllers (what makes it fire), gas-generator
  // rockets/combustors/nozzles, then per-instance gimbal overlays.
  for (const controller of game.rocketControllers)
    gd.appendChild(buildControllerElement(doc, controller))
  for (const rocket of game.rockets) gd.appendChild(buildRocketElement(doc, rocket))
  for (const combustor of game.combustors) gd.appendChild(buildCombustorElement(doc, combustor))
  for (const motor of game.solidMotors) gd.appendChild(buildSolidMotorElement(doc, motor))
  for (const nozzle of game.nozzles) gd.appendChild(buildNozzleElement(doc, nozzle))
  for (const nozzle of game.solidNozzles) gd.appendChild(buildSolidNozzleElement(doc, nozzle))
  for (const seg of game.solidGrainSegments) gd.appendChild(buildSolidGrainSegmentElement(doc, seg))
  for (const gimbal of game.gimbals) {
    const el = buildGimbalSubPartElement(doc, gimbal)
    if (el) gd.appendChild(el)
  }
  // <ConsumerFeedWiring> — wires a placed SubPart's <FeedsFrom Parent> onto this Part's
  // own containers/connectors. Emitted after the modules it references, before passthrough.
  for (const w of game.consumerFeedWiring) {
    const el = buildConsumerFeedWiringElement(doc, w)
    if (el) gd.appendChild(el)
  }

  // Unmodeled children flexo captured on import (e.g. <Collider>) — re-emitted verbatim, last.
  for (const node of game.unknownChildren) gd.appendChild(buildRawNode(doc, node))

  assets.appendChild(gd)

  // User-authored propellants — top-level <FixedReaction> siblings of <PartGameData>
  // (KSA registers them by Id; a combustor's <Reaction Id> resolves to one).
  for (const reaction of part.customReactions) {
    // A Category="Solid" reaction missing its burn-rate law / pressure limits makes
    // FixedReactionTemplate.Create() THROW, failing the whole mod load — never emit one.
    if (!isCustomReactionExportable(reaction)) {
      console.warn(
        `flexo export: skipping solid reaction "${reaction.id}" — KSA refuses to load a ` +
          `Category="Solid" FixedReaction without a valid <BurnRate> (a > 0, 0 <= n < 0.95), ` +
          `<MinimumBurnPressure> (> 0), <MaxStablePressure> (> the minimum) and ` +
          `<ExhaustCondensedFraction> (in [0, 1)).`,
      )
      continue
    }
    assets.appendChild(buildFixedReactionElement(doc, reaction))
  }

  for (const spd of part.subPartGameData) {
    if (isSubPartGameDataEmpty(spd)) continue
    const spdEl = doc.createElement('SubPartGameData')
    // Remap to the export variant id so GameData keyed on a built-in template lands on the
    // fresh variant SubPart instead of REDEFINING the shared built-in (KSA merges by id).
    spdEl.setAttribute('Id', templateRemap.get(spd.subPartTemplateId) ?? spd.subPartTemplateId)
    applyUnknownAttrs(spdEl, spd.unknownAttrs)
    for (const tank of spd.tanks) spdEl.appendChild(buildTankWrapperElement(doc, tank))
    for (const sp of spd.solarPanels) spdEl.appendChild(buildSolarPanelElement(doc, sp))
    for (const light of spd.lights) spdEl.appendChild(buildLightElement(doc, light))
    // Reusable thrust-chamber / solid-motor modules that travel with this mesh.
    for (const rocket of spd.rockets) spdEl.appendChild(buildRocketElement(doc, rocket))
    for (const combustor of spd.combustors) spdEl.appendChild(buildCombustorElement(doc, combustor))
    for (const motor of spd.solidMotors) spdEl.appendChild(buildSolidMotorElement(doc, motor))
    for (const nozzle of spd.nozzles) spdEl.appendChild(buildNozzleElement(doc, nozzle))
    for (const nozzle of spd.solidNozzles) spdEl.appendChild(buildSolidNozzleElement(doc, nozzle))
    for (const seg of spd.solidGrainSegments)
      spdEl.appendChild(buildSolidGrainSegmentElement(doc, seg))
    // Unmodeled children flexo captured on import — re-emitted verbatim, last.
    for (const node of spd.unknownChildren) spdEl.appendChild(buildRawNode(doc, node))
    assets.appendChild(spdEl)
  }

  const body = new XMLSerializer().serializeToString(doc)
  return '<?xml version="1.0" encoding="utf-8"?>\n' + prettyXml(body) + '\n'
}

/** Creates an element with a single attribute, e.g. <Mass Kg="100"/>. */
function elWithAttr(doc: XmlDocument, name: string, attr: string, value: string): XmlElement {
  const el = doc.createElement(name)
  el.setAttribute(attr, value)
  return el
}

/** Rebuilds a captured {@link RawXmlNode} (unmodeled passthrough XML) into a real element. */
function buildRawNode(doc: XmlDocument, node: RawXmlNode): XmlElement {
  const el = doc.createElement(node.tag)
  for (const [name, value] of Object.entries(node.attrs ?? {})) el.setAttribute(name, value)
  for (const child of node.children ?? []) el.appendChild(buildRawNode(doc, child))
  if ((node.children?.length ?? 0) === 0 && node.text) el.appendChild(doc.createTextNode(node.text))
  return el
}

/** Re-applies captured unmodeled root attributes onto a `<PartGameData>`/`<SubPartGameData>` element. */
function applyUnknownAttrs(el: XmlElement, attrs: Record<string, string>): void {
  for (const [name, value] of Object.entries(attrs ?? {})) el.setAttribute(name, value)
}

/** <SolarPanel><Produced W/><Transform/></SolarPanel> (Transform omitted when identity). */
function buildSolarPanelElement(doc: XmlDocument, sp: SolarPanel): XmlElement {
  const el = doc.createElement('SolarPanel')
  el.appendChild(elWithAttr(doc, 'Produced', 'W', formatG6(sp.outputWatts)))
  const transform = buildTransformElement(doc, sp.transform)
  if (transform) el.appendChild(transform)
  return el
}

/**
 * `<Tank [Id]><CylindricalTank|SphericalTank>…</Tank>`. The `Id` sits on the WRAPPER
 * (it is the `Components` entry id an engine addresses with `<FeedsFrom Container>`);
 * the geometry and the assembly-frame offset sit on the shape element.
 */
function buildTankWrapperElement(doc: XmlDocument, tank: Tank): XmlElement {
  const wrapper = doc.createElement('Tank')
  if (tank.id.trim()) wrapper.setAttribute('Id', tank.id)
  wrapper.appendChild(buildTankShapeElement(doc, tank))
  return wrapper
}

/** <CylindricalTank>/<SphericalTank> with Material/Length/OuterRadius/WallThickness. */
function buildTankShapeElement(doc: XmlDocument, tank: Tank): XmlElement {
  const el = doc.createElement(tank.shape === 'Cylindrical' ? 'CylindricalTank' : 'SphericalTank')
  if (tank.wallMaterialId.trim()) {
    el.appendChild(elWithAttr(doc, 'Material', 'Id', tank.wallMaterialId))
  }
  if (tank.shape === 'Cylindrical') {
    el.appendChild(elWithAttr(doc, 'Length', 'M', formatG6(tank.lengthM)))
  }
  el.appendChild(elWithAttr(doc, 'OuterRadius', 'M', formatG6(tank.outerRadiusM)))
  el.appendChild(elWithAttr(doc, 'WallThickness', 'Mm', formatG6(tank.wallThicknessMm)))
  // <RoleAffinity> — ConsumerRole flags text (KSA 2026.7.5); omitted at the Engine default.
  if (tank.roleAffinity !== 'Engine') {
    const affinity = doc.createElement('RoleAffinity')
    affinity.appendChild(doc.createTextNode(tank.roleAffinity))
    el.appendChild(affinity)
  }
  // <LocationAsmb> — AsmbTransformTemplate offset; omitted at the (0,0,0) default.
  const loc = buildEngineVec3(doc, 'LocationAsmb', tank.locationAsmb, { x: 0, y: 0, z: 0 })
  if (loc) el.appendChild(loc)
  return el
}

/**
 * <Light> with Type/Transform/Range/Intensity/Color, plus InnerAngle+OuterAngle for
 * Spots and <RayTracing> only when enabled. Matches KSA's LightModule schema:
 * Position aims/places the light, Rotation aims a Spot's cone; Scale is never emitted
 * (the engine ignores it). The <Transform> itself is omitted when identity.
 */
function buildLightElement(doc: XmlDocument, light: Light): XmlElement {
  const el = doc.createElement('Light')
  const type = doc.createElement('Type')
  type.appendChild(doc.createTextNode(light.type))
  el.appendChild(type)

  // Only Position + Rotation are meaningful to KSA lights; never emit Scale.
  const transform = buildTransformElement(doc, { ...light.transform, scale: { x: 1, y: 1, z: 1 } })
  if (transform) el.appendChild(transform)

  el.appendChild(elWithAttr(doc, 'Range', 'Value', formatG6(light.rangeM)))
  el.appendChild(elWithAttr(doc, 'Intensity', 'Value', formatG6(light.intensity)))

  const color = doc.createElement('Color')
  color.setAttribute('R', formatG6(light.color.r))
  color.setAttribute('G', formatG6(light.color.g))
  color.setAttribute('B', formatG6(light.color.b))
  el.appendChild(color)

  if (light.type === 'Spot') {
    el.appendChild(elWithAttr(doc, 'InnerAngle', 'Value', formatG6(light.innerAngleRad)))
    el.appendChild(elWithAttr(doc, 'OuterAngle', 'Value', formatG6(light.outerAngleRad)))
  }

  if (light.rayTracing) {
    const rt = doc.createElement('RayTracing')
    rt.appendChild(doc.createTextNode('true'))
    el.appendChild(rt)
  }
  return el
}

// --- Engine module builders ---

/** Sets a SubPartIdReference's Id (+ SubPartId only when scoped to a specific instance). */
function setRefAttrs(el: XmlElement, ref: SubPartIdRef): void {
  el.setAttribute('Id', ref.id)
  if (ref.subPartInstanceId) el.setAttribute('SubPartId', ref.subPartInstanceId)
}

/** A distance element emitted as `Cm` under 1 m (matching Core's small-nozzle style), else `M`. */
function buildDistanceElement(doc: XmlDocument, name: string, meters: number): XmlElement {
  return meters < 1
    ? elWithAttr(doc, name, 'Cm', formatG6(meters * 100))
    : elWithAttr(doc, name, 'M', formatG6(meters))
}

/** A point/direction vector emitted with all three axes, or null when equal to `def` within EPSILON. */
function buildEngineVec3(doc: XmlDocument, name: string, v: Vec3, def: Vec3): XmlElement | null {
  if (
    Math.abs(v.x - def.x) <= EPSILON &&
    Math.abs(v.y - def.y) <= EPSILON &&
    Math.abs(v.z - def.z) <= EPSILON
  ) {
    return null
  }
  const el = doc.createElement(name)
  el.setAttribute('X', formatG6(v.x))
  el.setAttribute('Y', formatG6(v.y))
  el.setAttribute('Z', formatG6(v.z))
  return el
}

/**
 * `<FeedsFrom Container|SubPart|Connector|Parent/>` — one element per feed point,
 * skipping any that names nothing KSA could resolve (it would only log an error).
 */
function buildFeedElements(doc: XmlDocument, feeds: readonly FeedSource[]): XmlElement[] {
  const out: XmlElement[] = []
  for (const f of feeds) {
    if (!isFeedSourceValid(f)) continue
    const el = doc.createElement('FeedsFrom')
    if (f.kind === 'container') {
      // Core authors SubPart before Container; attribute order is irrelevant to XmlSerializer.
      if (f.subPartInstanceId) el.setAttribute('SubPart', f.subPartInstanceId)
      el.setAttribute('Container', f.containerId)
    } else if (f.kind === 'connector') {
      el.setAttribute('Connector', f.connectorId)
    } else {
      el.setAttribute('Parent', 'true')
    }
    out.push(el)
  }
  return out
}

/** <Combustor Id><FeedsFrom/><Plumbing/><Reaction Id><MixtureRatio/></Reaction><MaxPressure Bar/>… — omits efficiency/throttle at their defaults. */
function buildCombustorElement(doc: XmlDocument, c: Combustor): XmlElement {
  const el = doc.createElement('Combustor')
  el.setAttribute('Id', c.id)
  // <FeedsFrom> then <Plumbing> then <Reaction>, matching Core's authoring order.
  // Without any feed point KSA logs "declares no FeedsFrom feed points; it will reach
  // no propellant" and the chamber never fires.
  for (const f of buildFeedElements(doc, c.feeds)) el.appendChild(f)
  // Bulk is the schema default (PlumbingClass.Bulk = 0) — emit only the Service override.
  if (c.plumbing === 'Service') {
    const plumbing = doc.createElement('Plumbing')
    plumbing.appendChild(doc.createTextNode('Service'))
    el.appendChild(plumbing)
  }
  // <Reaction Id> with the O/F ratio as a text child — REQUIRED by KSA for
  // MixtureReactions (CombustorTemplate.ResolveReaction throws without it),
  // omitted for FixedReactions (custom propellants, monoprops, solids).
  const reaction = elWithAttr(doc, 'Reaction', 'Id', c.reactionId)
  if (c.mixtureRatio != null) {
    const ratio = doc.createElement('MixtureRatio')
    ratio.appendChild(doc.createTextNode(formatG6(c.mixtureRatio)))
    reaction.appendChild(ratio)
  }
  el.appendChild(reaction)
  // Stored SI Pa, emitted as Bar (Pa / 1e5) to match Core's authoring style.
  el.appendChild(elWithAttr(doc, 'MaxPressure', 'Bar', formatG6(c.maxPressurePa / 1e5)))
  if (Math.abs(c.thermalEfficiency - 1) > EPSILON) {
    el.appendChild(elWithAttr(doc, 'ThermalEfficiency', 'Value', formatG6(c.thermalEfficiency)))
  }
  if (Math.abs(c.minimumThrottle - 1) > EPSILON) {
    el.appendChild(elWithAttr(doc, 'MinimumThrottle', 'Value', formatG6(c.minimumThrottle)))
  }
  if (c.minimumPulseTimeS != null) {
    el.appendChild(elWithAttr(doc, 'MinimumPulseTime', 'Seconds', formatG6(c.minimumPulseTimeS)))
  }
  return el
}

/**
 * `<DeLavalNozzle Id>` with geometry, efficiencies, exhaust placement + plume/light/
 * sound FX. `<AreaRatio>` is emitted between the exit diameters and the efficiencies —
 * a `<SolidMotorNozzle>` is exactly this element without it (see
 * {@link buildSolidNozzleElement}).
 */
function buildNozzleElement(doc: XmlDocument, n: DeLavalNozzle): XmlElement {
  return buildRocketNozzleElement(doc, 'DeLavalNozzle', n, (el) => {
    el.appendChild(elWithAttr(doc, 'AreaRatio', 'Value', formatG6(n.areaRatio)))
  })
}

/**
 * `<SolidMotorNozzle Id>` — the DeLaval schema WITHOUT `<AreaRatio>`:
 * `SolidMotorNozzleTemplate.Create` derives the throat as `exitArea / 12`, so an
 * authored area ratio would be ignored (and there is no XML slot for it).
 */
function buildSolidNozzleElement(doc: XmlDocument, n: SolidMotorNozzle): XmlElement {
  return buildRocketNozzleElement(doc, 'SolidMotorNozzle', n)
}

/**
 * The shared nozzle body (`RocketNozzleTemplate` + exit geometry/efficiencies). The
 * `afterExitDiameter` hook is where `<DeLavalNozzle>` slots its `<AreaRatio>`.
 */
function buildRocketNozzleElement(
  doc: XmlDocument,
  tag: 'DeLavalNozzle' | 'SolidMotorNozzle',
  n: SolidMotorNozzle,
  afterExitDiameter?: (el: XmlElement) => void,
): XmlElement {
  const el = doc.createElement(tag)
  el.setAttribute('Id', n.id)
  el.appendChild(buildDistanceElement(doc, 'ExitDiameter', n.exitDiameterM))
  if (n.fxExitDiameterM != null) {
    el.appendChild(buildDistanceElement(doc, 'FxExitDiameter', n.fxExitDiameterM))
  }
  afterExitDiameter?.(el)
  if (Math.abs(n.flowEfficiency - 1) > EPSILON) {
    el.appendChild(elWithAttr(doc, 'FlowEfficiency', 'Value', formatG6(n.flowEfficiency)))
  }
  if (Math.abs(n.expansionEfficiency - 1) > EPSILON) {
    el.appendChild(elWithAttr(doc, 'ExpansionEfficiency', 'Value', formatG6(n.expansionEfficiency)))
  }
  const loc = buildEngineVec3(doc, 'ExhaustLocation', n.exhaustLocation, { x: 0, y: 0, z: 0 })
  if (loc) el.appendChild(loc)
  const dir = buildEngineVec3(doc, 'ExhaustDirection', n.exhaustDirection, { x: -1, y: 0, z: 0 })
  if (dir) el.appendChild(dir)
  if (n.fxExhaustLocation) {
    const fl = buildEngineVec3(doc, 'FxExhaustLocation', n.fxExhaustLocation, {
      x: NaN,
      y: NaN,
      z: NaN,
    })
    if (fl) el.appendChild(fl)
  }
  if (n.fxExhaustDirection) {
    const fd = buildEngineVec3(doc, 'FxExhaustDirection', n.fxExhaustDirection, {
      x: NaN,
      y: NaN,
      z: NaN,
    })
    if (fd) el.appendChild(fd)
  }
  if (n.volumetricExhaustId) {
    el.appendChild(elWithAttr(doc, 'VolumetricExhaust', 'Id', n.volumetricExhaustId))
  }
  if (n.plumeTrailId) {
    el.appendChild(elWithAttr(doc, 'PlumeTrail', 'Id', n.plumeTrailId))
  }
  if (n.sound) {
    const sound = doc.createElement('SoundEvent')
    sound.setAttribute('Action', n.sound.action)
    sound.setAttribute('SoundId', n.sound.soundId)
    el.appendChild(sound)
  }
  // ExhaustLight defaults true — only emit the override when disabled.
  if (!n.exhaustLight) el.appendChild(elWithAttr(doc, 'ExhaustLight', 'Value', 'false'))
  return el
}

/**
 * `<SolidMotor Id><Reaction Id/><ThermalEfficiency/><DefaultPressure Bar/><Grain Id/>
 * <FeedsFrom/>…</SolidMotor>` — a solid motor case. Element order matches Core's
 * authoring in `CorePropulsionCGameData.xml`.
 */
function buildSolidMotorElement(doc: XmlDocument, m: SolidMotor): XmlElement {
  const el = doc.createElement('SolidMotor')
  el.setAttribute('Id', m.id)
  el.appendChild(elWithAttr(doc, 'Reaction', 'Id', m.reactionId))
  if (Math.abs(m.thermalEfficiency - 1) > EPSILON) {
    el.appendChild(elWithAttr(doc, 'ThermalEfficiency', 'Value', formatG6(m.thermalEfficiency)))
  }
  // Stored SI Pa, emitted as Bar to match Core's authoring style.
  el.appendChild(elWithAttr(doc, 'DefaultPressure', 'Bar', formatG6(m.defaultPressurePa / 1e5)))
  // Blank ⇒ omit, so KSA takes GrainGeometryLibrary.Default.
  if (m.grainGeometryId.trim()) el.appendChild(elWithAttr(doc, 'Grain', 'Id', m.grainGeometryId))
  for (const f of buildFeedElements(doc, m.feeds)) el.appendChild(f)
  return el
}

/**
 * `<SolidGrainSegment Id><Grain><Material Id/><OuterRadius M/><WallThickness Mm/>
 * <Length M/>[<LocationAsmb/>]</Grain></SolidGrainSegment>` — a stackable propellant
 * grain, addressable as a feed container by its `Id`.
 */
function buildSolidGrainSegmentElement(doc: XmlDocument, s: SolidGrainSegment): XmlElement {
  const el = doc.createElement('SolidGrainSegment')
  el.setAttribute('Id', s.id)
  const grain = doc.createElement('Grain')
  if (s.wallMaterialId.trim()) {
    grain.appendChild(elWithAttr(doc, 'Material', 'Id', s.wallMaterialId))
  }
  grain.appendChild(elWithAttr(doc, 'OuterRadius', 'M', formatG6(s.outerRadiusM)))
  grain.appendChild(elWithAttr(doc, 'WallThickness', 'Mm', formatG6(s.wallThicknessMm)))
  grain.appendChild(elWithAttr(doc, 'Length', 'M', formatG6(s.lengthM)))
  const loc = buildEngineVec3(doc, 'LocationAsmb', s.locationAsmb, { x: 0, y: 0, z: 0 })
  if (loc) grain.appendChild(loc)
  el.appendChild(grain)
  return el
}

/**
 * `<ConsumerFeedWiring Id [SubPartId]><FeedsFrom/>…</ConsumerFeedWiring>`, or null when
 * it names no consumer / wires no resolvable feed point — KSA logs an Error for either
 * ("wires no feed points" / "wires no consumer this part carries"), so we omit instead.
 */
function buildConsumerFeedWiringElement(
  doc: XmlDocument,
  w: ConsumerFeedWiring,
): XmlElement | null {
  if (!w.consumerId.trim()) return null
  // A wiring entry may not itself defer to Parent (ConsumerFeedWiring.OnDataLoad).
  const feeds = buildFeedElements(
    doc,
    w.feeds.filter((f) => f.kind !== 'parent'),
  )
  if (feeds.length === 0) return null
  const el = doc.createElement('ConsumerFeedWiring')
  el.setAttribute('Id', w.consumerId)
  if (w.subPartInstanceId) el.setAttribute('SubPartId', w.subPartInstanceId)
  for (const f of feeds) el.appendChild(f)
  return el
}

/** <Rocket Id><Core Id [SubPartId]/><Nozzle Id [SubPartId]/>…</Rocket>. */
function buildRocketElement(doc: XmlDocument, r: Rocket): XmlElement {
  const el = doc.createElement('Rocket')
  el.setAttribute('Id', r.id)
  const core = doc.createElement('Core')
  setRefAttrs(core, r.core)
  el.appendChild(core)
  for (const nozzle of r.nozzles) {
    const nz = doc.createElement('Nozzle')
    setRefAttrs(nz, nozzle)
    el.appendChild(nz)
  }
  return el
}

/** <RocketEngineController>/<RocketThrusterController> with its rocket references (+ ControlMap for RCS). */
function buildControllerElement(doc: XmlDocument, c: RocketController): XmlElement {
  const el = doc.createElement(
    c.kind === 'thruster' ? 'RocketThrusterController' : 'RocketEngineController',
  )
  el.setAttribute('Id', c.id)
  for (const ref of c.rocketRefs) {
    const r = doc.createElement('RocketReference')
    setRefAttrs(r, ref)
    el.appendChild(r)
  }
  if (c.kind === 'thruster' && c.controlMapFlags && c.controlMapFlags.length > 0) {
    el.appendChild(elWithAttr(doc, 'ControlMap', 'CSV', c.controlMapFlags.join(',')))
  }
  return el
}

/** <SubPart Id="instanceId"><Gimbal>…</Gimbal></SubPart>, or null for a fixed (0/0) gimbal. */
function buildGimbalSubPartElement(doc: XmlDocument, g: Gimbal): XmlElement | null {
  const hasY = Math.abs(g.maxAngleYDeg) > EPSILON
  const hasZ = Math.abs(g.maxAngleZDeg) > EPSILON
  // A 0/0 gimbal is a no-op in KSA; only emit when it actually actuates or constrains.
  if (!hasY && !hasZ && g.constrainToCircle) return null
  const sub = doc.createElement('SubPart')
  sub.setAttribute('Id', g.subPartInstanceId)
  const gimbal = doc.createElement('Gimbal')
  if (hasY) gimbal.appendChild(elWithAttr(doc, 'MaxAngleY', 'Degrees', formatG6(g.maxAngleYDeg)))
  if (hasZ) gimbal.appendChild(elWithAttr(doc, 'MaxAngleZ', 'Degrees', formatG6(g.maxAngleZDeg)))
  // ConstrainToCircle defaults true — only emit the override when disabled.
  if (!g.constrainToCircle)
    gimbal.appendChild(elWithAttr(doc, 'ConstrainToCircle', 'Value', 'false'))
  sub.appendChild(gimbal)
  return sub
}

/** <FixedReaction Id Category><Name/><Reactant…/><PressureCondition>…</FixedReaction> (custom propellant). */
function buildFixedReactionElement(doc: XmlDocument, reaction: CustomReaction): XmlElement {
  const el = doc.createElement('FixedReaction')
  el.setAttribute('Id', reaction.id)
  // KSA's FixedReaction category fallback is Monopropellant — omit it at that default.
  if (reaction.category !== 'Monopropellant') el.setAttribute('Category', reaction.category)
  if (reaction.name.trim() && reaction.name !== reaction.id) {
    el.appendChild(elWithAttr(doc, 'Name', 'Value', reaction.name))
  }
  for (const r of reaction.reactants) {
    const re = doc.createElement('Reactant')
    re.setAttribute('Id', r.phaseId)
    re.setAttribute('MassShare', formatG6(r.massShare))
    el.appendChild(re)
  }
  // Solid-propellant data, after <Reactant> and before <PressureCondition> (Core's order).
  // Each is emitted only when set; a Category="Solid" reaction missing any of them is
  // rejected up front by isCustomReactionExportable (KSA would throw on load).
  if (reaction.burnRate) {
    const br = doc.createElement('BurnRate')
    br.setAttribute('CoefficientMPerS', formatG6(reaction.burnRate.coefficientMPerS))
    br.setAttribute('Exponent', formatG6(reaction.burnRate.exponent))
    el.appendChild(br)
  }
  if (reaction.minimumBurnPressurePa != null) {
    el.appendChild(
      elWithAttr(doc, 'MinimumBurnPressure', 'Bar', formatG6(reaction.minimumBurnPressurePa / 1e5)),
    )
  }
  if (reaction.maxStablePressurePa != null) {
    el.appendChild(
      elWithAttr(doc, 'MaxStablePressure', 'Bar', formatG6(reaction.maxStablePressurePa / 1e5)),
    )
  }
  if (reaction.exhaustCondensedFraction != null) {
    el.appendChild(
      elWithAttr(
        doc,
        'ExhaustCondensedFraction',
        'Value',
        formatG6(reaction.exhaustCondensedFraction),
      ),
    )
  }
  for (const row of reaction.lut) {
    const cond = doc.createElement('PressureCondition')
    cond.appendChild(elWithAttr(doc, 'LnPressure', 'Value', formatG6(row.lnPressure)))
    cond.appendChild(elWithAttr(doc, 'Temperature', 'K', formatG6(row.temperatureK)))
    cond.appendChild(elWithAttr(doc, 'Gamma', 'Value', formatG6(row.gamma)))
    cond.appendChild(elWithAttr(doc, 'MolarMass', 'GPerMol', formatG6(row.molarMassGPerMol)))
    el.appendChild(cond)
  }
  return el
}

/**
 * Builds a `<KeyframeAnimationModule>` for one animation: the `<KeyframeAnimation
 * Path/Id>` reference (path matches what {@link buildCustomBundle} writes) plus an
 * optional `<SolarTracking>` child. `ShowDeployRetract="true"` is emitted only in
 * deploy/retract mode (its absence gives KSA's Actuate slider).
 */
function buildAnimationModuleElement(
  doc: XmlDocument,
  anim: PartAnimation,
  base: string,
): XmlElement {
  const moduleId = animModuleId(base, anim)
  const mod = doc.createElement('KeyframeAnimationModule')
  mod.setAttribute('Id', moduleId)
  if (anim.mode === 'deployRetract') mod.setAttribute('ShowDeployRetract', 'true')

  const ref = doc.createElement('KeyframeAnimation')
  ref.setAttribute('Path', animGlbPath(base, anim))
  ref.setAttribute('Id', moduleId)
  mod.appendChild(ref)

  const st = anim.solarTracking
  if (st && st.subPartInstanceId.trim()) {
    const stEl = doc.createElement('SolarTracking')
    stEl.setAttribute('DegreesPerSecond', formatG6(st.degreesPerSecond))
    stEl.setAttribute('SubPart', st.subPartInstanceId)
    for (const ex of st.excludeInstanceIds) {
      if (!ex.trim()) continue
      const exEl = doc.createElement('ExcludeSubPart')
      exEl.appendChild(doc.createTextNode(ex))
      stEl.appendChild(exEl)
    }
    mod.appendChild(stEl)
  }
  return mod
}

function buildSubPartElement(
  doc: XmlDocument,
  placement: SubPartPlacement,
  templateRemap: TemplateRemap,
): XmlElement {
  const el = doc.createElement('SubPart')
  el.setAttribute('Id', placement.instanceId)
  el.setAttribute(
    'InstanceOf',
    templateRemap.get(placement.subPartTemplateId) ?? placement.subPartTemplateId,
  )
  const transform = buildTransformElement(doc, placement)
  if (transform) el.appendChild(transform)
  return el
}

function buildConnectorElement(doc: XmlDocument, connector: Connector): XmlElement {
  const el = doc.createElement('Connector')
  el.setAttribute('Id', connector.id)
  const transform = buildTransformElement(doc, connector)
  if (transform) el.appendChild(transform)
  appendConnectorTokens(doc, el, connector)
  // <Sibling Id/> — attach-node grouping preserved from import (KSA 2026.7 multi-mount prefabs).
  for (const siblingId of connector.siblingIds) {
    el.appendChild(elWithAttr(doc, 'Sibling', 'Id', siblingId))
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
 * Exported so the Assets-XML serializer (custom assets) emits identical style.
 */
export function prettyXml(xml: string): string {
  const lines = xml.replace(/></g, '>\n<').split('\n')
  const out: string[] = []
  let depth = 0
  for (const line of lines) {
    const isClosing = line.startsWith('</')
    if (isClosing) depth = Math.max(0, depth - 1)
    out.push('    '.repeat(depth) + line)
    const isOpening = /^<[^/!?]/.test(line) && !line.endsWith('/>') && !/<\/[^>]+>$/.test(line)
    if (isOpening) depth++
  }
  return out.join('\n')
}
