import type {
  AnimationJoint,
  AnimationKeyframe,
  Battery,
  BurnRateLaw,
  ColliderShape,
  Combustor,
  Connector,
  ConnectorCapability,
  ConsumerFeedWiring,
  CustomMaterial,
  CustomReaction,
  CustomMesh,
  CustomTexture,
  DeLavalNozzle,
  FeedSource,
  PlumbingClass,
  ScalarChannel,
  EasingConfig,
  EulerXYZ,
  Generator,
  Gimbal,
  EasingChannel,
  ImportedMeshSource,
  IvaSeat,
  JointSegmentEasing,
  KittenInstance,
  KittenMeshSource,
  Layer,
  LayerColor,
  PartAnimation,
  PartCollider,
  PartGameData,
  PartLight,
  PowerConsumer,
  PrimitiveSpec,
  RawXmlNode,
  ReactionCategory,
  ReactionPlume,
  Rocket,
  RocketController,
  RocketSoundAction,
  SolarPanel,
  SolidGrainSegment,
  SolidMotor,
  SolidMotorNozzle,
  SubPartGameData,
  SubPartIdRef,
  SubPartPlacement,
  Tank,
  TankRoleAffinity,
  TextureChannel,
  Transform,
  Vec3,
} from '../ksa/types';
import {
  COLLIDER_SHAPES,
  IVA_SEAT_LAYER_ID,
  LAYER_COLORS,
  KITTEN_LAYER_ID,
  LIGHT_LAYER_ID,
  createDefaultMaterial,
  createEmptyGameData,
  createSubPartGameData,
  meshKind,
} from '../ksa/types';
import { normalizeSegmentEasing } from '../ksa/easing';
import type { ProjectExportEnvelope } from './projectTransfer';

/**
 * The wire-format marker + version. These live here (not in projectTransfer) so the
 * codec has no runtime dependency on projectTransfer — projectTransfer imports the
 * codec, and only its *types* flow back the other way (erased at build, no cycle).
 */
export const PROJECT_EXPORT_FORMAT = 'flexo-project';
// v2: KSA 2026.7.5.4892 Reactions refactor — combustor `c`(combustionId)→`r`+`mr`, tank
// `cp`(combustionProcessId)→`ra`(roleAffinity), envelope `cp`(custom processes)→`cr`(custom
// reactions). v3: custom materials (`mat`). v4: KSA 2026.7.9.5018 plumbing topology —
// connector `cp`(capabilities), tank `id`+`lo`, combustor `fd`(feeds)+`pl`(plumbing),
// part-level `tk`(tanks)/`cfw`(consumer feed wiring), and the solid-motor trio
// `sm`/`sn`/`sg` on both game-data levels, plus the solid burn-rate reaction fields.
// v5: imported glTF meshes (`imp`) — a third CustomMesh source kind, plus the mesh-level
// `mid` (materialId) an imported mesh needs to keep its surface across a round-trip.
// v6: colliders (`cl`) — the Part's collision volume as a flat list of analytic primitives.
// v7: the per-SubPart-template `<Internal>` (interior-only) flag (`ifl`) AND IVA seats
// (`iv`) — both halves of the IVA plan ship together, so they share the one bump.
// v8: lights normalized out of SubPartGameData (`sg[].li` with a nested transform) into
// first-class part entities: top-level `li` (flat inline `p`/`r`, `ot` owner template,
// editor-only id) — part-level `<Light>` support.
// NOT a bump (deliberately, AGENTS.md case 1 — additive): the `.flexo.tar.gz` archive added
// `tex` (custom-texture descriptors) and the mesh-level `prm`/`ft` (primitive spec + face
// textures) so a container that carries binaries can carry their descriptors too. Every one
// is a field an older v8 payload simply lacks, and its absence decodes to exactly what that
// payload meant — no textures, no primitive meshes, no per-face config. Bumping would have
// made every share link and exported JSON already in the wild unopenable to buy nothing.
// This number is a COMPATIBILITY CONTRACT, not a changelog counter: from now on a
// BACKWARDS-COMPATIBLE additive change MUST NOT bump it — decode is total and tolerant, so
// a same-version payload written before the new field existed simply decodes with that
// field's default. Only a BREAKING wire/model change (an existing token's shape or meaning
// changes, or a new field whose default would decode silently wrong) bumps it, and appends
// its own `// vN:` line above. Bumping needlessly makes every payload already in the wild —
// saved JSON files, pasted share links — unopenable.
// Per the no-migration rule, older payloads are REJECTED on import, never converted.
// v9: per-channel keyframe easing — CKeyframe.es values change shape from CEasing to
// {p?,r?,s?} (BREAKING: a v8 `es` value carries ONE easing meant for the whole pose, and
// decoding it as a per-channel record would silently drop it to LINEAR motion), plus
// additive CAnimation.cs (CubicSpline-approximated import flag).
export const PROJECT_EXPORT_VERSION = 9;

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
const PRECISION = 6;
const ROUND = 10 ** PRECISION;

/** Default tank wall material — omitted from the wire form, restored on decode. */
const DEFAULT_TANK_MATERIAL = 'Aluminum.2014(s)';

function round(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const v = Math.round(n * ROUND) / ROUND;
  return v === 0 ? 0 : v; // normalize -0 → 0
}

// ── vectors / transforms ─────────────────────────────────────────────────────

type Triple = [number, number, number];

function encVec(v: Vec3): Triple {
  return [round(v.x), round(v.y), round(v.z)];
}

function decVec(t: unknown, def: number): Vec3 {
  if (Array.isArray(t) && t.length === 3) {
    return { x: num(t[0], def), y: num(t[1], def), z: num(t[2], def) };
  }
  return { x: def, y: def, z: def };
}

function isZeroVec(v: Vec3 | EulerXYZ): boolean {
  return round(v.x) === 0 && round(v.y) === 0 && round(v.z) === 0;
}

function isOneVec(v: Vec3): boolean {
  return round(v.x) === 1 && round(v.y) === 1 && round(v.z) === 1;
}

/** Compact transform: each component present only when non-default (pos/rot 0, scale 1). */
interface CTransform {
  p?: Triple;
  r?: Triple;
  s?: Triple;
}

function encTransform(t: Transform): CTransform {
  const o: CTransform = {};
  if (!isZeroVec(t.position)) o.p = encVec(t.position);
  if (!isZeroVec(t.rotation)) o.r = encVec(t.rotation);
  if (!isOneVec(t.scale)) o.s = encVec(t.scale);
  return o;
}

function decTransform(o: CTransform | undefined): Transform {
  return {
    position: decVec(o?.p, 0),
    rotation: decVec(o?.r, 0),
    scale: decVec(o?.s, 1),
  };
}

/** True when a transform is the identity (origin, no rotation, unit scale) → omit entirely. */
function isIdentityTransform(t: Transform): boolean {
  return isZeroVec(t.position) && isZeroVec(t.rotation) && isOneVec(t.scale);
}

// ── small coercion helpers (decode is tolerant of malformed input) ───────────

function num(v: unknown, def = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : def;
}

function str(v: unknown, def = ''): string {
  return typeof v === 'string' ? v : def;
}

function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

// ── entities ─────────────────────────────────────────────────────────────────

interface CPlacement extends CTransform {
  i: string; // instanceId
  t: string; // subPartTemplateId
  l: string; // layerId
}

function encPlacement(p: SubPartPlacement): CPlacement {
  return { i: p.instanceId, t: p.subPartTemplateId, l: p.layerId, ...encTransform(p) };
}

function decPlacement(c: CPlacement): SubPartPlacement {
  return {
    instanceId: str(c.i),
    subPartTemplateId: str(c.t),
    layerId: str(c.l),
    ...decTransform(c),
  };
}

