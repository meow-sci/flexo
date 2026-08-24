import {
  COLLIDER_SHAPES,
  CONNECTOR_CAPABILITIES,
  createEmptyGameData,
  createSubPartGameData,
  DEFAULT_LAYER_ID,
  isSubPartGameDataEmpty,
  IVA_SEAT_LAYER_ID,
} from './types';
import { SEAT_LOCAL_FORWARD, SEAT_LOCAL_UP, seatRotationFromAxes } from './ivaSeatAxes';
import {
  colliderDimensionNames,
  colliderSizeFromDimensions,
  DEFAULT_COLLIDER_SIZE_M,
  type ColliderDimensions,
} from './colliderSize';
import type {
  CatalogAnimationModule,
  ColliderShape,
  Combustor,
  Connector,
  ConnectorCapability,
  ConnectorFlag,
  CustomReaction,
  DeLavalNozzle,
  EulerXYZ,
  FeedSource,
  Gimbal,
  IvaSeat,
  LightType,
  PartCollider,
  PartGameData,
  PartLight,
  PlumbingClass,
  RawXmlNode,
  ReactionCategory,
  Rocket,
  RocketController,
  RocketControllerKind,
  RocketNozzleRef,
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
  TankShape,
  Transform,
  Vec3,
} from './types';

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
  parseFromString(text: string, type: string): unknown;
}

export function parsePartPlacements(
  xmlText: string,
  partId: string,
  parserImpl: DomParserLike = new DOMParser(),
): SubPartPlacement[] {
  const doc = parserImpl.parseFromString(xmlText, 'application/xml') as Document;
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error(`partXmlParser: parse error parsing Part '${partId}'`);
  }

  const part = Array.from(doc.getElementsByTagName('Part')).find(
    (p) => p.getAttribute('Id') === partId,
  );
  if (!part) throw new Error(`partXmlParser: Part '${partId}' not found`);

  return placementsFromPartElement(part);
}

/**
 * Extracts the SubPart instance placements from a single <Part> element. Only
 * children carrying an InstanceOf are placements (skin/structure metadata
 * children without it are ignored). Shared by the single-Part parser and the
 * Part catalog loader.
 */
export function placementsFromPartElement(part: Element): SubPartPlacement[] {
  const placements: SubPartPlacement[] = [];
  for (const sub of directChildren(part, 'SubPart')) {
    const instanceOf = sub.getAttribute('InstanceOf');
    if (!instanceOf) continue; // skip non-instance entries
    const transform = directChildren(sub, 'Transform')[0] ?? null;
    placements.push({
      instanceId: sub.getAttribute('Id') ?? instanceOf,
      subPartTemplateId: instanceOf,
      position: readVec(transform, 'Position', 0),
      rotation: readVec(transform, 'Rotation', 0) as EulerXYZ,
      scale: readVec(transform, 'Scale', 1),
      // KSA XML has no layers; placements load into the Default layer. Importing
      // into the editor reassigns them to the active layer (see addPart).
      layerId: DEFAULT_LAYER_ID,
    });
  }
  return placements;
}

const CONNECTOR_FLAG_SET = new Set<ConnectorFlag>(['Internal', 'ToSurface', 'FromSurface']);

/**
 * The separator .NET's `XmlSerializationReader.ToEnum` uses for a `[Flags]` enum body:
 * it does `value.Split(null)`, i.e. splits on WHITESPACE. Commas are tolerated here only
 * so a hand-authored (or legacy flexo-authored) `"Internal, ToSurface"` still reads —
 * flexo itself always EMITS the whitespace form, since a comma-joined body makes KSA
 * throw `CreateUnknownConstantException` on the token `"Internal,"`.
 */
const FLAG_SEPARATOR = /[\s,]+/;

/**
 * Parses a whitespace-separated `<Flags>` body (e.g. "Internal ToSurface") into the
 * recognized {@link ConnectorFlag}s, preserving order and dropping unknowns.
 */
export function parseConnectorFlags(raw: string | null | undefined): ConnectorFlag[] {
  if (!raw) return [];
  return raw
    .split(FLAG_SEPARATOR)
    .map((s) => s.trim() as ConnectorFlag)
    .filter((f) => CONNECTOR_FLAG_SET.has(f));
}

const CONNECTOR_CAPABILITY_SET = new Set<ConnectorCapability>(CONNECTOR_CAPABILITIES);

/**
 * Parses a whitespace-separated `<Capabilities>` body (KSA's `ConnectorCapabilityFlags`)
 * into the recognized tokens, preserving order and dropping unknowns. An empty result is
 * NOT "no capabilities" — it is KSA's implicit `Electricity | ServiceFluid` default.
 */
export function parseConnectorCapabilities(raw: string | null | undefined): ConnectorCapability[] {
  if (!raw) return [];
  return raw
    .split(FLAG_SEPARATOR)
    .map((s) => s.trim() as ConnectorCapability)
    .filter((c) => CONNECTOR_CAPABILITY_SET.has(c));
}

/**
 * Extracts the connector attachment points from a single <Part> element, with
 * their relative transforms. Core Assets <Part> definitions carry connector
 * transforms but not <Flags> (those live on <PartGameData>), so flags default to
 * [] unless a <Flags> child is present inline.
 */
export function connectorsFromPartElement(part: Element): Connector[] {
  const connectors: Connector[] = [];
  for (const conn of directChildren(part, 'Connector')) {
    const id = conn.getAttribute('Id');
    if (!id) continue;
    const transform = directChildren(conn, 'Transform')[0] ?? null;
    connectors.push({
      id,
      position: readVec(transform, 'Position', 0),
      rotation: readVec(transform, 'Rotation', 0) as EulerXYZ,
      scale: readVec(transform, 'Scale', 1),
      flags: parseConnectorFlags(directChildren(conn, 'Flags')[0]?.textContent),
      // <Capabilities> — KSA ORs the geometry and GameData values, so reading both is safe.
      capabilities: parseConnectorCapabilities(
        directChildren(conn, 'Capabilities')[0]?.textContent,
      ),
      // <Sibling Id/> children group this connector with the part's other attach nodes
      // (KSA 2026.7 multi-mount prefabs); preserved verbatim, dropping any without an Id.
      siblingIds: directChildren(conn, 'Sibling')
        .map((s) => s.getAttribute('Id') ?? '')
        .filter((s) => s),
      // XML carries no layers: everything parsed lands on Default, exactly like the
      // SubPart placements it sits with (an import then re-homes the whole Part).
      layerId: DEFAULT_LAYER_ID,
    });
  }
  return connectors;
}

/**
 * Reads every `<Collider>` component of an owner element into flat {@link PartCollider}s.
 *
 * The four legal owners (`<Part>`, geometry `<SubPart>`, `<PartGameData>`,
 * `<SubPartGameData>`) all use the identical schema — `Components` is mapped onto every
 * `PartTemplate` subclass by `XmlHelper.AttributeOverrides` — so ONE reader serves all
 * of them. The `<Collider Id>` COMPONENT id is deliberately dropped: nothing references
 * it (Core reuses "Collider1" everywhere) and flexo re-emits a single deterministic
 * component per owner, so keeping it would only risk colliding with a `<Tank Id>` in the
 * shared feed-container namespace (`PartTemplate` scans every `Components[].Id`).
 *
 * `ownerTemplateId` is the frame the shapes are expressed in: `null` for a Part-level
 * owner, else the SubPart template id.
 */
