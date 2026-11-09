# KSA 5801 renderer and asset-pipeline research

The foil/cloth parts need the new catalog schema and complete catalog discovery; they do not need a new renderer or texture format. Keep the existing PBR mapping, normal decoding, UASTC loading, and one-primitive mesh extraction for the stock 5801 content.

Research date: 2026-11-08. This is an implementation brief, not a claim of browser or in-game validation. No source code or private reference repository was changed.

## Evidence and versions

- Flexo's integration baseline is 5554 (`ksa-game-assemblies` commit `935a32b`, as established by the coordinating audit). The source comparisons below use that commit and current 5801.
- `../ksa-game-assemblies/current` and the updated `.agents/skills/ksa/SKILL.md` describe `2026.11.10.5801`.
- `../flexo-private-assets/assets/version.json` also reports `2026.11.10.5801`.
- **The supplied private-assets previous mirror is 5638**, `2026.10.19.5638`, not the assemblies' previous 5707. File additions and size comparisons in this brief are therefore 5638 → 5801; do not label them 5707 → 5801.
- Original foil/cloth texture headers were read directly from `/Users/asherwin/repos/meow-sci/ksa-linux/Content/Core/Textures`. Served headers were read from `../flexo-private-assets/assets/Textures`.
- Relevant Flexo documents read: `docs/texturing.md`, `docs/asset-pipeline.md`, `docs/subpart-catalog.md`, `scope/FULL_SCOPE.md`, `scope/custom-assets-and-mod-export.md`; relevant skill references: `assets-parts.md`, `rendering-gpu.md`.

## Required changes: catalog resolution and discovery

`src/ksa/catalog.ts` cannot read the current stock rendering definitions:

| Existing assumption | 5801 source contract | Required implementation |
| --- | --- | --- |
| `SubPart > PartModel` or `PartModelDynamic` | `SubPart > Components > PartModel`, `PartModelDynamic`, or `PartModelGlass` | Read the model from `Components` after applying content patches. Preserve the actual model kind. |
| `<Mesh Id>` and `<Material Id>` | `<Mesh Ref>` and `<Material Ref>` | Resolve global data references. Do not retain an old-token fallback. |
| A default `<MeshAtlas>` has no `Id`; named atlas Id means whole scene | Every atlas has an Id; generated mesh Ids come from **glTF mesh names** | Index mesh name → owning atlas, either from GLB JSON or a build-generated index. Do not infer visual meshes from atlas Ids or arbitrary first-atlas selection. |
| Nested `<Diffuse Path>` etc. | Top-level `<Texture Id Path Category>` plus `<Diffuse Ref>` etc. | Index textures globally, resolve material channel Ref → Texture → Path. |
| Material and atlas belong to the same file as the SubPart | Global content registry; cross-file models exist | Resolve globally across the selected content, preserving file provenance only for UI grouping/debugging. |
| Hand-maintained `ASSET_FILES` covers all part packs | Six new pack names, including Parts-only packs | Update discovery/list and its completeness guard; ensure Parts-only packs are not omitted by a SubPart-only criterion. |

The resolved catalog still only needs the existing `diffuseUrl`, `normalUrl`, `aoRoughMetalUrl`, `emissiveUrl`, material identity and atlas/mesh identity for foil preview. ThinFilm/Alpha are separate existing limitations, below. Coordinate shared XML/types changes with the schema and variants workstreams; do not add a second independent XML merger inside the renderer.

New mirror XML files relative to the supplied previous mirror:

- `CoreCommandBAssets.xml` and `CoreCommandBGameData.xml`: lander; 5 geometry SubParts and 2 Parts in the Assets file.
- `CoreCommandCAssets.xml` and `CoreCommandCGameData.xml`: probe-core Parts, including cross-pack foil geometry; do not expect a render atlas here. Its collision atlas is HostOnly.
- `CoreLifeSupportAAssets.xml` and `CoreLifeSupportAGameData.xml`: Parts-only Assets file (2 Parts).
- `CoreStructuralBAssets.xml`: 5 geometry SubParts.
- `CoreSurfacesAAssets.xml`: 13 geometry SubParts, including cloth and panels.
- `CoreSurfacesBAssets.xml`: 16 geometry SubParts, including foil and panels.
- `TestContent.xml`: game test definitions, currently included by the private updater. Do not include it in the normal user part catalog merely because it contains Part/SubPart rows.

