import type {
  AnimationJoint,
  AnimationKeyframe,
  Battery,
  Combustor,
  Connector,
  CustomCombustionProcess,
  CustomMesh,
  DeLavalNozzle,
  EasingConfig,
  EulerXYZ,
  Generator,
  Gimbal,
  KittenInstance,
  KittenMeshSource,
  Layer,
  Light,
  PartAnimation,
  PartGameData,
  PowerConsumer,
  RawXmlNode,
  Rocket,
  RocketController,
  RocketSoundAction,
  SolarPanel,
  SubPartGameData,
  SubPartIdRef,
  SubPartPlacement,
  Tank,
  Transform,
  Vec3,
} from '../ksa/types'
import {
  CONNECTOR_LAYER_ID,
  KITTEN_LAYER_ID,
  createEmptyGameData,
  createSubPartGameData,
} from '../ksa/types'
import type { ProjectExportEnvelope } from './projectTransfer'

/**
 * The wire-format marker + version. These live here (not in projectTransfer) so the
 * codec has no runtime dependency on projectTransfer — projectTransfer imports the
 * codec, and only its *types* flow back the other way (erased at build, no cycle).
 */
export const PROJECT_EXPORT_FORMAT = 'flexo-project'
export const PROJECT_EXPORT_VERSION = 1

/**
 * COMPACT PROJECT CODEC — the single wire format for everything that serializes a
 * project: the JSON Export/Import dialogs AND the stateless "Share Link" payload.
 * It translates the verbose in-memory {@link ProjectExportEnvelope} (descriptive
 * keys, full objects) into a space-optimized plain object and back, losslessly.
 *
 * Three compaction tactics, in order of payoff:
 *  1. Drop defaults — identity transforms (pos 0 / rot 0 / scale 1), empty arrays,
 *     blank/null/false fields, and the always-constant connector/kitten layerId are
 *     simply absent and restored on decode.
 *  2. Round floats — every coordinate/angle is rounded to {@link PRECISION} decimals,
 *     killing `0.7071067811865476`-style noise that would otherwise dominate the bytes.
 *  3. Short keys — every property is a 1–3 char token (see the field comments). After
 *     compression this is the smallest win, but it keeps the uncompressed JSON small too.
 *
 * Decode is total and tolerant: missing fields fall back to defaults so a partial or
 * lightly-corrupted payload degrades rather than throwing mid-tree (the parse boundary
 * in projectTransfer/projectShareLink owns the hard validation + try/catch).
 *
 * Pure (no store/React imports) so it's unit-testable as an encode→decode round-trip.
 */

/** Decimal places kept for every coordinate/angle. 1e-6 rad ≈ 6e-5° — far below KSA tolerance. */
const PRECISION = 6
const ROUND = 10 ** PRECISION

/** Default tank wall material — omitted from the wire form, restored on decode. */
const DEFAULT_TANK_MATERIAL = 'Aluminum.2014(s)'

function round(n: number): number {
  if (!Number.isFinite(n)) return 0
  const v = Math.round(n * ROUND) / ROUND
  return v === 0 ? 0 : v // normalize -0 → 0
}

// ── vectors / transforms ─────────────────────────────────────────────────────

type Triple = [number, number, number]

function encVec(v: Vec3): Triple {
  return [round(v.x), round(v.y), round(v.z)]
}

function decVec(t: unknown, def: number): Vec3 {
  if (Array.isArray(t) && t.length === 3) {
    return { x: num(t[0], def), y: num(t[1], def), z: num(t[2], def) }
  }
  return { x: def, y: def, z: def }
}

function isZeroVec(v: Vec3 | EulerXYZ): boolean {
  return round(v.x) === 0 && round(v.y) === 0 && round(v.z) === 0
}

function isOneVec(v: Vec3): boolean {
  return round(v.x) === 1 && round(v.y) === 1 && round(v.z) === 1
}

/** Compact transform: each component present only when non-default (pos/rot 0, scale 1). */
interface CTransform {
  p?: Triple
  r?: Triple
  s?: Triple
}

function encTransform(t: Transform): CTransform {
  const o: CTransform = {}
  if (!isZeroVec(t.position)) o.p = encVec(t.position)
  if (!isZeroVec(t.rotation)) o.r = encVec(t.rotation)
  if (!isOneVec(t.scale)) o.s = encVec(t.scale)
  return o
}

