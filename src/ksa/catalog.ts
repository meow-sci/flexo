/**
 * Loads the KSA "Core" SubPart catalog at runtime by fetching and parsing the
 * Core *Assets.xml files (served under /ksa/ in dev). Uses the browser DOMParser
 * — no third-party XML lib, no build step.
 *
 * Each catalog entry resolves a SubPart template id to the GLB mesh-atlas node
 * and PbrMaterial texture atlases needed to render it (see Domain Reference in
 * plans/FLEXO_INITIAL_PLAN.md). Mesh node names equal the value of the SubPart's
 * <PartModel><Mesh Id="..."/> and exist as named nodes inside the atlas GLB.
 */

export interface CatalogSubPart {
  /** SubPart template id, e.g. "CoreStructuralA_Subpart_TrussBarA". */
  id: string
  /** URL of the GLB mesh atlas, e.g. "/ksa/Meshes/CoreStructuralA_MeshAtlas.glb". */
  atlasUrl: string
  /**
   * Name of the node to extract from the atlas. null means "use the whole atlas
   * scene" (the rare named-MeshAtlas case, e.g. circle_light.glb).
   */
  meshNodeName: string | null
  materialId?: string
  diffuseUrl?: string
  normalUrl?: string
  aoRoughMetalUrl?: string
  emissiveUrl?: string
  /** Originating XML file (for debugging). */
  sourceFile: string
}

/** Core asset files that declare <SubPart> templates with renderable <PartModel>. */
export const ASSET_FILES = [
  'CoreStructuralAAssets.xml',
  'CoreCouplingAAssets.xml',
  'CoreFuelTankAAssets.xml',
  'CoreCommandAAssets.xml',
  'CorePropulsionAAssets.xml',
  'CorePropulsionBAssets.xml',
  'CoreElectricalAAssets.xml',
  'CoreFairingAAssets.xml',
  'CorePassageAAssets.xml',
  'CoreLandingAAssets.xml',
  'CoreServiceModuleAAssets.xml',
  'CoreIVAPropAAssets.xml',
  'CoreIVASpaceAAssets.xml',
  'PartAssets.xml',
]

// Respects Vite's `base` (e.g. "/flexo/") so /ksa/ URLs resolve under a sub-path deploy.
const KSA_BASE = `${import.meta.env.BASE_URL}ksa/`

export function toUrl(relPath: string): string {
  return KSA_BASE + relPath.replace(/^\/+/, '')
}

/** Result of fetching+parsing a /ksa/ XML file. 'missing' = file genuinely absent (real 404, or vite's SPA index.html fallback served with 200 for an unknown path). */
export type XmlFetchResult =
  | { kind: 'ok'; doc: Document }
  | { kind: 'missing' }
  | { kind: 'error' }

function looksLikeHtmlFallback(text: string): boolean {
  const head = text.slice(0, 256).trimStart().toLowerCase()
  return head.startsWith('<!doctype html') || head.startsWith('<html')
}

/**
 * Fetches and parses a /ksa/ XML file. Returns 'missing' for absent files (404,
 * or the dev server's index.html SPA fallback) so optional siblings can be skipped
 * silently. On a genuine XML parse error — which indicates a real bug — logs the
 * file, parser message, content-type, and full body before returning 'error'.
 */
export async function fetchXmlFile(file: string): Promise<XmlFetchResult> {
  let res: Response
  try {
    res = await fetch(toUrl(file))
  } catch (err) {
    console.error(`ksa catalog: network error fetching ${file}`, err)
    return { kind: 'error' }
  }
  if (res.status === 404) return { kind: 'missing' }
  if (!res.ok) {
    console.error(`ksa catalog: failed to fetch ${file}: ${res.status} ${res.statusText}`)
    return { kind: 'error' }
  }
  const text = await res.text()
  if (looksLikeHtmlFallback(text)) return { kind: 'missing' }
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  const parseErr = doc.getElementsByTagName('parsererror')[0]
  if (parseErr) {
    console.error(
      `ksa catalog: XML parse error in ${file}\n` +
        `  url: ${res.url}\n` +
        `  content-type: ${res.headers.get('content-type') ?? '(none)'}\n` +
        `  parser message: ${(parseErr.textContent ?? '').trim()}\n` +
        `  --- ${file} contents (${text.length} chars) ---\n${text}`,
    )
    return { kind: 'error' }
  }
  return { kind: 'ok', doc }
}

function firstChildByTag(parent: Element, tag: string): Element | null {
  for (const child of Array.from(parent.childNodes)) {
    if (child.nodeType === 1 && (child as Element).tagName === tag) return child as Element
  }
  return null
}

