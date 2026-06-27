/**
 * Loads the KSA "Core" Part catalog at runtime by fetching and parsing the same
 * Core *Assets.xml files as the SubPart catalog, but extracting whole <Part>
 * definitions (their SubPart instances + transforms + editor tags) instead of
 * individual SubPart templates. Used by the "+ Part" importer to drop a complete
 * pre-assembled Part into the current project.
 *
 * Uses the browser DOMParser — no third-party XML lib, no build step.
 */

import { ASSET_FILES, fetchXmlFile } from './catalog'
import {
  connectorsFromPartElement,
  directChildren,
  parseGameDataElement,
  placementsFromPartElement,
  subPartGameDataFromDoc,
} from './partXmlParser'
import type {
  Battery,
  CatalogAnimationModule,
  Combustor,
  Connector,
  ConnectorFlag,
  Decoupler,
  DeLavalNozzle,
  DockingPort,
  EvaDoor,
  Generator,
  Gimbal,
  PowerConsumer,
  RawXmlNode,
  Rocket,
  RocketController,
  SolarPanel,
  SubPartGameData,
  SubPartPlacement,
} from './types'

export interface CatalogPart {
  /** Part id as declared in the Assets XML, e.g. "CoreFuelTankA_Prefab_LF1W1HA". */
  id: string
  /** Editor tags from <EditorTag Value="..."/> (e.g. "Fuel Tanks"), in order. */
  editorTags: string[]
  /** The SubPart instances composing this Part, with their relative transforms. */
  placements: SubPartPlacement[]
  /** The connector attachment points of this Part, with their relative transforms. */
  connectors: Connector[]
  /** KeyframeAnimationModules (from GameData), decoded + imported alongside the Part. */
  animationModules: CatalogAnimationModule[]
  /** Connector-bound coupling game-data (from GameData); connectorIds are in the Part's original id space. */
  decoupler: Decoupler | null
  dockingPort: DockingPort | null
  evaDoor: EvaDoor | null
  /** Part diameter in meters (<Diameter M/>, VAB size-class filter), or null. */
  diameterM: number | null
  /** Command-capability marker (<Control/>): the part can pilot a vehicle. */
  controllable: boolean
  /** Unmodeled `<PartGameData>` attrs + child elements, preserved verbatim for round-trip. */
  unknownAttrs: Record<string, string>
  unknownChildren: RawXmlNode[]
  /** Part-level power modules (from GameData), carried into the editor on import. */
  batteries: Battery[]
  generators: Generator[]
  solarPanels: SolarPanel[]
  powerConsumers: PowerConsumer[]
  /** Per-SubPart-template data (tanks / solar panels / engine modules) for the SubParts this Part places. */
  subPartGameData: SubPartGameData[]
  /** Part-level engine modules (controllers/rockets/combustors/nozzles/gimbals); instance refs in original id space. */
  rocketControllers: RocketController[]
  rockets: Rocket[]
  combustors: Combustor[]
  nozzles: DeLavalNozzle[]
  gimbals: Gimbal[]
  /** Originating XML file (for debugging / grouping). */
  sourceFile: string
}

export function parsePartsFile(doc: Document, sourceFile: string, out: CatalogPart[]): void {
  for (const part of Array.from(doc.getElementsByTagName('Part'))) {
    const id = part.getAttribute('Id')
    if (!id) continue
    const editorTags = directChildren(part, 'EditorTag')
      .map((t) => t.getAttribute('Value'))
      .filter((v): v is string => !!v)
    const placements = placementsFromPartElement(part)
    if (placements.length === 0) continue // nothing renderable/importable
    const connectors = connectorsFromPartElement(part)
    out.push({
      id,
      editorTags,
      placements,
      connectors,
      animationModules: [],
      decoupler: null,
      dockingPort: null,
      evaDoor: null,
      diameterM: null,
      controllable: false,
      unknownAttrs: {},
      unknownChildren: [],
      batteries: [],
      generators: [],
      solarPanels: [],
      powerConsumers: [],
      subPartGameData: [],
      rocketControllers: [],
      rockets: [],
      combustors: [],
      nozzles: [],
      gimbals: [],
      sourceFile,
    })
  }
}

