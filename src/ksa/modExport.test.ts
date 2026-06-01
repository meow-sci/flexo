import { describe, expect, it, vi } from 'vitest'
import { createEmptyPart, createPartAnimation, identityTransform } from './types'
import type { CustomMesh, EditingPart, PartAnimation } from './types'

// Avoid loading the real kitten gltfs (GLTFLoader/fetch) — return tiny baked geometry.
vi.mock('../three/kittenBake', () => ({
  bakeKittenSubMeshes: vi.fn(async () => {
    const THREE = await import('three')
    const tri = () => {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3))
      return g
    }
    return [
      { specKey: 'suit', label: 'Suit', source: {}, geometry: tri() },
      { specKey: 'eye', label: 'Eyes', source: {}, geometry: tri() },
    ]
  }),
  buildKittenMaterial: vi.fn(async () => ({})),
}))
import {
  buildCustomBundle,
  buildIvaVariantMap,
  buildModContent,
  buildModZip,
  expandGlassGlow,
  sanitizeBaseName,
  serializeModToml,
  uniqueFileName,
} from './modExport'
import { serializeGameData, serializePart } from './partXmlSerializer'
import type { CatalogSubPart } from './catalog'
import { animGlbPath } from './animationNaming'

describe('sanitizeBaseName', () => {
  it('strips spaces and punctuation', () => {
    expect(sanitizeBaseName('My Part')).toBe('MyPart')
    expect(sanitizeBaseName('Project 1')).toBe('Project1')
    expect(sanitizeBaseName('a-b_c.d')).toBe('abcd')
  })
  it('falls back to "Mod" when empty', () => {
    expect(sanitizeBaseName('   ')).toBe('Mod')
    expect(sanitizeBaseName('???')).toBe('Mod')
  })
})

describe('serializeModToml', () => {
  it('matches the KSA mod.toml format', () => {
    expect(serializeModToml(['Project1Part.xml', 'Project1GameData.xml'])).toBe(
      'name = "flexo-parts"\nassets = [ "Project1Part.xml", "Project1GameData.xml"]\n',
    )
  })
  it('handles an empty asset list', () => {
    expect(serializeModToml([])).toBe('name = "flexo-parts"\nassets = []\n')
  })
})

describe('uniqueFileName', () => {
  it('returns the plain name when free', () => {
    expect(uniqueFileName(new Set(), 'FooPart', 'xml')).toBe('FooPart.xml')
  })
  it('suffixes on collision (case-insensitive)', () => {
    const taken = new Set(['foopart.xml', 'foopart-2.xml'])
    expect(uniqueFileName(taken, 'FooPart', 'xml')).toBe('FooPart-3.xml')
  })
})

describe('buildModContent', () => {
  it('derives Part/GameData filenames from the project name', () => {
    const c = buildModContent(createEmptyPart(), 'My Part')
    expect(c.partFile).toBe('MyPartPart.xml')
    expect(c.gameDataFile).toBe('MyPartGameData.xml')
    expect(c.partXml).toContain('<Part')
    expect(c.gameDataXml).toContain('<PartGameData')
  })
})

function partWithDoorAnimation(): EditingPart {
  const part = createEmptyPart()
  part.partId = 'MyPart'
  part.placements.push({
    instanceId: 'panel_1',
    subPartTemplateId: 'CoreStructuralA_Subpart_X',
    position: { x: 1, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    layerId: 'default',
  })
  const anim: PartAnimation = {
    id: 'anim_door',
    name: 'Door',
    durationSec: 1,
    mode: 'deployRetract',
    joints: [{ id: 'j', name: 'Hinge', parentJointId: null, memberInstanceIds: ['panel_1'] }],
    keyframes: [
      { id: 'k0', timeSec: 0, poses: { j: identityTransform() } },
      { id: 'k1', timeSec: 1, poses: { j: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: Math.PI / 2, z: 0 }, scale: { x: 1, y: 1, z: 1 } } } },
    ],
    solarTracking: null,
  }
  part.animations.push(anim)
  return part
}