function decTransform(o: CTransform | undefined): Transform {
  return {
    position: decVec(o?.p, 0),
    rotation: decVec(o?.r, 0),
    scale: decVec(o?.s, 1),
  }
}

/** True when a transform is the identity (origin, no rotation, unit scale) → omit entirely. */
function isIdentityTransform(t: Transform): boolean {
  return isZeroVec(t.position) && isZeroVec(t.rotation) && isOneVec(t.scale)
}

// ── small coercion helpers (decode is tolerant of malformed input) ───────────

function num(v: unknown, def = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : def
}

function str(v: unknown, def = ''): string {
  return typeof v === 'string' ? v : def
}

function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

// ── entities ─────────────────────────────────────────────────────────────────

interface CPlacement extends CTransform {
  i: string // instanceId
  t: string // subPartTemplateId
  l: string // layerId
}

function encPlacement(p: SubPartPlacement): CPlacement {
  return { i: p.instanceId, t: p.subPartTemplateId, l: p.layerId, ...encTransform(p) }
}

function decPlacement(c: CPlacement): SubPartPlacement {
  return {
    instanceId: str(c.i),
    subPartTemplateId: str(c.t),
    layerId: str(c.l),
    ...decTransform(c),
  }
}

interface CConnector extends CTransform {
  i: string // id
  f?: Connector['flags'] // flags (omitted when empty)
}

function encConnector(c: Connector): CConnector {
  // layerId is always CONNECTOR_LAYER_ID — restored on decode, never serialized.
  const o: CConnector = { i: c.id, ...encTransform(c) }
  if (c.flags.length > 0) o.f = c.flags
  return o
}

function decConnector(c: CConnector): Connector {
  return {
    id: str(c.i),
    flags: arr<Connector['flags'][number]>(c.f),
    layerId: CONNECTOR_LAYER_ID,
    ...decTransform(c),
  }
}

interface CKitten extends CTransform {
  i: string // id
  k: KittenInstance['kind'] // kind
}

function encKitten(k: KittenInstance): CKitten {
  // layerId is always KITTEN_LAYER_ID — restored on decode.
  return { i: k.id, k: k.kind, ...encTransform(k) }
}

function decKitten(c: CKitten): KittenInstance {
  return {
    id: str(c.i),
    kind: (c.k ?? 'hunter') as KittenInstance['kind'],
    layerId: KITTEN_LAYER_ID,
    ...decTransform(c),
  }
}

interface CLayer {
  i: string
  n: string
}

// ── game data ────────────────────────────────────────────────────────────────

/** Solar panel: watts + an optional orientation transform (most are identity). */
interface CSolarPanel {
  w: number
  tf?: CTransform
}

function encSolarPanel(sp: SolarPanel): CSolarPanel {
  const o: CSolarPanel = { w: round(sp.outputWatts) }
  if (!isIdentityTransform(sp.transform)) o.tf = encTransform(sp.transform)
  return o
}

function decSolarPanel(c: CSolarPanel): SolarPanel {
  return { outputWatts: num(c.w), transform: decTransform(c.tf) }
}

interface CGameData {
  dn?: string // displayName
  cm?: number // customMass
  dm?: number // diameterM (omitted when null)
  co?: 1 // controllable (<Control/>); present ⇒ true
  bt?: number[] // batteries → capacityWh[]
  gn?: number[] // generators → outputWatts[]
  sp?: CSolarPanel[] // solarPanels
  pc?: number[] // powerConsumers → consumedWatts[]
  dc?: { c: string; f: number } // decoupler
  dp?: { c: string; ke: number; pi: number } // dockingPort
  ed?: { c: string } // evaDoor
  ct?: CController[] // rocketControllers
  ro?: CRocket[] // part-level rockets (gas generators)
  cb?: CCombustor[] // part-level combustors
  nz?: CNozzle[] // part-level nozzles
  gm?: CGimbal[] // gimbals
  ua?: Record<string, string> // unmodeled <PartGameData> attrs (passthrough)
  uc?: RawXmlNode[] // unmodeled <PartGameData> child elements (passthrough)
}

