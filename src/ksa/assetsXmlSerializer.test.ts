import { describe, it, expect } from 'vitest';
import { serializeAssets } from './assetsXmlSerializer';

describe('serializeAssets', () => {
  it('emits MeshAtlas, PbrMaterial and SubPart for a textured custom mesh', () => {
    const xml = serializeAssets([
      {
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
      },
    ]);
    expect(xml).toContain('<MeshAtlas Path="Meshes/MyMod_MeshAtlas.glb"');
    expect(xml).toContain('<PbrMaterial Id="flexo_panel_ab12cd_Material"');
    expect(xml).toContain('<Diffuse Path="Textures/dean_ab12cd_Diffuse.ktx2" Category="Vessel"');
    // Every material carries the three channels KSA dereferences with no null check.
    expect(xml).toContain('<Normal Path="Textures/MyMod_FlatNormal.ktx2" Category="Vessel"');
    expect(xml).toContain('<AoRoughMetal Path="Textures/MyMod_NeutralORM.ktx2" Category="Vessel"');
    expect(xml).toContain('<SubPart Id="flexo_panel_ab12cd"');
    // PartModel needs a UNIQUE Id — KSA dedupes PartModels by Template.Id, so an
    // empty Id collapses multi-SubPart parts onto the first piece.
    expect(xml).toContain('<PartModel Id="flexo_panel_ab12cd_Model"');
    expect(xml).toContain('<Mesh Id="flexo_panel_ab12cd"');
    expect(xml).toContain('<Material Id="flexo_panel_ab12cd_Material"');
    // View mesh so the in-game vehicle editor can hover/select the placed part.
    expect(xml).toContain('<MeshView>');
    expect(xml).toContain('<Mesh Id="flexo_panel_ab12cd_VM"');
    expect(xml.startsWith('<?xml version="1.0" encoding="utf-8"?>')).toBe(true);
  });

  // KSA has NO untextured <PartModel>: ThumbnailRenderResources.AddDraw derefs
  // Material.DiffuseReference with no null guard, so omitting <Material> NREs at startup before
  // the main menu. modExport gives a texture-less mesh the shared neutral material instead; the
  // serializer's job is simply to always emit the reference it was given.
  it('always emits <Material> — a SubPart that declares no PbrMaterial here still references one', () => {
    const xml = serializeAssets([
      {
        meshAtlasPath: 'Meshes/X.glb',
        subParts: [{ subPartId: 's1', materialId: 'X_NeutralMaterial' }],
      },
    ]);
    expect(xml).not.toContain('PbrMaterial');
    expect(xml).toContain('<Material Id="X_NeutralMaterial"/>');
    expect(xml).toContain('<SubPart Id="s1"');
    expect(xml).toContain('<Mesh Id="s1"');
    // Untextured parts still need a view mesh to be pickable in-game.
    expect(xml).toContain('<MeshView>');
    expect(xml).toContain('<Mesh Id="s1_VM"');
  });

  it('one shared PbrMaterial can serve several SubParts (Core pack-material pattern)', () => {
    const xml = serializeAssets([
      {
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
      },
    ]);
    // ONE material declaration…
    expect(xml.match(/<PbrMaterial /g)?.length).toBe(1);
    // …referenced by both SubParts, each with its own unique PartModel id.
    expect(xml.match(/<Material Id="flexo_RedMetal_ab12cd34_Material"/g)?.length).toBe(2);
    expect(xml).toContain('<PartModel Id="button_Model"');
    expect(xml).toContain('<PartModel Id="plinth_Model"');
  });

  it('emits <Emissive> after <AoRoughMetal> when emissivePath is set, and omits it otherwise', () => {
    const xml = serializeAssets([
      {
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
      },
    ]);
    expect(xml).toContain('<Emissive Path="Textures/X_glow_Emissive.ktx2" Category="Vessel"');
    // Emissive comes after AoRoughMetal in the glowing material.
    expect(xml.indexOf('X_NeutralORM.ktx2')).toBeLessThan(xml.indexOf('X_glow_Emissive.ktx2'));
    // The non-glow material has no <Emissive>.
    const plainMat = xml.slice(xml.indexOf('<PbrMaterial Id="plain_Material"'));
    expect(plainMat.slice(0, plainMat.indexOf('</PbrMaterial>'))).not.toContain('Emissive');
  });

  it('a glass shell + its opaque glow sibling emit <PartModelGlass> and <PartModel>+<Emissive>', () => {
    const xml = serializeAssets([
      {
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
      },
    ]);
    expect(xml).toContain('<PartModelGlass Id="visor_Model"');
    expect(xml).toContain('<PartModel Id="visor_Glow_Model"');
    expect(xml).toContain('<Emissive Path="Textures/X_glow_Emissive.ktx2"');
  });

  it('kitten materials carry their own real normal/ORM paths; map-less ones use the solids', () => {
    const xml = serializeAssets([
      {
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
      },
    ]);
    expect(xml).toContain('<Normal Path="Textures/Characters/Kitten_EMU_N.ktx2" Category="Vessel"');
    expect(xml).toContain(
      '<AoRoughMetal Path="Textures/Characters/Kitten_EMU_ORM.ktx2" Category="Vessel"',
    );
    expect(xml).toContain('<Normal Path="Textures/X_FlatNormal.ktx2" Category="Vessel"');
    expect(xml).toContain('<AoRoughMetal Path="Textures/X_NeutralORM.ktx2" Category="Vessel"');
  });

  it('emits exterior-override reference SubParts reusing built-in Mesh/Material, with a render-mesh MeshView', () => {
    const xml = serializeAssets([
      {
        // No meshAtlasPath: a variant-only export declares no custom geometry.
        subParts: [],
        referenceSubParts: [
          {
            subPartId: 'flexo_MyShip_CoreIVAPropA_Subpart_ChairA',
            meshId: 'CoreIVAPropA_Subpart_ChairA',
            materialId: 'CoreIVAPropA_Material',
            internal: false,
            rayTracing: null,
            shadowCaster: null,
          },
          {
            subPartId: 'flexo_MyShip_CoreIVAPropA_Subpart_NoteA',
            meshId: 'CoreIVAPropA_Subpart_NoteA',
            materialId: 'CoreIVAPropA_Material',
            internal: false,
            rayTracing: null,
            shadowCaster: null,
          },
        ],
      },
    ]);
    expect(xml).toContain('<SubPart Id="flexo_MyShip_CoreIVAPropA_Subpart_ChairA"');
    // Fresh, unique PartModel id — must NOT reuse the built-in "..._Model" (KSA dedupes by id).
    expect(xml).toContain('<PartModel Id="flexo_MyShip_CoreIVAPropA_Subpart_ChairA_Model"');
    // Reuses the built-in Mesh + Material by id.
    expect(xml).toContain('<Mesh Id="CoreIVAPropA_Subpart_ChairA"');
    expect(xml).toContain('<Material Id="CoreIVAPropA_Material"');
    // Untextured reference part omits <Material>.
    expect(xml).toContain('<PartModel Id="flexo_MyShip_CoreIVAPropA_Subpart_NoteA_Model"');
    expect(xml).toContain('<Mesh Id="CoreIVAPropA_Subpart_NoteA"');
    // Each variant carries a <MeshView> so KSA's editor can raycast (hover/select/right-click)
    // it. The view mesh reuses the built-in RENDER mesh id (NOT a "<id>_VM" suffix, which would
    // dangle for IVA parts whose atlas ships no _VM) — so each render mesh id appears twice:
    // once in the <PartModel>, once in the <MeshView>. Both textured and untextured parts get one.
    expect(xml).toContain('<MeshView>');
    expect(xml).not.toContain('_VM');
    expect(xml.split('<Mesh Id="CoreIVAPropA_Subpart_ChairA"').length - 1).toBe(2);
    expect(xml.split('<Mesh Id="CoreIVAPropA_Subpart_NoteA"').length - 1).toBe(2);
    // No atlas, no PbrMaterial, and — the override — no interior-only flag.
    expect(xml).not.toContain('MeshAtlas');
    expect(xml).not.toContain('PbrMaterial');
    expect(xml).not.toContain('<Internal>');
    expect(xml).not.toContain('RayTracing');
  });

  it('carries <Internal> and the raw <RayTracing> token forward onto a reference SubPart', () => {
    const xml = serializeAssets([
      {
        subParts: [],
        referenceSubParts: [
          {
            subPartId: 'flexo_MyShip_RayBlocker',
            meshId: 'CoreIVASpaceA_Subpart_MediumCapsuleARayBlocker',
            materialId: 'CoreIVASpaceA_Material',
            internal: true,
            rayTracing: 'ShadowProxy',
            shadowCaster: null,
          },
        ],
      },
    ]);
    // Element order mirrors Core: Internal, Mesh, Material, RayTracing.
    expect(xml).toMatch(
      /<PartModel Id="flexo_MyShip_RayBlocker_Model">\s*<Internal>true<\/Internal>\s*<Mesh Id="CoreIVASpaceA_Subpart_MediumCapsuleARayBlocker"\s*\/>\s*<Material Id="CoreIVASpaceA_Material"\s*\/>\s*<RayTracing>ShadowProxy<\/RayTracing>/,
    );
    expect(xml).not.toContain('ShadowCaster');
  });

  it('carries <ShadowCaster> forward onto a reference SubPart, in Core’s child order', () => {
    const xml = serializeAssets([
      {
        subParts: [],
        referenceSubParts: [
          {
            subPartId: 'flexo_MyShip_Window',
            meshId: 'CoreCommandA_Subpart_MediumCapsuleWindowA',
            materialId: 'CoreCommandA_Material',
            internal: false,
            rayTracing: null,
            shadowCaster: false,
          },
        ],
      },
    ]);
    // Core authors Mesh, Material, ShadowCaster (CoreCommandAAssets.xml) — matched here, and
    // consistent with Internal, Mesh, Material, RayTracing (CoreIVASpaceAAssets.xml) above.
    expect(xml).toMatch(
      /<PartModel Id="flexo_MyShip_Window_Model">\s*<Mesh Id="CoreCommandA_Subpart_MediumCapsuleWindowA"\s*\/>\s*<Material Id="CoreCommandA_Material"\s*\/>\s*<ShadowCaster>false<\/ShadowCaster>/,
    );
  });

  it('emits <ShadowCaster>true</ShadowCaster> when the built-in authors an explicit true', () => {
    // "absent" and "explicitly true" are the same to KSA, but flexo copies what it read rather
    // than second-guessing the built-in's authoring.
    const xml = serializeAssets([
      {
        subParts: [],
        referenceSubParts: [
          {
            subPartId: 'flexo_MyShip_Caster',
            meshId: 'CoreStructuralA_Subpart_X',
            materialId: 'CoreStructuralA_Material',
            internal: false,
            rayTracing: null,
            shadowCaster: true,
          },
        ],
      },
    ]);
    expect(xml).toContain('<ShadowCaster>true</ShadowCaster>');
  });

  it('emits <Internal>true</Internal> on a custom mesh’s own <PartModel>, never on the glass path', () => {
    const xml = serializeAssets([
      {
        meshAtlasPath: 'Meshes/X.glb',
        subParts: [
          { subPartId: 'panel', materialId: 'M', internal: true },
          // Belt-and-braces: modExport never sets `internal` on a glass plan (KSA's
          // <PartModelGlass> has no such field), and the serializer drops it if it ever did.
          { subPartId: 'visor', materialId: 'M', glass: true, internal: true },
        ],
      },
    ]);
    expect(xml).toMatch(/<PartModel Id="panel_Model">\s*<Internal>true<\/Internal>/);
    expect(xml.match(/<Internal>true<\/Internal>/g)).toHaveLength(1);
    expect(xml).toContain('<PartModelGlass Id="visor_Model"');
  });

  it('emits <PartModelGlass> for a glass SubPart (translucent path)', () => {
    const xml = serializeAssets([
      {
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
      },
    ]);
    expect(xml).toContain('<PartModelGlass Id="visor_Model"');
    expect(xml).toContain('<PartModel Id="suit_Model"');
    expect(xml).not.toContain('<PartModel Id="visor_Model"'); // visor must NOT be the opaque path
  });
});