describe('animation export', () => {
  it('GameData XML emits a <KeyframeAnimationModule> with the matching glb Path', () => {
    const part = partWithDoorAnimation()
    const base = sanitizeBaseName('My Part')
    const xml = serializeGameData(part, base)
    expect(xml).toContain('<KeyframeAnimationModule')
    expect(xml).toContain('ShowDeployRetract="true"')
    expect(xml).toContain(`Path="${animGlbPath(base, part.animations[0])}"`)
  })

  it('the bundle ships the Animations/*.glb at the path the XML references', async () => {
    const part = partWithDoorAnimation()
    const base = sanitizeBaseName('My Part')
    const bundle = await buildCustomBundle(part, base)
    const entry = bundle.binaries.find((b) => b.path === animGlbPath(base, part.animations[0]))
    expect(entry).toBeTruthy()
    const dv = new DataView(entry!.data.buffer, entry!.data.byteOffset, entry!.data.byteLength)
    expect(dv.getUint32(0, true)).toBe(0x46546c67) // it's a GLB
  })

  it('exports animations even with no custom meshes (Core-only animated part)', async () => {
    const bundle = await buildCustomBundle(partWithDoorAnimation(), 'MyPart')
    expect(bundle.assetsFile).toBeNull() // no custom SubParts → no Assets XML
    expect(bundle.binaries.length).toBe(1) // …but the animation glb still ships
  })

  it('emits <SolarTracking> with excludes when configured', () => {
    const part = partWithDoorAnimation()
    part.animations[0].solarTracking = { degreesPerSecond: 5, subPartInstanceId: 'panel_1', excludeInstanceIds: ['base_1'] }
    const xml = serializeGameData(part, 'MyPart')
    expect(xml).toContain('<SolarTracking')
    expect(xml).toContain('DegreesPerSecond="5"')
    expect(xml).toContain('SubPart="panel_1"')
    expect(xml).toContain('<ExcludeSubPart>base_1</ExcludeSubPart>')
  })

  it('skips a degenerate animation (no joints / single keyframe)', async () => {
    const part = createEmptyPart()
    part.animations.push(createPartAnimation('anim_x', 'Empty'))
    expect(serializeGameData(part, 'P')).not.toContain('KeyframeAnimationModule')
    expect((await buildCustomBundle(part, 'P')).binaries).toHaveLength(0)
  })
})

function partWithKittenMeshes(): EditingPart {
  const part = createEmptyPart()
  part.partId = 'KittenMod'
  const add = (subPartId: string, kitten: EditingPart['customMeshes'][number]['kitten']) => {
    part.customMeshes.push({ id: `mesh_${subPartId}`, name: subPartId, subPartId, kitten, faceTextures: {} })
    part.placements.push({ instanceId: subPartId, subPartTemplateId: subPartId, ...identityTransform(), layerId: 'default' })
  }
  add('flexo_hunter_suit_a', {
    kind: 'hunter',
    specKey: 'suit',
    diffuse: 'Textures/Characters/Kitten_EMU_A.ktx2',
    normal: 'Textures/Characters/Kitten_EMU_N.ktx2',
    aoRoughMetal: 'Textures/Characters/Kitten_EMU_ORM.ktx2',
  })
  add('flexo_hunter_eye_b', { kind: 'hunter', specKey: 'eye', diffuse: 'Textures/Characters/Kitten_Eye_Green2_A.ktx2' })
  return part
}