function encGameData(g: PartGameData): CGameData {
  const o: CGameData = {}
  if (g.displayName.trim()) o.dn = g.displayName
  if (g.customMass != null) o.cm = round(g.customMass)
  if (g.diameterM != null) o.dm = round(g.diameterM)
  if (g.controllable) o.co = 1
  if (g.batteries.length) o.bt = g.batteries.map((b) => round(b.capacityWh))
  if (g.generators.length) o.gn = g.generators.map((x) => round(x.outputWatts))
  if (g.solarPanels.length) o.sp = g.solarPanels.map(encSolarPanel)
  if (g.powerConsumers.length) o.pc = g.powerConsumers.map((p) => round(p.consumedWatts))
  if (g.decoupler) o.dc = { c: g.decoupler.connectorId, f: round(g.decoupler.force) }
  if (g.dockingPort) {
    o.dp = {
      c: g.dockingPort.connectorId,
      ke: round(g.dockingPort.latchingKineticEnergyJ),
      pi: round(g.dockingPort.pushoffImpulseNs),
    }
  }
  if (g.evaDoor) o.ed = { c: g.evaDoor.connectorId }
  if (g.rocketControllers.length) o.ct = g.rocketControllers.map(encController)
  if (g.rockets.length) o.ro = g.rockets.map(encRocket)
  if (g.combustors.length) o.cb = g.combustors.map(encCombustor)
  if (g.nozzles.length) o.nz = g.nozzles.map(encNozzle)
  if (g.gimbals.length) o.gm = g.gimbals.map(encGimbal)
  if (Object.keys(g.unknownAttrs).length) o.ua = g.unknownAttrs
  if (g.unknownChildren.length) o.uc = g.unknownChildren
  return o
}

function decGameData(c: CGameData | undefined): PartGameData {
  const g = createEmptyGameData()
  if (!c) return g
  g.displayName = str(c.dn)
  g.customMass = typeof c.cm === 'number' ? c.cm : null
  g.diameterM = typeof c.dm === 'number' ? c.dm : null
  g.controllable = !!c.co
  g.batteries = arr<number>(c.bt).map((wh): Battery => ({ capacityWh: num(wh) }))
  g.generators = arr<number>(c.gn).map((w): Generator => ({ outputWatts: num(w) }))
  g.solarPanels = arr<CSolarPanel>(c.sp).map(decSolarPanel)
  g.powerConsumers = arr<number>(c.pc).map((w): PowerConsumer => ({ consumedWatts: num(w) }))
  g.decoupler = c.dc ? { connectorId: str(c.dc.c), force: num(c.dc.f) } : null
  g.dockingPort = c.dp
    ? {
        connectorId: str(c.dp.c),
        latchingKineticEnergyJ: num(c.dp.ke),
        pushoffImpulseNs: num(c.dp.pi),
      }
    : null
  g.evaDoor = c.ed ? { connectorId: str(c.ed.c) } : null
  g.rocketControllers = arr<CController>(c.ct).map(decController)
  g.rockets = arr<CRocket>(c.ro).map(decRocket)
  g.combustors = arr<CCombustor>(c.cb).map(decCombustor)
  g.nozzles = arr<CNozzle>(c.nz).map(decNozzle)
  g.gimbals = arr<CGimbal>(c.gm).map(decGimbal)
  g.unknownAttrs = decRawAttrs(c.ua)
  g.unknownChildren = decRawNodes(c.uc)
  return g
}

/** Tolerant decode of a passthrough attr map (drops non-string values). */
function decRawAttrs(v: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (v && typeof v === 'object') {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === 'string') out[k] = val
    }
  }
  return out
}

/** Tolerant decode of a passthrough child-node list (recursively coerces each {@link RawXmlNode}). */
function decRawNodes(v: unknown): RawXmlNode[] {
  return arr<unknown>(v)
    .filter((n): n is Record<string, unknown> => !!n && typeof n === 'object')
    .map((n) => {
      const node: RawXmlNode = {
        tag: str(n.tag),
        attrs: decRawAttrs(n.attrs),
        children: decRawNodes(n.children),
      }
      if (typeof n.text === 'string' && n.text) node.text = n.text
      return node
    })
}

// ── per-SubPart game data (tanks / solar panels / lights) ────────────────────

interface CTank {
  l: number // lengthM
  r: number // outerRadiusM
  w: number // wallThicknessMm
  m?: string // wallMaterialId (omitted when the default aluminium)
  sph?: 1 // shape: present ⇒ Spherical (Cylindrical is the default)
}

function encTank(t: Tank): CTank {
  const o: CTank = { l: round(t.lengthM), r: round(t.outerRadiusM), w: round(t.wallThicknessMm) }
  if (t.wallMaterialId && t.wallMaterialId !== DEFAULT_TANK_MATERIAL) o.m = t.wallMaterialId
  if (t.shape === 'Spherical') o.sph = 1
  return o
}