`CorePassageAGameData.xml` was removed from the mirror; optional sibling handling must tolerate that. The new global catalog also needs `CoreFuelPortGameData.xml` render definitions: its meshes resolve to `CoreFuelTankB_MeshAtlas.glb`, not a sibling atlas.

## Foil/cloth textures: existing renderer is sufficient

`CoreSurfacesA_Material` and `CoreSurfacesB_Material` have exactly `Diffuse`, `Normal`, `AoRoughMetal`. Neither has ThinFilm, Alpha, Emissive, scalar parameters, special shaders, nor a foil-specific material class. The foil appearance comes from colored metallic PBR pixels plus normal detail. Do not implement foil with physical-material iridescence or transparency.

All six `CoreSurfaces{A,B}_TextureAtlas_{Diffuse,Normal,PBR}.ktx2` files are 2048 × 2048, 12 mips, Zstd supercompression (`scheme=2`). Actual original versus served formats:

| Channel | Original game KTX2 | Private mirror KTX2 | Existing Flexo action |
| --- | --- | --- | --- |
| Diffuse | `vkFormat=145`, BC7 UNORM, linear DFD | `vkFormat=0`, UASTC color model 166, linear DFD | `loadTexture(url, 'srgb')` explicitly tags sRGB content. |
| Normal | `vkFormat=141`, BC5 UNORM, linear DFD | `vkFormat=0`, UASTC color model 166, linear DFD | Load linear; decode RG, flip X, reconstruct Z. |
| PBR | `vkFormat=145`, BC7 UNORM, linear DFD | `vkFormat=0`, UASTC color model 166, linear DFD | Load linear; R=AO, G=roughness, B=metalness. |

The mirror's new `CoreCommandB` and `CoreStructuralB` maps are also already UASTC; CommandB additionally has the existing single-channel emissive path. No private asset conversion is pending for these maps. Keep `textureSupport.ts`, `TextureCache.ts`, `MaterialFactory.ts` and `normalMapPatch.ts` unchanged unless runtime validation exposes a specific defect.

Source anchors:

- `current/decomp/KSA/PbrMaterialReference.cs`: the same six map slots now hold `DataReference<TextureReference>`; the old `TexturePowerReference` normal type is gone. There are still no authored PBR scalar/tint controls.
- `current/Content/Core/Shaders/Mesh/MeshIndirect.frag:105–136`: diffuse gamma decode; packed PBR G/B/R; sampled normal RG; ThinFilm/temperature is a separate optional map.
- `current/Content/Core/Shaders/Common/SharedFrag.glsl:28–37`: normal X flip and reconstructed Z are unchanged from 5554.
- `src/three/MaterialFactory.ts:buildTextured`, `src/three/normalMapPatch.ts`: existing preview channel mapping matches these contracts.

Shader diff against 5554 has a new `Common/SpecularAA.glsl` roughness filter and habitat-highlight colors. These affect appearance/runtime highlighting, not asset decoding or foil support. Do not enlarge the compatibility fix into a new KSA lighting renderer. Existing ThinFilm heat/frost, wetness, exact KSA illumination and tonemapping remain preview limitations.

ThinFilm remains optional and unrelated to the new foil packs: the current mirror has four PbrMaterial ThinFilm slots (CommandA, FuelTankA, PropulsionA, PropulsionC), seven Emissive slots and one Alpha slot. Keep their references when exporting/redeclaring a built-in model even if the preview does not implement them. The schema changes must not erase these slots.

## Mesh inventory and the multiple-primitive question

A read-only GLB JSON scan covered **85 GLB files / 1,808 meshes** in the current mirror. **Every mesh has exactly one primitive.** Every mesh has POSITION, NORMAL and TEXCOORD_0; 119 have TANGENT, 3 have TEXCOORD_1, and 5 have JOINTS_0/WEIGHTS_0. The new render atlases have no glTF extensions and their meshes use POSITION/NORMAL/TEXCOORD_0 with no tangents. Existing MikkTSpace tangent generation applies.

| New render atlas | Meshes (visual + view meshes) | Primitive count per mesh |
| --- | ---: | ---: |
| CoreSurfacesA | 26 | 1 |
| CoreSurfacesB | 32 | 1 |
| CoreCommandB | 10 | 1 |
| CoreStructuralB | 10 | 1 |