describe('buildCustomBundle — part-ified kitten textures', () => {
  it('reference mode emits absolute <Diffuse>/<Normal>/<AoRoughMetal> and copies no kitten textures', async () => {
    const bundle = await buildCustomBundle(partWithKittenMeshes(), 'KittenMod', {
      mode: 'reference',
      contentCorePath: 'C:\\KSA\\Content\\Core',
    })
    expect(bundle.assetsXml).toContain('<Diffuse Path="C:\\KSA\\Content\\Core\\Textures\\Characters\\Kitten_EMU_A.ktx2"')
    expect(bundle.assetsXml).toContain('<Normal Path="C:\\KSA\\Content\\Core\\Textures\\Characters\\Kitten_EMU_N.ktx2"')
    expect(bundle.assetsXml).toContain('<AoRoughMetal Path="C:\\KSA\\Content\\Core\\Textures\\Characters\\Kitten_EMU_ORM.ktx2"')
    // Eyes (diffuse only) fall back to the shared synthetic normal/ORM.
    expect(bundle.assetsXml).toContain('_FlatNormal.ktx2')
    expect(bundle.assetsXml).toContain('_NeutralORM.ktx2')
    // No game textures are copied into the mod; the baked mesh atlas still ships.
    expect(bundle.binaries.filter((b) => b.path.includes('Kitten_'))).toHaveLength(0)
    expect(bundle.binaries.some((b) => b.path.endsWith('_MeshAtlas.glb'))).toBe(true)
  })

  it('bundle mode copies each unique kitten .ktx2 verbatim (deduped) and references them relatively', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer }))
    vi.stubGlobal('fetch', fetchMock)
    try {
      const bundle = await buildCustomBundle(partWithKittenMeshes(), 'KittenMod', { mode: 'bundle', contentCorePath: '' })
      const paths = bundle.binaries.map((b) => b.path)
      expect(paths).toContain('Textures/Kitten_EMU_A.ktx2')
      expect(paths).toContain('Textures/Kitten_EMU_N.ktx2')
      expect(paths).toContain('Textures/Kitten_EMU_ORM.ktx2')
      expect(paths).toContain('Textures/Kitten_Eye_Green2_A.ktx2')
      expect(bundle.assetsXml).toContain('<Diffuse Path="Textures/Kitten_EMU_A.ktx2"')
      // 4 unique subpaths → exactly 4 fetches (no duplicate copies).
      expect(fetchMock).toHaveBeenCalledTimes(4)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

function ivaCatalog(): Map<string, CatalogSubPart> {
  return new Map<string, CatalogSubPart>([
    [
      'CoreIVAPropA_Subpart_ChairA',
      {
        id: 'CoreIVAPropA_Subpart_ChairA',
        atlasUrl: '/ksa/Meshes/CoreIVAPropA_MeshAtlas.glb',
        meshNodeName: 'CoreIVAPropA_Subpart_ChairA',
        materialId: 'CoreIVAPropA_Material',
        internal: true,
        sourceFile: 'CoreIVAPropAAssets.xml',
      },
    ],
    [
      'CoreStructuralA_Subpart_X',
      {
        id: 'CoreStructuralA_Subpart_X',
        atlasUrl: '/ksa/Meshes/CoreStructuralA_MeshAtlas.glb',
        meshNodeName: 'CoreStructuralA_Subpart_X',
        materialId: 'CoreStructuralA_Material',
        sourceFile: 'CoreStructuralAAssets.xml',
      },
    ],
  ])
}

function partWithIvaAndCore(): EditingPart {
  const part = createEmptyPart()
  part.partId = 'MyShip'
  part.placements.push(
    { instanceId: 'chair_1', subPartTemplateId: 'CoreIVAPropA_Subpart_ChairA', ...identityTransform(), layerId: 'default' },
    { instanceId: 'x_1', subPartTemplateId: 'CoreStructuralA_Subpart_X', ...identityTransform(), layerId: 'default' },
  )
  return part
}

describe('IVA (Internal) SubPart export variants', () => {
  it('maps placed IVA templates to project-namespaced variants, skipping normal parts', () => {
    const variants = buildIvaVariantMap(partWithIvaAndCore(), ivaCatalog(), 'MyShip')
    expect(variants.size).toBe(1)
    const v = variants.get('CoreIVAPropA_Subpart_ChairA')!
    expect(v.variantId).toBe('flexo_MyShip_CoreIVAPropA_Subpart_ChairA_NotIVA')
    expect(v.meshId).toBe('CoreIVAPropA_Subpart_ChairA')
    expect(v.materialId).toBe('CoreIVAPropA_Material')
  })

  it('dedupes repeated placements of the same IVA template', () => {
    const part = partWithIvaAndCore()
    part.placements.push({ instanceId: 'chair_2', subPartTemplateId: 'CoreIVAPropA_Subpart_ChairA', ...identityTransform(), layerId: 'default' })
    expect(buildIvaVariantMap(part, ivaCatalog(), 'MyShip').size).toBe(1)
  })

  it('produces no variants for a part with no IVA props', () => {
    const part = createEmptyPart()
    part.placements.push({ instanceId: 'x_1', subPartTemplateId: 'CoreStructuralA_Subpart_X', ...identityTransform(), layerId: 'default' })
    expect(buildIvaVariantMap(part, ivaCatalog(), 'P').size).toBe(0)
  })

  it('Part XML points IVA placements at the variant, normal placements unchanged', () => {
    const part = partWithIvaAndCore()
    const variants = buildIvaVariantMap(part, ivaCatalog(), 'MyShip')
    const remap = new Map([...variants.values()].map((v) => [v.originalId, v.variantId]))
    const xml = serializePart(part, remap)
    expect(xml).toContain('InstanceOf="flexo_MyShip_CoreIVAPropA_Subpart_ChairA_NotIVA"')
    expect(xml).toContain('InstanceOf="CoreStructuralA_Subpart_X"')
    expect(xml).not.toContain('InstanceOf="CoreIVAPropA_Subpart_ChairA"') // the closing quote disambiguates from the variant
  })

  it('Assets XML declares the de-IVA variant (no Internal/RayTracing) even with no custom meshes', async () => {
    const part = partWithIvaAndCore()
    const variants = buildIvaVariantMap(part, ivaCatalog(), 'MyShip')
    const bundle = await buildCustomBundle(part, 'MyShip', undefined, variants)
    expect(bundle.assetsFile).toBe('MyShipAssets.xml')
    expect(bundle.assetsXml).toContain('<SubPart Id="flexo_MyShip_CoreIVAPropA_Subpart_ChairA_NotIVA"')
    expect(bundle.assetsXml).toContain('<PartModel Id="flexo_MyShip_CoreIVAPropA_Subpart_ChairA_NotIVA_Model"')
    expect(bundle.assetsXml).toContain('<Mesh Id="CoreIVAPropA_Subpart_ChairA"')
    expect(bundle.assetsXml).toContain('<Material Id="CoreIVAPropA_Material"')
    expect(bundle.assetsXml).not.toContain('<Internal>')
    expect(bundle.assetsXml).not.toContain('RayTracing')
    expect(bundle.assetsXml).not.toContain('MeshAtlas') // IVA-only → no custom geometry
    expect(bundle.binaries).toHaveLength(0) // variants reuse built-in assets — nothing to ship
  })

  it('end-to-end: buildModZip threads the catalog into both Part and Assets XML', async () => {
    const blob = await buildModZip(partWithIvaAndCore(), 'MyShip', undefined, ivaCatalog())
    const text = new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()))
    expect(text).toContain('flexo-parts/MyShipAssets.xml')
    expect(text).toContain('InstanceOf="flexo_MyShip_CoreIVAPropA_Subpart_ChairA_NotIVA"')
    expect(text).toContain('<SubPart Id="flexo_MyShip_CoreIVAPropA_Subpart_ChairA_NotIVA"')
  })
})