interface CConnector extends CTransform {
  i: string; // id
  l: string; // layerId
  f?: Connector['flags']; // flags (omitted when empty)
  cp?: ConnectorCapability[]; // capabilities (omitted when empty ⇒ KSA's implicit default)
  sb?: string[]; // siblingIds (omitted when empty)
}

function encConnector(c: Connector): CConnector {
  const o: CConnector = { i: c.id, l: c.layerId, ...encTransform(c) };
  if (c.flags.length > 0) o.f = c.flags;
  if (c.capabilities.length > 0) o.cp = c.capabilities;
  if (c.siblingIds.length > 0) o.sb = c.siblingIds;
  return o;
}

function decConnector(c: CConnector): Connector {
  return {
    id: str(c.i),
    flags: arr<Connector['flags'][number]>(c.f),
    capabilities: arr<ConnectorCapability>(c.cp),
    siblingIds: arr<string>(c.sb).map((s) => str(s)),
    layerId: str(c.l),
    ...decTransform(c),
  };
}

/** `s` is taken by {@link CTransform}'s scale, so the shape token is `sh`. */
interface CCollider extends CTransform {
  i: string; // id
  l: string; // layerId
  sh: ColliderShape; // shape
  o?: string; // ownerTemplateId (omitted ⇒ null ⇒ part-level)
}

function encCollider(c: PartCollider): CCollider {
  // `scale` carries the collider's SIZE in meters; the shared CTransform encoder omits
  // it at (1,1,1), which decodes back to a 1 m cube — the same shape.
  const o: CCollider = { i: c.id, l: c.layerId, sh: c.shape, ...encTransform(c) };
  if (c.ownerTemplateId) o.o = c.ownerTemplateId;
  return o;
}

function decCollider(c: CCollider): PartCollider {
  return {
    id: str(c.i),
    shape: COLLIDER_SHAPES.includes(c.sh) ? c.sh : 'Cylinder',
    ownerTemplateId: c.o ? str(c.o) : null,
    layerId: str(c.l),
    ...decTransform(c),
  };
}

/** An IVA seat. `scale` is unused, so the shared CTransform encoder always omits it. */
interface CIvaSeat extends CTransform {
  i: string; // id (editor-only `_seatN`)
  k?: string; // ksaId — the authored `<IVASeat Id>`, omitted when the seat has none
}

function encIvaSeat(s: IvaSeat): CIvaSeat {
  // layerId is always IVA_SEAT_LAYER_ID — restored on decode, never serialized.
  // `scale` is unused (KSA has no seat size); it is pinned to (1,1,1), which the shared
  // CTransform encoder omits and `decTransform` restores from its `1` default.
  return s.ksaId ? { i: s.id, k: s.ksaId, ...encTransform(s) } : { i: s.id, ...encTransform(s) };
}

function decIvaSeat(c: CIvaSeat): IvaSeat {
  return {
    id: str(c.i),
    ksaId: c.k ? str(c.k) : null,
    layerId: IVA_SEAT_LAYER_ID,
    ...decTransform(c),
  };
}

/**
 * Per-SubPart-template `<Internal>` overrides. Defensive: a hostile/stale payload can carry
 * anything under `ifl`, so only string→boolean entries survive (bad data is DROPPED, never
 * converted — see the no-migration rule in AGENTS.md).
 */
function decInternalFlags(raw: unknown): Record<string, boolean> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'boolean') out[k] = v;
  }
  return out;
}

interface CKitten extends CTransform {
  i: string; // id
  k: KittenInstance['kind']; // kind
}

function encKitten(k: KittenInstance): CKitten {
  // layerId is always KITTEN_LAYER_ID — restored on decode.
  return { i: k.id, k: k.kind, ...encTransform(k) };
}

function decKitten(c: CKitten): KittenInstance {
  return {
    id: str(c.i),
    kind: (c.k ?? 'hunter') as KittenInstance['kind'],
    layerId: KITTEN_LAYER_ID,
    ...decTransform(c),
  };
}

interface CLayer {
  i: string;
  n: string;
  /** Layer color swatch name; omitted when the layer has none (the common case). */
  c?: string;
}

/**
 * A wire color name → the {@link LayerColor} it denotes, or `undefined` for anything that
 * is not one of the twelve. Decode stays total and tolerant: an unknown swatch (a payload
 * from a build with a different palette, or hand-edited JSON) simply means "no color".
 */
function decLayerColor(raw: unknown): LayerColor | undefined {
  return LAYER_COLORS.includes(raw as LayerColor) ? (raw as LayerColor) : undefined;
}

// ── game data ────────────────────────────────────────────────────────────────

/** Solar panel: watts + an optional orientation transform (most are identity). */
interface CSolarPanel {
  w: number;
  tf?: CTransform;
}

function encSolarPanel(sp: SolarPanel): CSolarPanel {
  const o: CSolarPanel = { w: round(sp.outputWatts) };
  if (!isIdentityTransform(sp.transform)) o.tf = encTransform(sp.transform);
  return o;
}

function decSolarPanel(c: CSolarPanel): SolarPanel {
  return { outputWatts: num(c.w), transform: decTransform(c.tf) };
}

interface CPowerConsumer {
  w: number; // consumedWatts
  ls?: 1; // lightSwitch; present ⇒ true
  la?: 1; // lightIsActive; present ⇒ true
}

function encPowerConsumer(pc: PowerConsumer): CPowerConsumer {
  const o: CPowerConsumer = { w: round(pc.consumedWatts) };
  if (pc.lightSwitch) o.ls = 1;
  if (pc.lightIsActive) o.la = 1;
  return o;
}

function decPowerConsumer(c: CPowerConsumer): PowerConsumer {
  return { consumedWatts: num(c.w), lightSwitch: !!c.ls, lightIsActive: !!c.la };
}

interface CGameData {
  dn?: string; // displayName
  cm?: number; // customMass
  cmx?: RawXmlNode[]; // customMassExtras (unmodeled <CustomMass> children, passthrough)
  dm?: number; // diameterM (omitted when null)
  xdm?: number[]; // extraDiametersM (adapter size classes; omitted when empty)
  co?: 1; // controllable (<Control/>); present ⇒ true
  bt?: number[]; // batteries → capacityWh[]
  gn?: number[]; // generators → outputWatts[]
  sp?: CSolarPanel[]; // solarPanels
  pc?: CPowerConsumer; // powerConsumer (one per part)
  dc?: { c: string; f: number }; // decoupler
  dp?: { c: string; ke: number; pi: number }; // dockingPort
  ed?: { s?: string }; // evaDoor — presence = the hatch; s = SeatId when authored
  ct?: CController[]; // rocketControllers
  ro?: CRocket[]; // part-level rockets (gas generators)
  cb?: CCombustor[]; // part-level combustors
  nz?: CNozzle[]; // part-level nozzles
  gm?: CGimbal[]; // gimbals
  tk?: CTank[]; // part-level tanks (feed containers)
  sm?: CSolidMotor[]; // part-level solid motors
  sn?: CSolidNozzle[]; // part-level solid-motor nozzles
  sg?: CSolidGrain[]; // part-level solid grain segments
  cfw?: CFeedWiring[]; // consumerFeedWiring
  ua?: Record<string, string>; // unmodeled <PartGameData> attrs (passthrough)
  uc?: RawXmlNode[]; // unmodeled <PartGameData> child elements (passthrough)
}