interface MaterialPaths {
  diffuse?: string
  normal?: string
  aoRoughMetal?: string
  emissive?: string
}

export function parseAssetsFile(doc: Document, sourceFile: string, out: CatalogSubPart[]): void {
  const root = doc.documentElement
  if (!root) return

  // Mesh atlases: the default (no Id) and any named ones.
  let defaultAtlasPath: string | null = null
  const namedAtlases = new Map<string, string>()
  for (const atlas of Array.from(doc.getElementsByTagName('MeshAtlas'))) {
    const path = atlas.getAttribute('Path')
    if (!path) continue
    const id = atlas.getAttribute('Id')
    if (id) namedAtlases.set(id, path)
    else if (defaultAtlasPath === null) defaultAtlasPath = path
  }

  // PbrMaterials by Id.
  const materials = new Map<string, MaterialPaths>()
  for (const mat of Array.from(doc.getElementsByTagName('PbrMaterial'))) {
    const id = mat.getAttribute('Id')
    if (!id) continue
    materials.set(id, {
      diffuse: firstChildByTag(mat, 'Diffuse')?.getAttribute('Path') ?? undefined,
      normal: firstChildByTag(mat, 'Normal')?.getAttribute('Path') ?? undefined,
      aoRoughMetal: firstChildByTag(mat, 'AoRoughMetal')?.getAttribute('Path') ?? undefined,
      emissive: firstChildByTag(mat, 'Emissive')?.getAttribute('Path') ?? undefined,
    })
  }

  // SubPart templates: those that carry a renderable model. Static parts use
  // <PartModel>; movable engine parts (actuators, gimbals, flexipipes) use
  // <PartModelDynamic> with the same inner <Mesh>/<Material>. Instances carry only
  // InstanceOf and no model element, so they are naturally skipped.
  for (const sub of Array.from(doc.getElementsByTagName('SubPart'))) {
    const id = sub.getAttribute('Id')
    if (!id) continue
    const partModel = firstChildByTag(sub, 'PartModel') ?? firstChildByTag(sub, 'PartModelDynamic')
    if (!partModel) continue

    const meshId = firstChildByTag(partModel, 'Mesh')?.getAttribute('Id')
    if (!meshId) {
      console.warn(`catalog: ${sourceFile}: SubPart '${id}' has PartModel without Mesh — skipped`)
      continue
    }

    // Resolve atlas: a Mesh Id matching a named atlas = whole-atlas mesh,
    // otherwise it names a node inside the file's default atlas.
    let atlasPath: string | null
    let meshNodeName: string | null
    if (namedAtlases.has(meshId)) {
      atlasPath = namedAtlases.get(meshId)!
      meshNodeName = null
    } else {
      atlasPath = defaultAtlasPath
      meshNodeName = meshId
    }
    if (!atlasPath) {
      console.warn(`catalog: ${sourceFile}: SubPart '${id}' has no resolvable mesh atlas — skipped`)
      continue
    }

    const materialId = firstChildByTag(partModel, 'Material')?.getAttribute('Id') ?? undefined
    const mat = materialId ? materials.get(materialId) : undefined

    out.push({
      id,
      atlasUrl: toUrl(atlasPath),
      meshNodeName,
      materialId,
      diffuseUrl: mat?.diffuse ? toUrl(mat.diffuse) : undefined,
      normalUrl: mat?.normal ? toUrl(mat.normal) : undefined,
      aoRoughMetalUrl: mat?.aoRoughMetal ? toUrl(mat.aoRoughMetal) : undefined,
      emissiveUrl: mat?.emissive ? toUrl(mat.emissive) : undefined,
      sourceFile,
    })
  }
}

/** Fetches and parses every Core asset file into a sorted SubPart catalog. */
export async function loadCoreCatalog(): Promise<CatalogSubPart[]> {
  const out: CatalogSubPart[] = []
  await Promise.all(
    ASSET_FILES.map(async (file) => {
      const r = await fetchXmlFile(file)
      if (r.kind === 'missing') {
        console.error(`catalog: required asset file ${file} not found`)
        return
      }
      if (r.kind === 'ok') parseAssetsFile(r.doc, file, out)
    }),
  )
  out.sort((a, b) => a.id.localeCompare(b.id))
  console.info(`flexo catalog: ${out.length} SubParts loaded`)
  return out
}

/** Builds an id->entry index for O(1) lookups by template id. */
export function indexCatalog(entries: CatalogSubPart[]): Map<string, CatalogSubPart> {
  return new Map(entries.map((e) => [e.id, e]))
}