export function collidersFromElement(
  owner: Element,
  ownerTemplateId: string | null,
): PartCollider[] {
  const out: PartCollider[] = [];
  for (const component of directChildren(owner, 'Collider')) {
    for (const shapeEl of childElements(component)) {
      const shape = COLLIDER_SHAPE_SET.has(shapeEl.tagName as ColliderShape)
        ? (shapeEl.tagName as ColliderShape)
        : null;
      if (!shape) continue; // not one of the four Bepu primitives KSA accepts
      const dims = {
        lengthXM: readDistanceM(directChildren(shapeEl, 'LengthX')[0]),
        lengthYM: readDistanceM(directChildren(shapeEl, 'LengthY')[0]),
        lengthZM: readDistanceM(directChildren(shapeEl, 'LengthZ')[0]),
        radiusM: readDistanceM(directChildren(shapeEl, 'Radius')[0]),
      };
      // A DistanceReference with no unit attribute reads back as NaN in KSA, poisoning
      // the Bepu shape. Substitute a visible default and say so — flexo always emits.
      const missing = colliderDimensionNames(shape).filter(
        (name) => dims[DIMENSION_FIELD[name]] == null,
      );
      if (missing.length > 0) {
        console.warn(
          `flexo import: <${shapeEl.tagName} Id="${shapeEl.getAttribute('Id') ?? ''}"> is missing ` +
            `<${missing.join('>, <')}> — KSA would build a NaN shape from it; ` +
            `defaulting each to ${DEFAULT_COLLIDER_SIZE_M} m.`,
        );
      }
      out.push({
        id: shapeEl.getAttribute('Id') ?? `${shape.toLowerCase()}_collider`,
        shape,
        ownerTemplateId,
        position: readVec3Attrs(directChildren(shapeEl, 'LocationAsmb')[0], ZERO_VEC3),
        // <Collider2Asmb> is Euler XYZ radians — the same convention as a <Rotation>.
        rotation: readVec3Attrs(directChildren(shapeEl, 'Collider2Asmb')[0], ZERO_VEC3) as EulerXYZ,
        scale: colliderSizeFromDimensions(shape, dims),
        // XML carries no layers — Default, like the placements/connectors alongside it.
        layerId: DEFAULT_LAYER_ID,
      });
    }
  }
  return out;
}

const COLLIDER_SHAPE_SET: ReadonlySet<ColliderShape> = new Set(COLLIDER_SHAPES);

/** Dimension element name → the {@link ColliderDimensions} field it fills. */
const DIMENSION_FIELD: Record<string, keyof ColliderDimensions> = {
  LengthX: 'lengthXM',
  LengthY: 'lengthYM',
  LengthZ: 'lengthZM',
  Radius: 'radiusM',
};

const ZERO_VEC3: Vec3 = { x: 0, y: 0, z: 0 };

/**
 * Reads the `<Collider>`s of every top-level `<SubPartGameData Id>` in a GameData
 * document root, each tagged with its owning SubPart template id. Kept separate from
 * {@link parseGameDataElement} (which sees only one `<PartGameData>`) because
 * `<SubPartGameData>` is its SIBLING, not its child.
 */
export function subPartCollidersFromRoot(root: Element): PartCollider[] {
  const out: PartCollider[] = [];
  for (const spEl of directChildren(root, 'SubPartGameData')) {
    const templateId = spEl.getAttribute('Id');
    if (!templateId) continue;
    out.push(...collidersFromElement(spEl, templateId));
  }
  return out;
}

/**
 * Reads every `<IVASeat>` of an owner element (`<Part>` or `<PartGameData>`) into
 * {@link IvaSeat}s, preserving DOCUMENT ORDER (which is KSA's seat cycle order — the first
 * seat is the one IVA opens on).
 *
 * The seat ids are REGENERATED here (`_seat1`, `_seat2`, …) and are never emitted (the
 * serializer writes no `Id` attribute, see partXmlSerializer's `buildIvaSeatElement`), so —
 * unlike a placement/connector id — nothing needs an `idRemap` entry for them. Order is the
 * only identity a seat has in-game, and order is preserved.
 *
 * Degenerate pairs are DROPPED with a console warning rather than imported: KSA builds a NaN
 * camera rotation from them (`Camera.LookAtRotation` → `Cross(f, up).Normalized()`), so
 * round-tripping one would only preserve a broken seat.
 */
export function ivaSeatsFromElement(owner: Element): IvaSeat[] {
  const out: IvaSeat[] = [];
  for (const el of directChildren(owner, 'IVASeat')) {
    // Element ABSENT ⇒ the C# field default. Element PRESENT ⇒ each missing attribute is 0
    // (`Vector3Reference` initialises X/Y/Z to 0), which is a zero look direction.
    const fwdEl = directChildren(el, 'ForwardAxis')[0];
    const upEl = directChildren(el, 'UpAxis')[0];
    const forward = fwdEl ? readVec3Attrs(fwdEl, ZERO_VEC3) : { ...SEAT_LOCAL_FORWARD };
    const up = upEl ? readVec3Attrs(upEl, ZERO_VEC3) : { ...SEAT_LOCAL_UP };
    const rotation = seatRotationFromAxes(forward, up);
    if (!rotation) {
      console.warn(
        `flexo import: dropping an <IVASeat> whose <ForwardAxis>/<UpAxis> are zero or parallel — ` +
          `KSA would build a NaN camera rotation from it.`,
      );
      continue;
    }
    out.push({
      id: `_seat${out.length + 1}`,
      // The AUTHORED `<IVASeat Id>` (KSA `TemplateDataBase.Id`) — kept verbatim so an
      // `<EVADoor SeatId>` pointing at it survives the round trip. Absent ⇒ null.
      ksaId: el.getAttribute('Id') || null,
      position: readVec3Attrs(directChildren(el, 'Position')[0], ZERO_VEC3),
      rotation,
      // KSA has no seat size; scale is unused and never emitted.
      scale: { x: 1, y: 1, z: 1 },
      layerId: IVA_SEAT_LAYER_ID,
    });
  }
  return out;
}

/** The full GameData payload read back from a <PartGameData> element. */
export interface ParsedGameData {
  editorTags: string[];
  /** connector id → its flags (only connectors that carry <Flags>). */
  connectorFlags: Map<string, ConnectorFlag[]>;
  /** connector id → its capabilities (only connectors that carry <Capabilities>). */
  connectorCapabilities: Map<string, ConnectorCapability[]>;
  gameData: PartGameData;
  subPartGameData: SubPartGameData[];
  /**
   * Collision primitives read from this document. `<PartGameData><Collider>` shapes
   * carry `ownerTemplateId: null`; `<SubPartGameData Id><Collider>` shapes carry that
   * template id (filled in by {@link gameDataFromAssets}, which sees the whole root).
   */
  colliders: PartCollider[];
  /**
   * IVA camera vantage points read from this document's `<PartGameData><IVASeat>`s, in
   * document (= cycle) order. SubPart-level seats are deliberately NOT gathered — they keep
   * riding the GameData passthrough (plans/IVA_PLAN.md §6).
   */
  ivaSeats: IvaSeat[];
  /**
   * Cast lights read from this document. `<PartGameData><Light>`s carry
   * `ownerTemplateId: null`; `<SubPartGameData Id><Light>`s carry that template id
   * (filled in by {@link gameDataFromAssets}, which sees the whole root and renumbers
   * `_lightN` ids over the merged list in document order — part-level first).
   */
  lights: PartLight[];
  /** Parsed <KeyframeAnimationModule>s (refs in ORIGINAL instance-id space). */
  animationModules: CatalogAnimationModule[];
  /** Top-level <FixedReaction> custom propellants (siblings of <PartGameData>). */
  customReactions: CustomReaction[];
}

