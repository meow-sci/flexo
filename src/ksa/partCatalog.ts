/**
 * Loads the KSA "Core" Part catalog at runtime by fetching and parsing the same
 * Core *Assets.xml files as the SubPart catalog, but extracting whole <Part>
 * definitions (their SubPart instances + transforms + editor tags) instead of
 * individual SubPart templates. Used by the "+ Part" importer to drop a complete
 * pre-assembled Part into the current project.
 *
 * Uses the browser DOMParser — no third-party XML lib, no build step.
 */

import { ASSET_FILES, fetchXmlFile, gameDataSibling } from './catalog';
import {
  collidersFromElement,
  connectorsFromPartElement,
  crashToleranceFromPartElement,
  directChildren,
  ivaSeatsFromElement,
  parseGameDataElement,
  placementsFromPartElement,
  subPartCollidersFromRoot,
  subPartGameDataFromDoc,
  subPartLightsFromRoot,
} from './partXmlParser';
import type {
  Battery,
  CatalogAnimationModule,
  Combustor,
  Connector,
  ConnectorCapability,
  ConnectorFlag,
  ConsumerFeedWiring,
  Decoupler,
  DeLavalNozzle,
  DockingPort,
  EvaDoor,
  Generator,
  Gimbal,
  IvaSeat,
  PartCollider,
  PartLight,
  PowerConsumer,
  RawXmlNode,
  Rocket,
  RocketController,
  SolarPanel,
  SolidGrainSegment,
  SolidMotor,
  SolidMotorNozzle,
  SubPartGameData,
  SubPartPlacement,
  Tank,
} from './types';

export interface CatalogPart {
  /** Part id as declared in the Assets XML, e.g. "CoreFuelTankA_Prefab_LF1W1HA". */
  id: string;
  /** Editor tags from <EditorTag Value="..."/> (e.g. "Fuel Tanks"), in order. */
  editorTags: string[];
  /** The SubPart instances composing this Part, with their relative transforms. */
  placements: SubPartPlacement[];
  /** The connector attachment points of this Part, with their relative transforms. */
  connectors: Connector[];
  /**
   * The Part's collision volume, gathered from ALL of its authoring sites: the geometry
   * `<Part><Collider>` (which flexo used to drop — gap E), the `<PartGameData><Collider>`,
   * and every `<SubPartGameData><Collider>` for a template this Part places. Part-level
   * shapes carry `ownerTemplateId: null`; SubPart-owned ones name their template.
   */
  colliders: PartCollider[];
  /**
   * The Part's IVA camera vantage points, gathered from BOTH Part-level authoring sites —
   * the geometry `<Part><IVASeat>` first, then the `<PartGameData><IVASeat>`s (KSA merges
   * `Components` additively, no dedupe) — with `_seatN` re-numbered over the merged list.
   * SubPart-level seats are deliberately not gathered (plans/IVA_PLAN.md §6).
   */
  ivaSeats: IvaSeat[];
  /**
   * The Part's cast lights, gathered from both GameData authoring sites: the
   * `<PartGameData><Light>`s (`ownerTemplateId: null`) and every
   * `<SubPartGameData><Light>` for a template this Part places (owner = that template
   * id), with `_lightN` re-numbered over the merged list.
   */
  lights: PartLight[];
  /** KeyframeAnimationModules (from GameData), decoded + imported alongside the Part. */
  animationModules: CatalogAnimationModule[];
  /** Connector-bound coupling game-data (from GameData); connectorIds are in the Part's original id space. */
  decoupler: Decoupler | null;
  dockingPort: DockingPort | null;
  evaDoor: EvaDoor | null;
  /** Part diameter in meters (<Diameter M/>, VAB size-class filter), or null. */
  diameterM: number | null;
  /** Extra `<Diameter M/>` size classes beyond {@link diameterM} (adapter prefabs), preserved for round-trip. */
  extraDiametersM: number[];
  /** Geometry `<Part CrashTolerance>` (Pa), or null when the game derives it (KSA 2026.9.7.5402). */
  crashTolerancePa: number | null;
  /** Command-capability marker (<Control/>): the part can pilot a vehicle. */
  controllable: boolean;
  /** Part-level `<CustomMass><Mass Kg>` override, or null (the part masses from its tanks/inert masses). */
  customMass: number | null;
  /** Unmodeled children of that `<CustomMass>` (inertia, offsets), preserved verbatim. */
  customMassExtras: RawXmlNode[];
  /** Unmodeled `<PartGameData>` attrs + child elements, preserved verbatim for round-trip. */
  unknownAttrs: Record<string, string>;
  unknownChildren: RawXmlNode[];
  /** Part-level power modules (from GameData), carried into the editor on import. */
  batteries: Battery[];
  generators: Generator[];
  solarPanels: SolarPanel[];
  /** The part's single power consumer / light switch, or null (KSA has one switch slot). */
  powerConsumer: PowerConsumer | null;
  /** Per-SubPart-template data (tanks / solar panels / engine modules) for the SubParts this Part places. */
  subPartGameData: SubPartGameData[];
  /** Part-level engine modules (controllers/rockets/combustors/nozzles/gimbals); instance refs in original id space. */
  rocketControllers: RocketController[];
  rockets: Rocket[];
  combustors: Combustor[];
  nozzles: DeLavalNozzle[];
  gimbals: Gimbal[];
  /** Part-level `<Tank>`s (where Core authors its prefab tank data since KSA 2026.7.6). */
  tanks: Tank[];
  /** Part-level solid-motor hardware (SRB cases / nozzles / grain segments). */
  solidMotors: SolidMotor[];
  solidNozzles: SolidMotorNozzle[];
  solidGrainSegments: SolidGrainSegment[];
  /** `<ConsumerFeedWiring>`; SubPart + connector refs in the Part's ORIGINAL id space. */
  consumerFeedWiring: ConsumerFeedWiring[];
  /** Originating XML file (for debugging / grouping). */
  sourceFile: string;
}