`MeshAtlasCache.getSubPartGeometry` uses `findFirstMesh` and therefore would discard extra pieces in a three.js multi-primitive Group. This is **not a stock 5801 regression**. Moreover, KSA's `MeshReference` exposes all `HostPrimitives`/`DevicePrimitives`, but its current stock `PartModel.WriteInstancesToGpu` (`PartModel.cs:504`) and thumbnail `AddDraw` (`ThumbnailRenderResources.cs:147`) use `DeviceMeshInterleaved`, whose getter selects index 0. It would be incorrect to infer that all stock PartModels now render every primitive merely because MeshReference stores arrays.

Keep extraction unchanged for this update; record the one-primitive assumption in scope/completeness checks. If future native PartModel rendering starts drawing multiple primitives, implement that as a separately evidenced change. The custom glTF importer already has its own multi-primitive planning semantics; do not conflate it with stock atlas preview.

Atlas identity must still use glTF **mesh** names, the names KSA registers (`MeshAtlasFileReference.ReadMeshes`/`ReadNames`), rather than relying solely on node names. All current stock visual Model Mesh Ref values matched an actual GLB mesh name in the mirror. A global map is necessary for cross-file CoreFuelPort meshes and `PartAssets.xml`'s `LightPartMesh` in `Meshes/circle_light.glb`.

## Supporting catalogs

These are separate from the viewport, but their silent empty results can mask an otherwise successful upgrade.

| Consumer | 5801 required change / verified unchanged behavior |
| --- | --- |
| `reactionCatalog.ts:readReactants` | Read `Reactants/Reactant`; use `Ref` plus `Phase="Solid|Liquid|Gas"` to construct internal `APCP(s)` / `H2(l)` / etc. Read MassShare unchanged. Phase is explicit substance data, not a suffix inside Ref. |
| `reactionCatalog.ts:readPressureConditions` | Read `PressureConditions/PressureCondition`, wherever the reaction flavor owns the array. Numeric children/units and lookup mathematics remain the existing contract. |
| Mixture reactions | Read `MixtureRatioConditions/MixtureRatioCondition`; each row owns `PressureConditions`. `DefaultMixtureRatio` remains text. |
| Thermal reactions | Read `TemperatureConditions/TemperatureCondition`; each condition owns `PressureConditions`. |
| `grainGeometryCatalog.ts` | Read `DepthConditions/DepthCondition`. Depth/Perimeter/PortArea, normalization and validation stay unchanged. |
| `materialDensityCatalog.ts` | Existing direct Substance → Solid/Liquid → StorageDensity remains valid. Current files contain 10 material phases, 39 volatile solid/liquid phases, 2 solid propellant phases. No density parser rewrite is needed solely for new MechanicalConditions/ThermalConditions wrappers. |
| `parseSolidPropellantsFile` | Direct Solid/StorageDensity is still valid: APCP 1780 kg/m³; DoubleBase 1600 kg/m³. |
| `SceneEnvironment.ts` / `environmentPresets.ts` | Skybox choices are Flexo's own nine presets, including procedural `room`, and eight committed `public/hdr/*.hdr` files. They do not depend on KSA skybox XML or celestial texture changes. Keep them unchanged. |
| `vite/previewManifest.ts` | Must consume the same **resolved current catalog** as the app; its present per-Assets-file `parsePartsFile` loop and claim that GameData siblings cannot add Parts are stale. Parts-only packs, patched rows, cross-file references and effective removals must produce the same manifest IDs as runtime. `skybox_ids` stays the existing nine presets. |

Expected live reaction inventory is **16**: 6 MixtureReaction, 4 FixedReaction, 6 ThermalReaction. Expected grain inventory is **5**. Assert nonempty LUTs, not just reaction tag counts. Exported custom reactions must use the same new Reactants and PressureConditions arrays and Ref/Phase shape; coordinate this with the main XML export workstream.

## Asset pipeline and completeness

The private repo now uses `node update-from-ksa-build.ts <ksa-game-directory>` (Node 24+) and `uv` for conversion. `docs/asset-pipeline.md`'s old Bun `copy-assets.ts` instructions and the `vite/ksaAssets.ts` comment naming a removed Flexo copy script are stale. Update the documentation; do not run the updater or modify its read-only repository during this task.

The current updater already scans top-level Texture Path declarations through its generic binary Path scanner, so moving material paths into Texture rows does not require a Flexo serving-plugin change. `vite/ksaAssets.ts` serves/copies the whole mirror and is schema-agnostic. Its base-path handling and MIME mappings already cover the new assets.

