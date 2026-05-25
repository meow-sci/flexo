#!/usr/bin/env bun
import { parseArgs } from 'util'
import { mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { Glob } from 'bun'

/**
 * Discovers the KSA "Core" Part/SubPart asset catalog dynamically and copies it
 * (plus the GLB/KTX2/GLTF/DDS binaries it references) into a target directory,
 * preserving the relative layout under Core/.
 *
 * The target is intended to be a private GitHub repo: flexo is open source, but
 * the licensed binary assets must stay private and only be pulled in at CI build
 * time. This replaces the hard-coded filename lists in vite/ksaAssets.ts with
 * dynamic discovery.
 *
 *   bun run scripts/copy-ksa-assets-to-private-repo.ts --target ../.tmp
 */

// Core asset root, relative to this script's directory (scripts/).
const CORE_DIR = resolve(import.meta.dir, '../thirdparty/ksa/Content/Core')

// Binary asset types referenced by the catalog that must travel with it.
const BINARY_EXTENSIONS = ['.glb', '.gltf', '.ktx2', '.dds']

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    target: { type: 'string' },
  },
  strict: true,
  allowPositionals: false,
})

if (!values.target) {
  console.error('Error: --target <dir> is required (e.g. --target ../.tmp)')
  process.exit(1)
}

const targetDir = resolve(process.cwd(), values.target)

console.log(`Source Core dir: ${CORE_DIR}`)
console.log(`Target dir:      ${targetDir}`)
console.log('')

// Some KSA XML files start with a UTF-8 BOM; strip it before string matching.
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

function hasBinaryExtension(path: string): boolean {
  const lower = path.toLowerCase()
  return BINARY_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

// Extract every Path="..." attribute value referencing a binary asset. Paths in
// the catalog XML are relative to the Core root (e.g. "Meshes/X.glb").
function findBinaryRefs(xml: string): string[] {
  const refs: string[] = []
  const re = /\bPath\s*=\s*"([^"]+)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    const path = m[1]!
    if (hasBinaryExtension(path)) refs.push(path)
  }
  return refs
}

// Copy a file (by Core-relative path) into the target, preserving its layout.
// Returns false if the source is missing.
async function copyRelative(rel: string): Promise<boolean> {
  const src = Bun.file(join(CORE_DIR, rel))
  if (!(await src.exists())) return false
  const dst = join(targetDir, rel)
  await mkdir(dirname(dst), { recursive: true })
  await Bun.write(dst, src)
  return true
}

// --- 1. Discover the Part/SubPart asset catalog XML ---------------------------

const xmlGlob = new Glob('**/*.{xml,XML}')
const assetXmlRels: string[] = []
for await (const rel of xmlGlob.scan({ cwd: CORE_DIR })) {
  const text = stripBom(await Bun.file(join(CORE_DIR, rel)).text())
  const isAssets = /<Assets[\s>]/.test(text)
  const hasParts = /<(Part|SubPart)[\s>]/.test(text)
  if (isAssets && hasParts) {
    assetXmlRels.push(rel)
    console.log(`Discovered asset XML: ${rel}`)
  }
}
assetXmlRels.sort()
console.log(`\nFound ${assetXmlRels.length} Part/SubPart asset XML file(s).\n`)

// --- 2. Copy each asset XML + its GameData sibling, collecting binary refs -----

const xmlToCopy = new Set<string>()
const binaryRefs = new Set<string>()

for (const rel of assetXmlRels) {
  xmlToCopy.add(rel)
  const text = stripBom(await Bun.file(join(CORE_DIR, rel)).text())
  for (const ref of findBinaryRefs(text)) binaryRefs.add(ref)

  // GameData sibling (e.g. CoreCommandAAssets.xml -> CoreCommandAGameData.xml).
  // Not every asset file has one; scan it for binary refs too (light packs, etc.).
  const gameDataRel = rel.replace(/Assets\.xml$/i, 'GameData.xml')
  if (gameDataRel !== rel) {
    const gameData = Bun.file(join(CORE_DIR, gameDataRel))
    if (await gameData.exists()) {
      xmlToCopy.add(gameDataRel)
      console.log(`Discovered GameData XML: ${gameDataRel}`)
      const gdText = stripBom(await gameData.text())
      for (const ref of findBinaryRefs(gdText)) binaryRefs.add(ref)
    }
  }
}

console.log(
  `\nReferenced binaries: ${binaryRefs.size} unique (.glb/.gltf/.ktx2/.dds)\n`,
)

// --- 3. Copy everything -------------------------------------------------------

let copied = 0
const missing: string[] = []

for (const rel of [...xmlToCopy].sort()) {
  if (await copyRelative(rel)) {
    console.log(`Copied XML:    ${rel}`)
    copied++
  } else {
    missing.push(rel)
  }
}

for (const rel of [...binaryRefs].sort()) {
  if (await copyRelative(rel)) {
    console.log(`Copied binary: ${rel}`)
    copied++
  } else {
    console.warn(`MISSING (skipped): ${rel}`)
    missing.push(rel)
  }
}

console.log(`\nDone. Copied ${copied} file(s) to ${targetDir}.`)
if (missing.length > 0) {
  console.warn(`${missing.length} referenced file(s) were missing and skipped.`)
}
