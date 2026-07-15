import { describe, expect, it, vi } from 'vitest'
import {
  createEmptyPart,
  createLight,
  createPartAnimation,
  createSubPartGameData,
  identityTransform,
} from './types'
import type { CustomMesh, EditingPart, PartAnimation } from './types'

// In-memory stand-in for the IndexedDB blob store (happy-dom has no indexedDB), so
// image-channel export paths (stored-.ktx2 copies) are testable. Keys mirror assetKeys.
vi.mock('../state/assetDb', () => {
  const store = new Map<string, Blob>()
  return {
    assetKeys: {
      textureSource: (id: string) => `tex-src:${id}`,
      textureKtx2: (id: string) => `tex-ktx2:${id}`,
      meshGlb: (id: string) => `mesh-glb:${id}`,
      emissivePaint: (id: string) => `emissive-paint:${id}`,
    },
    getAsset: async (key: string) => store.get(key) ?? null,
    putAsset: async (key: string, data: Blob | Uint8Array, type = '') => {
      store.set(key, data instanceof Blob ? data : new Blob([data.slice()], { type }))
    },
    deleteAsset: async (key: string) => {
      store.delete(key)
    },
    __assetStore: store,
  }
})

// Avoid loading the real kitten gltfs (GLTFLoader/fetch) — return tiny baked geometry.
vi.mock('../three/kittenBake', () => ({
  bakeKittenSubMeshes: vi.fn(async () => {
    const THREE = await import('three')
    const tri = () => {
      const g = new THREE.BufferGeometry()
      g.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3),
      )
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
  buildExportVariantMap,
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
      {
        id: 'k1',
        timeSec: 1,
        poses: {
          j: {
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: Math.PI / 2, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
          },
        },
      },
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
    part.animations[0].solarTracking = {
      degreesPerSecond: 5,
      subPartInstanceId: 'panel_1',
      excludeInstanceIds: ['base_1'],
    }
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
    part.customMeshes.push({
      id: `mesh_${subPartId}`,
      name: subPartId,
      subPartId,
      kitten,
      faceTextures: {},
    })
    part.placements.push({
      instanceId: subPartId,
      subPartTemplateId: subPartId,
      ...identityTransform(),
      layerId: 'default',
    })
  }
  add('flexo_hunter_suit_a', {
    kind: 'hunter',
    specKey: 'suit',
    diffuse: 'Textures/Characters/Kitten_EMU_A.ktx2',
    normal: 'Textures/Characters/Kitten_EMU_N.ktx2',
    aoRoughMetal: 'Textures/Characters/Kitten_EMU_ORM.ktx2',
  })
  add('flexo_hunter_eye_b', {
    kind: 'hunter',
    specKey: 'eye',
    diffuse: 'Textures/Characters/Kitten_Eye_Green2_A.ktx2',
  })
  return part
}

describe('buildCustomBundle — part-ified kitten textures', () => {
  it('reference mode emits absolute <Diffuse>/<Normal>/<AoRoughMetal> and copies no kitten textures', async () => {
    const bundle = await buildCustomBundle(partWithKittenMeshes(), 'KittenMod', {
      mode: 'reference',
      contentCorePath: 'C:\\KSA\\Content\\Core',
    })
    expect(bundle.assetsXml).toContain(
      '<Diffuse Path="C:\\KSA\\Content\\Core\\Textures\\Characters\\Kitten_EMU_A.ktx2"',
    )
    expect(bundle.assetsXml).toContain(
      '<Normal Path="C:\\KSA\\Content\\Core\\Textures\\Characters\\Kitten_EMU_N.ktx2"',
    )
    expect(bundle.assetsXml).toContain(
      '<AoRoughMetal Path="C:\\KSA\\Content\\Core\\Textures\\Characters\\Kitten_EMU_ORM.ktx2"',
    )
    // Eyes (diffuse only) fall back to the shared synthetic normal/ORM.
    expect(bundle.assetsXml).toContain('_FlatNormal.ktx2')
    expect(bundle.assetsXml).toContain('_NeutralORM.ktx2')
    // No game textures are copied into the mod; the baked mesh atlas still ships.
    expect(bundle.binaries.filter((b) => b.path.includes('Kitten_'))).toHaveLength(0)
    expect(bundle.binaries.some((b) => b.path.endsWith('_MeshAtlas.glb'))).toBe(true)
  })

  it('bundle mode copies each unique kitten .ktx2 verbatim (deduped) and references them relatively', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
    }))
    vi.stubGlobal('fetch', fetchMock)
    try {
      const bundle = await buildCustomBundle(partWithKittenMeshes(), 'KittenMod', {
        mode: 'bundle',
        contentCorePath: '',
      })
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

describe('SubPart light GameData export', () => {
  const REF_TEX = { mode: 'reference', contentCorePath: 'C:\\KSA\\Content\\Core' } as const

  // A custom light SubPart's <Light> must reach the GameData XML keyed by the SAME id that
  // the Part tree references (InstanceOf) and the Assets XML declares (<SubPart Id>), or KSA's
  // merge-by-id won't attach the light. See analysis/HOW_LIGHT_PARTS_WORK.md §1.1.
  it('emits <SubPartGameData><Light> with an id aligned across Part / GameData / Assets XML', async () => {
    const part = partWithKittenMeshes()
    const lampId = 'flexo_hunter_suit_a' // a placed custom SubPart
    part.subPartGameData.push({ ...createSubPartGameData(lampId), lights: [createLight()] })

    const gameDataXml = serializeGameData(part, 'KittenMod')
    const partXml = serializePart(part)
    const bundle = await buildCustomBundle(part, 'KittenMod', REF_TEX)

    // GameData carries the light, keyed by the SubPart template id.
    expect(gameDataXml).toContain(`<SubPartGameData Id="${lampId}"`)
    expect(gameDataXml).toContain('<Light>')
    expect(gameDataXml).toContain('<Type>Spot</Type>')
    // The Part tree instantiates that template, and the Assets XML declares it — same id everywhere.
    expect(partXml).toContain(`InstanceOf="${lampId}"`)
    expect(bundle.assetsXml).toContain(`<SubPart Id="${lampId}"`)
  })

  it('emits one <PowerConsumer LightSwitch="true"> for the part switch', () => {
    const part = createEmptyPart()
    part.gameData.powerConsumer = { consumedWatts: 60, lightSwitch: true, lightIsActive: false }
    const xml = serializeGameData(part, 'P')
    expect(xml.match(/<PowerConsumer/g)?.length).toBe(1)
    expect(xml).toContain('LightSwitch="true"')
    expect(xml).not.toContain('LightIsActive')
  })
})

const SPOTLIGHT = 'CoreElectricalA_Subpart_SpotlightA'

/** A catalog with one non-IVA built-in light SubPart (mesh + material), like CoreElectricalA. */
function lightCatalog(): Map<string, CatalogSubPart> {
  return new Map<string, CatalogSubPart>([
    [
      SPOTLIGHT,
      {
        id: SPOTLIGHT,
        atlasUrl: '/ksa/Meshes/CoreElectricalA_MeshAtlas.glb',
        meshNodeName: SPOTLIGHT,
        materialId: 'CoreElectricalA_Material',
        sourceFile: 'CoreElectricalAAssets.xml',
      },
    ],
  ])
}

/** A part that places the built-in spotlight SubPart and gives it a <Light> (the reported case). */
function partWithBuiltinLight(): EditingPart {
  const part = createEmptyPart()
  part.partId = 'fixme_part_id'
  part.placements.push({
    instanceId: 'spot_1',
    subPartTemplateId: SPOTLIGHT,
    ...identityTransform(),
    layerId: 'default',
  })
  part.subPartGameData.push({ ...createSubPartGameData(SPOTLIGHT), lights: [createLight()] })
  return part
}

describe('built-in SubPart GameData export variants (never redefine the built-in)', () => {
  const VID = `flexo_MyLight_${SPOTLIGHT}`

  it('creates a variant for a placed built-in SubPart carrying GameData, reusing built-in mesh/material', () => {
    const v = buildExportVariantMap(partWithBuiltinLight(), lightCatalog(), 'MyLight').get(
      SPOTLIGHT,
    )!
    expect(v.variantId).toBe(VID) // no _NotIVA suffix — it's not an IVA prop
    expect(v.meshId).toBe(SPOTLIGHT)
    expect(v.materialId).toBe('CoreElectricalA_Material')
  })

  it('makes NO variant for a placed built-in SubPart with no GameData (plain mesh reuse)', () => {
    const part = createEmptyPart()
    part.placements.push({
      instanceId: 's',
      subPartTemplateId: SPOTLIGHT,
      ...identityTransform(),
      layerId: 'default',
    })
    expect(buildExportVariantMap(part, lightCatalog(), 'X').size).toBe(0)
  })

  it('Part + GameData XML reference the variant id, never the built-in id', () => {
    const content = buildModContent(partWithBuiltinLight(), 'MyLight', lightCatalog())
    // The <Light> moves onto a fresh variant SubPartGameData…
    expect(content.gameDataXml).toContain(`<SubPartGameData Id="${VID}"`)
    expect(content.gameDataXml).toContain('<Light>')
    // …and the built-in SubPart is NEVER redefined (the reported bug).
    expect(content.gameDataXml).not.toContain(`<SubPartGameData Id="${SPOTLIGHT}"`)
    // The placement instantiates the variant, not the built-in.
    expect(content.partXml).toContain(`InstanceOf="${VID}"`)
    expect(content.partXml).not.toContain(`InstanceOf="${SPOTLIGHT}"`)
  })

  it('Assets XML declares the variant reusing the built-in Mesh + Material (ships no binaries)', async () => {
    const content = buildModContent(partWithBuiltinLight(), 'MyLight', lightCatalog())
    const bundle = await buildCustomBundle(
      partWithBuiltinLight(),
      content.base,
      undefined,
      content.variants,
    )
    expect(bundle.assetsFile).toBe('MyLightAssets.xml')
    expect(bundle.assetsXml).toContain(`<SubPart Id="${VID}"`)
    expect(bundle.assetsXml).toContain(`<PartModel Id="${VID}_Model"`)
    expect(bundle.assetsXml).toContain(`<Mesh Id="${SPOTLIGHT}"`) // reuse built-in geometry
    expect(bundle.assetsXml).toContain('<Material Id="CoreElectricalA_Material"')
    expect(bundle.assetsXml).not.toContain('MeshAtlas') // no custom geometry generated
    expect(bundle.binaries).toHaveLength(0) // reuses built-in art — nothing to ship
  })

  it('end-to-end zip never emits a <SubPartGameData> for the built-in id', async () => {
    const blob = await buildModZip(partWithBuiltinLight(), 'MyLight', undefined, lightCatalog())
    const text = new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()))
    expect(text).toContain(`<SubPartGameData Id="${VID}"`)
    expect(text).not.toContain(`<SubPartGameData Id="${SPOTLIGHT}"`)
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
    {
      instanceId: 'chair_1',
      subPartTemplateId: 'CoreIVAPropA_Subpart_ChairA',
      ...identityTransform(),
      layerId: 'default',
    },
    {
      instanceId: 'x_1',
      subPartTemplateId: 'CoreStructuralA_Subpart_X',
      ...identityTransform(),
      layerId: 'default',
    },
  )
  return part
}

describe('IVA (Internal) SubPart export variants', () => {
  it('maps placed IVA templates to project-namespaced variants, skipping normal parts', () => {
    const variants = buildExportVariantMap(partWithIvaAndCore(), ivaCatalog(), 'MyShip')
    expect(variants.size).toBe(1)
    const v = variants.get('CoreIVAPropA_Subpart_ChairA')!
    expect(v.variantId).toBe('flexo_MyShip_CoreIVAPropA_Subpart_ChairA_NotIVA')
    expect(v.meshId).toBe('CoreIVAPropA_Subpart_ChairA')
    expect(v.materialId).toBe('CoreIVAPropA_Material')
  })

  it('dedupes repeated placements of the same IVA template', () => {
    const part = partWithIvaAndCore()
    part.placements.push({
      instanceId: 'chair_2',
      subPartTemplateId: 'CoreIVAPropA_Subpart_ChairA',
      ...identityTransform(),
      layerId: 'default',
    })
    expect(buildExportVariantMap(part, ivaCatalog(), 'MyShip').size).toBe(1)
  })

  it('produces no variants for a part with no IVA props', () => {
    const part = createEmptyPart()
    part.placements.push({
      instanceId: 'x_1',
      subPartTemplateId: 'CoreStructuralA_Subpart_X',
      ...identityTransform(),
      layerId: 'default',
    })
    expect(buildExportVariantMap(part, ivaCatalog(), 'P').size).toBe(0)
  })

  it('Part XML points IVA placements at the variant, normal placements unchanged', () => {
    const part = partWithIvaAndCore()
    const variants = buildExportVariantMap(part, ivaCatalog(), 'MyShip')
    const remap = new Map([...variants.values()].map((v) => [v.originalId, v.variantId]))
    const xml = serializePart(part, remap)
    expect(xml).toContain('InstanceOf="flexo_MyShip_CoreIVAPropA_Subpart_ChairA_NotIVA"')
    expect(xml).toContain('InstanceOf="CoreStructuralA_Subpart_X"')
    expect(xml).not.toContain('InstanceOf="CoreIVAPropA_Subpart_ChairA"') // the closing quote disambiguates from the variant
  })

  it('Assets XML declares the de-IVA variant (no Internal/RayTracing) even with no custom meshes', async () => {
    const part = partWithIvaAndCore()
    const variants = buildExportVariantMap(part, ivaCatalog(), 'MyShip')
    const bundle = await buildCustomBundle(part, 'MyShip', undefined, variants)
    expect(bundle.assetsFile).toBe('MyShipAssets.xml')
    expect(bundle.assetsXml).toContain(
      '<SubPart Id="flexo_MyShip_CoreIVAPropA_Subpart_ChairA_NotIVA"',
    )
    expect(bundle.assetsXml).toContain(
      '<PartModel Id="flexo_MyShip_CoreIVAPropA_Subpart_ChairA_NotIVA_Model"',
    )
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
    expect(text).toContain(
      `flexo-parts/${animGlbPath('MyPart', partWithDoorAnimation().animations[0])}`,
    )
  })
})

/** A part with primitive meshes wearing a CustomMaterial (the "red metallic button" case). */
function partWithMaterialMeshes(): EditingPart {
  const part = createEmptyPart()
  part.partId = 'ButtonMod'
  part.customMaterials.push({
    id: 'mat_red1',
    name: 'Red Metal',
    baseColor: { kind: 'color', color: { r: 255, g: 0, b: 0 } },
    metalness: { kind: 'value', value: 1 },
    roughness: { kind: 'value', value: 0.15 },
  })
  const add = (subPartId: string, materialId?: string) => {
    part.customMeshes.push({
      id: `mesh_${subPartId}`,
      name: subPartId,
      subPartId,
      primitive: { kind: 'box', params: { width: 1, height: 1, depth: 1 } },
      faceTextures: {},
      materialId,
    })
    part.placements.push({
      instanceId: subPartId,
      subPartTemplateId: subPartId,
      ...identityTransform(),
      layerId: 'default',
    })
  }
  add('flexo_button_a', 'mat_red1')
  add('flexo_plinth_b', 'mat_red1')
  add('flexo_bare_c') // no material → untextured legacy SubPart
  return part
}

describe('buildCustomBundle — uniform-channel CustomMaterial (red metallic button)', () => {
  it('emits solid BaseColor + ORM texels and ONE shared PbrMaterial for both meshes', async () => {
    const bundle = await buildCustomBundle(partWithMaterialMeshes(), 'ButtonMod')
    const paths = bundle.binaries.map((b) => b.path)

    // Uniform channels become 1×1 solids: pure-red diffuse + ORM (AO 255, rough 0.15→38=0x26, metal 255).
    expect(paths.some((p) => p.endsWith('_BaseColor_ff0000.ktx2'))).toBe(true)
    expect(paths.some((p) => p.endsWith('_ORM_ff26ff.ktx2'))).toBe(true)
    expect(paths.some((p) => p.endsWith('_FlatNormal.ktx2'))).toBe(true)
    // Each solid ships exactly once even though two meshes share the material.
    expect(paths.filter((p) => p.includes('_BaseColor_ff0000'))).toHaveLength(1)
    expect(paths.filter((p) => p.includes('_ORM_ff26ff'))).toHaveLength(1)

    // ONE shared <PbrMaterial>, named from the material, referenced by both SubParts.
    const xml = bundle.assetsXml!
    expect(xml.match(/<PbrMaterial /g)?.length).toBe(1)
    expect(xml).toContain('<PbrMaterial Id="flexo_RedMetal_red1_Material"')
    expect(xml.match(/<Material Id="flexo_RedMetal_red1_Material"/g)?.length).toBe(2)
    expect(xml).toContain('<Diffuse Path="Textures/ButtonMod_flexo_button_a_BaseColor_ff0000.ktx2"')
    expect(xml).toContain('<AoRoughMetal Path="Textures/ButtonMod_flexo_button_a_ORM_ff26ff.ktx2"')

    // The material-less mesh stays untextured (no <Material>) but keeps its MeshView.
    expect(xml).toContain('<SubPart Id="flexo_bare_c"')
    const bare = xml.slice(xml.indexOf('<SubPart Id="flexo_bare_c"'))
    expect(bare.slice(0, bare.indexOf('</SubPart>'))).not.toContain('<Material ')
    expect(bare).toContain('<Mesh Id="flexo_bare_c_VM"')
  })

  it('a glowing mesh keeps its material scalars in the ORM and bakes the base color under the glow', async () => {
    const part = partWithMaterialMeshes()
    part.customMeshes[0].emissive = {
      shape: 'whole',
      color: { r: 255, g: 255, b: 255 },
      strength: 0.5,
    }
    const bundle = await buildCustomBundle(part, 'ButtonMod')
    const xml = bundle.assetsXml!
    // The glowing mesh gets its own per-mesh material (composited diffuse) with <Emissive>…
    expect(xml).toContain('<PbrMaterial Id="flexo_button_a_Material"')
    expect(xml).toContain(
      '<Emissive Path="Textures/ButtonMod_flexo_button_a_flexo_button_a_Emissive.ktx2"',
    )
    // …still carrying the material's metallic ORM solid.
    const glowMat = xml.slice(xml.indexOf('<PbrMaterial Id="flexo_button_a_Material"'))
    expect(glowMat.slice(0, glowMat.indexOf('</PbrMaterial>'))).toContain('_ORM_ff26ff.ktx2')
    // The non-glowing sibling still shares the plain material entry.
    expect(xml).toContain('<PbrMaterial Id="flexo_RedMetal_red1_Material"')
  })
})

describe('buildCustomBundle — image-backed material channels', () => {
  it('copies a strength-1 normal map and a packed ORM verbatim with channel-suffixed names', async () => {
    const { __assetStore } = (await import('../state/assetDb')) as unknown as {
      __assetStore: Map<string, Blob>
    }
    __assetStore.set('tex-ktx2:tex_n1', new Blob([new Uint8Array([1, 1, 1, 1])]))
    __assetStore.set('tex-ktx2:tex_orm1', new Blob([new Uint8Array([2, 2, 2, 2])]))

    const part = partWithMaterialMeshes()
    part.customTextures.push(
      { id: 'tex_n1', name: 'Bumps', width: 4, height: 4, channel: 'normal' },
      { id: 'tex_orm1', name: 'Packed', width: 4, height: 4, channel: 'orm' },
    )
    part.customMaterials[0].normal = { textureId: 'tex_n1', strength: 1 }
    part.customMaterials[0].ormPacked = { textureId: 'tex_orm1' }

    const bundle = await buildCustomBundle(part, 'ButtonMod')
    const xml = bundle.assetsXml!
    expect(xml).toContain('<Normal Path="Textures/Bumps_texn1_Normal.ktx2"')
    expect(xml).toContain('<AoRoughMetal Path="Textures/Packed_texorm1_AoRoughMetal.ktx2"')
    const paths = bundle.binaries.map((b) => b.path)
    expect(paths).toContain('Textures/Bumps_texn1_Normal.ktx2')
    expect(paths).toContain('Textures/Packed_texorm1_AoRoughMetal.ktx2')
    // Copied bytes, not regenerated.
    const normalBin = bundle.binaries.find((b) => b.path.endsWith('Bumps_texn1_Normal.ktx2'))!
    expect([...normalBin.data]).toEqual([1, 1, 1, 1])
    // The shared material still interns once for both meshes.
    expect(xml.match(/<PbrMaterial /g)?.length).toBe(1)
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
    kitten: {
      kind: 'hunter',
      specKey: 'suit',
      diffuse: 'Textures/Characters/Kitty_Helmet_Visor_A.ktx2',
      transparent: true,
    },
    faceTextures: {},
    ...overrides,
  })
  part.placements.push({
    instanceId: 'visor_1',
    subPartTemplateId: subPartId,
    ...identityTransform(),
    layerId: 'default',
  })
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
    expect(bundle.binaries.some((b) => b.path.endsWith('flexo_hunter_visor_a_Diffuse.ktx2'))).toBe(
      true,
    )
    expect(bundle.assetsXml).not.toContain('Kitty_Helmet_Visor_A.ktx2')
  })

  it('an opaque-glow visor exports <PartModel> + an emissive mask, never <PartModelGlass>', async () => {
    const part = partWithVisor({
      surface: 'glow',
      emissive: { shape: 'whole', color: { r: 255, g: 180, b: 0 }, strength: 0.7 },
    })
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
    const glowPlacement = expanded.placements.find(
      (p) => p.subPartTemplateId === 'flexo_hunter_visor_a_Glow',
    )!
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