export function parsePartsFile(doc: Document, sourceFile: string, out: CatalogPart[]): void {
  for (const part of Array.from(doc.getElementsByTagName('Part'))) {
    const id = part.getAttribute('Id');
    if (!id) continue;
    const editorTags = directChildren(part, 'EditorTag')
      .map((t) => t.getAttribute('Value'))
      .filter((v): v is string => !!v);
    const placements = placementsFromPartElement(part);
    if (placements.length === 0) continue; // nothing renderable/importable
    const connectors = connectorsFromPartElement(part);
    out.push({
      id,
      editorTags,
      placements,
      connectors,
      // Geometry `<Part><Collider>` — equivalent to authoring it on <PartGameData>
      // (PartTemplate.ApplyGameData merges Components additively), so it is normalised
      // into the same flat list and re-emitted into the GameData document on export.
      colliders: collidersFromElement(part, null),
      // Geometry `<Part><IVASeat>` — equivalent to authoring it on <PartGameData> (same
      // additive Components merge), so it joins the same list and is re-emitted into the
      // GameData document on export.
      ivaSeats: ivaSeatsFromElement(part),
      // Lights come exclusively from the GameData docs (mergeGameData) — Core authors no
      // geometry-level <Light>.
      lights: [],
      animationModules: [],
      decoupler: null,
      dockingPort: null,
      evaDoor: null,
      diameterM: null,
      extraDiametersM: [],
      // A geometry-<Part> root attribute (never merged from GameData), read right here.
      crashTolerancePa: crashToleranceFromPartElement(part),
      controllable: false,
      customMass: null,
      customMassExtras: [],
      unknownAttrs: {},
      unknownChildren: [],
      batteries: [],
      generators: [],
      solarPanels: [],
      powerConsumer: null,
      subPartGameData: [],
      rocketControllers: [],
      rockets: [],
      combustors: [],
      nozzles: [],
      gimbals: [],
      tanks: [],
      solidMotors: [],
      solidNozzles: [],
      solidGrainSegments: [],
      consumerFeedWiring: [],
      sourceFile,
    });
  }
}

