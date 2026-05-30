import type { EditingPart } from './types'
import { serializeGameData, serializePart } from './partXmlSerializer'
import { serializeAssets, type AssetsSubPartPlan } from './assetsXmlSerializer'
import { buildMeshAtlasGlb } from './exportGlb'
import { buildPrimitiveGeometry } from '../three/primitives'
import { assetKeys, getAsset } from '../state/assetDb'
import { createZip, type ZipEntry } from '../util/zip'

/**
 * KSA part-mod export. A "part mod" is a folder the game loads from
 * `Documents/Kitten Space Agency/mods/`. flexo writes its output into a
 * `flexo-parts` subfolder containing:
 *   - `mod.toml`  — declares the mod name and lists the asset XML files
 *   - one `<Name>Part.xml` + one `<Name>GameData.xml` per exported project
 *
 * We emit a separate XML file per project (rather than merging everything into
 * shared files) to keep each project's output self-contained and easy to manage.
 *
 * Two delivery paths share this logic:
 *   - {@link writeModToFolder} writes into a user-granted directory via the File
 *     System Access API, non-destructively (never overwrites existing XML;
 *     rebuilds `mod.toml` from whatever XML actually ends up in the folder).
 *   - {@link buildModZip} produces a downloadable `.zip` with a fresh `flexo-parts`
 *     folder — no filesystem permission required, works in any browser.
 */

export const MOD_FOLDER_NAME = 'flexo-parts'
export const MOD_TOML_NAME = 'mod.toml'
/** The `name` field written into mod.toml. */
export const MOD_NAME = 'flexo-parts'

/** Project name → a safe, space-free base for XML filenames (e.g. "My Part" → "MyPart"). */
export function sanitizeBaseName(projectName: string): string {
  const cleaned = projectName.replace(/[^A-Za-z0-9]+/g, '')
  return cleaned || 'Mod'
}

/** Serializes mod.toml with the given asset filenames (matches KSA's format). */
export function serializeModToml(assets: string[]): string {
  const list = assets.length === 0 ? '[]' : `[ ${assets.map((a) => `"${a}"`).join(', ')}]`
  return `name = "${MOD_NAME}"\nassets = ${list}\n`
}

/**
 * Returns `base.ext`, or the first `base-N.ext` (N≥2) not present in `taken`.
 * `taken` holds **lowercased** names so conflict detection is case-insensitive
 * (matching case-insensitive filesystems like macOS/Windows).
 */