function encGameData(g: PartGameData): CGameData {
  const o: CGameData = {};
  if (g.displayName.trim()) o.dn = g.displayName;
  if (g.customMass != null) o.cm = round(g.customMass);
  if (g.customMass != null && g.customMassExtras.length) o.cmx = g.customMassExtras;
  if (g.diameterM != null) o.dm = round(g.diameterM);
  if (g.extraDiametersM.length) o.xdm = g.extraDiametersM.map(round);
  if (g.controllable) o.co = 1;
  if (g.batteries.length) o.bt = g.batteries.map((b) => round(b.capacityWh));
  if (g.generators.length) o.gn = g.generators.map((x) => round(x.outputWatts));
  if (g.solarPanels.length) o.sp = g.solarPanels.map(encSolarPanel);
  if (g.powerConsumer) o.pc = encPowerConsumer(g.powerConsumer);
  if (g.decoupler) o.dc = { c: g.decoupler.connectorId, f: round(g.decoupler.force) };
  if (g.dockingPort) {
    o.dp = {
      c: g.dockingPort.connectorId,
      ke: round(g.dockingPort.latchingKineticEnergyJ),
      pi: round(g.dockingPort.pushoffImpulseNs),
    };
  }
  if (g.evaDoor) {
    o.ed = {};
    if (g.evaDoor.seatId) o.ed.s = g.evaDoor.seatId;
  }
  if (g.rocketControllers.length) o.ct = g.rocketControllers.map(encController);
  if (g.rockets.length) o.ro = g.rockets.map(encRocket);
  if (g.combustors.length) o.cb = g.combustors.map(encCombustor);
  if (g.nozzles.length) o.nz = g.nozzles.map(encNozzle);
  if (g.gimbals.length) o.gm = g.gimbals.map(encGimbal);
  if (g.tanks.length) o.tk = g.tanks.map(encTank);
  if (g.solidMotors.length) o.sm = g.solidMotors.map(encSolidMotor);
  if (g.solidNozzles.length) o.sn = g.solidNozzles.map(encSolidNozzle);
  if (g.solidGrainSegments.length) o.sg = g.solidGrainSegments.map(encSolidGrain);
  if (g.consumerFeedWiring.length) o.cfw = g.consumerFeedWiring.map(encFeedWiring);
  if (Object.keys(g.unknownAttrs).length) o.ua = g.unknownAttrs;
  if (g.unknownChildren.length) o.uc = g.unknownChildren;
  return o;
}

function decGameData(c: CGameData | undefined): PartGameData {
  const g = createEmptyGameData();
  if (!c) return g;
  g.displayName = str(c.dn);
  g.customMass = typeof c.cm === 'number' ? c.cm : null;
  g.customMassExtras = g.customMass != null ? decRawNodes(c.cmx) : [];
  g.diameterM = typeof c.dm === 'number' ? c.dm : null;
  g.extraDiametersM = arr<number>(c.xdm).map(num);
  g.controllable = !!c.co;
  g.batteries = arr<number>(c.bt).map((wh): Battery => ({ capacityWh: num(wh) }));
  g.generators = arr<number>(c.gn).map((w): Generator => ({ outputWatts: num(w) }));
  g.solarPanels = arr<CSolarPanel>(c.sp).map(decSolarPanel);
  g.powerConsumer = c.pc ? decPowerConsumer(c.pc) : null;
  g.decoupler = c.dc ? { connectorId: str(c.dc.c), force: num(c.dc.f) } : null;
  g.dockingPort = c.dp
    ? {
        connectorId: str(c.dp.c),
        latchingKineticEnergyJ: num(c.dp.ke),
        pushoffImpulseNs: num(c.dp.pi),
      }
    : null;
  g.evaDoor = c.ed ? { seatId: c.ed.s ? str(c.ed.s) : null } : null;
  g.rocketControllers = arr<CController>(c.ct).map(decController);
  g.rockets = arr<CRocket>(c.ro).map(decRocket);
  g.combustors = arr<CCombustor>(c.cb).map(decCombustor);
  g.nozzles = arr<CNozzle>(c.nz).map(decNozzle);
  g.gimbals = arr<CGimbal>(c.gm).map(decGimbal);
  g.tanks = arr<CTank>(c.tk).map(decTank);
  g.solidMotors = arr<CSolidMotor>(c.sm).map(decSolidMotor);
  g.solidNozzles = arr<CSolidNozzle>(c.sn).map(decSolidNozzle);
  g.solidGrainSegments = arr<CSolidGrain>(c.sg).map(decSolidGrain);
  g.consumerFeedWiring = arr<CFeedWiring>(c.cfw).map(decFeedWiring);
  g.unknownAttrs = decRawAttrs(c.ua);
  g.unknownChildren = decRawNodes(c.uc);
  return g;
}

/** Tolerant decode of a passthrough attr map (drops non-string values). */
function decRawAttrs(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (v && typeof v === 'object') {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === 'string') out[k] = val;
    }
  }
  return out;
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
      };
      if (typeof n.text === 'string' && n.text) node.text = n.text;
      return node;
    });
}

// ── per-SubPart game data (tanks / solar panels / engine modules) ────────────

interface CTank {
  l: number; // lengthM
  r: number; // outerRadiusM
  w: number; // wallThicknessMm
  m?: string; // wallMaterialId (omitted when the default aluminium)
  sph?: 1; // shape: present ⇒ Spherical (Cylindrical is the default)
  ra?: string; // roleAffinity (omitted at the Engine default)
  id?: string; // <Tank Id> feed-container id (omitted when unnamed)
  lo?: Triple; // locationAsmb (omitted at 0,0,0)
}

function encTank(t: Tank): CTank {
  const o: CTank = { l: round(t.lengthM), r: round(t.outerRadiusM), w: round(t.wallThicknessMm) };
  if (t.wallMaterialId && t.wallMaterialId !== DEFAULT_TANK_MATERIAL) o.m = t.wallMaterialId;
  if (t.shape === 'Spherical') o.sph = 1;
  if (t.roleAffinity !== 'Engine') o.ra = t.roleAffinity;
  if (t.id.trim()) o.id = t.id;
  if (!isZeroVec(t.locationAsmb)) o.lo = encVec(t.locationAsmb);
  return o;
}

const TANK_ROLE_AFFINITIES: ReadonlySet<string> = new Set([
  'None',
  'Engine',
  'Thruster',
  'Engine Thruster',
]);

function decTank(c: CTank): Tank {
  return {
    id: str(c.id),
    locationAsmb: decVec(c.lo, 0),
    shape: c.sph ? 'Spherical' : 'Cylindrical',
    wallMaterialId: c.m != null ? str(c.m) : DEFAULT_TANK_MATERIAL,
    lengthM: num(c.l),
    outerRadiusM: num(c.r),
    wallThicknessMm: num(c.w),
    roleAffinity:
      c.ra != null && TANK_ROLE_AFFINITIES.has(str(c.ra))
        ? (str(c.ra) as TankRoleAffinity)
        : 'Engine',
  };
}

/**
 * A cast light — a first-class part entity (like {@link CCollider}), not SubPart data.
 * `scale` is unused (pinned 1,1,1), so the shared CTransform encoder always omits it;
 * `layerId` is the constant LIGHT_LAYER_ID (`ly` is emitted only if it ever differed,
 * which the model forbids) — both restored on decode.
 */
interface CLight extends CTransform {
  i: string; // id
  rg: number; // rangeM
  in: number; // intensity
  co: Triple; // color [r,g,b] 0..1
  ia: number; // innerAngleRad
  oa: number; // outerAngleRad
  ot?: string; // ownerTemplateId (omitted ⇒ null ⇒ part-level)
  ly?: string; // layerId (omitted at the constant LIGHT_LAYER_ID — always, in practice)
  pt?: 1; // type: present ⇒ Point (Spot is the default)
  rt?: 1; // rayTracing
}

function encLight(l: PartLight): CLight {
  const o: CLight = {
    i: l.id,
    rg: round(l.rangeM),
    in: round(l.intensity),
    co: [round(l.color.r), round(l.color.g), round(l.color.b)],
    ia: round(l.innerAngleRad),
    oa: round(l.outerAngleRad),
    ...encTransform(l),
  };
  if (l.ownerTemplateId) o.ot = l.ownerTemplateId;
  if (l.layerId !== LIGHT_LAYER_ID) o.ly = l.layerId;
  if (l.type === 'Point') o.pt = 1;
  if (l.rayTracing) o.rt = 1;
  return o;
}

