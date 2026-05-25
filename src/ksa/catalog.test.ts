import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { DOMParser } from '@xmldom/xmldom'
import { parseAssetsFile, type CatalogSubPart } from './catalog'

const CORE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../thirdparty/ksa/Content/Core',
)

function parseFile(name: string): CatalogSubPart[] {
  const text = readFileSync(join(CORE_DIR, name), 'utf-8')
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  const out: CatalogSubPart[] = []
  parseAssetsFile(doc as unknown as Document, name, out)
  return out
}

/** Extracts the node names declared in a GLB's JSON chunk. */
function glbNodeNames(glbPath: string): Set<string> {
  const buf = readFileSync(glbPath)
  // GLB header: magic(4) version(4) length(4); first chunk: length(4) type(4) data.
  const jsonChunkLength = buf.readUInt32LE(12)
  const jsonText = buf.toString('utf-8', 20, 20 + jsonChunkLength)
  const json = JSON.parse(jsonText) as { nodes?: { name?: string }[] }
  return new Set((json.nodes ?? []).map((n) => n.name).filter((n): n is string => !!n))
}

describe('catalog parsing (real Core XML)', () => {
  const structural = parseFile('CoreStructuralAAssets.xml')

  it('extracts SubPart templates with atlas + mesh node + material', () => {
    expect(structural.length).toBeGreaterThan(20)
    const truss = structural.find((s) => s.id === 'CoreStructuralA_Subpart_TrussBarA')!
    expect(truss).toBeDefined()
    const base = import.meta.env.BASE_URL
    expect(truss.atlasUrl).toBe(`${base}ksa/Meshes/CoreStructuralA_MeshAtlas.glb`)
    expect(truss.meshNodeName).toBe('CoreStructuralA_Subpart_TrussBarA')
    expect(truss.materialId).toBe('CoreStructuralA_Material')
    expect(truss.diffuseUrl).toContain(`${base}ksa/Textures/`)
  })

  it('does not include Part SubPart instances (only templates)', () => {
    // Every entry must have a mesh node (templates), none should be an instance.
    for (const s of structural) {
      expect(s.meshNodeName ?? '').not.toBe('')
    }
  })

  it('every resolved mesh node name exists in its GLB atlas', () => {
    const names = glbNodeNames(join(CORE_DIR, 'Meshes/CoreStructuralA_MeshAtlas.glb'))
    const missing = structural
      .filter((s) => s.meshNodeName && !names.has(s.meshNodeName))
      .map((s) => s.meshNodeName)
    expect(missing).toEqual([])
  })
})
