import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { DOMParser } from '@xmldom/xmldom'
import { parseAssetsFile, type CatalogSubPart } from './catalog'
import { hasKsaAssets, ksaAsset } from './ksaTestAssets'

function parseFile(name: string): CatalogSubPart[] {
  const text = readFileSync(ksaAsset(name), 'utf-8')
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
  // Real licensed XML/GLB from the private assets repo; skips without it (open-source CI).
  const structural = hasKsaAssets ? parseFile('CoreStructuralAAssets.xml') : []

  it.runIf(hasKsaAssets)('extracts SubPart templates with atlas + mesh node + material', () => {
    expect(structural.length).toBeGreaterThan(20)
    const truss = structural.find((s) => s.id === 'CoreStructuralA_Subpart_TrussBarA')!
    expect(truss).toBeDefined()
    const base = import.meta.env.BASE_URL
    expect(truss.atlasUrl).toBe(`${base}ksa/Meshes/CoreStructuralA_MeshAtlas.glb`)
    expect(truss.meshNodeName).toBe('CoreStructuralA_Subpart_TrussBarA')
    expect(truss.materialId).toBe('CoreStructuralA_Material')
    expect(truss.diffuseUrl).toContain(`${base}ksa/Textures/`)
  })

  it.runIf(hasKsaAssets)('does not include Part SubPart instances (only templates)', () => {
    // Every entry must have a mesh node (templates), none should be an instance.
    for (const s of structural) {
      expect(s.meshNodeName ?? '').not.toBe('')
    }
  })

  it.runIf(hasKsaAssets)('every resolved mesh node name exists in its GLB atlas', () => {
    const names = glbNodeNames(ksaAsset('Meshes/CoreStructuralA_MeshAtlas.glb'))
    const missing = structural
      .filter((s) => s.meshNodeName && !names.has(s.meshNodeName))
      .map((s) => s.meshNodeName)
    expect(missing).toEqual([])
  })

  it.runIf(hasKsaAssets)('flags IVA (Internal) SubParts and leaves normal ones unmarked', () => {
    const iva = parseFile('CoreIVAPropAAssets.xml')
    const note = iva.find((s) => s.id === 'CoreIVAPropA_Subpart_WrittenNoteE')!
    expect(note).toBeDefined()
    expect(note.internal).toBe(true)
    // The built-in Mesh + Material ids the de-IVA export variant reuses.
    expect(note.meshNodeName).toBe('CoreIVAPropA_Subpart_WrittenNoteE')
    expect(note.materialId).toBe('CoreIVAPropA_Material')
    // A normal structural SubPart carries no Internal flag.
    const truss = structural.find((s) => s.id === 'CoreStructuralA_Subpart_TrussBarA')!
    expect(truss.internal).toBeUndefined()
  })
})