Read-only integrity scan result: **zero missing binary Path references** from every root mirror XML. Declarations scanned: 46 `.glb`, 138 `.ktx2`, 71 `.dds` occurrences. These counts are declarations, not unique files. All visual model Mesh Ref values match a mesh name in the mirror. This proves payload presence, not correct resolved/patched content or browser uploads.

**Material payload growth is real:** the mirror is now 2.3 GB versus 213 MB in the supplied previous mirror. The updater's broad catalog predicate now discovers nested StaticObject rows in `Astronomicals.xml`, then follows that file's planet/cloud Path references before the explicit XML-only copy. Its comments still claim planet-scale textures are excluded. This explains the raw cubemap KTX2s now present outside Characters; the re-encoder correctly skips cubemaps and volumes. Do not interpret these as unconverted foil atlases or try converting them to 2D UASTC. Fixing private-tree selection needs a separate authorized change in the private assets repository. A production build currently copies this full 2.3 GB tree verbatim, so check deployment artifact size and limits before calling deployment ready.

Recommended asset audit at the shared content boundary:

1. Enumerate effective Core content in game manifest order; apply 5801 patch/array semantics; retain source ownership/provenance.
2. Resolve model mesh/material/texture Ref values globally. Fail the audit on an unresolved supported render reference rather than permitting silent flat fallback to hide a catalog regression.
3. For each selected atlas, read GLB JSON, match referenced mesh name, verify one primitive and POSITION/NORMAL/TEXCOORD_0. Exclude HostOnly atlases from visual selection.
4. For each selected material, require Diffuse/Normal/AoRoughMetal (game PartModel and thumbnail code still dereferences all three), resolve existing optional map references, and check binary existence.
5. Read selected part-map KTX2 headers and assert 2D, usable dimensions/mips, UASTC model 166 in the served mirror. Do not assert all mirror textures are UASTC, because character/planet/cubemap payloads intentionally differ.
6. Verify new production artifacts and wiki manifests use the current build string and current effective IDs. Keep private licensed GLBs/KTX2s out of the public source repository; real XML fixtures may be vendored according to existing fixture policy.

## Concrete validation plan

Use existing relevant Vitest suites after changing the shared parsers: catalog/partCatalog, asset serializer/mod export, reactionCatalog, grainGeometryCatalog, materialDensityCatalog, and previewManifest. Sync curated XML fixtures from 5801 byte-for-byte using the repository's fixture workflow. Old-format inline fixtures must be rewritten; do not add compatibility selectors to make them pass.

Minimum catalog assertions:

- All intended Core pack filenames are discoverable, including CommandB/C, LifeSupportA, StructuralB, SurfacesA/B and the fuel-port data; TestContent is excluded from normal browsing.
- Resolve `CoreSurfacesB_Subpart_TrussAFoilA` to `Meshes/CoreSurfacesB_MeshAtlas.glb`, mesh of the same name, `CoreSurfacesB_Material`, and its three real Texture paths.
- Resolve `CoreSurfacesA_Subpart_SmallLanderClothA` similarly through CoreSurfacesA.
- Resolve a CoreFuelPort model to CoreFuelTankB's atlas/material across files.
- Manifest Part IDs equal app catalog IDs after merging; assert presence of new lander, probe-core and life-support entries by actual IDs from the effective XML.
- Parse all 16 reactions and 5 grain curves with valid data. Confirm Hydrolox reactants are H2(l)/O2(l), APCP density is 1780, and Aluminum.2014(s) remains 2800.

Known sample geometry counts from actual GLB accessors:

| Mesh | Vertices | Indices | Useful visual check |
| --- | ---: | ---: | --- |
| `CoreSurfacesB_Subpart_TrussAFoilA` | 220 | 564 | Colored metallic foil, relief and grazing-angle response. |
| `CoreSurfacesB_Subpart_HalfPatchFoilA` | 4 | 6 | Tiny flat foil patch; inspect front/back visibility and overlay placement. |
| `CoreSurfacesA_Subpart_SmallLanderClothA` | 594 | 2,106 | Cloth remains correctly textured and distinct from foil. |
| `CoreCommandB_Subpart_SmallLanderStructureA` | 6,221 | 17,802 | New ordinary structural material and combined lander assembly. |