describe('buildModZip', () => {
  it('produces a zip archive containing the flexo-parts entries', async () => {
    const blob = await buildModZip(createEmptyPart(), 'Project1')
    expect(blob.type).toBe('application/zip')
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const text = new TextDecoder('latin1').decode(bytes)
    expect(text).toContain('flexo-parts/mod.toml')
    expect(text).toContain('flexo-parts/Project1Part.xml')
    expect(text).toContain('flexo-parts/Project1GameData.xml')
    // End-of-central-directory signature (PK\x05\x06).
    const eocd = bytes.subarray(bytes.length - 22)
    const view = new DataView(eocd.buffer, eocd.byteOffset, eocd.byteLength)
    expect(view.getUint32(0, true)).toBe(0x06054b50)
    expect(view.getUint16(10, true)).toBe(3) // total entries
  })

  it('includes the Animations/*.glb entry for an animated part', async () => {
    const blob = await buildModZip(partWithDoorAnimation(), 'My Part')
    const text = new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()))
    expect(text).toContain(`flexo-parts/${animGlbPath('MyPart', partWithDoorAnimation().animations[0])}`)
  })
})

// A part with a single visor (transparent kitten submesh). specKey 'suit' matches the mocked bake
// above so the geometry node resolves; transparent:true is what makes it a visor.
function partWithVisor(overrides: Partial<CustomMesh>): EditingPart {
  const part = createEmptyPart()
  part.partId = 'VisorMod'
  const subPartId = 'flexo_hunter_visor_a'
  part.customMeshes.push({
    id: 'mesh_visor',
    name: 'Visor',
    subPartId,
    kitten: { kind: 'hunter', specKey: 'suit', diffuse: 'Textures/Characters/Kitty_Helmet_Visor_A.ktx2', transparent: true },
    faceTextures: {},
    ...overrides,
  })
  part.placements.push({ instanceId: 'visor_1', subPartTemplateId: subPartId, ...identityTransform(), layerId: 'default' })
  return part
}

const REF = { mode: 'reference', contentCorePath: 'C:\\KSA\\Content\\Core' } as const