function decTank(c: CTank): Tank {
  return {
    shape: c.sph ? 'Spherical' : 'Cylindrical',
    wallMaterialId: c.m != null ? str(c.m) : DEFAULT_TANK_MATERIAL,
    lengthM: num(c.l),
    outerRadiusM: num(c.r),
    wallThicknessMm: num(c.w),
  }
}

interface CLight {
  tf?: CTransform // transform (lights ignore scale; most are origin/identity)
  rg: number // rangeM
  in: number // intensity
  co: Triple // color [r,g,b] 0..1
  ia: number // innerAngleRad
  oa: number // outerAngleRad
  pt?: 1 // type: present ⇒ Point (Spot is the default)
  rt?: 1 // rayTracing
}

function encLight(l: Light): CLight {
  const o: CLight = {
    rg: round(l.rangeM),
    in: round(l.intensity),
    co: [round(l.color.r), round(l.color.g), round(l.color.b)],
    ia: round(l.innerAngleRad),
    oa: round(l.outerAngleRad),
  }
  if (!isIdentityTransform(l.transform)) o.tf = encTransform(l.transform)
  if (l.type === 'Point') o.pt = 1
  if (l.rayTracing) o.rt = 1
  return o
}

function decLight(c: CLight): Light {
  const co = decVec(c.co, 0)
  return {
    type: c.pt ? 'Point' : 'Spot',
    transform: decTransform(c.tf),
    rangeM: num(c.rg),
    intensity: num(c.in),
    color: { r: co.x, g: co.y, b: co.z },
    innerAngleRad: num(c.ia),
    outerAngleRad: num(c.oa),
    rayTracing: !!c.rt,
  }
}

// ── engine modules (combustor / nozzle / rocket / controller / gimbal) ───────

/** Compact SubPartIdReference: id, plus instance id only when scoped to a placement. */
interface CRef {
  i: string // id
  s?: string // subPartInstanceId
}

function encRef(r: SubPartIdRef): CRef {
  const o: CRef = { i: r.id }
  if (r.subPartInstanceId) o.s = r.subPartInstanceId
  return o
}

function decRef(c: CRef | undefined): SubPartIdRef {
  return { id: str(c?.i), subPartInstanceId: c?.s ? str(c.s) : null }
}

interface CCombustor {
  id: string
  c: string // combustionId
  p: number // maxPressurePa
  te?: number // thermalEfficiency (omit when 1)
  mt?: number // minimumThrottle (omit when 1)
  pt?: number // minimumPulseTimeS (omit when null)
}

function encCombustor(c: Combustor): CCombustor {
  const o: CCombustor = { id: c.id, c: c.combustionId, p: round(c.maxPressurePa) }
  if (c.thermalEfficiency !== 1) o.te = round(c.thermalEfficiency)
  if (c.minimumThrottle !== 1) o.mt = round(c.minimumThrottle)
  if (c.minimumPulseTimeS != null) o.pt = round(c.minimumPulseTimeS)
  return o
}

function decCombustor(c: CCombustor): Combustor {
  return {
    id: str(c.id),
    combustionId: str(c.c),
    maxPressurePa: num(c.p, 5_000_000),
    thermalEfficiency: typeof c.te === 'number' ? c.te : 1,
    minimumThrottle: typeof c.mt === 'number' ? c.mt : 1,
    minimumPulseTimeS: typeof c.pt === 'number' ? c.pt : null,
  }
}

interface CNozzle {
  id: string
  d: number // exitDiameterM
  ar: number // areaRatio
  fx?: number // fxExitDiameterM
  fe?: number // flowEfficiency (omit 1)
  ee?: number // expansionEfficiency (omit 1)
  el?: Triple // exhaustLocation (omit 0,0,0)
  ed?: Triple // exhaustDirection (omit -1,0,0)
  fl?: Triple // fxExhaustLocation
  fd?: Triple // fxExhaustDirection
  ve?: string // volumetricExhaustId
  lo?: 1 // exhaustLight OFF (default on)
  sd?: { a: string; s: string } // sound {action, soundId}
}

function isDefaultExhaustDir(v: Vec3): boolean {
  return round(v.x) === -1 && round(v.y) === 0 && round(v.z) === 0
}

