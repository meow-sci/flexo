import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { DOMParser } from '@xmldom/xmldom'
import { parseAssetsFile, type CatalogSubPart } from './catalog'
import { hasKsaAssets, ksaAsset, readVendoredAsset } from './ksaTestAssets'
import { COLLIDER_LAYER_ID } from './types'

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
    // The built-in Mesh + Material ids an export variant of this template reuses.
    expect(note.meshNodeName).toBe('CoreIVAPropA_Subpart_WrittenNoteE')
    expect(note.materialId).toBe('CoreIVAPropA_Material')
    // A normal structural SubPart carries no Internal flag.
    const truss = structural.find((s) => s.id === 'CoreStructuralA_Subpart_TrussBarA')!
    expect(truss.internal).toBeUndefined()
  })

  it.runIf(hasKsaAssets)('captures the raw <RayTracing> token, including ShadowProxy', () => {
    const space = parseFile('CoreIVASpaceAAssets.xml')
    const blocker = space.find((s) => s.id === 'CoreIVASpaceA_Subpart_MediumCapsuleARayBlocker')!
    expect(blocker.rayTracing).toBe('ShadowProxy')
  })
})

// Inline XML so the <RayTracing> capture is covered without the private asset tree.
describe('<PartModel><RayTracing> capture', () => {
  function parseInline(xml: string): CatalogSubPart[] {
    const out: CatalogSubPart[] = []
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    parseAssetsFile(doc as unknown as Document, 'InlineAssets.xml', out)
    return out
  }

  const xml = `<Assets>
    <MeshAtlas Path="Meshes/Inline_MeshAtlas.glb" />
    <SubPart Id="Inline_Subpart_Blocker">
      <PartModel Id="Inline_Subpart_Blocker_Model">
        <Internal>true</Internal>
        <Mesh Id="Inline_Subpart_Blocker" />
        <Material Id="Inline_Material" />
        <RayTracing>ShadowProxy</RayTracing>
      </PartModel>
    </SubPart>
    <SubPart Id="Inline_Subpart_Plain">
      <PartModel Id="Inline_Subpart_Plain_Model">
        <Mesh Id="Inline_Subpart_Plain" />
      </PartModel>
    </SubPart>
  </Assets>`

  it('keeps the token verbatim (flexo copies it, never interprets it)', () => {
    const out = parseInline(xml)
    const blocker = out.find((s) => s.id === 'Inline_Subpart_Blocker')!
    expect(blocker.rayTracing).toBe('ShadowProxy')
    expect(blocker.internal).toBe(true)
  })

  it('leaves `rayTracing` undefined for a template that authors none', () => {
    expect(
      parseInline(xml).find((s) => s.id === 'Inline_Subpart_Plain')!.rayTracing,
    ).toBeUndefined()
  })
})

// Runs against the committed fixtures (src/ksa/__fixtures__/), so it exercises the REAL
// Core data without the private asset tree.
describe('geometry <SubPart><Collider> (gap E — vendored fixtures)', () => {
  const out: CatalogSubPart[] = []
  const doc = new DOMParser().parseFromString(
    readVendoredAsset('CoreElectricalAAssets.xml'),
    'application/xml',
  )
  parseAssetsFile(doc as unknown as Document, 'CoreElectricalAAssets.xml', out)

  it('reads the solar-cell templates’ own <Box> collider off the geometry <SubPart>', () => {
    const cell = out.find((s) => s.id === 'CoreElectricalA_Subpart_SolarPanelA_CellA')!
    expect(cell.colliders).toEqual([
      {
        id: 'BoxCollider1',
        shape: 'Box',
        ownerTemplateId: 'CoreElectricalA_Subpart_SolarPanelA_CellA',
        position: { x: 0, y: 0, z: -0.00894 },
        rotation: { x: 0, y: 0, z: 0 },
        // Box dimensions are FULL extents: the cell's real mesh AABB is
        // 0.800 × 0.600 × 0.025 m. A half-extent reading would make this a 5 cm-thick,
        // 1.6 m panel instead of the 2.5 cm-thick 0.79 × 0.60 m one it is.
        scale: { x: 0.79467, y: 0.59602, z: 0.02531 },
        layerId: COLLIDER_LAYER_ID,
      },
    ])
  })

  it('leaves `colliders` undefined for a template that authors none', () => {
    const battery = out.find((s) => s.id === 'CoreElectricalA_Subpart_RadialBatteryA')!
    expect(battery.colliders).toBeUndefined()
  })
})