/**
 * Game-data carried in the sibling *GameData.xml files: editor tags and connector
 * flags, both keyed by Part id. In KSA's Core data these live on <PartGameData>,
 * NOT on the geometry <Part> — so without merging them the importer drops both
 * the editor tags and the connector <Flags> (e.g. ToSurface on solar panels).
 */
export interface PartGameData {
  editorTags: string[];
  /** connector id -> its flags (only connectors carrying <Flags> are recorded). */
  connectorFlags: Map<string, ConnectorFlag[]>;
  /** connector id -> its capabilities (only connectors carrying <Capabilities> are recorded). */
  connectorCapabilities: Map<string, ConnectorCapability[]>;
  /** KeyframeAnimationModules declared on this <PartGameData>. */
  animationModules: CatalogAnimationModule[];
  /** `<PartGameData><Collider>` shapes (part-level, `ownerTemplateId: null`). */
  colliders: PartCollider[];
  /** `<PartGameData><IVASeat>` camera vantage points, in document (= cycle) order. */
  ivaSeats: IvaSeat[];
  /** `<PartGameData><Light>`s (part-level, `ownerTemplateId: null`). */
  lights: PartLight[];
  /**
   * `<PartGameData><SubPart Id InstanceOf><Transform>` — placements the GameData ADDS to the
   * geometry template. `PartTemplate.ApplyOrAddSubPartInstance` appends an entry whose `Id`
   * matches no geometry instance (a matched one only overlays Transform / Gimbal / SolarTracker,
   * which flexo does not model). Core's parachute bay (KSA 2026.9.7.5402) gets its two packed
   * chutes ONLY this way; the fuel port has authored its port SubPart like this since 5026.
   */
  subPartPlacements: SubPartPlacement[];
  /** Connector-bound coupling game-data, so built-in part imports carry them in. */
  decoupler: Decoupler | null;
  dockingPort: DockingPort | null;
  evaDoor: EvaDoor | null;
  /** Part diameter (<Diameter M/>) and command marker (<Control/>) declared on this <PartGameData>. */
  diameterM: number | null;
  /** Extra `<Diameter M/>` size classes beyond {@link diameterM} (adapter prefabs), preserved for round-trip. */
  extraDiametersM: number[];
  controllable: boolean;
  /** Part-level `<CustomMass>` mass override (Kg) + its preserved unmodeled children. */
  customMass: number | null;
  customMassExtras: RawXmlNode[];
  /** Unmodeled `<PartGameData>` attrs + child elements preserved from this entry. */
  unknownAttrs: Record<string, string>;
  unknownChildren: RawXmlNode[];
  /** Part-level power modules declared on this <PartGameData>. */
  batteries: Battery[];
  generators: Generator[];
  solarPanels: SolarPanel[];
  /** The part's single power consumer / light switch, or null (KSA has one switch slot). */
  powerConsumer: PowerConsumer | null;
  /** Part-level engine modules declared on this <PartGameData>. */
  rocketControllers: RocketController[];
  rockets: Rocket[];
  combustors: Combustor[];
  nozzles: DeLavalNozzle[];
  gimbals: Gimbal[];
  /** Part-level tanks, solid-motor hardware and consumer feed wiring declared here. */
  tanks: Tank[];
  solidMotors: SolidMotor[];
  solidNozzles: SolidMotorNozzle[];
  solidGrainSegments: SolidGrainSegment[];
  consumerFeedWiring: ConsumerFeedWiring[];
}

/** Parsed GameData for a whole file: per-Part data + per-SubPart-template data (keyed by template id). */
interface ParsedGameDataFile {
  parts: Map<string, PartGameData>;
  subParts: Map<string, SubPartGameData>;
  /** `<SubPartGameData><Collider>` shapes, keyed by the owning SubPart template id. */
  subPartColliders: Map<string, PartCollider[]>;
  /** `<SubPartGameData><Light>`s, keyed by the owning SubPart template id. */
  subPartLights: Map<string, PartLight[]>;
}

