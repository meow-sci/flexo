# Scope — Custom assets, textures, GLB and mod export

**Baseline: KSA 2026.11.10.5801.** Current XML uses the content prepass and identified
global assets. Historical in-game checks of earlier formats do not establish that
5801 exports load in the running game. Validation results and limits are recorded
in [the upgrade report](../plans/KSA_5801_UPGRADE.md).

Read with [custom assets](../docs/custom-assets.md),
[importing models](../docs/importing-models.md), [texturing](../docs/texturing.md),
[asset pipeline](../docs/asset-pipeline.md), and
[Part XML](part-and-subpart-xml.md).

## Flexo modules

| Module                                                                      | Responsibility                                                                     |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `src/ksa/modExport.ts`                                                      | Per-part plans, independent built-in copies, multi-part bundles, ZIP/folder output |
| `src/ksa/assetsXmlSerializer.ts`                                            | Texture, MeshAtlas, material and SubPart declarations; ID uniqueness               |
| `src/ksa/partXmlSerializer.ts`                                              | Part definitions and current same-tag gameplay patches                             |
| `src/ksa/exportGlb.ts`                                                      | Indexed geometry, mesh names, view meshes and their triangle budget                |
| `src/ksa/importPlan.ts`, `importNormalize.ts`, `importMaterials.ts`         | glTF analysis, geometry normalization and texture-channel conversion               |
| `src/ktx/encodeKtx2.ts`, `channelTransforms.ts`, `glowComposite.ts`         | KTX2 container, normal/ORM mapping and emissive baking                             |
| `src/state/customAssetStore.ts`, `assetDb.ts`                               | Project-owned descriptors, binaries and preview URLs                               |
| `src/three/TextureCache.ts`, `MaterialFactory.ts`, `catalogRenderModels.ts` | Texture decode and material/model selection for previews                           |

## Game-side anchors

Current classes are under `ksa-game-assemblies/current/decomp/`: `KSA/ContentLoader`,
`ContentDeserializer`, `ChildMerge`, `GameContentTags`, `Mod`, `MeshAtlasFileReference`,
`MeshReference`, `PbrMaterialReference`, `TextureReference`, `PartModelModule`,
`PartModelDynamicModule`, `PartModelGlassModule`, `PartModelRenderer`,
`KSA.Rendering.Thumbnails/ThumbnailRenderResources`, and `RenderCore.Gltf/GltfUtils`.
Shaders live under `Content/Core/Shaders`. The detailed binary and shader audit is
[the rendering research](../plans/KSA_5801_RENDER_RESEARCH.md).

## Contracts

1. **Global asset identities.** Top-level Texture, MeshAtlas, PbrMaterial and SubPart
   rows require `Id`. Material slots use `Ref` to Texture; model Mesh/Material children
   use `Ref` to global resources. Each render module has an owner-local `Key`, not a
   global model ID. `Components` contains the model and MeshView declarations.

2. **Mesh names.** KSA registers GLB `meshes[i].name`; a node name alone is insufficient.
   `exportGlb.ts` copies names to the mesh objects. Atlas IDs do not namespace meshes.
   Render and `_VM` names must be unique throughout the exported mod and must not
   collide with referenced Core resources. HostOnly collision atlases are separate
   from the renderer's atlas index.

3. **Required material channels.** Diffuse, Normal and AoRoughMetal are always emitted.
   The thumbnail path dereferences the normal and packed PBR textures without null
   guards. Missing channels get shared neutral textures. ORM means R=AO, G=roughness,
   B=metalness. Optional native Emissive, ThinFilm and Alpha references survive
   built-in template copies even where Flexo does not simulate them.

4. **KTX2 color convention.** Custom output is RGBA8 UNORM with linear container tags,
   sRGB-encoded color bytes and Zstd mip compression. KSA performs its own gamma decode;
   an SRGB Vulkan format would decode twice. Source normal maps receive the KSA X
   inversion once during encoding. The editor reverses that convention while
   reconstructing the normal Z component. Core browser textures use UASTC and transcode
   according to device capabilities. Foil and cloth require no special format.

5. **Current XML shape.** For example:

   ```xml
   <Texture Id="ExampleDiffuse" Path="Textures/example.ktx2" Category="Vessel"/>
   <MeshAtlas Id="ExampleAtlas" Path="Meshes/example.glb"/>
   <PbrMaterial Id="ExampleMaterial"><Diffuse Ref="ExampleDiffuse"/></PbrMaterial>
   <SubPart Id="ExampleBody"><Components>
     <PartModel Key="Model"><Mesh Ref="ExampleMesh"/><Material Ref="ExampleMaterial"/></PartModel>
     <MeshView Key="View"><Mesh Ref="ExampleMesh_VM"/></MeshView>
   </Components></SubPart>
   ```

   The abbreviated material above illustrates references; real output also supplies
   Normal and AoRoughMetal as required by contract 3. `Category` retains the game's
   texture-size policy; it is not a shader selection.

