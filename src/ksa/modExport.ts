import type { EditingPart } from './types'
import { serializeGameData, serializePart } from './partXmlSerializer'
import { createZip } from '../util/zip'

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

/**
 * Builds a downloadable zip containing `flexo-parts/` with a fresh mod.toml and
 * the project's Part + GameData XML. Filenames are the un-suffixed desired names
 * (a zip is always a clean slate, so there's nothing to conflict with).
 */
export function buildModZip(part: EditingPart, projectName: string): Blob {
  const content = buildModContent(part, projectName)
  const encoder = new TextEncoder()
  const assets = [content.partFile, content.gameDataFile]
  return createZip([
    { name: `${MOD_FOLDER_NAME}/${MOD_TOML_NAME}`, data: encoder.encode(serializeModToml(assets)) },
    { name: `${MOD_FOLDER_NAME}/${content.partFile}`, data: encoder.encode(content.partXml) },
    {
      name: `${MOD_FOLDER_NAME}/${content.gameDataFile}`,
      data: encoder.encode(content.gameDataXml),
    },
  ])
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

export interface WriteResult {
  partFile: string
  gameDataFile: string
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

  const taken = new Set((await listFileNames(modDir)).map((n) => n.toLowerCase()))
  const partFile = uniqueFileName(taken, `${content.base}Part`, 'xml')
  taken.add(partFile.toLowerCase())
  const gameDataFile = uniqueFileName(taken, `${content.base}GameData`, 'xml')

  await writeTextFile(modDir, partFile, content.partXml)
  await writeTextFile(modDir, gameDataFile, content.gameDataXml)

  const assets = (await listFileNames(modDir)).filter(isXml).sort((a, b) => a.localeCompare(b))
  await writeTextFile(modDir, MOD_TOML_NAME, serializeModToml(assets))

  return { partFile, gameDataFile, assets }
}