function encNozzle(n: DeLavalNozzle): CNozzle {
  const o: CNozzle = { id: n.id, d: round(n.exitDiameterM), ar: round(n.areaRatio) }
  if (n.fxExitDiameterM != null) o.fx = round(n.fxExitDiameterM)
  if (n.flowEfficiency !== 1) o.fe = round(n.flowEfficiency)
  if (n.expansionEfficiency !== 1) o.ee = round(n.expansionEfficiency)
  if (!isZeroVec(n.exhaustLocation)) o.el = encVec(n.exhaustLocation)
  if (!isDefaultExhaustDir(n.exhaustDirection)) o.ed = encVec(n.exhaustDirection)
  if (n.fxExhaustLocation) o.fl = encVec(n.fxExhaustLocation)
  if (n.fxExhaustDirection) o.fd = encVec(n.fxExhaustDirection)
  if (n.volumetricExhaustId) o.ve = n.volumetricExhaustId
  if (!n.exhaustLight) o.lo = 1
  if (n.sound) o.sd = { a: n.sound.action, s: n.sound.soundId }
  return o
}

function decNozzle(c: CNozzle): DeLavalNozzle {
  return {
    id: str(c.id),
    exitDiameterM: num(c.d, 1),
    fxExitDiameterM: typeof c.fx === 'number' ? c.fx : null,
    areaRatio: num(c.ar),
    flowEfficiency: typeof c.fe === 'number' ? c.fe : 1,
    expansionEfficiency: typeof c.ee === 'number' ? c.ee : 1,
    exhaustLocation: decVec(c.el, 0),
    exhaustDirection: c.ed ? decVec(c.ed, 0) : { x: -1, y: 0, z: 0 },
    fxExhaustLocation: c.fl ? decVec(c.fl, 0) : null,
    fxExhaustDirection: c.fd ? decVec(c.fd, 0) : null,
    volumetricExhaustId: c.ve ? str(c.ve) : null,
    exhaustLight: !c.lo,
    sound: c.sd ? { action: str(c.sd.a, 'On') as RocketSoundAction, soundId: str(c.sd.s) } : null,
  }
}

interface CRocket {
  id: string
  c: CRef // core
  n?: CRef[] // nozzles
}

function encRocket(r: Rocket): CRocket {
  const o: CRocket = { id: r.id, c: encRef(r.core) }
  if (r.nozzles.length) o.n = r.nozzles.map(encRef)
  return o
}

function decRocket(c: CRocket): Rocket {
  return { id: str(c.id), core: decRef(c.c), nozzles: arr<CRef>(c.n).map(decRef) }
}

interface CController {
  id: string
  tk?: 1 // kind: present ⇒ thruster (engine is the default)
  r?: CRef[] // rocketRefs
  cm?: string[] // controlMapFlags
}

function encController(c: RocketController): CController {
  const o: CController = { id: c.id }
  if (c.kind === 'thruster') o.tk = 1
  if (c.rocketRefs.length) o.r = c.rocketRefs.map(encRef)
  if (c.controlMapFlags && c.controlMapFlags.length) o.cm = c.controlMapFlags
  return o
}

function decController(c: CController): RocketController {
  return {
    id: str(c.id),
    kind: c.tk ? 'thruster' : 'engine',
    rocketRefs: arr<CRef>(c.r).map(decRef),
    controlMapFlags: Array.isArray(c.cm) ? arr<string>(c.cm) : null,
  }
}

interface CGimbal {
  i: string // subPartInstanceId
  y?: number // maxAngleYDeg (omit 0)
  z?: number // maxAngleZDeg (omit 0)
  nc?: 1 // NOT constrain-to-circle (default is constrained)
}

function encGimbal(g: Gimbal): CGimbal {
  const o: CGimbal = { i: g.subPartInstanceId }
  if (g.maxAngleYDeg) o.y = round(g.maxAngleYDeg)
  if (g.maxAngleZDeg) o.z = round(g.maxAngleZDeg)
  if (!g.constrainToCircle) o.nc = 1
  return o
}

function decGimbal(c: CGimbal): Gimbal {
  return {
    subPartInstanceId: str(c.i),
    maxAngleYDeg: num(c.y),
    maxAngleZDeg: num(c.z),
    constrainToCircle: !c.nc,
  }
}

interface CSubPartGameData {
  t: string // subPartTemplateId
  tk?: CTank[] // tanks
  sp?: CSolarPanel[] // solarPanels
  li?: CLight[] // lights
  cb?: CCombustor[] // combustors
  nz?: CNozzle[] // nozzles
  ro?: CRocket[] // rockets
  ua?: Record<string, string> // unmodeled <SubPartGameData> attrs (passthrough)
  uc?: RawXmlNode[] // unmodeled <SubPartGameData> child elements (passthrough)
}