function decLight(c: CLight): PartLight {
  const co = decVec(c.co, 0);
  return {
    id: str(c.i),
    type: c.pt ? 'Point' : 'Spot',
    ownerTemplateId: c.ot ? str(c.ot) : null,
    rangeM: num(c.rg),
    intensity: num(c.in),
    color: { r: co.x, g: co.y, b: co.z },
    innerAngleRad: num(c.ia),
    outerAngleRad: num(c.oa),
    rayTracing: !!c.rt,
    layerId: c.ly ? str(c.ly) : LIGHT_LAYER_ID,
    ...decTransform(c),
  };
}

// ── engine modules (combustor / nozzle / rocket / controller / gimbal) ───────

/** Compact SubPartIdReference: id, plus instance id only when scoped to a placement. */
interface CRef {
  i: string; // id
  s?: string; // subPartInstanceId
}

function encRef(r: SubPartIdRef): CRef {
  const o: CRef = { i: r.id };
  if (r.subPartInstanceId) o.s = r.subPartInstanceId;
  return o;
}

function decRef(c: CRef | undefined): SubPartIdRef {
  return { id: str(c?.i), subPartInstanceId: c?.s ? str(c.s) : null };
}

/**
 * A feed point, at its most compact: `'p'` parent · `['c', connectorId]` ·
 * `['t', containerId]` / `['t', containerId, subPartInstanceId]`. The overwhelmingly
 * common case (a reusable chamber deferring to its placing part) is one character.
 */
type CFeed = 'p' | ['c', string] | ['t', string] | ['t', string, string];

function encFeed(f: FeedSource): CFeed {
  if (f.kind === 'connector') return ['c', f.connectorId];
  if (f.kind === 'container') {
    return f.subPartInstanceId ? ['t', f.containerId, f.subPartInstanceId] : ['t', f.containerId];
  }
  return 'p';
}

/** Decodes one compact feed point; null for anything unrecognized (caller filters). */
function decFeed(c: CFeed): FeedSource | null {
  if (c === 'p') return { kind: 'parent' };
  if (!Array.isArray(c)) return null;
  if (c[0] === 'c') return { kind: 'connector', connectorId: str(c[1]) };
  if (c[0] === 't') {
    return {
      kind: 'container',
      containerId: str(c[1]),
      subPartInstanceId: c[2] ? str(c[2]) : null,
    };
  }
  return null;
}

function decFeeds(c: CFeed[] | undefined): FeedSource[] {
  return arr<CFeed>(c)
    .map(decFeed)
    .filter((f): f is FeedSource => f != null);
}

/** `1` ⇒ Service; anything else is KSA's `Bulk` schema default. */
function decPlumbing(c: 1 | undefined): PlumbingClass {
  return c === 1 ? 'Service' : 'Bulk';
}

interface CCombustor {
  id: string;
  r: string; // reactionId
  mr?: number; // mixtureRatio (omit when null — fixed reactions)
  p: number; // maxPressurePa
  te?: number; // thermalEfficiency (omit when 1)
  mt?: number; // minimumThrottle (omit when 1)
  pt?: number; // minimumPulseTimeS (omit when null)
  fd?: CFeed[]; // feeds (omit when empty)
  pl?: 1; // plumbing: present ⇒ Service (Bulk is the schema default)
}

function encCombustor(c: Combustor): CCombustor {
  const o: CCombustor = { id: c.id, r: c.reactionId, p: round(c.maxPressurePa) };
  if (c.mixtureRatio != null) o.mr = round(c.mixtureRatio);
  if (c.thermalEfficiency !== 1) o.te = round(c.thermalEfficiency);
  if (c.minimumThrottle !== 1) o.mt = round(c.minimumThrottle);
  if (c.minimumPulseTimeS != null) o.pt = round(c.minimumPulseTimeS);
  if (c.feeds.length) o.fd = c.feeds.map(encFeed);
  if (c.plumbing === 'Service') o.pl = 1;
  return o;
}

function decCombustor(c: CCombustor): Combustor {
  return {
    id: str(c.id),
    reactionId: str(c.r),
    mixtureRatio: typeof c.mr === 'number' ? c.mr : null,
    maxPressurePa: num(c.p, 5_000_000),
    thermalEfficiency: typeof c.te === 'number' ? c.te : 1,
    minimumThrottle: typeof c.mt === 'number' ? c.mt : 1,
    minimumPulseTimeS: typeof c.pt === 'number' ? c.pt : null,
    feeds: decFeeds(c.fd),
    plumbing: decPlumbing(c.pl),
  };
}

interface CNozzle {
  id: string;
  d: number; // exitDiameterM
  ar: number; // areaRatio
  fx?: number; // fxExitDiameterM
  fe?: number; // flowEfficiency (omit 1)
  ee?: number; // expansionEfficiency (omit 1)
  el?: Triple; // exhaustLocation (omit 0,0,0)
  ed?: Triple; // exhaustDirection (omit -1,0,0)
  fl?: Triple; // fxExhaustLocation
  fd?: Triple; // fxExhaustDirection
  rp?: CReactionPlume[]; // reactionPlumes (omit when empty)
  lo?: 1; // exhaustLight OFF (default on)
  sd?: { a: string; s: string }; // sound {action, soundId}
}

interface CReactionPlume {
  r?: string; // reactionId (omit on the unkeyed fallback)
  df?: 1; // isDefault
  ve?: string; // volumetricExhaustId
  pt?: string; // plumeTrailId
}

function encPlumes(plumes: ReactionPlume[]): CReactionPlume[] {
  return plumes.map((p) => {
    const o: CReactionPlume = {};
    if (p.reactionId) o.r = p.reactionId;
    if (p.isDefault) o.df = 1;
    if (p.volumetricExhaustId) o.ve = p.volumetricExhaustId;
    if (p.plumeTrailId) o.pt = p.plumeTrailId;
    return o;
  });
}

function decPlumes(cs: CReactionPlume[] | undefined): ReactionPlume[] {
  return (Array.isArray(cs) ? cs : []).map((c) => ({
    reactionId: c.r ? str(c.r) : null,
    isDefault: !!c.df,
    volumetricExhaustId: c.ve ? str(c.ve) : null,
    plumeTrailId: c.pt ? str(c.pt) : null,
  }));
}

function isDefaultExhaustDir(v: Vec3): boolean {
  return round(v.x) === -1 && round(v.y) === 0 && round(v.z) === 0;
}

function encNozzle(n: DeLavalNozzle): CNozzle {
  const o: CNozzle = { id: n.id, d: round(n.exitDiameterM), ar: round(n.areaRatio) };
  if (n.fxExitDiameterM != null) o.fx = round(n.fxExitDiameterM);
  if (n.flowEfficiency !== 1) o.fe = round(n.flowEfficiency);
  if (n.expansionEfficiency !== 1) o.ee = round(n.expansionEfficiency);
  if (!isZeroVec(n.exhaustLocation)) o.el = encVec(n.exhaustLocation);
  if (!isDefaultExhaustDir(n.exhaustDirection)) o.ed = encVec(n.exhaustDirection);
  if (n.fxExhaustLocation) o.fl = encVec(n.fxExhaustLocation);
  if (n.fxExhaustDirection) o.fd = encVec(n.fxExhaustDirection);
  if (n.reactionPlumes.length > 0) o.rp = encPlumes(n.reactionPlumes);
  if (!n.exhaustLight) o.lo = 1;
  if (n.sound) o.sd = { a: n.sound.action, s: n.sound.soundId };
  return o;
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
    reactionPlumes: decPlumes(c.rp),
    exhaustLight: !c.lo,
    sound: c.sd ? { action: str(c.sd.a, 'On') as RocketSoundAction, soundId: str(c.sd.s) } : null,
  };
}

