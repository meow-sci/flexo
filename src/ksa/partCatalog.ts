/**
 * Loads the KSA "Core" Part catalog at runtime by fetching and parsing the same
 * Core *Assets.xml files as the SubPart catalog, but extracting whole <Part>
 * definitions (their SubPart instances + transforms + editor tags) instead of
 * individual SubPart templates. Used by the "+ Part" importer to drop a complete
 * pre-assembled Part into the current project.
 *
 * Uses the browser DOMParser — no third-party XML lib, no build step.
 */

import { ASSET_FILES, toUrl } from './catalog'
import { connectorsFromPartElement, placementsFromPartElement } from './partXmlParser'
import type { Connector, SubPartPlacement } from './types'

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

function directChildren(parent: Element, tag: string): Element[] {
  const out: Element[] = []
  for (const node of Array.from(parent.childNodes)) {
    if (node.nodeType === 1 && (node as Element).tagName === tag) out.push(node as Element)
  }
  return out
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

/** Fetches and parses every Core asset file into a sorted Part catalog. */
export async function loadCorePartCatalog(): Promise<CatalogPart[]> {
  const out: CatalogPart[] = []
  await Promise.all(
    ASSET_FILES.map(async (file) => {
      try {
        const res = await fetch(toUrl(file))
        if (!res.ok) {
          console.warn(`partCatalog: failed to fetch ${file}: ${res.status}`)
          return
        }
        const text = await res.text()
        const doc = new DOMParser().parseFromString(text, 'application/xml')
        if (doc.getElementsByTagName('parsererror').length > 0) {
          console.warn(`partCatalog: parse error in ${file}`)
          return
        }
        parsePartsFile(doc, file, out)
      } catch (err) {
        console.warn(`partCatalog: error loading ${file}`, err)
      }
    }),
  )
  out.sort((a, b) => a.id.localeCompare(b.id))
  console.info(`flexo part catalog: ${out.length} Parts loaded`)
  return out
}

/** Builds an id->entry index for O(1) lookups by Part id. */
export function indexPartCatalog(entries: CatalogPart[]): Map<string, CatalogPart> {
  return new Map(entries.map((e) => [e.id, e]))
}