export function uniqueFileName(taken: Set<string>, base: string, ext: string): string {
  const first = `${base}.${ext}`
  if (!taken.has(first.toLowerCase())) return first
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}.${ext}`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
}

export interface ModContent {
  base: string
  partFile: string
  partXml: string
  gameDataFile: string
  gameDataXml: string
}

/** Builds the desired filenames + XML bodies for a project (no conflict resolution). */
export function buildModContent(part: EditingPart, projectName: string): ModContent {
  const base = sanitizeBaseName(projectName)
  return {
    base,
    partFile: `${base}Part.xml`,
    partXml: serializePart(part),
    gameDataFile: `${base}GameData.xml`,
    gameDataXml: serializeGameData(part),
  }
}

/** A token safe for an asset filename segment (letters/digits only). */
function sanitizeAssetToken(name: string): string {
  return name.replace(/[^A-Za-z0-9]+/g, '') || 'asset'
}

/** A custom-asset bundle for export: the Assets XML + the binary files it references. */
export interface CustomBundle {
  /** Desired Assets XML filename, or null when there are no custom assets to emit. */
  assetsFile: string | null
  assetsXml: string | null
  /** Binary files, each path relative to the mod folder (e.g. "Meshes/X.glb"). */
  binaries: { path: string; data: Uint8Array }[]
}

/**
 * Builds the custom-asset bundle for a project: a geometry mesh-atlas GLB (one named
 * node per custom SubPart actually placed), the diffuse .ktx2 for each referenced
 * custom texture, and the Assets XML that declares the MeshAtlas/PbrMaterial/SubPart.
 * Returns an empty bundle when no custom SubParts are placed.
 *
 * The .ktx2 bytes come from IndexedDB (encoded at upload time); the GLB is generated
 * fresh from the stored primitive params.
 */
export async function buildCustomBundle(part: EditingPart, base: string): Promise<CustomBundle> {
  const placed = new Set(part.placements.map((p) => p.subPartTemplateId))
  const meshes = part.customMeshes.filter((m) => placed.has(m.subPartId))
  if (meshes.length === 0) return { assetsFile: null, assetsXml: null, binaries: [] }

  const binaries: { path: string; data: Uint8Array }[] = []

  // One combined geometry GLB, mirroring a Core mesh atlas.
  const meshAtlasPath = `Meshes/${base}_MeshAtlas.glb`
  const nodes = meshes.map((m) => ({ name: m.subPartId, geometry: buildPrimitiveGeometry(m.primitive) }))
  try {
    binaries.push({ path: meshAtlasPath, data: await buildMeshAtlasGlb(nodes) })
  } finally {
    for (const n of nodes) n.geometry.dispose()
  }

  const texById = new Map(part.customTextures.map((t) => [t.id, t]))
  const texPath = new Map<string, string>() // texId -> relative path (dedupe shared textures)
  const subParts: AssetsSubPartPlan[] = []
  for (const m of meshes) {
    let diffusePath: string | null = null
    let materialId: string | null = null
    const tex = m.textureId ? texById.get(m.textureId) : undefined
    if (tex) {
      let rel = texPath.get(tex.id)
      if (!rel) {
        const blob = await getAsset(assetKeys.textureKtx2(tex.id))
        if (blob) {
          rel = `Textures/${sanitizeAssetToken(tex.name)}_${sanitizeAssetToken(tex.id)}_Diffuse.ktx2`
          texPath.set(tex.id, rel)
          binaries.push({ path: rel, data: new Uint8Array(await blob.arrayBuffer()) })
        }
      }
      if (rel) {
        diffusePath = rel
        materialId = `${m.subPartId}_Material`
      }
    }
    subParts.push({ subPartId: m.subPartId, materialId, diffusePath })
  }

  return {
    assetsFile: `${base}Assets.xml`,
    assetsXml: serializeAssets({ meshAtlasPath, subParts }),
    binaries,
  }
}

/**
 * Builds a downloadable zip containing `flexo-parts/` with a fresh mod.toml, the
 * project's Part + GameData XML, and — when custom SubParts are placed — an Assets
 * XML plus the referenced Meshes/*.glb and Textures/*.ktx2. Filenames are the
 * un-suffixed desired names (a zip is always a clean slate).
 */
export async function buildModZip(part: EditingPart, projectName: string): Promise<Blob> {
  const content = buildModContent(part, projectName)
  const bundle = await buildCustomBundle(part, content.base)
  const encoder = new TextEncoder()
  const xmlAssets = [content.partFile, content.gameDataFile]
  if (bundle.assetsFile) xmlAssets.push(bundle.assetsFile)

  const entries: ZipEntry[] = [
    { name: `${MOD_FOLDER_NAME}/${MOD_TOML_NAME}`, data: encoder.encode(serializeModToml(xmlAssets)) },
    { name: `${MOD_FOLDER_NAME}/${content.partFile}`, data: encoder.encode(content.partXml) },
    { name: `${MOD_FOLDER_NAME}/${content.gameDataFile}`, data: encoder.encode(content.gameDataXml) },
  ]
  if (bundle.assetsFile && bundle.assetsXml) {
    entries.push({ name: `${MOD_FOLDER_NAME}/${bundle.assetsFile}`, data: encoder.encode(bundle.assetsXml) })
  }
  for (const b of bundle.binaries) {
    entries.push({ name: `${MOD_FOLDER_NAME}/${b.path}`, data: b.data })
  }
  return createZip(entries)
}

const isXml = (name: string) => name.toLowerCase().endsWith('.xml')

/** All file names directly inside `dir`. */
async function listFileNames(dir: FileSystemDirectoryHandle): Promise<string[]> {
  const names: string[] = []
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === 'file') names.push(name)
  }
  return names
}

async function writeTextFile(
  dir: FileSystemDirectoryHandle,
  name: string,
  contents: string,
): Promise<void> {
  const fileHandle = await dir.getFileHandle(name, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(contents)
  await writable.close()
}

/** Writes binary bytes at a "Sub/Dir/file.ext" path under `root`, creating subdirs. */
async function writeBinaryAtPath(
  root: FileSystemDirectoryHandle,
  relPath: string,
  data: Uint8Array,
): Promise<void> {
  const segments = relPath.split('/')
  const fileName = segments.pop()!
  let dir = root
  for (const seg of segments) dir = await dir.getDirectoryHandle(seg, { create: true })
  const fileHandle = await dir.getFileHandle(fileName, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(data as unknown as BufferSource)
  await writable.close()
}

export interface WriteResult {
  partFile: string
  gameDataFile: string
  /** Assets XML filename when custom assets were written, else null. */
  assetsFile: string | null
  assets: string[]
}

/**
 * Non-destructively writes the project's mod files into `<modsDir>/flexo-parts`:
 *   - creates the `flexo-parts` folder if absent;
 *   - writes the Part + GameData XML under non-conflicting names (existing XML is
 *     never overwritten — a `-2`, `-3`, … suffix is added on collision);
 *   - rebuilds `mod.toml` to list the complete set of `.xml` files now present in
 *     the folder (regardless of what the previous `assets` list contained).
 */
export async function writeModToFolder(
  modsDir: FileSystemDirectoryHandle,
  part: EditingPart,
  projectName: string,
): Promise<WriteResult> {
  const modDir = await modsDir.getDirectoryHandle(MOD_FOLDER_NAME, { create: true })
  const content = buildModContent(part, projectName)

  const bundle = await buildCustomBundle(part, content.base)

  const taken = new Set((await listFileNames(modDir)).map((n) => n.toLowerCase()))
  const partFile = uniqueFileName(taken, `${content.base}Part`, 'xml')
  taken.add(partFile.toLowerCase())
  const gameDataFile = uniqueFileName(taken, `${content.base}GameData`, 'xml')
  taken.add(gameDataFile.toLowerCase())

  await writeTextFile(modDir, partFile, content.partXml)
  await writeTextFile(modDir, gameDataFile, content.gameDataXml)

  // Custom assets: the Assets XML respects the non-overwrite contract (suffixed on
  // collision); the binaries it references are regenerated deterministically and
  // written into Meshes/ and Textures/ (overwrite is fine — same content).
  let assetsFile: string | null = null
  if (bundle.assetsFile && bundle.assetsXml) {
    assetsFile = uniqueFileName(taken, `${content.base}Assets`, 'xml')
    await writeTextFile(modDir, assetsFile, bundle.assetsXml)
    for (const b of bundle.binaries) await writeBinaryAtPath(modDir, b.path, b.data)
  }

  const assets = (await listFileNames(modDir)).filter(isXml).sort((a, b) => a.localeCompare(b))
  await writeTextFile(modDir, MOD_TOML_NAME, serializeModToml(assets))

  return { partFile, gameDataFile, assetsFile, assets }
}