/**
 * A solid nozzle is exactly a DeLaval nozzle WITHOUT `ar` — KSA derives the throat as
 * `exitArea / 12` and the schema has no AreaRatio slot. Delegating to the DeLaval codec
 * (rather than copying 14 fields) means the two can never drift apart.
 */
type CSolidNozzle = Omit<CNozzle, 'ar'>;

function encSolidNozzle(n: SolidMotorNozzle): CSolidNozzle {
  const { ar, ...rest } = encNozzle({ ...n, areaRatio: 0 });
  void ar;
  return rest;
}

function decSolidNozzle(c: CSolidNozzle): SolidMotorNozzle {
  const { areaRatio, ...rest } = decNozzle({ ...c, ar: 0 });
  void areaRatio;
  return rest;
}

interface CSolidMotor {
  id: string;
  r: string; // reactionId
  dp: number; // defaultPressurePa
  te?: number; // thermalEfficiency (omit when 1)
  g?: string; // grainGeometryId (omit when '' ⇒ the library default)
  fd?: CFeed[]; // feeds (omit when empty)
}

function encSolidMotor(m: SolidMotor): CSolidMotor {
  const o: CSolidMotor = { id: m.id, r: m.reactionId, dp: round(m.defaultPressurePa) };
  if (m.thermalEfficiency !== 1) o.te = round(m.thermalEfficiency);
  if (m.grainGeometryId.trim()) o.g = m.grainGeometryId;
  if (m.feeds.length) o.fd = m.feeds.map(encFeed);
  return o;
}

function decSolidMotor(c: CSolidMotor): SolidMotor {
  return {
    id: str(c.id),
    reactionId: str(c.r),
    defaultPressurePa: num(c.dp, 7_000_000),
    thermalEfficiency: typeof c.te === 'number' ? c.te : 1,
    grainGeometryId: str(c.g),
    feeds: decFeeds(c.fd),
  };
}

interface CSolidGrain {
  id: string;
  r: number; // outerRadiusM
  w: number; // wallThicknessMm
  l: number; // lengthM
  m?: string; // wallMaterialId (omit when blank)
  lo?: Triple; // locationAsmb (omit at 0,0,0)
}

function encSolidGrain(s: SolidGrainSegment): CSolidGrain {
  const o: CSolidGrain = {
    id: s.id,
    r: round(s.outerRadiusM),
    w: round(s.wallThicknessMm),
    l: round(s.lengthM),
  };
  if (s.wallMaterialId.trim()) o.m = s.wallMaterialId;
  if (!isZeroVec(s.locationAsmb)) o.lo = encVec(s.locationAsmb);
  return o;
}

function decSolidGrain(c: CSolidGrain): SolidGrainSegment {
  return {
    id: str(c.id),
    wallMaterialId: str(c.m),
    outerRadiusM: num(c.r),
    wallThicknessMm: num(c.w),
    lengthM: num(c.l),
    locationAsmb: decVec(c.lo, 0),
  };
}

/** `<ConsumerFeedWiring Id [SubPartId]>` + its feed points. */
interface CFeedWiring {
  id: string; // consumerId (the consumer's TEMPLATE id)
  s?: string; // subPartInstanceId (omit ⇒ the root part)
  fd?: CFeed[]; // feeds
}

function encFeedWiring(w: ConsumerFeedWiring): CFeedWiring {
  const o: CFeedWiring = { id: w.consumerId };
  if (w.subPartInstanceId) o.s = w.subPartInstanceId;
  if (w.feeds.length) o.fd = w.feeds.map(encFeed);
  return o;
}

function decFeedWiring(c: CFeedWiring): ConsumerFeedWiring {
  return {
    consumerId: str(c.id),
    subPartInstanceId: c.s ? str(c.s) : null,
    feeds: decFeeds(c.fd),
  };
}

interface CRocket {
  id: string;
  c: CRef; // core
  n?: CRef[]; // nozzles
}

function encRocket(r: Rocket): CRocket {
  const o: CRocket = { id: r.id, c: encRef(r.core) };
  if (r.nozzles.length) o.n = r.nozzles.map(encRef);
  return o;
}

function decRocket(c: CRocket): Rocket {
  return { id: str(c.id), core: decRef(c.c), nozzles: arr<CRef>(c.n).map(decRef) };
}

interface CController {
  id: string;
  tk?: 1; // kind: present ⇒ thruster (engine is the default)
  r?: CRef[]; // rocketRefs
  cm?: string[]; // controlMapFlags
}

function encController(c: RocketController): CController {
  const o: CController = { id: c.id };
  if (c.kind === 'thruster') o.tk = 1;
  if (c.rocketRefs.length) o.r = c.rocketRefs.map(encRef);
  if (c.controlMapFlags && c.controlMapFlags.length) o.cm = c.controlMapFlags;
  return o;
}

function decController(c: CController): RocketController {
  return {
    id: str(c.id),
    kind: c.tk ? 'thruster' : 'engine',
    rocketRefs: arr<CRef>(c.r).map(decRef),
    controlMapFlags: Array.isArray(c.cm) ? arr<string>(c.cm) : null,
  };
}

interface CGimbal {
  i: string; // subPartInstanceId
  y?: number; // maxAngleYDeg (omit 0)
  z?: number; // maxAngleZDeg (omit 0)
  nc?: 1; // NOT constrain-to-circle (default is constrained)
}

function encGimbal(g: Gimbal): CGimbal {
  const o: CGimbal = { i: g.subPartInstanceId };
  if (g.maxAngleYDeg) o.y = round(g.maxAngleYDeg);
  if (g.maxAngleZDeg) o.z = round(g.maxAngleZDeg);
  if (!g.constrainToCircle) o.nc = 1;
  return o;
}

function decGimbal(c: CGimbal): Gimbal {
  return {
    subPartInstanceId: str(c.i),
    maxAngleYDeg: num(c.y),
    maxAngleZDeg: num(c.z),
    constrainToCircle: !c.nc,
  };
}

interface CSubPartGameData {
  t: string; // subPartTemplateId
  tk?: CTank[]; // tanks
  sp?: CSolarPanel[]; // solarPanels
  cb?: CCombustor[]; // combustors
  nz?: CNozzle[]; // nozzles
  ro?: CRocket[]; // rockets
  sm?: CSolidMotor[]; // solid motors
  sn?: CSolidNozzle[]; // solid-motor nozzles
  sg?: CSolidGrain[]; // solid grain segments
  ua?: Record<string, string>; // unmodeled <SubPartGameData> attrs (passthrough)
  uc?: RawXmlNode[]; // unmodeled <SubPartGameData> child elements (passthrough)
}

function encSubPartGameData(s: SubPartGameData): CSubPartGameData {
  const o: CSubPartGameData = { t: s.subPartTemplateId };
  if (s.tanks.length) o.tk = s.tanks.map(encTank);
  if (s.solarPanels.length) o.sp = s.solarPanels.map(encSolarPanel);
  if (s.combustors.length) o.cb = s.combustors.map(encCombustor);
  if (s.nozzles.length) o.nz = s.nozzles.map(encNozzle);
  if (s.rockets.length) o.ro = s.rockets.map(encRocket);
  if (s.solidMotors.length) o.sm = s.solidMotors.map(encSolidMotor);
  if (s.solidNozzles.length) o.sn = s.solidNozzles.map(encSolidNozzle);
  if (s.solidGrainSegments.length) o.sg = s.solidGrainSegments.map(encSolidGrain);
  if (Object.keys(s.unknownAttrs).length) o.ua = s.unknownAttrs;
  if (s.unknownChildren.length) o.uc = s.unknownChildren;
  return o;
}