/** GameData sibling of each catalog asset file (e.g. CoreElectricalAAssets.xml -> CoreElectricalAGameData.xml). Not every asset file has one. */
const GAMEDATA_FILES = ASSET_FILES.map(gameDataSibling);

/**
 * Parses a GameData document: `<PartGameData>` entries (editor tags, connector
 * flags, coupling bindings, power modules) keyed by Part id into `out.parts`, and
 * all top-level `<SubPartGameData>` entries (tanks / solar panels) keyed by SubPart
 * template id into `out.subParts`.
 */
export function parseGameDataFile(doc: Document, out: ParsedGameDataFile): void {
  for (const gd of Array.from(doc.getElementsByTagName('PartGameData'))) {
    const id = gd.getAttribute('Id');
    if (!id) continue;
    const parsed = parseGameDataElement(gd);
    const entry: PartGameData = out.parts.get(id) ?? {
      editorTags: [],
      connectorFlags: new Map(),
      connectorCapabilities: new Map(),
      animationModules: [],
      colliders: [],
      ivaSeats: [],
      lights: [],
      subPartPlacements: [],
      decoupler: null,
      dockingPort: null,
      evaDoor: null,
      diameterM: null,
      extraDiametersM: [],
      controllable: false,
      customMass: null,
      customMassExtras: [],
      unknownAttrs: {},
      unknownChildren: [],
      batteries: [],
      generators: [],
      solarPanels: [],
      powerConsumer: null,
      rocketControllers: [],
      rockets: [],
      combustors: [],
      nozzles: [],
      gimbals: [],
      tanks: [],
      solidMotors: [],
      solidNozzles: [],
      solidGrainSegments: [],
      consumerFeedWiring: [],
    };
    for (const tag of parsed.editorTags) {
      if (!entry.editorTags.includes(tag)) entry.editorTags.push(tag);
    }
    for (const [connId, flags] of parsed.connectorFlags) entry.connectorFlags.set(connId, flags);
    for (const [connId, caps] of parsed.connectorCapabilities)
      entry.connectorCapabilities.set(connId, caps);
    entry.animationModules.push(...parsed.animationModules);
    entry.colliders.push(...parsed.colliders);
    entry.ivaSeats.push(...parsed.ivaSeats);
    // Duplicate-Id <PartGameData> entries merge additively in KSA — lights accumulate.
    entry.lights.push(...parsed.lights);
    // Only children carrying InstanceOf are placements; the `<SubPart Id><Gimbal>` overlays
    // Core authors on engines have none and are read by gimbalsFromGameData instead.
    entry.subPartPlacements.push(...placementsFromPartElement(gd));
    entry.decoupler ??= parsed.gameData.decoupler;
    entry.dockingPort ??= parsed.gameData.dockingPort;
    entry.evaDoor ??= parsed.gameData.evaDoor;
    // Adopt the first entry's diameter + its extra adapter size classes together.
    if (entry.diameterM == null && parsed.gameData.diameterM != null) {
      entry.diameterM = parsed.gameData.diameterM;
      entry.extraDiametersM = parsed.gameData.extraDiametersM;
    }
    entry.controllable ||= parsed.gameData.controllable;
    // Adopt the first entry's custom mass; its preserved extras (inertia) ride along.
    if (entry.customMass == null && parsed.gameData.customMass != null) {
      entry.customMass = parsed.gameData.customMass;
      entry.customMassExtras = parsed.gameData.customMassExtras;
    }
    // First entry with passthrough wins (these represent one part's leftover XML).
    if (Object.keys(entry.unknownAttrs).length === 0)
      entry.unknownAttrs = parsed.gameData.unknownAttrs;
    if (entry.unknownChildren.length === 0) entry.unknownChildren = parsed.gameData.unknownChildren;
    entry.batteries.push(...parsed.gameData.batteries);
    entry.generators.push(...parsed.gameData.generators);
    entry.solarPanels.push(...parsed.gameData.solarPanels);
    entry.powerConsumer ??= parsed.gameData.powerConsumer;
    entry.rocketControllers.push(...parsed.gameData.rocketControllers);
    entry.rockets.push(...parsed.gameData.rockets);
    entry.combustors.push(...parsed.gameData.combustors);
    entry.nozzles.push(...parsed.gameData.nozzles);
    entry.gimbals.push(...parsed.gameData.gimbals);
    entry.tanks.push(...parsed.gameData.tanks);
    entry.solidMotors.push(...parsed.gameData.solidMotors);
    entry.solidNozzles.push(...parsed.gameData.solidNozzles);
    entry.solidGrainSegments.push(...parsed.gameData.solidGrainSegments);
    entry.consumerFeedWiring.push(...parsed.gameData.consumerFeedWiring);
    out.parts.set(id, entry);
  }
  for (const spd of subPartGameDataFromDoc(doc)) out.subParts.set(spd.subPartTemplateId, spd);
  for (const c of subPartCollidersFromRoot(doc.documentElement as Element)) {
    const list = out.subPartColliders.get(c.ownerTemplateId!);
    if (list) list.push(c);
    else out.subPartColliders.set(c.ownerTemplateId!, [c]);
  }
  for (const l of subPartLightsFromRoot(doc.documentElement as Element)) {
    const list = out.subPartLights.get(l.ownerTemplateId!);
    if (list) list.push(l);
    else out.subPartLights.set(l.ownerTemplateId!, [l]);
  }
}