describe('visor glass tint + glow export', () => {
  it('a plain visor exports through the glass path with its real diffuse and no emissive', async () => {
    const bundle = await buildCustomBundle(partWithVisor({}), 'VisorMod', REF)
    expect(bundle.assetsXml).toContain('<PartModelGlass')
    expect(bundle.assetsXml).toContain('Kitty_Helmet_Visor_A.ktx2')
    expect(bundle.assetsXml).not.toContain('<Emissive')
  })

  it('a glass-tinted visor emits a generated solid diffuse and stays on the glass path (no emissive)', async () => {
    const part = partWithVisor({ surface: 'glass', glass: { tint: { r: 200, g: 30, b: 30 } } })
    const bundle = await buildCustomBundle(part, 'VisorMod', REF)
    expect(bundle.assetsXml).toContain('<PartModelGlass')
    expect(bundle.assetsXml).not.toContain('<Emissive')
    // A generated solid tint diffuse is bundled for this subpart, not the stock visor texture.
    expect(bundle.binaries.some((b) => b.path.endsWith('flexo_hunter_visor_a_Diffuse.ktx2'))).toBe(true)
    expect(bundle.assetsXml).not.toContain('Kitty_Helmet_Visor_A.ktx2')
  })

  it('an opaque-glow visor exports <PartModel> + an emissive mask, never <PartModelGlass>', async () => {
    const part = partWithVisor({ surface: 'glow', emissive: { shape: 'whole', color: { r: 255, g: 180, b: 0 }, strength: 0.7 } })
    const bundle = await buildCustomBundle(part, 'VisorMod', REF)
    expect(bundle.assetsXml).toContain('<Emissive')
    expect(bundle.assetsXml).not.toContain('<PartModelGlass')
    expect(bundle.binaries.some((b) => b.path.endsWith('_Emissive.ktx2'))).toBe(true)
  })

  it('expandGlassGlow turns a glassGlow visor into a glass + inset-glow SubPart pair at one transform', () => {
    const part = partWithVisor({
      surface: 'glassGlow',
      glass: { tint: { r: 10, g: 200, b: 10 } },
      emissive: { shape: 'whole', color: { r: 10, g: 255, b: 10 }, strength: 0.6 },
    })
    const { part: expanded, insetIds } = expandGlassGlow(part)
    expect(expanded.customMeshes).toHaveLength(2)
    expect(expanded.placements).toHaveLength(2)
    expect(insetIds.has('flexo_hunter_visor_a_Glow')).toBe(true)
    const glow = expanded.customMeshes.find((m) => m.subPartId === 'flexo_hunter_visor_a_Glow')!
    expect(glow.surface).toBe('glow')
    expect(glow.emissive).toEqual(part.customMeshes[0].emissive)
    // The glow placement shares the visor's transform (identity here) and a distinct instanceId.
    const glowPlacement = expanded.placements.find((p) => p.subPartTemplateId === 'flexo_hunter_visor_a_Glow')!
    expect(glowPlacement.instanceId).toBe('visor_1_glow')
    expect(glowPlacement.position).toEqual({ x: 0, y: 0, z: 0 })
  })

  it('a glassGlow visor bundles a glass shell AND an opaque emissive layer', async () => {
    const part = partWithVisor({
      surface: 'glassGlow',
      glass: { tint: { r: 10, g: 200, b: 10 } },
      emissive: { shape: 'whole', color: { r: 10, g: 255, b: 10 }, strength: 0.6 },
    })
    const { part: expanded, insetIds } = expandGlassGlow(part)
    const bundle = await buildCustomBundle(expanded, 'VisorMod', REF, new Map(), insetIds)
    expect(bundle.assetsXml).toContain('<PartModelGlass') // the shell
    expect(bundle.assetsXml).toContain('<PartModel ') // the opaque glow layer
    expect(bundle.assetsXml).toContain('<Emissive')
    expect(bundle.assetsXml).toContain('flexo_hunter_visor_a_Glow')
    expect(bundle.binaries.some((b) => b.path.endsWith('_Emissive.ktx2'))).toBe(true)
  })

  it('expandGlassGlow is a no-op for a non-glassGlow part', () => {
    const part = partWithVisor({ surface: 'glass' })
    const { part: same, insetIds } = expandGlassGlow(part)
    expect(same).toBe(part)
    expect(insetIds.size).toBe(0)
  })
})