function decSubPartGameData(c: CSubPartGameData): SubPartGameData {
  const s = createSubPartGameData(str(c.t));
  s.tanks = arr<CTank>(c.tk).map(decTank);
  s.solarPanels = arr<CSolarPanel>(c.sp).map(decSolarPanel);
  s.combustors = arr<CCombustor>(c.cb).map(decCombustor);
  s.nozzles = arr<CNozzle>(c.nz).map(decNozzle);
  s.rockets = arr<CRocket>(c.ro).map(decRocket);
  s.solidMotors = arr<CSolidMotor>(c.sm).map(decSolidMotor);
  s.solidNozzles = arr<CSolidNozzle>(c.sn).map(decSolidNozzle);
  s.solidGrainSegments = arr<CSolidGrain>(c.sg).map(decSolidGrain);
  s.unknownAttrs = decRawAttrs(c.ua);
  s.unknownChildren = decRawNodes(c.uc);
  return s;
}

// ── custom materials ─────────────────────────────────────────────────────────

/** Compact scalar channel: `{v}` uniform value | `{t}` grayscale-map texture id. */
type CScalar = { v: number } | { t: string };
/** Compact base color: `{c:[r,g,b]}` picked color | `{t}` image texture id. */
type CBaseColor = { c: [number, number, number] } | { t: string };

interface CCustomMaterial {
  id: string;
  n: string; // name
  bc: CBaseColor;
  mt: CScalar; // metalness
  ro: CScalar; // roughness
  oc?: string; // occlusion textureId
  orm?: string; // packed-ORM textureId
  no?: { t: string; s: number }; // normal map textureId + strength
}

function encScalar(c: ScalarChannel): CScalar {
  return c.kind === 'value' ? { v: round(c.value) } : { t: c.textureId };
}

function decScalar(c: CScalar | undefined, def: number): ScalarChannel {
  if (c && 't' in c && typeof c.t === 'string') return { kind: 'map', textureId: c.t };
  return { kind: 'value', value: c && 'v' in c ? num(c.v, def) : def };
}

function encCustomMaterial(m: CustomMaterial): CCustomMaterial {
  const bc: CBaseColor =
    m.baseColor.kind === 'color'
      ? { c: [m.baseColor.color.r, m.baseColor.color.g, m.baseColor.color.b] }
      : { t: m.baseColor.textureId };
  const o: CCustomMaterial = {
    id: m.id,
    n: m.name,
    bc,
    mt: encScalar(m.metalness),
    ro: encScalar(m.roughness),
  };
  if (m.occlusion) o.oc = m.occlusion.textureId;
  if (m.ormPacked) o.orm = m.ormPacked.textureId;
  if (m.normal) o.no = { t: m.normal.textureId, s: round(m.normal.strength) };
  return o;
}

function decCustomMaterial(c: CCustomMaterial): CustomMaterial {
  const m = createDefaultMaterial(str(c.id), str(c.n));
  if (c.bc && 't' in c.bc && typeof c.bc.t === 'string') {
    m.baseColor = { kind: 'map', textureId: c.bc.t };
  } else if (c.bc && 'c' in c.bc && Array.isArray(c.bc.c)) {
    m.baseColor = {
      kind: 'color',
      color: { r: num(c.bc.c[0]), g: num(c.bc.c[1]), b: num(c.bc.c[2]) },
    };
  }
  m.metalness = decScalar(c.mt, 0);
  m.roughness = decScalar(c.ro, 0.5);
  if (typeof c.oc === 'string' && c.oc) m.occlusion = { textureId: c.oc };
  if (typeof c.orm === 'string' && c.orm) m.ormPacked = { textureId: c.orm };
  if (c.no && typeof c.no.t === 'string' && c.no.t) {
    m.normal = { textureId: c.no.t, strength: num(c.no.s, 1) };
  }
  return m;
}

// ── custom textures (descriptors only — the bytes ride the archive container) ─

/**
 * An uploaded texture's DESCRIPTOR. Its pixels live in the asset DB, so this only ever
 * reaches the wire inside a `.flexo.tar.gz`, whose `assets/tex-src/<id>` entry carries them
 * (design-projects-export.md §4.1). A bare-JSON / share-link payload never carries one —
 * `buildProjectExport` leaves the list empty and the import boundary drops any that is
 * smuggled in, exactly as it does for a binary-backed mesh.
 */
interface CTexture {
  id: string;
  n: string; // name
  w: number;
  h: number;
  c: TextureChannel; // channel
  sh?: string; // sha256 of the source bytes (import dedup cache)
}

function encCustomTexture(t: CustomTexture): CTexture {
  const o: CTexture = { id: t.id, n: t.name, w: t.width, h: t.height, c: t.channel };
  if (t.sha256) o.sh = t.sha256;
  return o;
}

function decCustomTexture(c: CTexture): CustomTexture {
  const t: CustomTexture = {
    id: str(c.id),
    name: str(c.n),
    width: num(c.w),
    height: num(c.h),
    channel: str(c.c, 'baseColor') as TextureChannel,
  };
  if (c.sh) t.sha256 = str(c.sh);
  return t;
}

// ── custom (kitten / imported / primitive) meshes ────────────────────────────
//
// PRIMITIVE meshes are never encoded (they'd need their generated GLB); IMPORTED meshes ARE
// encoded, but the data-only transfer paths (project JSON + share link) still refuse to CARRY
// one: `projectTransfer.hasCustomAssets` gates those paths off for any project holding a
// binary-backed asset, and imported geometry is the most binary of all — the import batch's
// GLB in IndexedDB is its only copy, and nothing in this JSON could rebuild it. The encoding
// exists so the descriptor is lossless the day a bundle format ships (and so `meshKind`'s
// three cases are all handled here rather than silently collapsing to "kitten or nothing").

interface CKittenSource {
  k: KittenMeshSource['kind'];
  s: string; // specKey
  d: string; // diffuse
  n?: string; // normal
  o?: string; // aoRoughMetal
  tr?: 1; // transparent
}

interface CImportedSource {
  i: string; // importId
  m: string; // meshName
  f: string; // sourceFile
  n: string; // sourceNode
  mt: string; // sourceMaterial
  t: number; // triangles
  v: number; // vertices
  tr?: 1; // transparent (exports via <PartModelGlass>)
}

interface CCustomMesh {
  id: string;
  n: string; // name
  sub: string; // subPartId
  kit?: CKittenSource; // kitten submesh source (mutually exclusive with `imp`/`prm`)
  imp?: CImportedSource; // imported glTF mesh source
  prm?: PrimitiveSpec; // primitive shape + params (small object — kept verbatim)
  ft?: CustomMesh['faceTextures']; // per-face texture + UV config (primitives only)
  mid?: string; // materialId (kitten submeshes carry their own PBR set instead)
  em?: CustomMesh['emissive']; // emissive (small object — kept verbatim)
  gl?: CustomMesh['glass']; // glass tint
  su?: CustomMesh['surface']; // visor surface mode
}

function encCustomMesh(m: CustomMesh): CCustomMesh {
  const o: CCustomMesh = { id: m.id, n: m.name, sub: m.subPartId };
  switch (meshKind(m)) {
    case 'kitten': {
      const k = m.kitten!;
      const kit: CKittenSource = { k: k.kind, s: k.specKey, d: k.diffuse };
      if (k.normal) kit.n = k.normal;
      if (k.aoRoughMetal) kit.o = k.aoRoughMetal;
      if (k.transparent) kit.tr = 1;
      o.kit = kit;
      break;
    }
    case 'imported': {
      const i = m.imported!;
      o.imp = {
        i: i.importId,
        m: i.meshName,
        f: i.sourceFile,
        n: i.sourceNode,
        mt: i.sourceMaterial,
        t: i.triangles,
        v: i.vertices,
      };
      if (i.transparent) o.imp.tr = 1;
      break;
    }
    case 'primitive':
      // The spec alone does NOT reconstitute the mesh: its generated GLB lives in the asset
      // DB. Whether the descriptor may travel is the CONTAINER's call — an archive carries
      // the bytes, a share link does not — and that gate is `buildProjectExport`'s
      // `includeBinaryBacked` plus the import-side drop rule, not this encoder's.
      if (m.primitive) o.prm = m.primitive;
      break;
  }
  if (m.materialId) o.mid = m.materialId;
  if (Object.keys(m.faceTextures).length) o.ft = m.faceTextures;
  if (m.emissive) o.em = m.emissive;
  if (m.glass) o.gl = m.glass;
  if (m.surface) o.su = m.surface;
  return o;
}