/**
 * Game-data carried in the sibling *GameData.xml files: editor tags and connector
 * flags, both keyed by Part id. In KSA's Core data these live on <PartGameData>,
 * NOT on the geometry <Part> — so without merging them the importer drops both
 * the editor tags and the connector <Flags> (e.g. ToSurface on solar panels).
 */
export interface PartGameData {
  editorTags: string[]
  /** connector id -> its flags (only connectors carrying <Flags> are recorded). */
  connectorFlags: Map<string, ConnectorFlag[]>
  /** KeyframeAnimationModules declared on this <PartGameData>. */
  animationModules: CatalogAnimationModule[]
  /** Connector-bound coupling game-data, so built-in part imports carry them in. */
  decoupler: Decoupler | null
  dockingPort: DockingPort | null
  evaDoor: EvaDoor | null
  /** Part diameter (<Diameter M/>) and command marker (<Control/>) declared on this <PartGameData>. */
  diameterM: number | null
  controllable: boolean
  /** Unmodeled `<PartGameData>` attrs + child elements preserved from this entry. */
  unknownAttrs: Record<string, string>
  unknownChildren: RawXmlNode[]
  /** Part-level power modules declared on this <PartGameData>. */
  batteries: Battery[]
  generators: Generator[]
  solarPanels: SolarPanel[]
  powerConsumers: PowerConsumer[]
  /** Part-level engine modules declared on this <PartGameData>. */
  rocketControllers: RocketController[]
  rockets: Rocket[]
  combustors: Combustor[]
  nozzles: DeLavalNozzle[]
  gimbals: Gimbal[]
}

/** Parsed GameData for a whole file: per-Part data + per-SubPart-template data (keyed by template id). */
interface ParsedGameDataFile {
  parts: Map<string, PartGameData>
  subParts: Map<string, SubPartGameData>
}

/** GameData sibling of each catalog asset file (e.g. CoreElectricalAAssets.xml -> CoreElectricalAGameData.xml). Not every asset file has one. */
const GAMEDATA_FILES = ASSET_FILES.map((f) => f.replace(/Assets\.xml$/, 'GameData.xml'))

/**
 * Parses a GameData document: `<PartGameData>` entries (editor tags, connector
 * flags, coupling bindings, power modules) keyed by Part id into `out.parts`, and
 * all top-level `<SubPartGameData>` entries (tanks / solar panels) keyed by SubPart
 * template id into `out.subParts`.
 */
export function parseGameDataFile(doc: Document, out: ParsedGameDataFile): void {
  for (const gd of Array.from(doc.getElementsByTagName('PartGameData'))) {
    const id = gd.getAttribute('Id')
    if (!id) continue
    const parsed = parseGameDataElement(gd)
    const entry: PartGameData = out.parts.get(id) ?? {
      editorTags: [],
      connectorFlags: new Map(),
      animationModules: [],
      decoupler: null,
      dockingPort: null,
      evaDoor: null,
      diameterM: null,
      controllable: false,
      unknownAttrs: {},
      unknownChildren: [],
      batteries: [],
      generators: [],
      solarPanels: [],
      powerConsumers: [],
      rocketControllers: [],
      rockets: [],
      combustors: [],
      nozzles: [],
      gimbals: [],
    }
    for (const tag of parsed.editorTags) {
      if (!entry.editorTags.includes(tag)) entry.editorTags.push(tag)
    }
    for (const [connId, flags] of parsed.connectorFlags) entry.connectorFlags.set(connId, flags)
    entry.animationModules.push(...parsed.animationModules)
    entry.decoupler ??= parsed.gameData.decoupler
    entry.dockingPort ??= parsed.gameData.dockingPort
    entry.evaDoor ??= parsed.gameData.evaDoor
    entry.diameterM ??= parsed.gameData.diameterM
    entry.controllable ||= parsed.gameData.controllable
    // First entry with passthrough wins (these represent one part's leftover XML).
    if (Object.keys(entry.unknownAttrs).length === 0)
      entry.unknownAttrs = parsed.gameData.unknownAttrs
    if (entry.unknownChildren.length === 0) entry.unknownChildren = parsed.gameData.unknownChildren
    entry.batteries.push(...parsed.gameData.batteries)
    entry.generators.push(...parsed.gameData.generators)
    entry.solarPanels.push(...parsed.gameData.solarPanels)
    entry.powerConsumers.push(...parsed.gameData.powerConsumers)
    entry.rocketControllers.push(...parsed.gameData.rocketControllers)
    entry.rockets.push(...parsed.gameData.rockets)
    entry.combustors.push(...parsed.gameData.combustors)
    entry.nozzles.push(...parsed.gameData.nozzles)
    entry.gimbals.push(...parsed.gameData.gimbals)
    out.parts.set(id, entry)
  }
  for (const spd of subPartGameDataFromDoc(doc)) out.subParts.set(spd.subPartTemplateId, spd)
}