6. **Manifest order.** `mod.toml` declares `name` and `assets=[…]`. Definitions precede
   same-tag Modify patches. There is no separate systems list for current System rows.
   A patch target must already exist, even though a Parent may resolve forward.

7. **Paths and ownership.** New binary Paths are mod-relative. References to native
   global resources keep Core's resource ownership. Fresh built-in SubPart copies
   reuse global Mesh and Material references and do not copy licensed binaries into
   the exported custom mod.

8. **Scope and deduplication.** Top-level IDs are case-insensitively unique across the
   export. Identical custom channel sets can intentionally share a single material;
   duplicate declarations are not emitted. Component Keys are local to their owner.
   The old PartModel-global-ID deduplication rule no longer describes the schema.

9. **Glass.** Native PartModelGlass is preserved. Its special in-game shader is not
   faithfully reproduced by the ordinary browser PBR preview. The existing custom
   tinted-glass approximation and two-layer glassGlow export remain separate features.
   Glass and Dynamic modules have no `Internal` member; only PartModel can be IVA-only.

10. **Indices.** GLB render and view geometry require indices. Export uses raw geometry,
    not the editor's tangented cache: tangent generation can de-index geometry.

11. **Accessors.** KSA consumes tightly packed float32 POSITION, NORMAL and TEXCOORD_0,
    with position bounds and unsigned integer indices. Unread attributes are stripped.
    Geometry exported from Blender passes through the same normalization.

12. **Emissive.** KSA adds a white mask after lighting; it has no arbitrary colored
    emission or user LUT material slot. Flexo bakes desired color into diffuse and can
    pair it with a Light. See [the emissive analysis](../analysis/KSA_EMISSIVE_AND_LUT.md).

13. **glTF transforms.** The atlas loader reads mesh data, not the node hierarchy. Node
    transforms must be baked into geometry or represented as Part placements. Mirrored
    transforms are baked with corrected winding.

14. **Materials and primitives.** A PartModel references one mesh and one material;
    current KSA renders primitive zero. Model import splits multi-material content into
    compatible meshes. A SubPart may contain multiple model components, and Flexo now
    preserves and previews all of them. Every shipped 5801 render mesh has one primitive.

15. **Culling.** KSA renders part surfaces with back-face culling. Interior geometry
    requires real inward-facing surfaces or deliberate double-sided geometry baking;
    a browser-side material flag alone cannot make an exported mesh double-sided.

16. **glTF factors.** KSA materials are texture-driven. Base color, roughness, metalness,
    occlusion and emissive factors are baked into channel pixels. The import path leaves
    normals unflipped until the common channel encoder applies the KSA convention.

17. **View mesh cost.** MeshView provides CPU picking geometry. It needs indices and
    normals. Custom `_VM` meshes may be simplified to the configured triangle budget;
    the render mesh remains unchanged. Failed simplification keeps the full mesh.

18. **Dynamic models and foil.** Dynamic temperature/heat and ordinary emissive are
    different native shader paths; built-in copies retain their original model kind.
    Foil/cloth in Surfaces A/B use ordinary Diffuse/Normal/AoRoughMetal, with no ThinFilm,
    transparency or special foil shader. Preview differences in native lighting,
    temperature, wetness and specular antialiasing are not texture decoding failures.

19. **Independent built-in copies.** When an edit changes a built-in SubPart, export
    creates a fresh project-unique resolved row, preserving every model, MeshView and
    untouched root field. It does not Patch the Core template. Explicit gameplay data
    replaces the corresponding copied gameplay; an explicit empty override removes it.
    Custom meshes already have project-owned IDs and do not acquire extra built-in
    copies. A missing catalog entry for an edited built-in blocks export rather than
    risking a global mutation. Unchanged external references can remain external.

20. **Multiple Parts and atlases.** One Assets file may hold multiple identified atlases,
    materials and SubParts. Namespaces isolate each Part's built-in copies. Equal bytes
    at a shared binary path deduplicate; differing bytes at the same path fail. Project
    export preflight rejects conflicting IDs. Native Part appearance families are
    independent of these private export copies.

## Deliberate limits and update checks

Actual 5801 game loading and rendering are separate from browser tests and XML schema
validation. Source-level validation cannot prove GPU appearance or full simulation.
The browser does not reproduce all native Alpha, ThinFilm, glass, heat or terrain
behavior. Arbitrary collision-hull authoring remains separate from preserved stock
hulls. Per-face custom texturing retains its documented export limitations.

On the next upgrade, inspect the content prepass, each modeled module's new fields,
all render module types, texture slots, GLB accessor rules and the thumbnail path.
Run both catalog completeness and real emitted XML checks. Do not infer schema
compatibility from a successful browser preview.