/** Parses the <KeyframeAnimationModule> children of a <PartGameData> element. */
export function animationModulesFromGameData(gd: Element): CatalogAnimationModule[] {
  const out: CatalogAnimationModule[] = [];
  for (const mod of directChildren(gd, 'KeyframeAnimationModule')) {
    const kf = directChildren(mod, 'KeyframeAnimation')[0];
    const glbPath = kf?.getAttribute('Path');
    if (!glbPath) continue; // a module without a GLB reference is unusable
    const st = directChildren(mod, 'SolarTracking')[0] ?? null;
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
    });
  }
  return out;
}

function readNum(el: Element | null | undefined, attr: string): number | null {
  const raw = el?.getAttribute(attr);
  if (raw == null) return null;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : null;
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
];
const POWER_TOKENS: readonly (readonly [string, number])[] = [
  ['W', 1],
  ['KW', 1_000],
  ['MW', 1_000_000],
  ['GW', 1_000_000_000],
  ['TW', 1_000_000_000_000],
];
const IMPULSE_TOKENS: readonly (readonly [string, number])[] = [
  ['Ns', 1],
  ['KNs', 1_000],
  ['MNs', 1_000_000],
];

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
  const el = directChildren(parent, childTag)[0];
  if (!el) return 0;
  let total = 0;
  for (const [attr, scale] of tokens) {
    const n = readNum(el, attr);
    if (n != null) total += n * scale;
  }
  return total;
}

/** Sum of a child's energy tokens, in joules (KSA `EnergyReference`). */
function readEnergyJoules(parent: Element, childTag: string): number {
  return sumUnitChild(parent, childTag, ENERGY_TOKENS);
}
/** Sum of a child's power tokens, in watts (KSA `PowerReference`). */
function readPowerWatts(parent: Element, childTag: string): number {
  return sumUnitChild(parent, childTag, POWER_TOKENS);
}
/** Sum of a child's impulse tokens, in newton-seconds (KSA `ImpulseReference`). */
function readImpulseNs(parent: Element, childTag: string): number {
  return sumUnitChild(parent, childTag, IMPULSE_TOKENS);
}

/**
 * Reads a child `<Transform>` into a full {@link Transform} (identity when absent).
 * Exported for ICRP (`apps/icrp`), whose `<SubObject>` placements carry the same
 * `TransformReference` schema — including the partial-`<Scale>` warning in `readVec`.
 */
export function readTransform(parent: Element): Transform {
  const t = directChildren(parent, 'Transform')[0] ?? null;
  return {
    position: readVec(t, 'Position', 0),
    rotation: readVec(t, 'Rotation', 0) as EulerXYZ,
    scale: readVec(t, 'Scale', 1),
  };
}

/** Parses one `<SolarPanel>` element: its `<Produced W>` and orientation `<Transform>`. */
function parseSolarPanel(el: Element): SolarPanel {
  return { outputWatts: readPowerWatts(el, 'Produced'), transform: readTransform(el) };
}

/**
 * Parses one `<Tank Id><CylindricalTank|SphericalTank>…</Tank>`. The container `Id`
 * lives on the WRAPPING `<Tank>` (it is a `Components` entry id, addressable by
 * `<FeedsFrom Container>`); the geometry + `<LocationAsmb>` live on the shape element.
 */
function tankFromElement(wrapper: Element, shapeEl: Element, shape: TankShape): Tank {
  return {
    id: wrapper.getAttribute('Id') ?? '',
    locationAsmb: readVec3Attrs(directChildren(shapeEl, 'LocationAsmb')[0], { x: 0, y: 0, z: 0 }),
    shape,
    wallMaterialId: directChildren(shapeEl, 'Material')[0]?.getAttribute('Id') ?? '',
    lengthM: readNum(directChildren(shapeEl, 'Length')[0], 'M') ?? 0,
    outerRadiusM: readNum(directChildren(shapeEl, 'OuterRadius')[0], 'M') ?? 0,
    wallThicknessMm: readNum(directChildren(shapeEl, 'WallThickness')[0], 'Mm') ?? 0,
    // <RoleAffinity> — which consumer kind the tank feeds (KSA 2026.7.5); absent ⇒ Engine.
    roleAffinity: readRoleAffinity(directChildren(shapeEl, 'RoleAffinity')[0]),
  };
}

/** Parses every `<Tank>` child of a `<PartGameData>`/`<SubPartGameData>` element. */
function tanksFromElement(parent: Element): Tank[] {
  const out: Tank[] = [];
  for (const tankEl of directChildren(parent, 'Tank')) {
    const cylEl = directChildren(tankEl, 'CylindricalTank')[0];
    const sphEl = directChildren(tankEl, 'SphericalTank')[0];
    if (cylEl) out.push(tankFromElement(tankEl, cylEl, 'Cylindrical'));
    else if (sphEl) out.push(tankFromElement(tankEl, sphEl, 'Spherical'));
  }
  return out;
}

/**
 * Parses `<RoleAffinity>` text into the normalized {@link TankRoleAffinity} form.
 * KSA's XmlSerializer writes the `ConsumerRole` [Flags] enum as space-separated
 * tokens; absent (or unrecognized) ⇒ the schema default `Engine`.
 */
function readRoleAffinity(el: Element | undefined): TankRoleAffinity {
  const raw = el?.textContent?.trim();
  if (!raw) return 'Engine';
  const tokens = new Set(raw.split(/[\s,]+/));
  const engine = tokens.has('Engine');
  const thruster = tokens.has('Thruster');
  if (engine && thruster) return 'Engine Thruster';
  if (thruster) return 'Thruster';
  if (tokens.has('None')) return 'None';
  return 'Engine';
}

/**
 * Parses one `<Light>` element into the flat {@link PartLight} field set. Missing
 * children/attributes fall back to KSA's `LightModule.TemplateData` defaults
 * (Range/Intensity 1, white color, InnerAngle π/8, OuterAngle π/4, RayTracing false).
 * NOTE: the schema default COLOR is actually Gray (0.5,0.5,0.5) — flexo's white
 * default is kept deliberately; see scope/gamedata-modules.md. `<Transform><Scale>`
 * is parsed by KSA but ignored for lights, so it is pinned to (1,1,1) here and never
 * emitted. Identity (`id`/`ownerTemplateId`/`layerId`) is assigned by the caller
 * ({@link lightsFromElement}). The inverse of `buildLightElement`.
 */
function lightFromElement(el: Element): Omit<PartLight, 'id' | 'ownerTemplateId' | 'layerId'> {
  const type: LightType =
    directChildren(el, 'Type')[0]?.textContent?.trim() === 'Point' ? 'Point' : 'Spot';
  const colorEl = directChildren(el, 'Color')[0];
  const transform = readTransform(el);
  return {
    // `<Light Id>` — KSA's module id (`ModuleBase.TemplateDataBase.Id`). Core names every
    // light since 5348 and duplicate Components ids now log an Error, so it is preserved.
    ksaId: el.getAttribute('Id') || null,
    type,
    position: transform.position,
    rotation: transform.rotation,
    // KSA ignores light scale (LightModule reads only Position/Rotation) — pinned.
    scale: { x: 1, y: 1, z: 1 },
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
    disableInIva:
      directChildren(el, 'DisableInIva')[0]?.textContent?.trim().toLowerCase() === 'true',
  };
}