function decCustomMesh(c: CCustomMesh): CustomMesh {
  const m: CustomMesh = {
    id: str(c.id),
    name: str(c.n),
    subPartId: str(c.sub),
    faceTextures: c.ft && typeof c.ft === 'object' ? { ...c.ft } : {},
  };
  if (c.prm && !c.imp && !c.kit) {
    m.primitive = c.prm;
    if (c.mid) m.materialId = c.mid;
  } else if (c.imp) {
    const imported: ImportedMeshSource = {
      importId: str(c.imp.i),
      meshName: str(c.imp.m),
      sourceFile: str(c.imp.f),
      sourceNode: str(c.imp.n),
      sourceMaterial: str(c.imp.mt),
      triangles: num(c.imp.t),
      vertices: num(c.imp.v),
    };
    if (c.imp.tr) imported.transparent = true;
    m.imported = imported;
    if (c.mid) m.materialId = c.mid;
  } else {
    const kit: KittenMeshSource = {
      kind: (c.kit?.k ?? 'hunter') as KittenMeshSource['kind'],
      specKey: str(c.kit?.s),
      diffuse: str(c.kit?.d),
    };
    if (c.kit?.n) kit.normal = c.kit.n;
    if (c.kit?.o) kit.aoRoughMetal = c.kit.o;
    if (c.kit?.tr) kit.transparent = true;
    m.kitten = kit;
  }
  if (c.em) m.emissive = c.em;
  if (c.gl) m.glass = c.gl;
  if (c.su) m.surface = c.su;
  return m;
}

// ── animations ───────────────────────────────────────────────────────────────

interface CJoint {
  id: string;
  n: string; // name
  pj: string | null; // parentJointId
  m: string[]; // memberInstanceIds
}

function encJoint(j: AnimationJoint): CJoint {
  return { id: j.id, n: j.name, pj: j.parentJointId, m: j.memberInstanceIds };
}

function decJoint(c: CJoint): AnimationJoint {
  return {
    id: str(c.id),
    name: str(c.n),
    parentJointId: typeof c.pj === 'string' ? c.pj : null,
    memberInstanceIds: arr<string>(c.m),
  };
}

/** A named easing preset (the `preset` arm of {@link EasingConfig}). */
type EasingPreset = Extract<EasingConfig, { kind: 'preset' }>['preset'];

/** Compact easing: `{b:[x1,y1,x2,y2]}` for a bézier, else `{e: presetName}`. */
type CEasing = { b: [number, number, number, number] } | { e: string };

function encEasing(e: EasingConfig): CEasing {
  if (e.kind === 'cubicBezier') {
    return { b: [round(e.x1), round(e.y1), round(e.x2), round(e.y2)] };
  }
  return { e: e.preset };
}

function decEasing(c: CEasing): EasingConfig {
  if ('b' in c && Array.isArray(c.b)) {
    return {
      kind: 'cubicBezier',
      x1: num(c.b[0]),
      y1: num(c.b[1]),
      x2: num(c.b[2]),
      y2: num(c.b[3]),
    };
  }
  return { kind: 'preset', preset: ('e' in c ? str(c.e, 'linear') : 'linear') as EasingPreset };
}

/** Per-channel easing: p=position, r=rotation, s=scale; absent channel = linear. */
type CSegEasing = { p?: CEasing; r?: CEasing; s?: CEasing };

/** Wire key ⇄ channel name; the ONE place the two orders are tied together. */
const SEG_EASING_KEYS: readonly [keyof CSegEasing, EasingChannel][] = [
  ['p', 'position'],
  ['r', 'rotation'],
  ['s', 'scale'],
];

function encSegEasing(seg: JointSegmentEasing): CSegEasing | undefined {
  const norm = normalizeSegmentEasing(seg);
  if (!norm) return undefined;
  const o: CSegEasing = {};
  for (const [key, ch] of SEG_EASING_KEYS) {
    const cfg = norm[ch];
    if (cfg) o[key] = encEasing(cfg);
  }
  return Object.keys(o).length ? o : undefined;
}

function decSegEasing(c: CSegEasing): JointSegmentEasing | undefined {
  const seg: JointSegmentEasing = {};
  for (const [key, ch] of SEG_EASING_KEYS) {
    const e = c?.[key];
    if (e && typeof e === 'object') seg[ch] = decEasing(e as CEasing);
  }
  return normalizeSegmentEasing(seg);
}

interface CKeyframe {
  id: string;
  t: number; // timeSec
  ps: Record<string, CTransform>; // poses keyed by jointId
  es?: Record<string, CSegEasing>; // easings keyed by jointId (per-channel since v9)
}

function encKeyframe(kf: AnimationKeyframe): CKeyframe {
  const ps: Record<string, CTransform> = {};
  for (const [jointId, pose] of Object.entries(kf.poses)) ps[jointId] = encTransform(pose);
  const o: CKeyframe = { id: kf.id, t: round(kf.timeSec), ps };
  if (kf.easings && Object.keys(kf.easings).length) {
    const es: Record<string, CSegEasing> = {};
    for (const [jointId, seg] of Object.entries(kf.easings)) {
      const enc = encSegEasing(seg);
      if (enc) es[jointId] = enc;
    }
    if (Object.keys(es).length) o.es = es;
  }
  return o;
}

function decKeyframe(c: CKeyframe): AnimationKeyframe {
  const poses: Record<string, Transform> = {};
  for (const [jointId, pose] of Object.entries(c.ps ?? {})) {
    poses[jointId] = decTransform(pose as CTransform);
  }
  const kf: AnimationKeyframe = { id: str(c.id), timeSec: num(c.t), poses };
  if (c.es && Object.keys(c.es).length) {
    const easings: Record<string, JointSegmentEasing> = {};
    for (const [jointId, e] of Object.entries(c.es)) {
      const seg = decSegEasing(e as CSegEasing);
      if (seg) easings[jointId] = seg;
    }
    if (Object.keys(easings).length) kf.easings = easings;
  }
  return kf;
}

interface CAnimation {
  id: string;
  n: string; // name
  d: number; // durationSec
  dr?: 1; // mode: present ⇒ deployRetract (actuate is the default)
  j: CJoint[]; // joints
  kf: CKeyframe[]; // keyframes
  rk?: string; // restKeyframeId
  cs?: 1; // cubicSplineApprox (imported from CUBICSPLINE samplers ⇒ approximated)
  st?: { dps: number; sub: string; ex: string[] }; // solarTracking
}

function encAnimation(a: PartAnimation): CAnimation {
  const o: CAnimation = {
    id: a.id,
    n: a.name,
    d: round(a.durationSec),
    j: a.joints.map(encJoint),
    kf: a.keyframes.map(encKeyframe),
  };
  if (a.mode === 'deployRetract') o.dr = 1;
  if (a.restKeyframeId) o.rk = a.restKeyframeId;
  if (a.cubicSplineApprox) o.cs = 1;
  if (a.solarTracking) {
    o.st = {
      dps: round(a.solarTracking.degreesPerSecond),
      sub: a.solarTracking.subPartInstanceId,
      ex: a.solarTracking.excludeInstanceIds,
    };
  }
  return o;
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
    ...(c.cs ? { cubicSplineApprox: true as const } : {}),
    solarTracking: c.st
      ? {
          degreesPerSecond: num(c.st.dps),
          subPartInstanceId: str(c.st.sub),
          excludeInstanceIds: arr<string>(c.st.ex),
        }
      : null,
  };
}