function encSubPartGameData(s: SubPartGameData): CSubPartGameData {
  const o: CSubPartGameData = { t: s.subPartTemplateId }
  if (s.tanks.length) o.tk = s.tanks.map(encTank)
  if (s.solarPanels.length) o.sp = s.solarPanels.map(encSolarPanel)
  if (s.lights.length) o.li = s.lights.map(encLight)
  if (s.combustors.length) o.cb = s.combustors.map(encCombustor)
  if (s.nozzles.length) o.nz = s.nozzles.map(encNozzle)
  if (s.rockets.length) o.ro = s.rockets.map(encRocket)
  if (Object.keys(s.unknownAttrs).length) o.ua = s.unknownAttrs
  if (s.unknownChildren.length) o.uc = s.unknownChildren
  return o
}

function decSubPartGameData(c: CSubPartGameData): SubPartGameData {
  const s = createSubPartGameData(str(c.t))
  s.tanks = arr<CTank>(c.tk).map(decTank)
  s.solarPanels = arr<CSolarPanel>(c.sp).map(decSolarPanel)
  s.lights = arr<CLight>(c.li).map(decLight)
  s.combustors = arr<CCombustor>(c.cb).map(decCombustor)
  s.nozzles = arr<CNozzle>(c.nz).map(decNozzle)
  s.rockets = arr<CRocket>(c.ro).map(decRocket)
  s.unknownAttrs = decRawAttrs(c.ua)
  s.unknownChildren = decRawNodes(c.uc)
  return s
}

// ── custom (kitten) meshes ───────────────────────────────────────────────────

interface CKittenSource {
  k: KittenMeshSource['kind']
  s: string // specKey
  d: string // diffuse
  n?: string // normal
  o?: string // aoRoughMetal
  tr?: 1 // transparent
}

interface CCustomMesh {
  id: string
  n: string // name
  sub: string // subPartId
  kit: CKittenSource
  em?: CustomMesh['emissive'] // emissive (small object — kept verbatim)
  gl?: CustomMesh['glass'] // glass tint
  su?: CustomMesh['surface'] // visor surface mode
}

function encCustomMesh(m: CustomMesh): CCustomMesh | null {
  const k = m.kitten
  if (!k) return null // only kitten meshes are data-only / shareable
  const kit: CKittenSource = { k: k.kind, s: k.specKey, d: k.diffuse }
  if (k.normal) kit.n = k.normal
  if (k.aoRoughMetal) kit.o = k.aoRoughMetal
  if (k.transparent) kit.tr = 1
  const o: CCustomMesh = { id: m.id, n: m.name, sub: m.subPartId, kit }
  if (m.emissive) o.em = m.emissive
  if (m.glass) o.gl = m.glass
  if (m.surface) o.su = m.surface
  return o
}

function decCustomMesh(c: CCustomMesh): CustomMesh {
  const kit: KittenMeshSource = {
    kind: (c.kit?.k ?? 'hunter') as KittenMeshSource['kind'],
    specKey: str(c.kit?.s),
    diffuse: str(c.kit?.d),
  }
  if (c.kit?.n) kit.normal = c.kit.n
  if (c.kit?.o) kit.aoRoughMetal = c.kit.o
  if (c.kit?.tr) kit.transparent = true
  const m: CustomMesh = {
    id: str(c.id),
    name: str(c.n),
    subPartId: str(c.sub),
    kitten: kit,
    faceTextures: {},
  }
  if (c.em) m.emissive = c.em
  if (c.gl) m.glass = c.gl
  if (c.su) m.surface = c.su
  return m
}

// ── animations ───────────────────────────────────────────────────────────────

interface CJoint {
  id: string
  n: string // name
  pj: string | null // parentJointId
  m: string[] // memberInstanceIds
}

function encJoint(j: AnimationJoint): CJoint {
  return { id: j.id, n: j.name, pj: j.parentJointId, m: j.memberInstanceIds }
}

function decJoint(c: CJoint): AnimationJoint {
  return {
    id: str(c.id),
    name: str(c.n),
    parentJointId: typeof c.pj === 'string' ? c.pj : null,
    memberInstanceIds: arr<string>(c.m),
  }
}

/** A named easing preset (the `preset` arm of {@link EasingConfig}). */
type EasingPreset = Extract<EasingConfig, { kind: 'preset' }>['preset']

