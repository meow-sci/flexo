import { describe, it, expect } from 'vitest'
import { serializeAssets } from './assetsXmlSerializer'

describe('serializeAssets', () => {
  it('emits MeshAtlas, PbrMaterial and SubPart for a textured custom mesh', () => {
    const xml = serializeAssets({
      meshAtlasPath: 'Meshes/MyMod_MeshAtlas.glb',
      subParts: [
        {
          subPartId: 'flexo_panel_ab12cd',
          materialId: 'flexo_panel_ab12cd_Material',
          diffusePath: 'Textures/dean_ab12cd_Diffuse.ktx2',
        },
      ],
    })
    expect(xml).toContain('<MeshAtlas Path="Meshes/MyMod_MeshAtlas.glb"')
    expect(xml).toContain('<PbrMaterial Id="flexo_panel_ab12cd_Material"')
    expect(xml).toContain('<Diffuse Path="Textures/dean_ab12cd_Diffuse.ktx2" Category="Vessel"')
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
      subParts: [{ subPartId: 's1', materialId: null, diffusePath: null }],
    })
    expect(xml).not.toContain('PbrMaterial')
    expect(xml).not.toContain('<Material ')
    expect(xml).toContain('<SubPart Id="s1"')
    expect(xml).toContain('<Mesh Id="s1"')
    // Untextured parts still need a view mesh to be pickable in-game.
    expect(xml).toContain('<MeshView>')
    expect(xml).toContain('<Mesh Id="s1_VM"')
  })

  it('emits <Emissive> after <AoRoughMetal> when emissivePath is set, and omits it otherwise', () => {
    const xml = serializeAssets({
      meshAtlasPath: 'Meshes/X.glb',
      normalPath: 'Textures/X_FlatNormal.ktx2',
      aoRoughMetalPath: 'Textures/X_NeutralORM.ktx2',
      subParts: [
        {
          subPartId: 'glow',
          materialId: 'glow_Material',
          diffusePath: 'Textures/X_glow_Diffuse.ktx2',
          emissivePath: 'Textures/X_glow_Emissive.ktx2',
        },
        {
          subPartId: 'plain',
          materialId: 'plain_Material',
          diffusePath: 'Textures/X_plain_Diffuse.ktx2',
        },
      ],
    })
    expect(xml).toContain('<Emissive Path="Textures/X_glow_Emissive.ktx2" Category="Vessel"')
    // Emissive comes after AoRoughMetal in the glowing material.
    expect(xml.indexOf('X_NeutralORM.ktx2')).toBeLessThan(xml.indexOf('X_glow_Emissive.ktx2'))
    // The non-glow material has no <Emissive>.
    const plainMat = xml.slice(xml.indexOf('plain_Material'))
    expect(plainMat).not.toContain('Emissive')
  })

  it('a glass shell + its opaque glow sibling emit <PartModelGlass> and <PartModel>+<Emissive>', () => {
    const xml = serializeAssets({
      meshAtlasPath: 'Meshes/X.glb',
      normalPath: 'Textures/X_FlatNormal.ktx2',
      aoRoughMetalPath: 'Textures/X_NeutralORM.ktx2',
      subParts: [
        {
          subPartId: 'visor',
          materialId: 'visor_Material',
          diffusePath: 'Textures/X_visor_Diffuse.ktx2',
          glass: true,
        },
        {
          subPartId: 'visor_Glow',
          materialId: 'visor_Glow_Material',
          diffusePath: 'Textures/X_glow_Diffuse.ktx2',
          emissivePath: 'Textures/X_glow_Emissive.ktx2',
        },
      ],
    })
    expect(xml).toContain('<PartModelGlass Id="visor_Model"')
    expect(xml).toContain('<PartModel Id="visor_Glow_Model"')
    expect(xml).toContain('<Emissive Path="Textures/X_glow_Emissive.ktx2"')
  })

  it('per-SubPart normal/ORM override the shared synthetic; undefined falls back', () => {
    const xml = serializeAssets({
      meshAtlasPath: 'Meshes/X.glb',
      normalPath: 'Textures/X_FlatNormal.ktx2',
      aoRoughMetalPath: 'Textures/X_NeutralORM.ktx2',
      subParts: [
        // Kitten suit: carries its own real normal + ORM (overrides the shared synthetic).
        {
          subPartId: 'suit',
          materialId: 'suit_Material',
          diffusePath: 'Textures/Characters/Kitten_EMU_A.ktx2',
          normalPath: 'Textures/Characters/Kitten_EMU_N.ktx2',
          aoRoughMetalPath: 'Textures/Characters/Kitten_EMU_ORM.ktx2',
        },
        // Kitten eyes: diffuse only → undefined channels fall back to the shared synthetic.
        {
          subPartId: 'eye',
          materialId: 'eye_Material',
          diffusePath: 'Textures/Characters/Kitten_Eye_A.ktx2',
        },
      ],
    })
    expect(xml).toContain('<Normal Path="Textures/Characters/Kitten_EMU_N.ktx2" Category="Vessel"')
    expect(xml).toContain(
      '<AoRoughMetal Path="Textures/Characters/Kitten_EMU_ORM.ktx2" Category="Vessel"',
    )
    // The eye material falls back to the shared synthetic paths.
    expect(xml).toContain('<Normal Path="Textures/X_FlatNormal.ktx2" Category="Vessel"')
    expect(xml).toContain('<AoRoughMetal Path="Textures/X_NeutralORM.ktx2" Category="Vessel"')
  })

  it('emits reference SubParts (de-IVA props) reusing built-in Mesh/Material, with a render-mesh MeshView', () => {
    const xml = serializeAssets({
      // No meshAtlasPath: an IVA-only export declares no custom geometry.
      subParts: [],
      referenceSubParts: [
        {
          subPartId: 'flexo_MyShip_CoreIVAPropA_Subpart_ChairA_NotIVA',
          meshId: 'CoreIVAPropA_Subpart_ChairA',
          materialId: 'CoreIVAPropA_Material',
        },
        {
          subPartId: 'flexo_MyShip_CoreIVAPropA_Subpart_NoteA_NotIVA',
          meshId: 'CoreIVAPropA_Subpart_NoteA',
          materialId: null,
        },
      ],
    })
    expect(xml).toContain('<SubPart Id="flexo_MyShip_CoreIVAPropA_Subpart_ChairA_NotIVA"')
    // Fresh, unique PartModel id — must NOT reuse the built-in "..._Model" (KSA dedupes by id).
    expect(xml).toContain('<PartModel Id="flexo_MyShip_CoreIVAPropA_Subpart_ChairA_NotIVA_Model"')
    // Reuses the built-in Mesh + Material by id.
    expect(xml).toContain('<Mesh Id="CoreIVAPropA_Subpart_ChairA"')
    expect(xml).toContain('<Material Id="CoreIVAPropA_Material"')
    // Untextured reference part omits <Material>.
    expect(xml).toContain('<PartModel Id="flexo_MyShip_CoreIVAPropA_Subpart_NoteA_NotIVA_Model"')
    expect(xml).toContain('<Mesh Id="CoreIVAPropA_Subpart_NoteA"')
    // Each variant carries a <MeshView> so KSA's editor can raycast (hover/select/right-click)
    // it. The view mesh reuses the built-in RENDER mesh id (NOT a "<id>_VM" suffix, which would
    // dangle for IVA parts whose atlas ships no _VM) — so each render mesh id appears twice:
    // once in the <PartModel>, once in the <MeshView>. Both textured and untextured parts get one.
    expect(xml).toContain('<MeshView>')
    expect(xml).not.toContain('_VM')
    expect(xml.split('<Mesh Id="CoreIVAPropA_Subpart_ChairA"').length - 1).toBe(2)
    expect(xml.split('<Mesh Id="CoreIVAPropA_Subpart_NoteA"').length - 1).toBe(2)
    // No atlas, no PbrMaterial, and never the IVA-only nodes.
    expect(xml).not.toContain('MeshAtlas')
    expect(xml).not.toContain('PbrMaterial')
    expect(xml).not.toContain('<Internal>')
    expect(xml).not.toContain('RayTracing')
  })

  it('emits <PartModelGlass> for a glass SubPart (translucent path)', () => {
    const xml = serializeAssets({
      meshAtlasPath: 'Meshes/X.glb',
      subParts: [
        {
          subPartId: 'visor',
          materialId: 'visor_Material',
          diffusePath: 'Textures/Visor.ktx2',
          glass: true,
        },
        { subPartId: 'suit', materialId: 'suit_Material', diffusePath: 'Textures/Suit.ktx2' },
      ],
    })
    expect(xml).toContain('<PartModelGlass Id="visor_Model"')
    expect(xml).toContain('<PartModel Id="suit_Model"')
    expect(xml).not.toContain('<PartModel Id="visor_Model"') // visor must NOT be the opaque path
  })
})