async function loadGameData(): Promise<ParsedGameDataFile> {
  const out: ParsedGameDataFile = {
    parts: new Map(),
    subParts: new Map(),
    subPartColliders: new Map(),
    subPartLights: new Map(),
  };
  await Promise.all(
    GAMEDATA_FILES.map(async (file) => {
      const r = await fetchXmlFile(file);
      // Most asset files have no GameData sibling ('missing' — expected and silent);
      // genuine parse/network errors are logged verbosely inside fetchXmlFile.
      if (r.kind === 'ok') parseGameDataFile(r.doc, out);
    }),
  );
  return out;
}

/**
 * Merges parsed game-data into catalog parts: unions editor tags, applies connector
 * flags by id, and carries coupling bindings, power modules, and the per-SubPart-template
 * data (tanks / solar panels) for whichever SubParts this Part actually places.
 */
export function mergeGameData(parts: CatalogPart[], gameData: ParsedGameDataFile): void {
  for (const part of parts) {
    const gd = gameData.parts.get(part.id);
    if (gd) {
      for (const tag of gd.editorTags) {
        if (!part.editorTags.includes(tag)) part.editorTags.push(tag);
      }
      for (const conn of part.connectors) {
        const flags = gd.connectorFlags.get(conn.id);
        if (flags) conn.flags = flags;
        // <Capabilities> decides what may FLOW across the connector (BulkFluid /
        // SolidMotorCase / DecouplerJoint) — dropping it makes an imported fuel tank,
        // SRB segment or decoupler dead on re-export.
        const caps = gd.connectorCapabilities.get(conn.id);
        if (caps) conn.capabilities = caps;
      }
      if (gd.animationModules.length) part.animationModules = gd.animationModules;
      part.decoupler = gd.decoupler;
      part.dockingPort = gd.dockingPort;
      part.evaDoor = gd.evaDoor;
      part.diameterM = gd.diameterM;
      part.extraDiametersM = gd.extraDiametersM;
      part.controllable = gd.controllable;
      part.customMass = gd.customMass;
      part.customMassExtras = gd.customMassExtras;
      part.unknownAttrs = gd.unknownAttrs;
      part.unknownChildren = gd.unknownChildren;
      part.batteries = gd.batteries;
      part.generators = gd.generators;
      part.solarPanels = gd.solarPanels;
      part.powerConsumer = gd.powerConsumer;
      part.rocketControllers = gd.rocketControllers;
      part.rockets = gd.rockets;
      part.combustors = gd.combustors;
      part.nozzles = gd.nozzles;
      part.gimbals = gd.gimbals;
      part.tanks = gd.tanks;
      part.solidMotors = gd.solidMotors;
      part.solidNozzles = gd.solidNozzles;
      part.solidGrainSegments = gd.solidGrainSegments;
      part.consumerFeedWiring = gd.consumerFeedWiring;
      // APPEND — the geometry `<Part><Collider>` read in parsePartsFile is already here,
      // and KSA applies both (Components merge additively, no dedupe).
      part.colliders.push(...gd.colliders);
      // Same additive merge for IVA seats, then re-number `_seatN` across the merged list so
      // the ids stay unique and in document order (geometry `<Part>` first, then GameData).
      // The ids are editor-only and never emitted, so renumbering is free.
      part.ivaSeats.push(...gd.ivaSeats);
      part.ivaSeats.forEach((seat, i) => {
        seat.id = `_seat${i + 1}`;
      });
      // Part-level <Light>s (Core: CoreCommandA headlights, CoreIVASpaceA interior light).
      part.lights.push(...gd.lights);
      // GameData-ADDED placements (`ApplyOrAddSubPartInstance`: an Id matching no geometry
      // instance is appended). Normalised into the one placement list exactly like colliders —
      // flexo re-emits every placement in the geometry `<Part>`, which the game treats
      // identically. A matching Id is NOT re-applied: KSA would only overlay its Transform /
      // Gimbal / SolarTracker, and Core authors no such overlay with an InstanceOf.
      const placed = new Set(part.placements.map((p) => p.instanceId));
      for (const p of gd.subPartPlacements) {
        if (placed.has(p.instanceId)) continue;
        part.placements.push(p);
        placed.add(p.instanceId);
      }
    }
    // SubPart-template data is keyed globally by template id; carry only the entries
    // for templates this Part places (deduped — many instances share one template).
    const templateIds = new Set(part.placements.map((p) => p.subPartTemplateId));
    part.subPartGameData = [...templateIds]
      .map((tid) => gameData.subParts.get(tid))
      .filter((spd): spd is SubPartGameData => spd != null);
    // Same scoping for SubPart-owned colliders. NOTE: the geometry `<SubPart><Collider>`
    // of a placed built-in template is deliberately NOT pulled in — the placement keeps
    // referencing the built-in id, so that collider already applies in-game (see
    // CatalogSubPart.colliders).
    for (const tid of templateIds) {
      part.colliders.push(...(gameData.subPartColliders.get(tid) ?? []));
    }
    // Same scoping for SubPart-owned lights (Core: CoreElectricalA spotlights), then
    // re-number `_lightN` across the merged list (part-level first) — the ids are
    // editor-only and never emitted, so renumbering is free. CLONED, unlike colliders:
    // the per-template lists are shared by every Part placing the template, and the
    // renumber below writes ids.
    for (const tid of templateIds) {
      part.lights.push(...structuredClone(gameData.subPartLights.get(tid) ?? []));
    }
    part.lights.forEach((light, i) => {
      light.id = `_light${i + 1}`;
    });
  }
}

/** Fetches and parses every Core asset file into a sorted Part catalog. */
export async function loadCorePartCatalog(): Promise<CatalogPart[]> {
  const out: CatalogPart[] = [];
  const [, gameData] = await Promise.all([
    Promise.all(
      ASSET_FILES.map(async (file) => {
        const r = await fetchXmlFile(file);
        if (r.kind === 'missing') {
          console.error(`partCatalog: required asset file ${file} not found`);
          return;
        }
        if (r.kind === 'ok') parsePartsFile(r.doc, file, out);
      }),
    ),
    loadGameData(),
  ]);
  mergeGameData(out, gameData);
  out.sort((a, b) => a.id.localeCompare(b.id));
  console.info(`flexo part catalog: ${out.length} Parts loaded`);
  return out;
}

/** Builds an id->entry index for O(1) lookups by Part id. */
export function indexPartCatalog(entries: CatalogPart[]): Map<string, CatalogPart> {
  return new Map(entries.map((e) => [e.id, e]));
}