/** Compact easing: `{b:[x1,y1,x2,y2]}` for a bézier, else `{e: presetName}`. */
type CEasing = { b: [number, number, number, number] } | { e: string }

function encEasing(e: EasingConfig): CEasing {
  if (e.kind === 'cubicBezier') {
    return { b: [round(e.x1), round(e.y1), round(e.x2), round(e.y2)] }
  }
  return { e: e.preset }
}

function decEasing(c: CEasing): EasingConfig {
  if ('b' in c && Array.isArray(c.b)) {
    return {
      kind: 'cubicBezier',
      x1: num(c.b[0]),
      y1: num(c.b[1]),
      x2: num(c.b[2]),
      y2: num(c.b[3]),
    }
  }
  return { kind: 'preset', preset: ('e' in c ? str(c.e, 'linear') : 'linear') as EasingPreset }
}

interface CKeyframe {
  id: string
  t: number // timeSec
  ps: Record<string, CTransform> // poses keyed by jointId
  es?: Record<string, CEasing> // easings keyed by jointId
}

function encKeyframe(kf: AnimationKeyframe): CKeyframe {
  const ps: Record<string, CTransform> = {}
  for (const [jointId, pose] of Object.entries(kf.poses)) ps[jointId] = encTransform(pose)
  const o: CKeyframe = { id: kf.id, t: round(kf.timeSec), ps }
  if (kf.easings && Object.keys(kf.easings).length) {
    const es: Record<string, CEasing> = {}
    for (const [jointId, e] of Object.entries(kf.easings)) es[jointId] = encEasing(e)
    o.es = es
  }
  return o
}

function decKeyframe(c: CKeyframe): AnimationKeyframe {
  const poses: Record<string, Transform> = {}
  for (const [jointId, pose] of Object.entries(c.ps ?? {})) {
    poses[jointId] = decTransform(pose as CTransform)
  }
  const kf: AnimationKeyframe = { id: str(c.id), timeSec: num(c.t), poses }
  if (c.es && Object.keys(c.es).length) {
    const easings: Record<string, EasingConfig> = {}
    for (const [jointId, e] of Object.entries(c.es)) easings[jointId] = decEasing(e as CEasing)
    kf.easings = easings
  }
  return kf
}

interface CAnimation {
  id: string
  n: string // name
  d: number // durationSec
  dr?: 1 // mode: present ⇒ deployRetract (actuate is the default)
  j: CJoint[] // joints
  kf: CKeyframe[] // keyframes
  rk?: string // restKeyframeId
  st?: { dps: number; sub: string; ex: string[] } // solarTracking
}

function encAnimation(a: PartAnimation): CAnimation {
  const o: CAnimation = {
    id: a.id,
    n: a.name,
    d: round(a.durationSec),
    j: a.joints.map(encJoint),
    kf: a.keyframes.map(encKeyframe),
  }
  if (a.mode === 'deployRetract') o.dr = 1
  if (a.restKeyframeId) o.rk = a.restKeyframeId
  if (a.solarTracking) {
    o.st = {
      dps: round(a.solarTracking.degreesPerSecond),
      sub: a.solarTracking.subPartInstanceId,
      ex: a.solarTracking.excludeInstanceIds,
    }
  }
  return o
}

function decAnimation(c: CAnimation): PartAnimation {
  return {
    id: str(c.id),
    name: str(c.n),
    durationSec: num(c.d, 1),
    mode: c.dr ? 'deployRetract' : 'actuate',
    joints: arr<CJoint>(c.j).map(decJoint),
    keyframes: arr<CKeyframe>(c.kf).map(decKeyframe),
    ...(c.rk ? { restKeyframeId: str(c.rk) } : {}),
    solarTracking: c.st
      ? {
          degreesPerSecond: num(c.st.dps),
          subPartInstanceId: str(c.st.sub),
          excludeInstanceIds: arr<string>(c.st.ex),
        }
      : null,
  }
}

// ── custom combustion processes (user-authored propellants) ──────────────────

interface CCombustionProcess {
  id: string
  n?: string // name (omitted when === id)
  r: [string, number][] // reactants [phaseId, massShare]
  lut: [number, number, number, number][] // rows [lnPressure, temperatureK, gamma, molarMassGPerMol]
}

