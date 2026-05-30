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
    expect(xml).toContain('<Mesh Id="flexo_panel_ab12cd"')
    expect(xml).toContain('<Material Id="flexo_panel_ab12cd_Material"')
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
  })
})