/**
 * Reads the `<Light>`s of an owner element (`<PartGameData>` or `<SubPartGameData>`)
 * into {@link PartLight}s, preserving DOCUMENT ORDER (KSA accumulates lights
 * additively; nothing orders them semantically, but stable order keeps round-trips
 * byte-identical).
 *
 * The editor document ids are REGENERATED here (`_light1`, `_light2`, … — renumbered again
 * by the outer callers over the merged part-level + SubPart-owned list). The authored
 * `<Light Id>` is kept SEPARATELY in {@link PartLight.ksaId} and re-emitted verbatim; it
 * became load-bearing in KSA 2026.8.22.5348, where duplicate Components ids log an Error
 * (see scope/gamedata-modules.md).
 *
 * `ownerTemplateId` is the frame the light is expressed in: `null` for a Part-level
 * owner, else the SubPart template id.
 */
export function lightsFromElement(owner: Element, ownerTemplateId: string | null): PartLight[] {
  return directChildren(owner, 'Light').map((el, i) => ({
    ...lightFromElement(el),
    id: `_light${i + 1}`,
    ownerTemplateId,
    // XML carries no layers: everything parsed lands on Default, exactly like the
    // placements it sits with — an import then re-homes the whole Part.
    layerId: DEFAULT_LAYER_ID,
  }));
}

/**
 * Reads the `<Light>`s of every top-level `<SubPartGameData Id>` in a GameData document
 * root, each tagged with its owning SubPart template id. Duplicate-Id blocks APPEND in
 * document order (KSA's `PartTemplate.ApplyGameData` accumulates list modules). Kept
 * separate from {@link parseGameDataElement} (which sees only one `<PartGameData>`)
 * because `<SubPartGameData>` is its SIBLING, not its child.
 */
export function subPartLightsFromRoot(root: Element): PartLight[] {
  const out: PartLight[] = [];
  for (const spEl of directChildren(root, 'SubPartGameData')) {
    const templateId = spEl.getAttribute('Id');
    if (!templateId) continue;
    out.push(...lightsFromElement(spEl, templateId));
  }
  return out;
}

/**
 * Parses a single <PartGameData> element into its editor tags, connector flags
 * (by id) and {@link PartGameData} block. The inverse of
 * {@link serializeGameDataXml}; missing children/attributes fall back to defaults.
 */
export function parseGameDataElement(gd: Element): ParsedGameData {
  const game = createEmptyGameData();
  game.displayName = gd.getAttribute('DisplayName') ?? '';

  const editorTags: string[] = [];
  for (const tag of directChildren(gd, 'EditorTag')) {
    const v = tag.getAttribute('Value');
    if (v && !editorTags.includes(v)) editorTags.push(v);
  }

  // <CustomMass> — KSA's CustomMassTemplate needs <Mass Kg> (> 0) and may also carry
  // <MassSpecificInertia> + transform offsets. flexo edits the Kg scalar; everything
  // else inside the modeled element is preserved verbatim (customMassExtras). A
  // CustomMass flexo can't model (no valid Mass) and any repeats beyond the first are
  // extra PartTemplate.InertMasses entries — kept whole via the unknown passthrough.
  const customMassEls = directChildren(gd, 'CustomMass');
  const mass = readNum(directChildren(customMassEls[0] ?? gd, 'Mass')[0], 'Kg');
  game.customMass = mass != null && mass > 0 ? mass : null;
  if (game.customMass != null && customMassEls[0]) {
    game.customMassExtras = childElements(customMassEls[0])
      .filter((el) => el.tagName !== 'Mass')
      .map(elementToRawNode);
  }
  const passthroughCustomMassEls = game.customMass != null ? customMassEls.slice(1) : customMassEls;

  // <Diameter M/> — a repeatable DistanceReference (KSA 2026.7). The first is the
  // editable size class; the rest (adapter prefabs list several) are preserved verbatim.
  const diameters = directChildren(gd, 'Diameter')
    .map((el) => readDistanceM(el))
    .filter((m): m is number => m != null);
  game.diameterM = diameters[0] ?? null;
  game.extraDiametersM = diameters.slice(1);
  // <Control/> — a bare command-capability marker (ControlTemplate has no fields).
  game.controllable = directChildren(gd, 'Control').length > 0;

  // Battery capacity is an EnergyReference (`J`); the model holds Wh.
  // Generator/Solar/Consumer rates are a PowerReference (`W`).
  for (const el of directChildren(gd, 'Battery'))
    game.batteries.push({ capacityWh: readEnergyJoules(el, 'MaximumCapacity') / 3600 });
  for (const el of directChildren(gd, 'Generator'))
    game.generators.push({ outputWatts: readPowerWatts(el, 'Produced') });
  for (const el of directChildren(gd, 'SolarPanel')) game.solarPanels.push(parseSolarPanel(el));
  // KSA has a single Part.LightSwitch slot, so flexo keeps ONE consumer per part:
  // prefer the first LightSwitch=true (the one KSA would actually wire up), else the
  // first. No shipped part has >1, so the >1 branch is purely defensive.
  const consumers = directChildren(gd, 'PowerConsumer').map((el) => ({
    consumedWatts: readPowerWatts(el, 'Consumed'),
    lightSwitch: el.getAttribute('LightSwitch')?.trim().toLowerCase() === 'true',
    lightIsActive: el.getAttribute('LightIsActive')?.trim().toLowerCase() === 'true',
  }));
  if (consumers.length > 1) {
    console.warn(
      `flexo import: <PartGameData Id="${gd.getAttribute('Id') ?? ''}"> has ${consumers.length} <PowerConsumer>; ` +
        `keeping one (KSA wires only a single Part.LightSwitch).`,
    );
  }
  game.powerConsumer = consumers.find((c) => c.lightSwitch) ?? consumers[0] ?? null;

  const connectorFlags = new Map<string, ConnectorFlag[]>();
  const connectorCapabilities = new Map<string, ConnectorCapability[]>();
  for (const conn of directChildren(gd, 'Connector')) {
    const connId = conn.getAttribute('Id');
    if (!connId) continue;
    const flags = parseConnectorFlags(directChildren(conn, 'Flags')[0]?.textContent);
    if (flags.length > 0) connectorFlags.set(connId, flags);
    const caps = parseConnectorCapabilities(directChildren(conn, 'Capabilities')[0]?.textContent);
    if (caps.length > 0) connectorCapabilities.set(connId, caps);
  }

  const dec = directChildren(gd, 'Decoupler')[0];
  if (dec)
    game.decoupler = {
      connectorId: dec.getAttribute('ConnectorId') ?? '',
      force: readNum(dec, 'Force') ?? 0,
    };
  const dp = directChildren(gd, 'DockingPort')[0];
  if (dp) {
    // <DockingPort><ConnectorId Value/><LatchingKineticEnergy J/><PushoffImpulse Ns/></DockingPort>.
    game.dockingPort = {
      connectorId: directChildren(dp, 'ConnectorId')[0]?.getAttribute('Value') ?? '',
      latchingKineticEnergyJ: readEnergyJoules(dp, 'LatchingKineticEnergy'),
      pushoffImpulseNs: readImpulseNs(dp, 'PushoffImpulse'),
    };
  }
  const eva = directChildren(gd, 'EVADoor')[0];
  if (eva) {
    game.evaDoor = {
      // `<EVADoor SeatId>` (KSA 5117) — the `<IVASeat Id>` this hatch is aligned to, and
      // `EVADoorTemplate`'s ONLY field. The element's presence is the hatch itself.
      seatId: eva.getAttribute('SeatId') || null,
    };
  }

  // Part-level `<Tank>`s — Core authors its prefab tank data here, and a part-level
  // tank id is what `<FeedsFrom Container>` addresses without a `SubPart=` scope.
  game.tanks = tanksFromElement(gd);

  // Engine modules: part-level rockets/combustors/nozzles (gas generators), solid-motor
  // hardware, controllers, and per-instance gimbal overlays.
  parseEngineModules(gd, game);
  for (const c of directChildren(gd, 'RocketEngineController'))
    game.rocketControllers.push(controllerFromElement(c, 'engine'));
  for (const c of directChildren(gd, 'RocketThrusterController'))
    game.rocketControllers.push(controllerFromElement(c, 'thruster'));
  game.gimbals = gimbalsFromGameData(gd);

  // <ConsumerFeedWiring> — how this Part satisfies a placed SubPart's <FeedsFrom Parent>.
  for (const w of directChildren(gd, 'ConsumerFeedWiring')) {
    game.consumerFeedWiring.push({
      consumerId: w.getAttribute('Id') ?? '',
      subPartInstanceId: w.getAttribute('SubPartId') || null,
      // KSA errors on a Parent="true" inside a wiring entry ("cannot itself defer to
      // Parent") — drop it here rather than round-trip a load error.
      feeds: feedsFromElement(w).filter((f) => f.kind !== 'parent'),
    });
  }

  // Preserve anything flexo doesn't model so import → export doesn't silently drop it.
  game.unknownAttrs = captureUnknownAttrs(gd, KNOWN_PART_GAMEDATA_ATTRS);
  game.unknownChildren = captureUnknownChildren(gd, KNOWN_PART_GAMEDATA_CHILDREN);
  game.unknownChildren.push(...passthroughCustomMassEls.map(elementToRawNode));

  return {
    editorTags,
    connectorFlags,
    connectorCapabilities,
    gameData: game,
    subPartGameData: [],
    // Part-level collision primitives, in the Part's own assembly frame.
    colliders: collidersFromElement(gd, null),
    // Part-level IVA seats, in document (= cycle) order.
    ivaSeats: ivaSeatsFromElement(gd),
    // Part-level cast lights, in the Part's own assembly frame (Core: CoreCommandA
    // headlights, CoreIVASpaceA interior light).
    lights: lightsFromElement(gd, null),
    animationModules: animationModulesFromGameData(gd),
    customReactions: [],
  };
}