Browser smoke with `KSA_ASSETS_DIR` pointing at the current mirror:

1. Open a new foil strut/probe and the cloth lander from the Part browser; also add the above SubParts directly. No missing texture, mesh or XML warnings; catalog counts must be nonzero.
2. Inspect under Studio and a bright HDR preset while orbiting and moving the light. Check crumpled foil normals, metallic highlights, seams, reverse faces and thin patches. Compare an older ordinary structural part and an emissive CommandB part so a foil-only success cannot hide regressions.
3. Repeat at a distant zoom/grazing angle for mip behavior. Verify selection highlighting and instance material cloning still work.
4. Test a browser/GPU without desktop BCn extensions; selected part atlases must transcode through existing UASTC support. Character fallback remains its existing limitation.
5. `pnpm build` with current mirror, then serve the production output under `/flexo/`; check main app, `/flexo/apps/partpreview/`, and ICRP, and verify shared `/flexo/ksa/`, `/flexo/hdr/`, `/flexo/basis/` requests. Inspect manifest build/part IDs and artifact size. Build success alone does not prove rendered foil appearance.
6. Export a mod containing foil/cloth built-in references and a custom-material variant, inspect generated Ref/Key/Components/Texture rows, then load in KSA 5801 and compare the same assembled samples. Actual KSA load/render verification remains required; static source review cannot supply it.

Acceptance: current-schema content resolves all intended stock packs with complete referenced assets; foil/cloth render through the existing three channels on both desktop and non-BCn devices; supporting reaction/grain catalogs populate; production manifests match the runtime catalog; exported variants retain unedited native material references and model kind. No additional renderer feature is justified by the supplied stock content.

### Browser rendering validation — 2026-11-08

An isolated Chromium run exercised the actual `SubPartPreviewViewport` at 1000 × 760
with default settings (Neutral tone mapping, exposure 0.85, `glasshouse_interior`
HDR at intensity 1). The HDR, both mesh atlases, all six UASTC texture atlases,
and Basis transcoder files returned HTTP 200. Screenshots were inspected:

- `CoreSurfacesB_Subpart_TrussAFoilA` shows gold foil with reflective folds;
  `CoreSurfacesA_Subpart_SmallLanderClothA` shows white cloth with seams and markings.
- `CoreSurfacesB_Subpart_HalfPatchFoilA` is invisible from the preview's initial
  camera but shows the textured foil face after orbiting. The reverse view is
  culled in this renderer, so the initial blank preview is a real discoverability
  limitation; this test does not establish whether KSA renders that face differently.
- Repeating with an initialization script that denies both BPTC and RGTC extension
  queries produced the same visible results. This is a **simulated no-BCn desktop**
  test, not a mobile-device or physical GPU test. Chromium used ANGLE SwiftShader;
  baseline exposed both extensions, while the simulated context exposed neither.
- A standalone `vite build apps/partpreview` succeeded. The built public preview
  for `CoreCommandC_Prefab_ProbeCoreSmallA` showed the assembled foil probe in
  both configurations, with current shared `/flexo/ksa/` and `/flexo/basis/`
  assets proxied from the isolated development server. The no-BCn capture needed a
  longer wait after network idle before the asynchronously decoded image appeared;
  a three-second capture was blank, and a 15-second follow-up rendered the probe.
  This is not a full production asset-copy or deployment test.

There were no failed requests or application errors in these runs. Chromium emitted
`ReadPixels` GPU-stall performance warnings in the baseline screenshot session; the
simulated no-BCn session logged the expected raw-BCn-unavailable informational
message. The inspection artifacts are under `/private/tmp/flexo-5801-validation/`:
`desktop-TrussAFoilA.png`, `no-bcn-TrussAFoilA.png`, the corresponding
`SmallLanderClothA.png` files, `desktop-HalfPatchFoilA.png` and
`no-bcn-HalfPatchFoilA.png` (initial blank views), `desktop-HalfPatch-orbit2.png`
and `no-bcn-HalfPatch-orbit2.png` (visible face), `desktop-built-probe.png`,
`no-bcn-built-probe.png` (early blank), and `no-bcn-built-probe-delayed.png`.
`report.json` and `followup.json` record URLs, status, console messages, and GPU
extension probes. These temporary paths are local evidence and may be cleared by the OS.
Actual KSA rendering, mobile GPUs, and a production deployment remain unverified.