// ── N plans in ONE Assets document (MULTI_PART_PLAN P3.03) ───────────────────
//
// One mod, one `<Base>Assets.xml`, N parts: an Assets file is a flat `List<SerializedId>`
// (`KSA/AssetBundle.cs`) and `MeshAtlasFileReference.DoLoad()` registers each GLB mesh BY NAME
// (first-wins), so one `<MeshAtlas>` per part is exactly how N parts ship their geometry.
describe('serializeAssets — N plans in one <Assets>', () => {
  /** One part's plan: its own atlas, its own material, its own custom SubPart. */
  const planA = {
    meshAtlasPath: 'Meshes/Fleet_a1b2_MeshAtlas.glb',
    materials: [
      {
        id: 'a_Material',
        diffusePath: 'Textures/Fleet_a1b2_BaseColor_ff0000.ktx2',
        normalPath: 'Textures/Fleet_a1b2_FlatNormal.ktx2',
        aoRoughMetalPath: 'Textures/Fleet_a1b2_NeutralORM.ktx2',
      },
    ],
    subParts: [{ subPartId: 'flexo_hull_a1b2', materialId: 'a_Material' }],
  };
  /** The second part: its own atlas + material + custom SubPart, PLUS an export variant. */
  const planB = {
    meshAtlasPath: 'Meshes/Fleet_c3d4_MeshAtlas.glb',
    materials: [
      {
        id: 'b_Material',
        diffusePath: 'Textures/Fleet_c3d4_BaseColor_00ff00.ktx2',
        normalPath: 'Textures/Fleet_c3d4_FlatNormal.ktx2',
        aoRoughMetalPath: 'Textures/Fleet_c3d4_NeutralORM.ktx2',
      },
    ],
    subParts: [{ subPartId: 'flexo_fin_c3d4', materialId: 'b_Material' }],
    referenceSubParts: [
      {
        subPartId: 'flexo_Fleet_ShipB_CoreIVAPropA_Subpart_ChairA',
        meshId: 'CoreIVAPropA_Subpart_ChairA',
        materialId: 'CoreIVAPropA_Material',
        internal: false,
        rayTracing: null,
        shadowCaster: null,
      },
    ],
  };

  it('emits one <MeshAtlas> per plan and merges every plan’s materials + SubParts, in plan order', () => {
    const xml = serializeAssets([planA, planB]);
    expect(xml.match(/<MeshAtlas /g)).toHaveLength(2);
    expect(xml).toContain('<MeshAtlas Path="Meshes/Fleet_a1b2_MeshAtlas.glb"');
    expect(xml).toContain('<MeshAtlas Path="Meshes/Fleet_c3d4_MeshAtlas.glb"');
    // Both materials and all three SubParts (2 custom + 1 export variant) are siblings.
    expect(xml.match(/<PbrMaterial /g)).toHaveLength(2);
    expect(xml.match(/<SubPart Id=/g)).toHaveLength(3);
    expect(xml).toContain('<Material Id="a_Material"/>');
    expect(xml).toContain('<Material Id="b_Material"/>');
    expect(xml).toContain('<SubPart Id="flexo_Fleet_ShipB_CoreIVAPropA_Subpart_ChairA"');
    // Plan order is document order: everything of plan A precedes everything of plan B.
    expect(xml.indexOf('Fleet_a1b2_MeshAtlas')).toBeLessThan(xml.indexOf('Fleet_c3d4_MeshAtlas'));
    expect(xml.indexOf('<SubPart Id="flexo_hull_a1b2"')).toBeLessThan(
      xml.indexOf('<SubPart Id="flexo_fin_c3d4"'),
    );
  });

  // KSA registers <SubPart> and <PbrMaterial> ids across the WHOLE mod, first-wins — a
  // duplicate does not error at load, it silently collapses onto the first. Unreachable under
  // I4 + the per-part `ns`; this is the tripwire that makes a breach loud instead of silent.
  it('throws on a duplicate <SubPart Id> across plans', () => {
    expect(() =>
      serializeAssets([planA, { ...planB, subParts: [{ ...planA.subParts[0] }] }]),
    ).toThrow(/duplicate <SubPart Id="flexo_hull_a1b2">/);
  });

  it('throws when a reference SubPart collides with another plan’s custom SubPart', () => {
    // The two kinds share ONE registry, so the guard must span both lists.
    expect(() =>
      serializeAssets([
        planA,
        {
          ...planB,
          referenceSubParts: [{ ...planB.referenceSubParts[0], subPartId: 'flexo_hull_a1b2' }],
        },
      ]),
    ).toThrow(/duplicate <SubPart Id="flexo_hull_a1b2">/);
  });

  it('throws on a duplicate <PbrMaterial Id> across plans', () => {
    expect(() =>
      serializeAssets([planA, { ...planB, materials: [{ ...planA.materials[0] }] }]),
    ).toThrow(/duplicate <PbrMaterial Id="a_Material">/);
  });

  it('allows a plan to repeat ids nothing else claims (no false positives)', () => {
    // Two plans, disjoint ids — the guard must not fire on legitimate multi-part output.
    expect(() => serializeAssets([planA, planB])).not.toThrow();
  });
});