const REACTION_CATEGORY_TOKENS: ReadonlySet<string> = new Set([
  'Bipropellant',
  'Hypergolic',
  'Monopropellant',
  'Solid',
  'Thermal',
]);

/**
 * Parses top-level `<FixedReaction>` (custom propellants) from an Assets document
 * root. flexo authors custom reactions exclusively in the fixed (1-D LUT) form —
 * a `<MixtureReaction>`'s 2-D table is a generated artifact, not an editing surface
 * — so top-level MixtureReaction/ThermalReaction elements are not imported.
 */
export function customReactionsFromRoot(root: Element): CustomReaction[] {
  const out: CustomReaction[] = [];
  for (const proc of directChildren(root, 'FixedReaction')) {
    const id = proc.getAttribute('Id');
    if (!id) continue;
    const name = directChildren(proc, 'Name')[0]?.getAttribute('Value')?.trim() || id;
    const rawCategory = proc.getAttribute('Category');
    // KSA's FixedReaction category fallback is Monopropellant (ResolveCategory).
    const category =
      rawCategory && REACTION_CATEGORY_TOKENS.has(rawCategory)
        ? (rawCategory as ReactionCategory)
        : 'Monopropellant';
    const reactants = directChildren(proc, 'Reactant')
      .map((r) => ({
        phaseId: r.getAttribute('Id') ?? '',
        massShare: readNum(r, 'MassShare') ?? 0,
      }))
      .filter((r) => r.phaseId);
    const lut = directChildren(proc, 'PressureCondition').map((c) => ({
      lnPressure: readNum(directChildren(c, 'LnPressure')[0], 'Value') ?? 0,
      temperatureK: readNum(directChildren(c, 'Temperature')[0], 'K') ?? 0,
      gamma: readNum(directChildren(c, 'Gamma')[0], 'Value') ?? 0,
      molarMassGPerMol: readNum(directChildren(c, 'MolarMass')[0], 'GPerMol') ?? 0,
    }));
    // Solid-propellant data — MANDATORY on a Category="Solid" reaction
    // (FixedReactionTemplate.Create throws without it), absent on every other category.
    const br = directChildren(proc, 'BurnRate')[0];
    out.push({
      id,
      name,
      category,
      reactants,
      lut,
      burnRate: br
        ? {
            coefficientMPerS: readNum(br, 'CoefficientMPerS') ?? 0,
            exponent: readNum(br, 'Exponent') ?? 0,
          }
        : null,
      minimumBurnPressurePa: readPressurePa(directChildren(proc, 'MinimumBurnPressure')[0]),
      maxStablePressurePa: readPressurePa(directChildren(proc, 'MaxStablePressure')[0]),
      exhaustCondensedFraction: readNum(
        directChildren(proc, 'ExhaustCondensedFraction')[0],
        'Value',
      ),
    });
  }
  return out;
}

/** Parses all top-level <SubPartGameData> elements from a parsed GameData document. */
export function subPartGameDataFromDoc(doc: Document): SubPartGameData[] {
  return subPartGameDataFromRoot(doc.documentElement as Element);
}

/**
 * Parses all top-level <SubPartGameData> elements from an Assets document root,
 * merging duplicate-Id entries the way KSA does. KSA registers each SubPartGameData
 * by Id and, on a repeat Id, applies the later entry onto the first
 * (PartGameDataReference.OnDataLoad → PartTemplate.ApplyGameData): list-valued modules
 * (tanks/solar panels/lights/engine modules) accumulate, so a naive last-wins would
 * silently drop the earlier entry's modules. (Core exercised this until 2026.7.5 by
 * declaring fuel-tank SubParts twice in PartGameData.xml; 2026.7.6 moved its tank data
 * to Part-level GameData, but the game's merge semantics are unchanged.) `<Light>`s and
 * `<Collider>`s are NOT part of the entry — they are first-class part entities gathered
 * by {@link subPartLightsFromRoot} / {@link subPartCollidersFromRoot}, where duplicate-Id
 * blocks append the same way.
 */
function subPartGameDataFromRoot(root: Element): SubPartGameData[] {
  const byId = new Map<string, SubPartGameData>();
  for (const spEl of directChildren(root, 'SubPartGameData')) {
    const subPartTemplateId = spEl.getAttribute('Id');
    if (!subPartTemplateId) continue;
    const spd = createSubPartGameData(subPartTemplateId);
    spd.tanks = tanksFromElement(spEl);
    spd.solarPanels = directChildren(spEl, 'SolarPanel').map(parseSolarPanel);
    // <Light> is NOT read here — lights are first-class part entities gathered by
    // subPartLightsFromRoot (each tagged with this template id as its owner).
    // Reusable thrust-chamber modules (rocket/combustor/nozzle) that travel with the mesh.
    parseEngineModules(spEl, spd);
    // Preserve unmodeled attrs (e.g. Core's `DisplayName`) + child elements verbatim.
    spd.unknownAttrs = captureUnknownAttrs(spEl, KNOWN_SUBPART_GAMEDATA_ATTRS);
    spd.unknownChildren = captureUnknownChildren(spEl, KNOWN_SUBPART_GAMEDATA_CHILDREN);
    const existing = byId.get(subPartTemplateId);
    if (existing) mergeSubPartGameDataInto(existing, spd);
    else byId.set(subPartTemplateId, spd);
  }
  return Array.from(byId.values()).filter((spd) => !isSubPartGameDataEmpty(spd));
}

