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
} from './partXmlParser'
import type { Connector, ConnectorFlag, SubPartPlacement } from './types'

export interface CatalogPart {
  /** Part id as declared in the Assets XML, e.g. "CoreFuelTankA_Prefab_LF1W1HA". */
  id: string
  /** Editor tags from <EditorTag Value="..."/> (e.g. "Fuel Tanks"), in order. */
  editorTags: string[]
  /** The SubPart instances composing this Part, with their relative transforms. */
  placements: SubPartPlacement[]
  /** The connector attachment points of this Part, with their relative transforms. */
  connectors: Connector[]
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
    out.push({ id, editorTags, placements, connectors, sourceFile })
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
}

/** GameData sibling of each catalog asset file (e.g. CoreElectricalAAssets.xml -> CoreElectricalAGameData.xml). Not every asset file has one. */
const GAMEDATA_FILES = ASSET_FILES.map((f) => f.replace(/Assets\.xml$/, 'GameData.xml'))

/** Parses <PartGameData> entries (editor tags + connector flags) keyed by Part id. */
export function parseGameDataFile(doc: Document, out: Map<string, PartGameData>): void {
  for (const gd of Array.from(doc.getElementsByTagName('PartGameData'))) {
    const id = gd.getAttribute('Id')
    if (!id) continue
    const parsed = parseGameDataElement(gd)
    const entry: PartGameData = out.get(id) ?? { editorTags: [], connectorFlags: new Map() }
    for (const tag of parsed.editorTags) {
      if (!entry.editorTags.includes(tag)) entry.editorTags.push(tag)
    }
    for (const [connId, flags] of parsed.connectorFlags) entry.connectorFlags.set(connId, flags)
    out.set(id, entry)
  }
}

async function loadGameData(): Promise<Map<string, PartGameData>> {
  const out = new Map<string, PartGameData>()
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

/** Merges parsed game-data into catalog parts: unions editor tags and applies connector flags by id. */
export function mergeGameData(parts: CatalogPart[], gameData: Map<string, PartGameData>): void {
  for (const part of parts) {
    const gd = gameData.get(part.id)
    if (!gd) continue
    for (const tag of gd.editorTags) {
      if (!part.editorTags.includes(tag)) part.editorTags.push(tag)
    }
    for (const conn of part.connectors) {
      const flags = gd.connectorFlags.get(conn.id)
      if (flags) conn.flags = flags
    }
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