function encCustomCombustion(c: CustomCombustionProcess): CCombustionProcess {
  const o: CCombustionProcess = {
    id: c.id,
    r: c.reactants.map((x) => [x.phaseId, round(x.massShare)]),
    lut: c.lut.map((row) => [
      round(row.lnPressure),
      round(row.temperatureK),
      round(row.gamma),
      round(row.molarMassGPerMol),
    ]),
  }
  if (c.name && c.name !== c.id) o.n = c.name
  return o
}

function decCustomCombustion(c: CCombustionProcess): CustomCombustionProcess {
  return {
    id: str(c.id),
    name: str(c.n) || str(c.id),
    reactants: arr<[string, number]>(c.r).map(([p, m]) => ({ phaseId: str(p), massShare: num(m) })),
    lut: arr<[number, number, number, number]>(c.lut).map(([l, t, g, m]) => ({
      lnPressure: num(l),
      temperatureK: num(t),
      gamma: num(g),
      molarMassGPerMol: num(m),
    })),
  }
}

// ── top-level envelope ───────────────────────────────────────────────────────

/** The compact wire object that `JSON.stringify` / compression operate on. */
export interface CompactProject {
  f: typeof PROJECT_EXPORT_FORMAT // format marker (validates non-flexo paste)
  v: number // version
  n?: string // projectName
  pid?: string // sourcePartId
  tg?: string[] // editorTags
  g?: CGameData // gameData
  sg?: CSubPartGameData[] // subPartGameData
  l?: CLayer[] // layers
  p?: CPlacement[] // placements
  c?: CConnector[] // connectors
  k?: CKitten[] // kittens
  a?: CAnimation[] // animations
  m?: CCustomMesh[] // customMeshes (kitten only)
  cp?: CCombustionProcess[] // customCombustionProcesses
}

/** Verbose export envelope → compact wire object (drops defaults, rounds, shortens keys). */
export function encodeProject(env: ProjectExportEnvelope): CompactProject {
  const d = env.data
  const o: CompactProject = { f: PROJECT_EXPORT_FORMAT, v: PROJECT_EXPORT_VERSION }
  if (env.projectName) o.n = env.projectName
  if (env.sourcePartId) o.pid = env.sourcePartId
  if (d.editorTags.length) o.tg = d.editorTags
  const g = encGameData(d.gameData)
  if (Object.keys(g).length) o.g = g
  if (d.subPartGameData.length) o.sg = d.subPartGameData.map(encSubPartGameData)
  if (d.layers.length) o.l = d.layers.map((x): CLayer => ({ i: x.id, n: x.name }))
  if (d.placements.length) o.p = d.placements.map(encPlacement)
  if (d.connectors.length) o.c = d.connectors.map(encConnector)
  if (d.kittens.length) o.k = d.kittens.map(encKitten)
  if (d.animations.length) o.a = d.animations.map(encAnimation)
  const meshes = d.customMeshes.map(encCustomMesh).filter((m): m is CCustomMesh => m != null)
  if (meshes.length) o.m = meshes
  if (d.customCombustionProcesses.length)
    o.cp = d.customCombustionProcesses.map(encCustomCombustion)
  return o
}

/** Compact wire object → verbose export envelope (restores every dropped default). */
export function decodeProject(raw: CompactProject): ProjectExportEnvelope {
  return {
    format: PROJECT_EXPORT_FORMAT,
    version: typeof raw.v === 'number' ? raw.v : PROJECT_EXPORT_VERSION,
    exportedAt: 0,
    projectName: str(raw.n),
    sourcePartId: str(raw.pid),
    data: {
      editorTags: arr<string>(raw.tg),
      gameData: decGameData(raw.g),
      subPartGameData: arr<CSubPartGameData>(raw.sg).map(decSubPartGameData),
      layers: arr<CLayer>(raw.l).map((x): Layer => ({ id: str(x.i), name: str(x.n) })),
      placements: arr<CPlacement>(raw.p).map(decPlacement),
      connectors: arr<CConnector>(raw.c).map(decConnector),
      kittens: arr<CKitten>(raw.k).map(decKitten),
      animations: arr<CAnimation>(raw.a).map(decAnimation),
      customMeshes: arr<CCustomMesh>(raw.m).map(decCustomMesh),
      customCombustionProcesses: arr<CCombustionProcess>(raw.cp).map(decCustomCombustion),
    },
  }
}

/** True when `raw` looks like a flexo compact project (its format marker matches). */
export function isCompactProject(raw: unknown): raw is CompactProject {
  return (
    typeof raw === 'object' && raw !== null && (raw as { f?: unknown }).f === PROJECT_EXPORT_FORMAT
  )
}