/**
 * Applies a repeat-Id `<SubPartGameData>` onto the first entry seen for that Id,
 * mirroring KSA's `PartTemplate.ApplyGameData`: list-valued modules accumulate and
 * unmodeled children are preserved; the base entry's unmodeled attrs win (its
 * `DisplayName` identifies the template).
 */
function mergeSubPartGameDataInto(base: SubPartGameData, add: SubPartGameData): void {
  base.tanks.push(...add.tanks);
  base.solarPanels.push(...add.solarPanels);
  base.combustors.push(...add.combustors);
  base.nozzles.push(...add.nozzles);
  base.rockets.push(...add.rockets);
  base.solidMotors.push(...add.solidMotors);
  base.solidNozzles.push(...add.solidNozzles);
  base.solidGrainSegments.push(...add.solidGrainSegments);
  base.unknownChildren.push(...add.unknownChildren);
  for (const [k, v] of Object.entries(add.unknownAttrs)) base.unknownAttrs[k] ??= v;
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
  const doc = parserImpl.parseFromString(xmlText, 'application/xml') as Document;
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error(`partXmlParser: parse error parsing PartGameData '${partId}'`);
  }
  const gd = Array.from(doc.getElementsByTagName('PartGameData')).find(
    (g) => g.getAttribute('Id') === partId,
  );
  if (!gd) return null;
  const root = doc.documentElement as Element;
  const parsed = parseGameDataElement(gd);
  parsed.subPartGameData = subPartGameDataFromRoot(root);
  // SubPart-owned colliders are siblings of <PartGameData>, so they join the flat list here.
  parsed.colliders = [...parsed.colliders, ...subPartCollidersFromRoot(root)];
  // Same for SubPart-owned lights; `_lightN` ids are renumbered over the merged list in
  // document order (part-level first, then SubPartGameData blocks).
  parsed.lights = [...parsed.lights, ...subPartLightsFromRoot(root)];
  parsed.lights.forEach((l, i) => {
    l.id = `_light${i + 1}`;
  });
  parsed.customReactions = customReactionsFromRoot(root);
  return parsed;
}

export function directChildren(parent: Element, tag: string): Element[] {
  const out: Element[] = [];
  for (const node of Array.from(parent.childNodes)) {
    if (node.nodeType === 1 && (node as Element).tagName === tag) out.push(node as Element);
  }
  return out;
}

/** All direct child *elements* of `parent` (any tag), in document order. */
function childElements(parent: Element): Element[] {
  const out: Element[] = [];
  for (const node of Array.from(parent.childNodes)) {
    if (node.nodeType === 1) out.push(node as Element);
  }
  return out;
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
  'SolidMotor',
  'SolidMotorNozzle',
  'SolidGrainSegment',
  'ConsumerFeedWiring',
  'Tank',
  'SubPart',
  'Collider',
  'IVASeat',
  'Light',
]);
/**
 * `<SubPartGameData>` child tags flexo models. Everything else is passthrough.
 *
 * NOTE: `'IVASeat'` is deliberately ABSENT. `<IVASeat>` is schema-legal here, but flexo models
 * Part-level seats ONLY (plans/IVA_PLAN.md §6), so a SubPart-level seat keeps riding this
 * passthrough verbatim — round-tripped, just not editable. Do not "fix" this by adding it.
 */
const KNOWN_SUBPART_GAMEDATA_CHILDREN: ReadonlySet<string> = new Set([
  'Tank',
  'SolarPanel',
  'Light',
  'Collider',
  'Rocket',
  'Combustor',
  'DeLavalNozzle',
  'SolidMotor',
  'SolidMotorNozzle',
  'SolidGrainSegment',
]);
/** `<PartGameData>` attributes flexo models (`DisplayName` is read; `Id` keys the entry). */
const KNOWN_PART_GAMEDATA_ATTRS: ReadonlySet<string> = new Set(['Id', 'DisplayName']);
/** `<SubPartGameData>` attributes flexo models (only `Id`; Core also authors an unmodeled `DisplayName`). */
const KNOWN_SUBPART_GAMEDATA_ATTRS: ReadonlySet<string> = new Set(['Id']);

/** Recursively snapshots an element into a JSON {@link RawXmlNode} (attrs + child elements + leaf text). */
function elementToRawNode(el: Element): RawXmlNode {
  const attrs: Record<string, string> = {};
  for (const attr of Array.from(el.attributes)) attrs[attr.name] = attr.value;
  const kids = childElements(el);
  const node: RawXmlNode = { tag: el.tagName, attrs, children: kids.map(elementToRawNode) };
  if (kids.length === 0) {
    const text = el.textContent?.trim();
    if (text) node.text = text;
  }
  return node;
}

/** Captures every direct child element whose tag is NOT in `known` as a verbatim {@link RawXmlNode}. */
export function captureUnknownChildren(parent: Element, known: ReadonlySet<string>): RawXmlNode[] {
  return childElements(parent)
    .filter((el) => !known.has(el.tagName))
    .map(elementToRawNode);
}

/**
 * Tags whose `Id` attribute is a KSA `Part.ConnectorReference` — the only way raw
 * passthrough XML points at a connector: `<ConnectorRef>` (inside `<Aligned>` /
 * `<SymmetryGroup>`) and `<Sibling>` (inside `<Connector>`). Modeled connector
 * bindings (Decoupler/DockingPort/EVADoor) never land in `unknownChildren`.
 */
const CONNECTOR_REF_TAGS: ReadonlySet<string> = new Set(['ConnectorRef', 'Sibling']);

/**
 * Returns a copy of preserved-passthrough XML with every connector reference
 * (`<ConnectorRef Id>` / `<Sibling Id>`, at any depth) rewritten through
 * `connectorIdMap` — imports regenerate `_connectorN` ids, so refs kept verbatim
 * would point at the wrong (or a colliding pre-existing) connector. Ids without a
 * mapping are left untouched: the raw structure can't be safely pruned, and a
 * whole-Part import maps every connector the refs can legitimately name.
 */
export function remapRawConnectorRefs(
  nodes: readonly RawXmlNode[],
  connectorIdMap: ReadonlyMap<string, string>,
): RawXmlNode[] {
  return nodes.map((node) => {
    const attrs = { ...node.attrs };
    if (CONNECTOR_REF_TAGS.has(node.tag) && attrs.Id) {
      const mapped = connectorIdMap.get(attrs.Id);
      if (mapped) attrs.Id = mapped;
    }
    const out: RawXmlNode = {
      tag: node.tag,
      attrs,
      children: remapRawConnectorRefs(node.children ?? [], connectorIdMap),
    };
    if (node.text != null) out.text = node.text;
    return out;
  });
}

/** Captures every attribute whose name is NOT in `known` as a verbatim name→value entry. */
export function captureUnknownAttrs(
  el: Element,
  known: ReadonlySet<string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const attr of Array.from(el.attributes)) {
    if (!known.has(attr.name)) out[attr.name] = attr.value;
  }
  return out;
}