async function loadGameData(): Promise<ParsedGameDataFile> {
  const out: ParsedGameDataFile = { parts: new Map(), subParts: new Map() }
  await Promise.all(
    GAMEDATA_FILES.map(async (file) => {
      const r = await fetchXmlFile(file)
      // Most asset files have no GameData sibling ('missing' — expected and silent);
      // genuine parse/network errors are logged verbosely inside fetchXmlFile.
      if (r.kind === 'ok') parseGameDataFile(r.doc, out)
    }),
  )
  return out
}

/**
 * Merges parsed game-data into catalog parts: unions editor tags, applies connector
 * flags by id, and carries coupling bindings, power modules, and the per-SubPart-template
 * data (tanks / solar panels) for whichever SubParts this Part actually places.
 */
export function mergeGameData(parts: CatalogPart[], gameData: ParsedGameDataFile): void {
  for (const part of parts) {
    const gd = gameData.parts.get(part.id)
    if (gd) {
      for (const tag of gd.editorTags) {
        if (!part.editorTags.includes(tag)) part.editorTags.push(tag)
      }
      for (const conn of part.connectors) {
        const flags = gd.connectorFlags.get(conn.id)
        if (flags) conn.flags = flags
      }
      if (gd.animationModules.length) part.animationModules = gd.animationModules
      part.decoupler = gd.decoupler
      part.dockingPort = gd.dockingPort
      part.evaDoor = gd.evaDoor
      part.diameterM = gd.diameterM
      part.controllable = gd.controllable
      part.unknownAttrs = gd.unknownAttrs
      part.unknownChildren = gd.unknownChildren
      part.batteries = gd.batteries
      part.generators = gd.generators
      part.solarPanels = gd.solarPanels
      part.powerConsumers = gd.powerConsumers
      part.rocketControllers = gd.rocketControllers
      part.rockets = gd.rockets
      part.combustors = gd.combustors
      part.nozzles = gd.nozzles
      part.gimbals = gd.gimbals
    }
    // SubPart-template data is keyed globally by template id; carry only the entries
    // for templates this Part places (deduped — many instances share one template).
    const templateIds = new Set(part.placements.map((p) => p.subPartTemplateId))
    part.subPartGameData = [...templateIds]
      .map((tid) => gameData.subParts.get(tid))
      .filter((spd): spd is SubPartGameData => spd != null)
  }
}

/** Fetches and parses every Core asset file into a sorted Part catalog. */
export async function loadCorePartCatalog(): Promise<CatalogPart[]> {
  const out: CatalogPart[] = []
  const [, gameData] = await Promise.all([
    Promise.all(
      ASSET_FILES.map(async (file) => {
        const r = await fetchXmlFile(file)
        if (r.kind === 'missing') {
          console.error(`partCatalog: required asset file ${file} not found`)
          return
        }
        if (r.kind === 'ok') parsePartsFile(r.doc, file, out)
      }),
    ),
    loadGameData(),
  ])
  mergeGameData(out, gameData)
  out.sort((a, b) => a.id.localeCompare(b.id))
  console.info(`flexo part catalog: ${out.length} Parts loaded`)
  return out
}

/** Builds an id->entry index for O(1) lookups by Part id. */
export function indexPartCatalog(entries: CatalogPart[]): Map<string, CatalogPart> {
  return new Map(entries.map((e) => [e.id, e]))
}
