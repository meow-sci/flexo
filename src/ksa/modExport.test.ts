import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_LAYER_ID,
  createEmptyPart,
  createGlow,
  createPartAnimation,
  createPartLight,
  identityTransform,
} from './types'
import type { CustomMesh, EditingPart, EmissiveConfig, PartAnimation, PartCollider } from './types'

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

// Imported geometry normally comes out of an IndexedDB GLB through GLTFLoader (no fetch, no
// indexedDB in happy-dom). Stand in with a one-triangle indexed mesh carrying the exact
// attribute set KSA imports; a mesh name containing 'missing' models a lost import blob.
vi.mock('../three/importedMeshCache', () => ({
  getImportedRawGeometry: vi.fn(async (_importId: string, meshName: string) => {
    if (meshName.includes('missing')) return null
    const THREE = await import('three')
    const g = new THREE.BufferGeometry()
    g.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3),
    )
    g.setAttribute(
      'normal',
      new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3),
    )
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1]), 2))
    g.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2]), 1))
    return g
  }),
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
import { serializeAssets } from './assetsXmlSerializer'
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
    part.lights.push(createPartLight(lampId, '_light1'))

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
  part.lights.push(createPartLight(SPOTLIGHT, '_light1'))
  return part
}

describe('built-in SubPart GameData export variants (never redefine the built-in)', () => {
  const VID = `flexo_MyLight_${SPOTLIGHT}`

  it('creates a variant for a placed built-in SubPart carrying GameData, reusing built-in mesh/material', () => {
    const v = buildExportVariantMap(partWithBuiltinLight(), lightCatalog(), 'MyLight').get(
      SPOTLIGHT,
    )!
    expect(v.variantId).toBe(VID) // one naming rule for every variant
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

/**
 * A part with ONE custom primitive mesh that carries SubPart GameData — the shape that crashed
 * KSA at startup. `withCollider` uses the other `hasSubPartGameData` trigger instead of a light.
 */
function partWithCustomMeshGameData(withCollider = false): EditingPart {
  const part = createEmptyPart()
  part.partId = 'inanimate_carbon_rod'
  part.customMeshes.push({
    id: 'mesh_rod',
    name: 'Rod',
    subPartId: CUSTOM_ROD,
    primitive: { kind: 'cylinder', params: { radius: 0.06, height: 1.5, radialSegments: 16 } },
    faceTextures: {},
    emissive: { ...createGlow(), color: { r: 60, g: 255, b: 50 } },
  })
  part.placements.push({
    instanceId: 'rod_1',
    subPartTemplateId: CUSTOM_ROD,
    ...identityTransform(),
    layerId: 'default',
  })
  if (withCollider) {
    part.colliders.push({
      id: '_collider1',
      shape: 'Cylinder',
      ownerTemplateId: CUSTOM_ROD,
      layerId: DEFAULT_LAYER_ID,
      ...identityTransform(),
    })
  } else {
    part.lights.push(createPartLight(CUSTOM_ROD, '_light1'))
  }
  return part
}

const CUSTOM_ROD = 'flexo_rod_fb406012'

/** The MERGED index the export really receives — $catalogIndex folds $customCatalog into it. */
function mergedCatalogWithCustomRod(): Map<string, CatalogSubPart> {
  return new Map<string, CatalogSubPart>([
    [
      CUSTOM_ROD,
      {
        id: CUSTOM_ROD,
        atlasUrl: 'blob:custom',
        meshNodeName: CUSTOM_ROD,
        // Custom entries carry NO materialId — the material lives in customMeshRenderCache.
        materialId: undefined,
        sourceFile: '(custom)',
      },
    ],
  ])
}

// A custom mesh is declared by this very export under a project-unique id, so its GameData can
// never collide with a shared template — a variant is pure harm. It also strips the material
// (custom catalog entries have none), which crashed KSA in ThumbnailRenderResources.AddDraw
// before the main menu. See plans/FIX_EMISSIVES_BUG.md.
describe('custom-mesh SubParts never get an export variant', () => {
  it('mints no variant for a custom mesh carrying a <Light>, even though it IS in the catalog', () => {
    const part = partWithCustomMeshGameData()
    // Guard the precondition that made the old catalog-membership test useless.
    expect(mergedCatalogWithCustomRod().has(CUSTOM_ROD)).toBe(true)
    expect(buildExportVariantMap(part, mergedCatalogWithCustomRod(), 'Rod').size).toBe(0)
  })

  it('mints no variant for a custom mesh carrying a SubPart-owned collider', () => {
    const part = partWithCustomMeshGameData(true)
    expect(buildExportVariantMap(part, mergedCatalogWithCustomRod(), 'Rod').size).toBe(0)
  })

  // Pins the RULE, not just its crash symptom: even if a custom catalog entry gained a
  // materialId (so the material guard wouldn't fire), a custom mesh must still never be
  // redeclared — the export already declares it under this exact id.
  it('mints no variant even when the custom catalog entry does carry a materialId', () => {
    const catalog = mergedCatalogWithCustomRod()
    catalog.set(CUSTOM_ROD, { ...catalog.get(CUSTOM_ROD)!, materialId: `${CUSTOM_ROD}_Material` })
    expect(buildExportVariantMap(partWithCustomMeshGameData(), catalog, 'Rod').size).toBe(0)
  })

  it('the Part places the custom SubPart id and its GameData hangs off the SAME id', () => {
    const part = partWithCustomMeshGameData()
    const content = buildModContent(part, 'Rod', mergedCatalogWithCustomRod())
    expect(content.partXml).toContain(`InstanceOf="${CUSTOM_ROD}"`)
    expect(content.partXml).not.toContain('InstanceOf="flexo_Rod_')
    expect(content.gameDataXml).toContain(`<SubPartGameData Id="${CUSTOM_ROD}"`)
    expect(content.gameDataXml).toContain('<Light>')
  })

  it('the Assets XML declares the SubPart exactly ONCE, with a <Material> and the _VM view mesh', async () => {
    const part = partWithCustomMeshGameData()
    const content = buildModContent(part, 'Rod', mergedCatalogWithCustomRod())
    const bundle = await buildCustomBundle(part, content.base, undefined, content.variants)
    const xml = bundle.assetsXml!
    expect(xml.match(/<SubPart Id=/g)).toHaveLength(1)
    expect(xml).toContain(`<SubPart Id="${CUSTOM_ROD}"`)
    expect(xml).toContain(`<Material Id="${CUSTOM_ROD}_Material"`)
    // The variant used to point <MeshView> at the render mesh, orphaning the decimated _VM.
    expect(xml).toContain(`<Mesh Id="${CUSTOM_ROD}_VM"`)
  })
})

// The property that makes the whole bug class unrepresentable, whatever the producer.
describe('every exported <PartModel> carries a <Material>', () => {
  it('holds for a glowing custom mesh with GameData (the crash case)', async () => {
    const part = partWithCustomMeshGameData()
    const content = buildModContent(part, 'Rod', mergedCatalogWithCustomRod())
    const bundle = await buildCustomBundle(part, content.base, undefined, content.variants)
    expectEveryPartModelHasMaterial(bundle.assetsXml!)
  })

  it('holds for a bare mesh with no glow, texture or material', async () => {
    const bundle = await buildCustomBundle(partWithMaterialMeshes(), 'ButtonMod')
    expectEveryPartModelHasMaterial(bundle.assetsXml!)
  })
})

/**
 * KSA's `ThumbnailRenderResources.AddDraw` reads `Material.DiffuseReference`/`NormalReference`/
 * `PBRMap` with no null guard, over every registered part at startup — so a single `<PartModel>`
 * without a `<Material>` child NREs before the main menu. Zero shipped Core PartModels omit one.
 */
function expectEveryPartModelHasMaterial(xml: string): void {
  const models = xml.match(/<PartModel(?:Glass)?\b[\s\S]*?<\/PartModel(?:Glass)?>/g) ?? []
  expect(models.length).toBeGreaterThan(0)
  for (const m of models) expect(m).toMatch(/<Material Id="/)
}

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
      // Core's invisible ray occluder: Internal AND ShadowProxy (CoreIVASpaceAAssets.xml).
      RAY_BLOCKER,
      {
        id: RAY_BLOCKER,
        atlasUrl: '/ksa/Meshes/CoreIVASpaceA_MeshAtlas.glb',
        meshNodeName: RAY_BLOCKER,
        materialId: 'CoreIVASpaceA_Material',
        internal: true,
        rayTracing: 'ShadowProxy',
        sourceFile: 'CoreIVASpaceAAssets.xml',
      },
    ],
    [
      // Core's capsule window: the only built-in kind that authors <ShadowCaster>false</>.
      WINDOW,
      {
        id: WINDOW,
        atlasUrl: '/ksa/Meshes/CoreCommandA_MeshAtlas.glb',
        meshNodeName: WINDOW,
        materialId: 'CoreCommandA_Material',
        shadowCaster: false,
        sourceFile: 'CoreCommandAAssets.xml',
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

const CHAIR = 'CoreIVAPropA_Subpart_ChairA'
const RAY_BLOCKER = 'CoreIVASpaceA_Subpart_MediumCapsuleARayBlocker'
const WINDOW = 'CoreCommandA_Subpart_MediumCapsuleWindowA'
const CHAIR_VARIANT = `flexo_MyShip_${CHAIR}`

function partWithIvaAndCore(): EditingPart {
  const part = createEmptyPart()
  part.partId = 'MyShip'
  part.placements.push(
    {
      instanceId: 'chair_1',
      subPartTemplateId: CHAIR,
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

describe('<Internal> (interior-only) export variants', () => {
  it('leaves an untouched interior prop ALONE — no variant, so it keeps the built-in <Internal>', () => {
    // The whole point of Phase 0: flexo mirrors the game's own data unless the user says otherwise.
    const part = partWithIvaAndCore()
    expect(buildExportVariantMap(part, ivaCatalog(), 'MyShip').size).toBe(0)
    expect(serializePart(part, new Map())).toContain(`InstanceOf="${CHAIR}"`)
  })

  it('flagging an interior prop exterior mints a variant with no <Internal>', () => {
    const part = partWithIvaAndCore()
    part.internalFlags[CHAIR] = false
    const variants = buildExportVariantMap(part, ivaCatalog(), 'MyShip')
    expect(variants.size).toBe(1) // the plain structural SubPart is untouched
    const v = variants.get(CHAIR)!
    expect(v.variantId).toBe(CHAIR_VARIANT) // one naming rule for every variant
    expect(v.meshId).toBe(CHAIR)
    expect(v.materialId).toBe('CoreIVAPropA_Material')
    expect(v.internal).toBe(false)
    expect(v.rayTracing).toBeNull()
  })

  it('a redundant flag matching the built-in collapses to no variant at all', () => {
    const part = partWithIvaAndCore()
    part.internalFlags[CHAIR] = true // already Internal in the catalog
    part.internalFlags['CoreStructuralA_Subpart_X'] = false // already non-Internal
    expect(buildExportVariantMap(part, ivaCatalog(), 'MyShip').size).toBe(0)
  })

  it('flagging a plain built-in interior mints a variant that DOES carry <Internal>', () => {
    const part = partWithIvaAndCore()
    part.internalFlags['CoreStructuralA_Subpart_X'] = true
    const v = buildExportVariantMap(part, ivaCatalog(), 'MyShip').get('CoreStructuralA_Subpart_X')!
    expect(v.variantId).toBe('flexo_MyShip_CoreStructuralA_Subpart_X')
    expect(v.internal).toBe(true)
  })

  it('a variant minted for GameData reasons keeps the built-in’s own <Internal>', async () => {
    // Nothing about the flag changed — the variant exists only so the <Light> doesn't merge onto
    // the shared built-in template — so the interior-only behaviour must survive the redeclaration.
    const part = partWithIvaAndCore()
    part.lights.push(createPartLight(CHAIR, '_light1'))
    const variants = buildExportVariantMap(part, ivaCatalog(), 'MyShip')
    expect(variants.get(CHAIR)!.internal).toBe(true)
    const bundle = await buildCustomBundle(part, 'MyShip', undefined, variants)
    expect(bundle.assetsXml).toContain('<Internal>true</Internal>')
  })

  it('dedupes repeated placements of the same flagged template', () => {
    const part = partWithIvaAndCore()
    part.internalFlags[CHAIR] = false
    part.placements.push({
      instanceId: 'chair_2',
      subPartTemplateId: CHAIR,
      ...identityTransform(),
      layerId: 'default',
    })
    expect(buildExportVariantMap(part, ivaCatalog(), 'MyShip').size).toBe(1)
  })

  it('produces no variants for a part that flags nothing', () => {
    const part = createEmptyPart()
    part.placements.push({
      instanceId: 'x_1',
      subPartTemplateId: 'CoreStructuralA_Subpart_X',
      ...identityTransform(),
      layerId: 'default',
    })
    expect(buildExportVariantMap(part, ivaCatalog(), 'P').size).toBe(0)
  })

  it('Part XML points flagged placements at the variant, normal placements unchanged', () => {
    const part = partWithIvaAndCore()
    part.internalFlags[CHAIR] = false
    const variants = buildExportVariantMap(part, ivaCatalog(), 'MyShip')
    const remap = new Map([...variants.values()].map((v) => [v.originalId, v.variantId]))
    const xml = serializePart(part, remap)
    expect(xml).toContain(`InstanceOf="${CHAIR_VARIANT}"`)
    expect(xml).toContain('InstanceOf="CoreStructuralA_Subpart_X"')
    expect(xml).not.toContain(`InstanceOf="${CHAIR}"`) // the closing quote disambiguates from the variant
  })

  it('Assets XML declares the exterior-override variant (no Internal) even with no custom meshes', async () => {
    const part = partWithIvaAndCore()
    part.internalFlags[CHAIR] = false
    const variants = buildExportVariantMap(part, ivaCatalog(), 'MyShip')
    const bundle = await buildCustomBundle(part, 'MyShip', undefined, variants)
    expect(bundle.assetsFile).toBe('MyShipAssets.xml')
    expect(bundle.assetsXml).toContain(`<SubPart Id="${CHAIR_VARIANT}"`)
    expect(bundle.assetsXml).toContain(`<PartModel Id="${CHAIR_VARIANT}_Model"`)
    expect(bundle.assetsXml).toContain(`<Mesh Id="${CHAIR}"`)
    expect(bundle.assetsXml).toContain('<Material Id="CoreIVAPropA_Material"')
    expect(bundle.assetsXml).not.toContain('<Internal>')
    expect(bundle.assetsXml).not.toContain('RayTracing') // the built-in authors none
    expect(bundle.assetsXml).not.toContain('MeshAtlas') // variants only → no custom geometry
    expect(bundle.binaries).toHaveLength(0) // variants reuse built-in assets — nothing to ship
  })

  it('carries a ShadowProxy <RayTracing> forward onto the variant (an invisible occluder stays invisible)', async () => {
    const part = createEmptyPart()
    part.partId = 'MyShip'
    part.placements.push({
      instanceId: 'blocker_1',
      subPartTemplateId: RAY_BLOCKER,
      ...identityTransform(),
      layerId: 'default',
    })
    part.internalFlags[RAY_BLOCKER] = false // any reason to redeclare will do
    const variants = buildExportVariantMap(part, ivaCatalog(), 'MyShip')
    expect(variants.get(RAY_BLOCKER)!.rayTracing).toBe('ShadowProxy')
    const bundle = await buildCustomBundle(part, 'MyShip', undefined, variants)
    expect(bundle.assetsXml).toContain('<RayTracing>ShadowProxy</RayTracing>')
  })

  it('carries a <ShadowCaster>false</ShadowCaster> forward onto the variant (a window keeps not casting)', async () => {
    const part = createEmptyPart()
    part.partId = 'MyShip'
    part.placements.push({
      instanceId: 'window_1',
      subPartTemplateId: WINDOW,
      ...identityTransform(),
      layerId: 'default',
    })
    part.internalFlags[WINDOW] = true // any reason to redeclare will do
    const variants = buildExportVariantMap(part, ivaCatalog(), 'MyShip')
    expect(variants.get(WINDOW)!.shadowCaster).toBe(false)
    const bundle = await buildCustomBundle(part, 'MyShip', undefined, variants)
    // Dropping it would default the field back to KSA's `true` and start casting shadows.
    expect(bundle.assetsXml).toContain('<ShadowCaster>false</ShadowCaster>')
  })

  it('emits no <ShadowCaster> for a variant whose built-in authors none', async () => {
    const part = partWithIvaAndCore()
    part.internalFlags[CHAIR] = false
    const variants = buildExportVariantMap(part, ivaCatalog(), 'MyShip')
    expect(variants.get(CHAIR)!.shadowCaster).toBeNull()
    const bundle = await buildCustomBundle(part, 'MyShip', undefined, variants)
    expect(bundle.assetsXml).not.toContain('ShadowCaster')
  })

  it('a <ShadowCaster> difference alone mints NO variant', () => {
    // <ShadowCaster> is never user-editable, so it can't be a REASON to redeclare a template —
    // placing the window untouched must leave it referencing the built-in id.
    const part = createEmptyPart()
    part.partId = 'MyShip'
    part.placements.push({
      instanceId: 'window_1',
      subPartTemplateId: WINDOW,
      ...identityTransform(),
      layerId: 'default',
    })
    expect(buildExportVariantMap(part, ivaCatalog(), 'MyShip').size).toBe(0)
  })

  it('end-to-end: buildModZip threads the catalog into both Part and Assets XML', async () => {
    const part = partWithIvaAndCore()
    part.internalFlags[CHAIR] = false
    const blob = await buildModZip(part, 'MyShip', undefined, ivaCatalog())
    const text = new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()))
    expect(text).toContain('flexo-parts/MyShipAssets.xml')
    expect(text).toContain(`InstanceOf="${CHAIR_VARIANT}"`)
    expect(text).toContain(`<SubPart Id="${CHAIR_VARIANT}"`)
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

    // ONE shared <PbrMaterial> for the two material-carrying meshes, named from the material…
    const xml = bundle.assetsXml!
    expect(xml).toContain('<PbrMaterial Id="flexo_RedMetal_red1_Material"')
    expect(xml.match(/<Material Id="flexo_RedMetal_red1_Material"/g)?.length).toBe(2)
    expect(xml).toContain('<Diffuse Path="Textures/ButtonMod_flexo_button_a_BaseColor_ff0000.ktx2"')
    expect(xml).toContain('<AoRoughMetal Path="Textures/ButtonMod_flexo_button_a_ORM_ff26ff.ktx2"')

    // …plus ONE neutral material for the bare mesh. KSA has no untextured <PartModel>:
    // ThumbnailRenderResources.AddDraw derefs Material.DiffuseReference unguarded, so omitting
    // <Material> crashes the game at startup. Two declarations total, no more.
    expect(xml.match(/<PbrMaterial /g)?.length).toBe(2)
    expect(xml).toContain('<PbrMaterial Id="ButtonMod_flexo_button_a_NeutralMaterial"')
    expect(xml).toContain('<SubPart Id="flexo_bare_c"')
    const bare = xml.slice(xml.indexOf('<SubPart Id="flexo_bare_c"'))
    expect(bare).toContain('<Material Id="ButtonMod_flexo_button_a_NeutralMaterial"/>')
    expect(bare).toContain('<Mesh Id="flexo_bare_c_VM"')
  })

  it('a glowing mesh keeps its material scalars in the ORM and bakes the base color under the glow', async () => {
    const part = partWithMaterialMeshes()
    part.customMeshes[0].emissive = {
      shape: 'whole',
      color: { r: 255, g: 255, b: 255 },
      strength: 0.5,
      coverage: 1,
    }
    const bundle = await buildCustomBundle(part, 'ButtonMod')
    const xml = bundle.assetsXml!
    // A glow lives on the MESH, so a glowing mesh can't share the plain material entry: its
    // <Diffuse> has the glow composited in. It gets a second <PbrMaterial> named after the first
    // SubPart that claims it — but the composited pair is CONTENT-ADDRESSED (base image + glow
    // bitmap + coverage/strength/ramp), so what forks the material is the glow, never the SubPart
    // id. See the shared-glowing-material suite below.
    expect(xml).toContain('<PbrMaterial Id="flexo_button_a_Material"')
    const emissive = xml.match(/<Emissive Path="([^"]+)"/)![1]
    expect(emissive).toMatch(
      /^Textures\/ButtonMod_flexo_button_a_RedMetal_[0-9a-f]{8}_Emissive\.ktx2$/,
    )
    expect(bundle.binaries.filter((b) => b.path === emissive)).toHaveLength(1)
    // …still carrying the material's metallic ORM solid.
    const glowMat = xml.slice(xml.indexOf('<PbrMaterial Id="flexo_button_a_Material"'))
    expect(glowMat.slice(0, glowMat.indexOf('</PbrMaterial>'))).toContain('_ORM_ff26ff.ktx2')
    // The non-glowing sibling still shares the plain material entry.
    expect(xml).toContain('<PbrMaterial Id="flexo_RedMetal_red1_Material"')
  })
})

/** partWithMaterialMeshes, but meshes a+b glow IDENTICALLY off the one shared CustomMaterial. */
function partWithSharedGlowingMaterial(): EditingPart {
  const part = partWithMaterialMeshes()
  part.customMeshes[2].materialId = 'mat_red1' // so all three wear the same material
  const glow = (): EmissiveConfig => ({
    shape: 'whole',
    color: { r: 255, g: 180, b: 0 },
    strength: 0.4,
    coverage: 1,
  })
  part.customMeshes[0].emissive = glow()
  part.customMeshes[1].emissive = glow()
  return part
}

/** The `<Material Id>` one `<SubPart Id="…">` references. */
function subPartMaterialId(xml: string, subPartId: string): string {
  return xml.slice(xml.indexOf(`<SubPart Id="${subPartId}"`)).match(/<Material Id="([^"]+)"/)![1]
}

// The composited glow diffuse+mask are named from a hash of what went INTO the composite (base
// image identity, glow bitmap identity, coverage/strength/ramp) rather than from the SubPart id.
// Naming them per-SubPart forked one <PbrMaterial> AND one full-resolution copy of the identical
// texture bytes per glowing mesh — a 6-material glTF whose emissive material covered 80 primitives
// exported 85 <PbrMaterial> and 177 texture files (414 MB, 19 distinct payloads). KSA keys textures
// by path, so those copies were also 80 GPU textures in-game for one image.
describe('buildCustomBundle — meshes sharing a GLOWING material share one composite', () => {
  it('emits ONE <PbrMaterial> + ONE composited pair for two meshes glowing identically', async () => {
    const bundle = await buildCustomBundle(partWithSharedGlowingMaterial(), 'ButtonMod')
    const xml = bundle.assetsXml!
    const paths = bundle.binaries.map((b) => b.path)

    // Two entries total: the shared glowing one + the plain one the non-glowing mesh wears.
    expect(xml.match(/<PbrMaterial /g)).toHaveLength(2)
    expect(xml).toContain('<PbrMaterial Id="flexo_RedMetal_red1_Material"')
    // Each composited payload is written exactly once, not once per glowing SubPart.
    expect(paths.filter((p) => p.endsWith('_Diffuse.ktx2'))).toHaveLength(1)
    expect(paths.filter((p) => p.endsWith('_Emissive.ktx2'))).toHaveLength(1)

    // Both glowing SubParts point at the SAME material; the non-glowing one at the plain entry.
    const glowMaterial = subPartMaterialId(xml, 'flexo_button_a')
    expect(subPartMaterialId(xml, 'flexo_plinth_b')).toBe(glowMaterial)
    expect(subPartMaterialId(xml, 'flexo_bare_c')).toBe('flexo_RedMetal_red1_Material')
    expect(glowMaterial).toBe('flexo_button_a_Material') // the first claimant names it
  })

  it('forks per DIVERGING glow: a different strength is a different composite', async () => {
    const part = partWithSharedGlowingMaterial()
    part.customMeshes[1].emissive!.strength = 0.9
    const bundle = await buildCustomBundle(part, 'ButtonMod')
    const xml = bundle.assetsXml!
    const paths = bundle.binaries.map((b) => b.path)

    // Two distinct composites → two glowing <PbrMaterial>s (+ the plain one), and crucially two
    // DISTINCT ids: intern() has no uniqueness guard, so a shared preferredId would emit two
    // <PbrMaterial> elements KSA could not tell apart.
    expect(xml.match(/<PbrMaterial /g)).toHaveLength(3)
    const a = subPartMaterialId(xml, 'flexo_button_a')
    const b = subPartMaterialId(xml, 'flexo_plinth_b')
    expect(a).not.toBe(b)
    expect(new Set([a, b, 'flexo_RedMetal_red1_Material']).size).toBe(3)
    // …and two distinct emissive masks, since the mask carries `strength`.
    const emissive = paths.filter((p) => p.endsWith('_Emissive.ktx2'))
    expect(emissive).toHaveLength(2)
    expect(new Set(emissive).size).toBe(2)
  })

  it('dedupes the part-ified kitten glow path too', async () => {
    const part = partWithKittenMeshes()
    // Two kitten submeshes glowing the same way: their bases are both synthetic neutrals, so the
    // composite is byte-identical and only its glow identity decides whether it is shared.
    for (const m of part.customMeshes)
      m.emissive = { shape: 'whole', color: { r: 10, g: 255, b: 10 }, strength: 0.6, coverage: 1 }
    const bundle = await buildCustomBundle(part, 'KittenMod', REF)
    const xml = bundle.assetsXml!
    expect(xml.match(/<PbrMaterial /g)).toHaveLength(1)
    expect(bundle.binaries.filter((b) => b.path.endsWith('_Emissive.ktx2'))).toHaveLength(1)
    expect(subPartMaterialId(xml, 'flexo_hunter_eye_b')).toBe(
      subPartMaterialId(xml, 'flexo_hunter_suit_a'),
    )
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
    // The shared material still interns once for both meshes; the third (bare) mesh adds the
    // neutral fallback and nothing else.
    expect(xml.match(/<PbrMaterial /g)?.length).toBe(2)
    expect(xml.match(/<Material Id="flexo_RedMetal_red1_Material"/g)?.length).toBe(2)
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
      emissive: { shape: 'whole', color: { r: 255, g: 180, b: 0 }, strength: 0.7, coverage: 1 },
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
      emissive: { shape: 'whole', color: { r: 10, g: 255, b: 10 }, strength: 0.6, coverage: 1 },
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
      emissive: { shape: 'whole', color: { r: 10, g: 255, b: 10 }, strength: 0.6, coverage: 1 },
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

describe('custom-mesh <Internal> (interior-only)', () => {
  /** The XML of one <SubPart Id="…"> element. */
  function subPartXml(xml: string, subPartId: string): string {
    const from = xml.slice(xml.indexOf(`<SubPart Id="${subPartId}"`))
    return from.slice(0, from.indexOf('</SubPart>'))
  }

  it('emits <Internal>true</Internal> on the flagged mesh’s own <PartModel>, and NO variant', async () => {
    const part = partWithMaterialMeshes()
    part.internalFlags['flexo_button_a'] = true
    // A custom mesh is absent from the catalog — flexo declares it itself, so it never needs one.
    expect(buildExportVariantMap(part, ivaCatalog(), 'ButtonMod').size).toBe(0)
    const xml = (await buildCustomBundle(part, 'ButtonMod')).assetsXml!
    expect(xml.match(/<Internal>true<\/Internal>/g)).toHaveLength(1)
    expect(subPartXml(xml, 'flexo_button_a')).toContain('<Internal>true</Internal>')
    expect(subPartXml(xml, 'flexo_plinth_b')).not.toContain('<Internal>')
  })

  it('IGNORES the flag on a glass mesh — <PartModelGlass> has no <Internal> field in KSA', async () => {
    const part = partWithVisor({})
    part.internalFlags['flexo_hunter_visor_a'] = true
    const bundle = await buildCustomBundle(part, 'VisorMod', REF)
    expect(bundle.assetsXml).toContain('<PartModelGlass')
    expect(bundle.assetsXml).not.toContain('<Internal>')
  })

  it('treats a layered glassGlow visor as glass WHOLE — neither the shell nor the glow layer is Internal', async () => {
    const part = partWithVisor({
      surface: 'glassGlow',
      glass: { tint: { r: 10, g: 200, b: 10 } },
      emissive: { shape: 'whole', color: { r: 10, g: 255, b: 10 }, strength: 0.6, coverage: 1 },
    })
    part.internalFlags['flexo_hunter_visor_a'] = true
    const { part: expanded, insetIds } = expandGlassGlow(part)
    const bundle = await buildCustomBundle(expanded, 'VisorMod', REF, new Map(), insetIds)
    expect(bundle.assetsXml).toContain('flexo_hunter_visor_a_Glow') // the opaque layer is there…
    expect(bundle.assetsXml).not.toContain('<Internal>') // …and it is NOT marked interior-only
  })
})

// ── imported (glTF) SubParts ──────────────────────────────────────────────────

/** Mesh names declared inside a generated mesh-atlas GLB (the JSON chunk's `meshes[].name`). */
function atlasMeshNames(glb: Uint8Array): string[] {
  const dv = new DataView(glb.buffer, glb.byteOffset, glb.byteLength)
  const jsonLen = dv.getUint32(12, true)
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLen))) as {
    meshes?: { name?: string }[]
  }
  return (json.meshes ?? []).map((m) => m.name ?? '').sort()
}

/**
 * A part holding imported SubParts. Every imported mesh gets its surface from a
 * {@link CustomMaterial} (they have no per-face texture grid), which is exactly the "material
 * verbatim" export path primitives already use — the interning it enables is asserted below.
 */
function partWithImportedMeshes(overrides: Partial<CustomMesh>[] = [{}]): EditingPart {
  const part = createEmptyPart()
  part.partId = 'PodMod'
  part.customMaterials.push({
    id: 'mat_paint',
    name: 'Painted Metal',
    baseColor: { kind: 'color', color: { r: 40, g: 80, b: 200 } },
    metalness: { kind: 'value', value: 0.9 },
    roughness: { kind: 'value', value: 0.35 },
  })
  overrides.forEach((o, i) => {
    const subPartId = `flexo_RcsPod_Part${i}_ab12cd`
    part.customMeshes.push({
      id: `mesh_imp${i}`,
      name: `RCS Pod ${i}`,
      subPartId,
      imported: {
        importId: 'imp_9f8e',
        meshName: subPartId,
        sourceFile: 'rcs_pod.glb',
        sourceNode: `RcsPod${i}`,
        sourceMaterial: 'PaintedMetal',
        triangles: 1,
        vertices: 3,
      },
      materialId: 'mat_paint',
      faceTextures: {},
      ...o,
    })
    part.placements.push({
      instanceId: `pod_${i}`,
      subPartTemplateId: subPartId,
      ...identityTransform(),
      layerId: 'default',
    })
  })
  return part
}

describe('buildCustomBundle — imported glTF SubParts', () => {
  it('ships the geometry in the atlas and a complete <PbrMaterial> + <SubPart> + <MeshView>', async () => {
    const bundle = await buildCustomBundle(partWithImportedMeshes(), 'PodMod')

    // Geometry: the imported mesh is a node in the shared atlas, paired with its _VM view mesh.
    const atlas = bundle.binaries.find((b) => b.path.endsWith('_MeshAtlas.glb'))!
    expect(atlas).toBeDefined()
    expect(atlasMeshNames(atlas.data)).toEqual([
      'flexo_RcsPod_Part0_ab12cd',
      'flexo_RcsPod_Part0_ab12cd_VM',
    ])

    const xml = bundle.assetsXml!
    // The material carries all three channels KSA dereferences with no null check.
    expect(xml).toContain('<PbrMaterial Id="flexo_PaintedMetal_paint_Material"')
    expect(xml).toContain('<Diffuse Path="Textures/PodMod_imp0_BaseColor_2850c8.ktx2"')
    expect(xml).toContain('<Normal Path="Textures/PodMod_imp0_FlatNormal.ktx2"')
    expect(xml).toContain('<AoRoughMetal Path="Textures/PodMod_imp0_ORM_ff59e6.ktx2"')
    expect(xml).not.toContain('<Emissive')
    // Opaque render path + the picking wiring.
    const sub = xml.slice(xml.indexOf('<SubPart Id="flexo_RcsPod_Part0_ab12cd"'))
    expect(sub).toContain('<PartModel Id="flexo_RcsPod_Part0_ab12cd_Model"')
    expect(sub).toContain('<Mesh Id="flexo_RcsPod_Part0_ab12cd"')
    expect(sub).toContain('<Material Id="flexo_PaintedMetal_paint_Material"')
    expect(sub).toContain('<MeshView>')
    expect(sub).toContain('<Mesh Id="flexo_RcsPod_Part0_ab12cd_VM"')
  })

  it('interns ONE <PbrMaterial> for two imported meshes sharing a CustomMaterial', async () => {
    const bundle = await buildCustomBundle(partWithImportedMeshes([{}, {}]), 'PodMod')
    const xml = bundle.assetsXml!
    expect(xml.match(/<PbrMaterial /g)).toHaveLength(1)
    expect(xml.match(/<Material Id="flexo_PaintedMetal_paint_Material"/g)).toHaveLength(2)
    // Both meshes are in the atlas, each with its own view mesh.
    const atlas = bundle.binaries.find((b) => b.path.endsWith('_MeshAtlas.glb'))!
    expect(atlasMeshNames(atlas.data)).toHaveLength(4)
  })

  it('a glowing imported mesh emits <Emissive> + a composited diffuse', async () => {
    const part = partWithImportedMeshes([
      {
        emissive: { shape: 'whole', color: { r: 255, g: 120, b: 0 }, strength: 0.75, coverage: 1 },
      },
    ])
    const bundle = await buildCustomBundle(part, 'PodMod')
    const xml = bundle.assetsXml!
    // A glowing mesh gets its own material (the diffuse has the glow baked in), and both halves
    // of the composite ship under one content-addressed name.
    expect(xml).toContain('<PbrMaterial Id="flexo_RcsPod_Part0_ab12cd_Material"')
    const stem = xml.match(/<Emissive Path="Textures\/(.+)_Emissive\.ktx2"/)![1]
    expect(stem).toMatch(/^PodMod_imp0_PaintedMetal_[0-9a-f]{8}$/)
    expect(xml).toContain(`<Diffuse Path="Textures/${stem}_Diffuse.ktx2"`)
    const paths = bundle.binaries.map((b) => b.path)
    expect(paths).toContain(`Textures/${stem}_Diffuse.ktx2`)
    expect(paths).toContain(`Textures/${stem}_Emissive.ktx2`)
    // The material's uniform scalars still ship in the ORM solid.
    expect(xml).toContain('_ORM_ff59e6.ktx2')
  })

  it('a transparent imported mesh exports through <PartModelGlass> and never <Emissive>', async () => {
    // KSA's glass shader (MeshGlassIndirect.frag) doesn't sample the emissive map at all, so a
    // glow on a glass SubPart must not reach the material — glass simply can't glow.
    const part = partWithImportedMeshes([
      { emissive: { shape: 'whole', color: { r: 0, g: 255, b: 255 }, strength: 0.6, coverage: 1 } },
    ])
    part.customMeshes[0].imported!.transparent = true
    const bundle = await buildCustomBundle(part, 'PodMod')
    const xml = bundle.assetsXml!
    expect(xml).toContain('<PartModelGlass Id="flexo_RcsPod_Part0_ab12cd_Model"')
    expect(xml).not.toContain('<PartModel ')
    expect(xml).not.toContain('<Emissive')
    expect(bundle.binaries.some((b) => b.path.endsWith('_Emissive.ktx2'))).toBe(false)
    // Still fully declared + pickable.
    expect(xml).toContain('<Material Id="flexo_PaintedMetal_paint_Material"')
    expect(xml).toContain('<Mesh Id="flexo_RcsPod_Part0_ab12cd_VM"')
  })

  it('skips an imported SubPart whose geometry is gone, without failing the export', async () => {
    const part = partWithImportedMeshes([{}, {}])
    part.customMeshes[1].imported!.meshName = 'flexo_missing_mesh'
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const bundle = await buildCustomBundle(part, 'PodMod')
    warn.mockRestore()
    const xml = bundle.assetsXml!
    // The survivor is fully exported; the dead one appears nowhere (a <SubPart> pointing at a
    // <Mesh Id> that isn't in the atlas is a dangling reference in-game).
    expect(xml).toContain('<SubPart Id="flexo_RcsPod_Part0_ab12cd"')
    expect(xml).not.toContain('flexo_RcsPod_Part1_ab12cd')
    const atlas = bundle.binaries.find((b) => b.path.endsWith('_MeshAtlas.glb'))!
    expect(atlasMeshNames(atlas.data)).toEqual([
      'flexo_RcsPod_Part0_ab12cd',
      'flexo_RcsPod_Part0_ab12cd_VM',
    ])
  })
})

describe('export variants carry the built-in template’s own colliders forward', () => {
  const BUILT_IN_BOX: PartCollider = {
    id: 'BoxCollider1',
    shape: 'Box',
    ownerTemplateId: SPOTLIGHT,
    position: { x: 0, y: 0, z: -0.00894 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 0.79467, y: 0.59602, z: 0.02531 },
    layerId: DEFAULT_LAYER_ID,
  }

  /** The light catalog, but the built-in template also declares its own geometry collider. */
  function catalogWithCollider(): Map<string, CatalogSubPart> {
    const c = lightCatalog()
    c.set(SPOTLIGHT, { ...c.get(SPOTLIGHT)!, colliders: [BUILT_IN_BOX] })
    return c
  }

  it('forces a variant for a template that carries ONLY a flexo collider', () => {
    const part = createEmptyPart()
    part.placements.push({
      instanceId: 's',
      subPartTemplateId: SPOTLIGHT,
      ...identityTransform(),
      layerId: 'default',
    })
    // Without this, the collider would be emitted under the SHARED built-in id and merge
    // onto every other use of that SubPart in the game.
    expect(buildExportVariantMap(part, lightCatalog(), 'X').size).toBe(0)
    part.colliders.push({
      id: '_collider1',
      shape: 'Cylinder',
      ownerTemplateId: SPOTLIGHT,
      ...identityTransform(),
      layerId: DEFAULT_LAYER_ID,
    })
    expect(buildExportVariantMap(part, lightCatalog(), 'X').size).toBe(1)
  })

  it('copies the built-in geometry collider onto the variant (a variant inherits nothing else)', () => {
    const v = buildExportVariantMap(partWithBuiltinLight(), catalogWithCollider(), 'MyLight').get(
      SPOTLIGHT,
    )!
    expect(v.colliders).toEqual([BUILT_IN_BOX])
  })

  it('declares them on the variant <SubPart> in the Assets XML, under a distinct component id', () => {
    const xml = serializeAssets({
      subParts: [],
      referenceSubParts: [
        {
          subPartId: 'flexo_X_Variant',
          meshId: SPOTLIGHT,
          materialId: `${SPOTLIGHT}_Material`,
          colliders: [BUILT_IN_BOX],
          internal: false,
          rayTracing: null,
          shadowCaster: null,
        },
      ],
    })
    expect(xml).toContain('<Collider Id="flexoInheritedColliders">')
    expect(xml).toContain('<Box Id="BoxCollider1">')
    expect(xml).toContain('<LengthX Cm="79.467"/>') // sub-metre distances emit as Cm
  })
})