function readVec(transform: Element | null, tag: string, def: number): Vec3 {
  const v: Vec3 = { x: def, y: def, z: def };
  if (!transform) return v;
  const el = directChildren(transform, tag)[0];
  if (!el) return v;
  const read = (attr: string) => {
    const raw = el.getAttribute(attr);
    return raw === null ? def : Number.parseFloat(raw);
  };
  if (tag === 'Scale') {
    // KSA's Vector3Reference defaults a MISSING attribute to 0 (not 1), so a partial
    // <Scale> collapses the mesh in-game. Keep the lenient 1 (what the author meant) but
    // don't hide it: such a file was written by a flexo build older than 2026-08-23.
    const missing = ['X', 'Y', 'Z'].filter((a) => !el.hasAttribute(a));
    if (missing.length > 0) {
      const owner = transform.parentElement;
      console.warn(
        `flexo import: <${owner?.tagName ?? '?'} Id="${owner?.getAttribute('Id') ?? ''}"> has a ` +
          `<Scale> missing ${missing.join('/')} — KSA reads a missing Scale axis as 0 and the ` +
          `mesh collapses in-game; this file was probably written by an older flexo — re-export it.`,
      );
    }
  }
  return { x: read('X'), y: read('Y'), z: read('Z') };
}

// --- Engine module parsing (inverse of partXmlSerializer's engine builders) ---

/** Reads X/Y/Z attributes directly off an element (engine vectors, unlike <Transform> children). */
function readVec3Attrs(el: Element | null | undefined, def: Vec3): Vec3 {
  if (!el) return { ...def };
  return {
    x: readNum(el, 'X') ?? def.x,
    y: readNum(el, 'Y') ?? def.y,
    z: readNum(el, 'Z') ?? def.z,
  };
}

/** Sums a `PressureReference`'s unit attributes into Pa; null when none are set. */
function readPressurePa(el: Element | null | undefined): number | null {
  if (!el) return null;
  const parts: [string, number][] = [
    ['Pa', 1],
    ['KPa', 1e3],
    ['MPa', 1e6],
    ['MBar', 100],
    ['Bar', 1e5],
    ['Atm', 101325],
  ];
  let value: number | null = null;
  for (const [attr, scale] of parts) {
    const n = readNum(el, attr);
    if (n != null) value = (value ?? 0) + n * scale;
  }
  return value;
}

/**
 * Sums a `DistanceReference`'s unit attributes into meters; null when none are set.
 * (KSA treats all-NaN as "unset"; a static object's GroundOffset/SurfaceHeight/
 * FootprintRadius rely on that — exported for ICRP's `staticCatalog`.)
 */
export function readDistanceM(el: Element | null | undefined): number | null {
  if (!el) return null;
  const parts: [string, number][] = [
    ['Mm', 0.001],
    ['Cm', 0.01],
    ['M', 1],
    ['Km', 1000],
  ];
  let value: number | null = null;
  for (const [attr, scale] of parts) {
    const n = readNum(el, attr);
    if (n != null) value = (value ?? 0) + n * scale;
  }
  return value;
}

/** Reads a `TimeSpanReference` (Seconds/Minutes/Hours) into seconds; null when absent. */
function readSeconds(el: Element | null | undefined): number | null {
  if (!el) return null;
  const parts: [string, number][] = [
    ['Seconds', 1],
    ['Minutes', 60],
    ['Hours', 3600],
  ];
  let value: number | null = null;
  for (const [attr, scale] of parts) {
    const n = readNum(el, attr);
    if (n != null) value = (value ?? 0) + n * scale;
  }
  return value;
}

/** Reads a `RadianReference` as degrees (Radians takes priority over Degrees, like KSA); 0 when absent. */
function readDegrees(el: Element | null | undefined): number {
  const radians = readNum(el, 'Radians');
  if (radians != null) return (radians * 180) / Math.PI;
  return readNum(el, 'Degrees') ?? 0;
}

/** Reads a `BoolReference` Value attribute; null when absent. */
function readBoolValue(el: Element | null | undefined): boolean | null {
  const raw = el?.getAttribute('Value');
  if (raw == null) return null;
  return raw.trim().toLowerCase() === 'true';
}

/**
 * Parses one `<FeedsFrom>` element (KSA `FeedsFromReference`). Exactly one of
 * Container / Connector / Parent must be set; `SubPart` is only meaningful with
 * `Container`. Returns null for a malformed element — KSA logs an Error for the same
 * shape ("must name exactly one of Container, Connector, or Parent"), so re-emitting it
 * would just round-trip a load error.
 */
function feedFromElement(el: Element): FeedSource | null {
  const container = el.getAttribute('Container')?.trim() ?? '';
  const connector = el.getAttribute('Connector')?.trim() ?? '';
  const parent = (el.getAttribute('Parent') ?? '').trim().toLowerCase() === 'true';
  const set = (container ? 1 : 0) + (connector ? 1 : 0) + (parent ? 1 : 0);
  if (set !== 1) return null;
  if (container) {
    const subPart = el.getAttribute('SubPart')?.trim() ?? '';
    return { kind: 'container', containerId: container, subPartInstanceId: subPart || null };
  }
  if (connector) return { kind: 'connector', connectorId: connector };
  return { kind: 'parent' };
}

/** All `<FeedsFrom>` children of an element, malformed entries dropped. */
function feedsFromElement(el: Element): FeedSource[] {
  return directChildren(el, 'FeedsFrom')
    .map(feedFromElement)
    .filter((f): f is FeedSource => f != null);
}

/**
 * One `<Nozzle>` of a `<Rocket>` — a {@link refFromElement} plus KSA 5348's
 * `RocketNozzleReference.AreaRatioMultiplier`. A missing or non-positive value is 1, exactly
 * as `RocketNozzleReference.OnDataLoad` resolves it.
 */
function nozzleRefFromElement(el: Element): RocketNozzleRef {
  const raw = Number(el.getAttribute('AreaRatioMultiplier'));
  return {
    ...refFromElement(el),
    areaRatioMultiplier: Number.isFinite(raw) && raw > 0 ? raw : 1,
  };
}

/** Parses a `<Core>`/`<Nozzle>`/`<RocketReference>` into a {@link SubPartIdRef}. */
function refFromElement(el: Element | null | undefined): SubPartIdRef {
  return {
    id: el?.getAttribute('Id') ?? '',
    subPartInstanceId: el?.getAttribute('SubPartId') || null,
  };
}

/** Parses one `<Combustor>` element. Missing fields fall back to CombustorTemplate defaults. */
function combustorFromElement(el: Element): Combustor {
  const reactionEl = directChildren(el, 'Reaction')[0];
  const ratioRaw = reactionEl
    ? directChildren(reactionEl, 'MixtureRatio')[0]?.textContent?.trim()
    : undefined;
  const ratio = ratioRaw ? Number.parseFloat(ratioRaw) : Number.NaN;
  return {
    id: el.getAttribute('Id') ?? '',
    reactionId: reactionEl?.getAttribute('Id') ?? '',
    mixtureRatio: Number.isFinite(ratio) ? ratio : null,
    maxPressurePa: readPressurePa(directChildren(el, 'MaxPressure')[0]) ?? 5_000_000,
    thermalEfficiency: readNum(directChildren(el, 'ThermalEfficiency')[0], 'Value') ?? 1,
    minimumThrottle: readNum(directChildren(el, 'MinimumThrottle')[0], 'Value') ?? 1,
    minimumPulseTimeS: readSeconds(directChildren(el, 'MinimumPulseTime')[0]),
    feeds: feedsFromElement(el),
    plumbing: readPlumbing(directChildren(el, 'Plumbing')[0]),
  };
}