// ── custom reactions (user-authored propellants) ─────────────────────────────

const REACTION_CATEGORIES: ReadonlySet<string> = new Set([
  'Bipropellant',
  'Hypergolic',
  'Monopropellant',
  'Solid',
  'Thermal',
]);

interface CReaction {
  id: string;
  n?: string; // name (omitted when === id)
  c?: string; // category (omitted at the Monopropellant default)
  r: [string, number][]; // reactants [phaseId, massShare]
  lut: [number, number, number, number][]; // rows [lnPressure, temperatureK, gamma, molarMassGPerMol]
  // Solid-propellant fields — REQUIRED by KSA on a Category="Solid" reaction, absent
  // on every other category (see isCustomReactionExportable).
  br?: [number, number]; // burnRate [coefficientMPerS, exponent]
  bp?: number; // minimumBurnPressurePa
  mp?: number; // maxStablePressurePa
  cf?: number; // exhaustCondensedFraction
}

function encCustomReaction(c: CustomReaction): CReaction {
  const o: CReaction = {
    id: c.id,
    r: c.reactants.map((x) => [x.phaseId, round(x.massShare)]),
    lut: c.lut.map((row) => [
      round(row.lnPressure),
      round(row.temperatureK),
      round(row.gamma),
      round(row.molarMassGPerMol),
    ]),
  };
  if (c.name && c.name !== c.id) o.n = c.name;
  if (c.category !== 'Monopropellant') o.c = c.category;
  if (c.burnRate) o.br = [round(c.burnRate.coefficientMPerS), round(c.burnRate.exponent)];
  if (c.minimumBurnPressurePa != null) o.bp = round(c.minimumBurnPressurePa);
  if (c.maxStablePressurePa != null) o.mp = round(c.maxStablePressurePa);
  if (c.exhaustCondensedFraction != null) o.cf = round(c.exhaustCondensedFraction);
  return o;
}

function decCustomReaction(c: CReaction): CustomReaction {
  return {
    id: str(c.id),
    name: str(c.n) || str(c.id),
    category:
      c.c != null && REACTION_CATEGORIES.has(str(c.c))
        ? (str(c.c) as ReactionCategory)
        : 'Monopropellant',
    reactants: arr<[string, number]>(c.r).map(([p, m]) => ({ phaseId: str(p), massShare: num(m) })),
    lut: arr<[number, number, number, number]>(c.lut).map(([l, t, g, m]) => ({
      lnPressure: num(l),
      temperatureK: num(t),
      gamma: num(g),
      molarMassGPerMol: num(m),
    })),
    burnRate: decBurnRate(c.br),
    minimumBurnPressurePa: typeof c.bp === 'number' ? c.bp : null,
    maxStablePressurePa: typeof c.mp === 'number' ? c.mp : null,
    exhaustCondensedFraction: typeof c.cf === 'number' ? c.cf : null,
  };
}

/** `[a, n]` ⇒ Vieille's law `r = a·p^n`; anything else ⇒ no burn-rate law. */
function decBurnRate(c: [number, number] | undefined): BurnRateLaw | null {
  if (!Array.isArray(c) || c.length !== 2) return null;
  return { coefficientMPerS: num(c[0]), exponent: num(c[1]) };
}

// ── top-level envelope ───────────────────────────────────────────────────────

/** The compact wire object that `JSON.stringify` / compression operate on. */
export interface CompactProject {
  f: typeof PROJECT_EXPORT_FORMAT; // format marker (validates non-flexo paste)
  v: number; // version
  n?: string; // projectName
  pid?: string; // sourcePartId
  tg?: string[]; // editorTags
  g?: CGameData; // gameData
  sg?: CSubPartGameData[]; // subPartGameData
  l?: CLayer[]; // layers
  p?: CPlacement[]; // placements
  c?: CConnector[]; // connectors
  cl?: CCollider[]; // colliders
  iv?: CIvaSeat[]; // ivaSeats (order is load-bearing — index 0 is the default seat)
  li?: CLight[]; // lights (first-class part entities since v8)
  ifl?: Record<string, boolean>; // per-SubPart-template <Internal> overrides
  k?: CKitten[]; // kittens
  a?: CAnimation[]; // animations
  m?: CCustomMesh[]; // customMeshes (every kind — the CONTAINER decides which may travel)
  tex?: CTexture[]; // customTextures (archive containers only — descriptors, not pixels)
  mat?: CCustomMaterial[]; // customMaterials
  cr?: CReaction[]; // customReactions
}

/** Verbose export envelope → compact wire object (drops defaults, rounds, shortens keys). */
export function encodeProject(env: ProjectExportEnvelope): CompactProject {
  const d = env.data;
  const o: CompactProject = { f: PROJECT_EXPORT_FORMAT, v: PROJECT_EXPORT_VERSION };
  if (env.projectName) o.n = env.projectName;
  if (env.sourcePartId) o.pid = env.sourcePartId;
  if (d.editorTags.length) o.tg = d.editorTags;
  const g = encGameData(d.gameData);
  if (Object.keys(g).length) o.g = g;
  if (d.subPartGameData.length) o.sg = d.subPartGameData.map(encSubPartGameData);
  if (d.layers.length)
    o.l = d.layers.map(
      (x): CLayer => (x.color ? { i: x.id, n: x.name, c: x.color } : { i: x.id, n: x.name }),
    );
  if (d.placements.length) o.p = d.placements.map(encPlacement);
  if (d.connectors.length) o.c = d.connectors.map(encConnector);
  if (d.colliders.length) o.cl = d.colliders.map(encCollider);
  if (d.ivaSeats.length) o.iv = d.ivaSeats.map(encIvaSeat);
  if (d.lights.length) o.li = d.lights.map(encLight);
  if (Object.keys(d.internalFlags).length) o.ifl = { ...d.internalFlags };
  if (d.kittens.length) o.k = d.kittens.map(encKitten);
  if (d.animations.length) o.a = d.animations.map(encAnimation);
  if (d.customMeshes.length) o.m = d.customMeshes.map(encCustomMesh);
  if (d.customTextures.length) o.tex = d.customTextures.map(encCustomTexture);
  if (d.customMaterials.length) o.mat = d.customMaterials.map(encCustomMaterial);
  if (d.customReactions.length) o.cr = d.customReactions.map(encCustomReaction);
  return o;
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
      layers: arr<CLayer>(raw.l).map((x): Layer => {
        const color = decLayerColor(x.c);
        return color ? { id: str(x.i), name: str(x.n), color } : { id: str(x.i), name: str(x.n) };
      }),
      placements: arr<CPlacement>(raw.p).map(decPlacement),
      connectors: arr<CConnector>(raw.c).map(decConnector),
      colliders: arr<CCollider>(raw.cl).map(decCollider),
      ivaSeats: arr<CIvaSeat>(raw.iv).map(decIvaSeat),
      lights: arr<CLight>(raw.li).map(decLight),
      internalFlags: decInternalFlags(raw.ifl),
      kittens: arr<CKitten>(raw.k).map(decKitten),
      animations: arr<CAnimation>(raw.a).map(decAnimation),
      customMeshes: arr<CCustomMesh>(raw.m).map(decCustomMesh),
      customTextures: arr<CTexture>(raw.tex).map(decCustomTexture),
      customMaterials: arr<CCustomMaterial>(raw.mat).map(decCustomMaterial),
      customReactions: arr<CReaction>(raw.cr).map(decCustomReaction),
    },
  };
}

/** True when `raw` looks like a flexo compact project (its format marker matches). */
export function isCompactProject(raw: unknown): raw is CompactProject {
  return (
    typeof raw === 'object' && raw !== null && (raw as { f?: unknown }).f === PROJECT_EXPORT_FORMAT
  );
}
