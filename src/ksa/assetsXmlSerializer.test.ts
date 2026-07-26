import { describe, it, expect } from 'vitest'
import { serializeAssets } from './assetsXmlSerializer'

describe('serializeAssets', () => {
  it('emits MeshAtlas, PbrMaterial and SubPart for a textured custom mesh', () => {
    const xml = serializeAssets({
      meshAtlasPath: 'Meshes/MyMod_MeshAtlas.glb',
      materials: [
        {
          id: 'flexo_panel_ab12cd_Material',
          diffusePath: 'Textures/dean_ab12cd_Diffuse.ktx2',
          normalPath: 'Textures/MyMod_FlatNormal.ktx2',
          aoRoughMetalPath: 'Textures/MyMod_NeutralORM.ktx2',
        },
      ],
      subParts: [{ subPartId: 'flexo_panel_ab12cd', materialId: 'flexo_panel_ab12cd_Material' }],
    })
    expect(xml).toContain('<MeshAtlas Path="Meshes/MyMod_MeshAtlas.glb"')
    expect(xml).toContain('<PbrMaterial Id="flexo_panel_ab12cd_Material"')
    expect(xml).toContain('<Diffuse Path="Textures/dean_ab12cd_Diffuse.ktx2" Category="Vessel"')
    // Every material carries the three channels KSA dereferences with no null check.
    expect(xml).toContain('<Normal Path="Textures/MyMod_FlatNormal.ktx2" Category="Vessel"')
    expect(xml).toContain('<AoRoughMetal Path="Textures/MyMod_NeutralORM.ktx2" Category="Vessel"')
    expect(xml).toContain('<SubPart Id="flexo_panel_ab12cd"')
    // PartModel needs a UNIQUE Id — KSA dedupes PartModels by Template.Id, so an
    // empty Id collapses multi-SubPart parts onto the first piece.
    expect(xml).toContain('<PartModel Id="flexo_panel_ab12cd_Model"')
    expect(xml).toContain('<Mesh Id="flexo_panel_ab12cd"')
    expect(xml).toContain('<Material Id="flexo_panel_ab12cd_Material"')
    // View mesh so the in-game vehicle editor can hover/select the placed part.
    expect(xml).toContain('<MeshView>')
    expect(xml).toContain('<Mesh Id="flexo_panel_ab12cd_VM"')
    expect(xml.startsWith('<?xml version="1.0" encoding="utf-8"?>')).toBe(true)
  })

  it('omits material/PbrMaterial for an untextured custom mesh', () => {
    const xml = serializeAssets({
      meshAtlasPath: 'Meshes/X.glb',
      subParts: [{ subPartId: 's1', materialId: null }],
    })
    expect(xml).not.toContain('PbrMaterial')
    expect(xml).not.toContain('<Material ')
    expect(xml).toContain('<SubPart Id="s1"')
    expect(xml).toContain('<Mesh Id="s1"')
    // Untextured parts still need a view mesh to be pickable in-game.
    expect(xml).toContain('<MeshView>')
    expect(xml).toContain('<Mesh Id="s1_VM"')
  })

  it('one shared PbrMaterial can serve several SubParts (Core pack-material pattern)', () => {
    const xml = serializeAssets({
      meshAtlasPath: 'Meshes/X.glb',
      materials: [
        {
          id: 'flexo_RedMetal_ab12cd34_Material',
          diffusePath: 'Textures/X_BaseColor_ff0000.ktx2',
          normalPath: 'Textures/X_FlatNormal.ktx2',
          aoRoughMetalPath: 'Textures/X_ORM_ff26ff.ktx2',
        },
      ],
      subParts: [
        { subPartId: 'button', materialId: 'flexo_RedMetal_ab12cd34_Material' },
        { subPartId: 'plinth', materialId: 'flexo_RedMetal_ab12cd34_Material' },
      ],
    })
    // ONE material declaration…
    expect(xml.match(/<PbrMaterial /g)?.length).toBe(1)
    // …referenced by both SubParts, each with its own unique PartModel id.
    expect(xml.match(/<Material Id="flexo_RedMetal_ab12cd34_Material"/g)?.length).toBe(2)
    expect(xml).toContain('<PartModel Id="button_Model"')
    expect(xml).toContain('<PartModel Id="plinth_Model"')
  })

  it('emits <Emissive> after <AoRoughMetal> when emissivePath is set, and omits it otherwise', () => {
    const xml = serializeAssets({
      meshAtlasPath: 'Meshes/X.glb',
      materials: [
        {
          id: 'glow_Material',
          diffusePath: 'Textures/X_glow_Diffuse.ktx2',
          normalPath: 'Textures/X_FlatNormal.ktx2',
          aoRoughMetalPath: 'Textures/X_NeutralORM.ktx2',
          emissivePath: 'Textures/X_glow_Emissive.ktx2',
        },
        {
          id: 'plain_Material',
          diffusePath: 'Textures/X_plain_Diffuse.ktx2',
          normalPath: 'Textures/X_FlatNormal.ktx2',
          aoRoughMetalPath: 'Textures/X_NeutralORM.ktx2',
        },
      ],
      subParts: [
        { subPartId: 'glow', materialId: 'glow_Material' },
        { subPartId: 'plain', materialId: 'plain_Material' },
      ],
    })
    expect(xml).toContain('<Emissive Path="Textures/X_glow_Emissive.ktx2" Category="Vessel"')
    // Emissive comes after AoRoughMetal in the glowing material.
    expect(xml.indexOf('X_NeutralORM.ktx2')).toBeLessThan(xml.indexOf('X_glow_Emissive.ktx2'))
    // The non-glow material has no <Emissive>.
    const plainMat = xml.slice(xml.indexOf('<PbrMaterial Id="plain_Material"'))
    expect(plainMat.slice(0, plainMat.indexOf('</PbrMaterial>'))).not.toContain('Emissive')
  })

  it('a glass shell + its opaque glow sibling emit <PartModelGlass> and <PartModel>+<Emissive>', () => {
    const xml = serializeAssets({
      meshAtlasPath: 'Meshes/X.glb',
      materials: [
        {
          id: 'visor_Material',
          diffusePath: 'Textures/X_visor_Diffuse.ktx2',
          normalPath: 'Textures/X_FlatNormal.ktx2',
          aoRoughMetalPath: 'Textures/X_NeutralORM.ktx2',
        },
        {
          id: 'visor_Glow_Material',
          diffusePath: 'Textures/X_glow_Diffuse.ktx2',
          normalPath: 'Textures/X_FlatNormal.ktx2',
          aoRoughMetalPath: 'Textures/X_NeutralORM.ktx2',
          emissivePath: 'Textures/X_glow_Emissive.ktx2',
        },
      ],
      subParts: [
        { subPartId: 'visor', materialId: 'visor_Material', glass: true },
        { subPartId: 'visor_Glow', materialId: 'visor_Glow_Material' },
      ],
    })
    expect(xml).toContain('<PartModelGlass Id="visor_Model"')
    expect(xml).toContain('<PartModel Id="visor_Glow_Model"')
    expect(xml).toContain('<Emissive Path="Textures/X_glow_Emissive.ktx2"')
  })

  it('kitten materials carry their own real normal/ORM paths; map-less ones use the solids', () => {
    const xml = serializeAssets({
      meshAtlasPath: 'Meshes/X.glb',
      materials: [
        {
          id: 'suit_Material',
          diffusePath: 'Textures/Characters/Kitten_EMU_A.ktx2',
          normalPath: 'Textures/Characters/Kitten_EMU_N.ktx2',
          aoRoughMetalPath: 'Textures/Characters/Kitten_EMU_ORM.ktx2',
        },
        {
          id: 'eye_Material',
          diffusePath: 'Textures/Characters/Kitten_Eye_A.ktx2',
          normalPath: 'Textures/X_FlatNormal.ktx2',
          aoRoughMetalPath: 'Textures/X_NeutralORM.ktx2',
        },
      ],
      subParts: [
        { subPartId: 'suit', materialId: 'suit_Material' },
        { subPartId: 'eye', materialId: 'eye_Material' },
      ],
    })
    expect(xml).toContain('<Normal Path="Textures/Characters/Kitten_EMU_N.ktx2" Category="Vessel"')
    expect(xml).toContain(
      '<AoRoughMetal Path="Textures/Characters/Kitten_EMU_ORM.ktx2" Category="Vessel"',
    )
    expect(xml).toContain('<Normal Path="Textures/X_FlatNormal.ktx2" Category="Vessel"')
    expect(xml).toContain('<AoRoughMetal Path="Textures/X_NeutralORM.ktx2" Category="Vessel"')
  })

  it('emits exterior-override reference SubParts reusing built-in Mesh/Material, with a render-mesh MeshView', () => {
    const xml = serializeAssets({
      // No meshAtlasPath: a variant-only export declares no custom geometry.
      subParts: [],
      referenceSubParts: [
        {
          subPartId: 'flexo_MyShip_CoreIVAPropA_Subpart_ChairA',
          meshId: 'CoreIVAPropA_Subpart_ChairA',
          materialId: 'CoreIVAPropA_Material',
          internal: false,
          rayTracing: null,
        },
        {
          subPartId: 'flexo_MyShip_CoreIVAPropA_Subpart_NoteA',
          meshId: 'CoreIVAPropA_Subpart_NoteA',
          materialId: null,
          internal: false,
          rayTracing: null,
        },
      ],
    })
    expect(xml).toContain('<SubPart Id="flexo_MyShip_CoreIVAPropA_Subpart_ChairA"')
    // Fresh, unique PartModel id — must NOT reuse the built-in "..._Model" (KSA dedupes by id).
    expect(xml).toContain('<PartModel Id="flexo_MyShip_CoreIVAPropA_Subpart_ChairA_Model"')
    // Reuses the built-in Mesh + Material by id.
    expect(xml).toContain('<Mesh Id="CoreIVAPropA_Subpart_ChairA"')
    expect(xml).toContain('<Material Id="CoreIVAPropA_Material"')
    // Untextured reference part omits <Material>.
    expect(xml).toContain('<PartModel Id="flexo_MyShip_CoreIVAPropA_Subpart_NoteA_Model"')
    expect(xml).toContain('<Mesh Id="CoreIVAPropA_Subpart_NoteA"')
    // Each variant carries a <MeshView> so KSA's editor can raycast (hover/select/right-click)
    // it. The view mesh reuses the built-in RENDER mesh id (NOT a "<id>_VM" suffix, which would
    // dangle for IVA parts whose atlas ships no _VM) — so each render mesh id appears twice:
    // once in the <PartModel>, once in the <MeshView>. Both textured and untextured parts get one.
    expect(xml).toContain('<MeshView>')
    expect(xml).not.toContain('_VM')
    expect(xml.split('<Mesh Id="CoreIVAPropA_Subpart_ChairA"').length - 1).toBe(2)
    expect(xml.split('<Mesh Id="CoreIVAPropA_Subpart_NoteA"').length - 1).toBe(2)
    // No atlas, no PbrMaterial, and — the override — no interior-only flag.
    expect(xml).not.toContain('MeshAtlas')
    expect(xml).not.toContain('PbrMaterial')
    expect(xml).not.toContain('<Internal>')
    expect(xml).not.toContain('RayTracing')
  })

  it('carries <Internal> and the raw <RayTracing> token forward onto a reference SubPart', () => {
    const xml = serializeAssets({
      subParts: [],
      referenceSubParts: [
        {
          subPartId: 'flexo_MyShip_RayBlocker',
          meshId: 'CoreIVASpaceA_Subpart_MediumCapsuleARayBlocker',
          materialId: 'CoreIVASpaceA_Material',
          internal: true,
          rayTracing: 'ShadowProxy',
        },
      ],
    })
    // Element order mirrors Core: Internal, Mesh, Material, RayTracing.
    expect(xml).toMatch(
      /<PartModel Id="flexo_MyShip_RayBlocker_Model">\s*<Internal>true<\/Internal>\s*<Mesh Id="CoreIVASpaceA_Subpart_MediumCapsuleARayBlocker"\s*\/>\s*<Material Id="CoreIVASpaceA_Material"\s*\/>\s*<RayTracing>ShadowProxy<\/RayTracing>/,
    )
  })

  it('emits <Internal>true</Internal> on a custom mesh’s own <PartModel>, never on the glass path', () => {
    const xml = serializeAssets({
      meshAtlasPath: 'Meshes/X.glb',
      subParts: [
        { subPartId: 'panel', materialId: null, internal: true },
        // Belt-and-braces: modExport never sets `internal` on a glass plan (KSA's
        // <PartModelGlass> has no such field), and the serializer drops it if it ever did.
        { subPartId: 'visor', materialId: null, glass: true, internal: true },
      ],
    })
    expect(xml).toMatch(/<PartModel Id="panel_Model">\s*<Internal>true<\/Internal>/)
    expect(xml.match(/<Internal>true<\/Internal>/g)).toHaveLength(1)
    expect(xml).toContain('<PartModelGlass Id="visor_Model"')
  })

  it('emits <PartModelGlass> for a glass SubPart (translucent path)', () => {
    const xml = serializeAssets({
      meshAtlasPath: 'Meshes/X.glb',
      materials: [
        {
          id: 'visor_Material',
          diffusePath: 'Textures/Visor.ktx2',
          normalPath: 'Textures/X_FlatNormal.ktx2',
          aoRoughMetalPath: 'Textures/X_NeutralORM.ktx2',
        },
        {
          id: 'suit_Material',
          diffusePath: 'Textures/Suit.ktx2',
          normalPath: 'Textures/X_FlatNormal.ktx2',
          aoRoughMetalPath: 'Textures/X_NeutralORM.ktx2',
        },
      ],
      subParts: [
        { subPartId: 'visor', materialId: 'visor_Material', glass: true },
        { subPartId: 'suit', materialId: 'suit_Material' },
      ],
    })
    expect(xml).toContain('<PartModelGlass Id="visor_Model"')
    expect(xml).toContain('<PartModel Id="suit_Model"')
    expect(xml).not.toContain('<PartModel Id="visor_Model"') // visor must NOT be the opaque path
  })
})