/** `<Plumbing>` body — `Service` for RCS, else KSA's `Bulk` schema default. */
function readPlumbing(el: Element | null | undefined): PlumbingClass {
  return el?.textContent?.trim() === 'Service' ? 'Service' : 'Bulk';
}

/**
 * The fields a `<DeLavalNozzle>` and a `<SolidMotorNozzle>` share — everything on
 * `RocketNozzleTemplate` plus the exit geometry/efficiencies both flavors declare.
 * The two differ ONLY in `<AreaRatio>` (solid nozzles have none: KSA sizes the throat
 * as `exitArea / 12` in `SolidMotorNozzleTemplate.Create`).
 */
function commonNozzleFields(el: Element): Omit<SolidMotorNozzle, 'id'> {
  const fxLoc = directChildren(el, 'FxExhaustLocation')[0];
  const fxDir = directChildren(el, 'FxExhaustDirection')[0];
  const soundEl = directChildren(el, 'SoundEvent')[0];
  return {
    exitDiameterM: readDistanceM(directChildren(el, 'ExitDiameter')[0]) ?? 1,
    fxExitDiameterM: readDistanceM(directChildren(el, 'FxExitDiameter')[0]),
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
    reactionPlumes: directChildren(el, 'ReactionPlume').map((p) => ({
      reactionId: p.getAttribute('Reaction') || null,
      isDefault: p.getAttribute('Default') === 'true',
      volumetricExhaustId: directChildren(p, 'VolumetricExhaust')[0]?.getAttribute('Id') ?? null,
      plumeTrailId: directChildren(p, 'PlumeTrail')[0]?.getAttribute('Id') ?? null,
    })),
    exhaustLight: readBoolValue(directChildren(el, 'ExhaustLight')[0]) ?? true,
    sound: soundEl
      ? {
          action: (soundEl.getAttribute('Action') as RocketSoundAction) || 'On',
          soundId: soundEl.getAttribute('SoundId') ?? '',
        }
      : null,
  };
}

/** Parses one `<DeLavalNozzle>` element. Missing fields fall back to nozzle template defaults. */
function nozzleFromElement(el: Element): DeLavalNozzle {
  return {
    id: el.getAttribute('Id') ?? '',
    ...commonNozzleFields(el),
    // KSA's AreaRatio default is NaN (a broken engine); preserve that so validation can flag it.
    areaRatio: readNum(directChildren(el, 'AreaRatio')[0], 'Value') ?? Number.NaN,
  };
}

/** Parses one `<SolidMotorNozzle>` element (the DeLaval schema minus `<AreaRatio>`). */
function solidNozzleFromElement(el: Element): SolidMotorNozzle {
  return { id: el.getAttribute('Id') ?? '', ...commonNozzleFields(el) };
}

/** Parses one `<SolidMotor>` element. Defaults mirror `SolidMotorTemplate.cs`. */
function solidMotorFromElement(el: Element): SolidMotor {
  return {
    id: el.getAttribute('Id') ?? '',
    reactionId: directChildren(el, 'Reaction')[0]?.getAttribute('Id') ?? '',
    thermalEfficiency: readNum(directChildren(el, 'ThermalEfficiency')[0], 'Value') ?? 1,
    defaultPressurePa: readPressurePa(directChildren(el, 'DefaultPressure')[0]) ?? 7_000_000,
    // '' ⇒ KSA takes GrainGeometryLibrary.Default.
    grainGeometryId: directChildren(el, 'Grain')[0]?.getAttribute('Id') ?? '',
    feeds: feedsFromElement(el),
  };
}

/**
 * Parses one `<SolidGrainSegment Id><Grain>…</Grain></SolidGrainSegment>`. The inner
 * `<Grain>` is a `SolidGrainSegmentTemplate` (an `AsmbVolumetricMassTemplate`): material
 * + hollow-cylinder dimensions + the assembly-frame mass offset.
 */
function solidGrainSegmentFromElement(el: Element): SolidGrainSegment {
  const g = directChildren(el, 'Grain')[0];
  return {
    id: el.getAttribute('Id') ?? '',
    wallMaterialId: g ? (directChildren(g, 'Material')[0]?.getAttribute('Id') ?? '') : '',
    outerRadiusM: (g && readDistanceM(directChildren(g, 'OuterRadius')[0])) || 0,
    // WallThickness is a DistanceReference (authored as Mm); the model holds millimeters.
    wallThicknessMm: g ? (readDistanceM(directChildren(g, 'WallThickness')[0]) ?? 0) * 1000 : 0,
    lengthM: (g && readDistanceM(directChildren(g, 'Length')[0])) || 0,
    locationAsmb: g
      ? readVec3Attrs(directChildren(g, 'LocationAsmb')[0], { x: 0, y: 0, z: 0 })
      : { x: 0, y: 0, z: 0 },
  };
}

/** Parses one `<Rocket>` element (core + nozzle references). */
function rocketFromElement(el: Element): Rocket {
  return {
    id: el.getAttribute('Id') ?? '',
    core: refFromElement(directChildren(el, 'Core')[0]),
    nozzles: directChildren(el, 'Nozzle').map(nozzleRefFromElement),
  };
}

/** Parses a `<RocketEngineController>`/`<RocketThrusterController>` element. */
function controllerFromElement(el: Element, kind: RocketControllerKind): RocketController {
  const controlMapEl = directChildren(el, 'ControlMap')[0];
  const csv = controlMapEl?.getAttribute('CSV');
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
  };
}

/** Parses the `<Gimbal>` overlays from a GameData element's `<SubPart Id>` children. */
function gimbalsFromGameData(gd: Element): Gimbal[] {
  const out: Gimbal[] = [];
  for (const sub of directChildren(gd, 'SubPart')) {
    const instanceId = sub.getAttribute('Id');
    if (!instanceId) continue;
    const gel = directChildren(sub, 'Gimbal')[0];
    if (!gel) continue;
    out.push({
      subPartInstanceId: instanceId,
      maxAngleYDeg: readDegrees(directChildren(gel, 'MaxAngleY')[0]),
      maxAngleZDeg: readDegrees(directChildren(gel, 'MaxAngleZ')[0]),
      constrainToCircle: readBoolValue(directChildren(gel, 'ConstrainToCircle')[0]) ?? true,
    });
  }
  return out;
}

/**
 * Parses all engine modules of a `<PartGameData>`/`<SubPartGameData>` element into
 * `target` — the liquid trio (rocket/combustor/DeLaval nozzle) and the solid trio
 * (solid motor / solid nozzle / grain segment). Both documents carry both families.
 */
function parseEngineModules(
  el: Element,
  target: {
    combustors: Combustor[];
    nozzles: DeLavalNozzle[];
    rockets: Rocket[];
    solidMotors: SolidMotor[];
    solidNozzles: SolidMotorNozzle[];
    solidGrainSegments: SolidGrainSegment[];
  },
): void {
  for (const r of directChildren(el, 'Rocket')) target.rockets.push(rocketFromElement(r));
  for (const c of directChildren(el, 'Combustor')) target.combustors.push(combustorFromElement(c));
  for (const n of directChildren(el, 'DeLavalNozzle')) target.nozzles.push(nozzleFromElement(n));
  for (const m of directChildren(el, 'SolidMotor'))
    target.solidMotors.push(solidMotorFromElement(m));
  for (const n of directChildren(el, 'SolidMotorNozzle'))
    target.solidNozzles.push(solidNozzleFromElement(n));
  for (const s of directChildren(el, 'SolidGrainSegment'))
    target.solidGrainSegments.push(solidGrainSegmentFromElement(s));
}
