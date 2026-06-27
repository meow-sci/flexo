import type {
  AnimationJoint,
  AnimationKeyframe,
  Battery,
  Connector,
  CustomMesh,
  EasingConfig,
  EulerXYZ,
  Generator,
  KittenInstance,
  KittenMeshSource,
  Layer,
  Light,
  PartAnimation,
  PartGameData,
  PowerConsumer,
  SolarPanel,
  SubPartGameData,
  SubPartPlacement,
  Tank,
  Transform,
  Vec3,
} from '../ksa/types'
import { CONNECTOR_LAYER_ID, KITTEN_LAYER_ID, createEmptyGameData } from '../ksa/types'
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
  bt?: number[] // batteries → capacityWh[]
  gn?: number[] // generators → outputWatts[]
  sp?: CSolarPanel[] // solarPanels
  pc?: number[] // powerConsumers → consumedWatts[]
  dc?: { c: string; f: number } // decoupler
  dp?: { c: string; li: number; po: number } // dockingPort
  ed?: { c: string } // evaDoor
}

function encGameData(g: PartGameData): CGameData {
  const o: CGameData = {}
  if (g.displayName.trim()) o.dn = g.displayName
  if (g.customMass != null) o.cm = round(g.customMass)
  if (g.batteries.length) o.bt = g.batteries.map((b) => round(b.capacityWh))
  if (g.generators.length) o.gn = g.generators.map((x) => round(x.outputWatts))
  if (g.solarPanels.length) o.sp = g.solarPanels.map(encSolarPanel)
  if (g.powerConsumers.length) o.pc = g.powerConsumers.map((p) => round(p.consumedWatts))
  if (g.decoupler) o.dc = { c: g.decoupler.connectorId, f: round(g.decoupler.force) }
  if (g.dockingPort) {
    o.dp = {
      c: g.dockingPort.connectorId,
      li: round(g.dockingPort.latchingImpulse),
      po: round(g.dockingPort.pushoffForce),
    }
  }
  if (g.evaDoor) o.ed = { c: g.evaDoor.connectorId }
  return o
}

function decGameData(c: CGameData | undefined): PartGameData {
  const g = createEmptyGameData()
  if (!c) return g
  g.displayName = str(c.dn)
  g.customMass = typeof c.cm === 'number' ? c.cm : null
  g.batteries = arr<number>(c.bt).map((wh): Battery => ({ capacityWh: num(wh) }))
  g.generators = arr<number>(c.gn).map((w): Generator => ({ outputWatts: num(w) }))
  g.solarPanels = arr<CSolarPanel>(c.sp).map(decSolarPanel)
  g.powerConsumers = arr<number>(c.pc).map((w): PowerConsumer => ({ consumedWatts: num(w) }))
  g.decoupler = c.dc ? { connectorId: str(c.dc.c), force: num(c.dc.f) } : null
  g.dockingPort = c.dp
    ? { connectorId: str(c.dp.c), latchingImpulse: num(c.dp.li), pushoffForce: num(c.dp.po) }
    : null
  g.evaDoor = c.ed ? { connectorId: str(c.ed.c) } : null
  return g
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

interface CSubPartGameData {
  t: string // subPartTemplateId
  tk?: CTank[] // tanks
  sp?: CSolarPanel[] // solarPanels
  li?: CLight[] // lights
}

function encSubPartGameData(s: SubPartGameData): CSubPartGameData {
  const o: CSubPartGameData = { t: s.subPartTemplateId }
  if (s.tanks.length) o.tk = s.tanks.map(encTank)
  if (s.solarPanels.length) o.sp = s.solarPanels.map(encSolarPanel)
  if (s.lights.length) o.li = s.lights.map(encLight)
  return o
}

function decSubPartGameData(c: CSubPartGameData): SubPartGameData {
  return {
    subPartTemplateId: str(c.t),
    tanks: arr<CTank>(c.tk).map(decTank),
    solarPanels: arr<CSolarPanel>(c.sp).map(decSolarPanel),
    lights: arr<CLight>(c.li).map(decLight),
  }
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
    },
  }
}

/** True when `raw` looks like a flexo compact project (its format marker matches). */
export function isCompactProject(raw: unknown): raw is CompactProject {
  return (
    typeof raw === 'object' && raw !== null && (raw as { f?: unknown }).f === PROJECT_EXPORT_FORMAT
  )
}
