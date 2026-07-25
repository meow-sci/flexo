# Scope — Custom assets, textures, GLB pipeline, mod export

> The deepest integration: a user-authored texture (image→KTX2) + primitive mesh (→GLB) is
> exported as a KSA part mod that **loads and renders in-game**. It must satisfy KSA's mod
> loader, KTX2/PBR pipeline, and several null-check-free renderer quirks **exactly**. Read
> alongside [docs/custom-assets.md](../docs/custom-assets.md), [docs/texturing.md](../docs/texturing.md),
> [docs/asset-pipeline.md](../docs/asset-pipeline.md).

**Baseline:** re-vetted against KSA build **2026.7.9.5018** (decomp @ 5018 + shipped Core XML).
**Baseline status:** ✅ **INTACT** — every schema/reference class and renderer quirk flexo's
export depends on is byte-identical or behavior-preserving. No code change required. Two
durable watch-items noted below.

---

## Flexo modules

| Path                                                    | Role                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/ksa/modExport.ts`                                  | Export orchestration. `buildCustomBundle`, `buildModZip`/`writeModToFolder`, `serializeModToml`, `expandGlassGlow` (two-SubPart visor), `buildIvaVariantMap`, synthesizes shared Normal/ORM.                                                                                                                           |
| `src/ksa/exportGlb.ts`                                  | `buildMeshAtlasGlb(nodes, {viewMeshes})` — geometry-only GLB atlas; render mesh + paired `_VM` view mesh per SubPart (`viewMeshes:false` for the importer's internal atlas); **`nameMeshesFromNodes()`** copies node name → `meshes[i].name`; **`toKsaGeometry()`** forces an index buffer + strips unread attributes. |
| `src/three/loadModelFile.ts`                            | Model import entry: File(s) → glTF scene (`GLTFLoader` + DRACO/meshopt decoders, multi-file `blob:` URL resolution for `.gltf` sidecars).                                                                                                                                                                              |
| `src/ksa/importPlan.ts`                                 | `analyzeImport()` — (glTF mesh × material) → one SubPart, each referencing node → one placement; scale/up-axis correction; the KSA-can't-do-this warning catalog.                                                                                                                                                      |
| `src/ksa/importNormalize.ts`                            | `normalizeImport()` — bakes transforms/mirror/bind-pose, strips unread attributes, forces indices, optional double-siding, emits the import atlas GLB.                                                                                                                                                                 |
| `src/ksa/assetsXmlSerializer.ts`                        | Emits `<MeshAtlas>`, `<PbrMaterial>` (`<Diffuse>/<Normal>/<AoRoughMetal>/<Emissive>`), `<SubPart>` (`<PartModel>`\|`<PartModelGlass>` + `<Mesh>` + `<Material>` + `<MeshView>`).                                                                                                                                       |
| `src/state/customAssetStore.ts`                         | Ties descriptors ↔ IndexedDB blobs ↔ `blob:` URLs ↔ `$customCatalog`. `$simulateGlass` preview.                                                                                                                                                                                                                        |
| `src/state/assetDb.ts`                                  | IndexedDB blob store (binaries too big for the localStorage snapshot).                                                                                                                                                                                                                                                 |
| `src/ktx/encodeKtx2.ts`                                 | **Single texture-format chokepoint.** ALWAYS `R8G8B8A8_UNORM`(23) + linear DFD (sRGB content keeps sRGB **bytes**; KSA's shader decodes once — see contract #4); `makeSolidKtx2()` for 1×1 solids; `isLegacySrgbKtx2()` flags pre-convention caches.                                                                   |
| `src/ktx/decodeImage.ts`, `zstd.ts`, `glowComposite.ts` | image→RGBA8+mips; Zstd (`supercompressionScheme=2`); glow composite (`{diffuse, mask}`).                                                                                                                                                                                                                               |
| `src/three/primitives.ts`                               | box/cyl/sphere/plane `BufferGeometry`.                                                                                                                                                                                                                                                                                 |

## Game-side anchors (`decomp/KSA/`, `decomp/KSA.Rendering.Thumbnails/`)

| Concern                      | Class / file                                                                                   | Key fact                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Thumbnail null-deref**     | `KSA.Rendering.Thumbnails/ThumbnailRenderResources.cs` (`AddDraw`)                             | reads `Material.NormalReference.BindlessHandle` + `Material.PBRMap.BindlessHandle` with **no null guard** (only `EmissiveMap?`/`ThinFilmMap?` are null-safe).                                                                                                                                                                                                                     |
| Mod load / discovery         | `KSA/Mod.cs`, `KSA/ModLibrary.cs`                                                              | iterate mod.toml `Assets`, `XmlLoader.Load<AssetBundle>` per file.                                                                                                                                                                                                                                                                                                                |
| Asset bundle root            | `KSA/AssetBundle.cs`                                                                           | `[XmlRoot("Assets")]`, polymorphic `[XmlElement(...)]` map.                                                                                                                                                                                                                                                                                                                       |
| MeshAtlas + mesh-name read   | `KSA/MeshAtlasFileReference.cs`                                                                | `DoLoad`: `if !Meshes[i].Name.StartsWith('_'): register MeshReference{Id=Meshes[i].Name}`.                                                                                                                                                                                                                                                                                        |
| **GLB geometry acceptance**  | `RenderCore.Gltf/GltfUtils.cs`, `KSA/MeshReference.cs`                                         | `GetGltfBufferWithStride` (:386-404) throws unless accessor element size == 12/12/8 AND the bufferView `byteStride` matches; index buffer built only `if (prim.Indices.HasValue)` (:484-488); `AddIntsToBuffer` (:540-566) accepts ushort/uint/ubyte only; `AddPositionExtremes` (:568-584) reads POSITION `min`/`max`; `MeshReference.Load` (:83) imports `Normals \| UVs` only. |
| PbrMaterial schema           | `KSA/PbrMaterialReference.cs`                                                                  | `[XmlElement]` `Diffuse`/`Normal`(`TexturePowerReference`)/`AoRoughMetal`/`Emissive`/`ThinFilm`.                                                                                                                                                                                                                                                                                  |
| Texture schema + KTX2 accept | `KSA/TextureReference.cs` (+ `TexturePowerReference.cs`)                                       | `[XmlAttribute("Category")] Default`; no `.toml` sidecar ⇒ transcode target defaults to `R8G8B8A8UNorm`/`Rgba32`.                                                                                                                                                                                                                                                                 |
| KTX2 vkFormat honored        | `decomp/Brutal.TextureApi.Ktx/Loader.cs` (+ `RenderCore/TextureAsset.cs`)                      | libktx `CreateFromNamedFile`; only UASTC (`NeedsTranscoding`) is transcoded — otherwise **the file's vkFormat becomes the VkImage format** (an `_SRGB` tag ⇒ hardware decode).                                                                                                                                                                                                    |
| In-shader gamma decode       | `Content/Core/Shaders/Mesh/MeshIndirect.frag` + `Common/Shared.glsl`                           | `sampledColor = gammaToLinear(texture(...diffuse...))`, `gammaToLinear(x) = pow(x, 2.2)` — the shader decodes the diffuse ITSELF (Core atlases are BC7_UNORM/linear-tagged).                                                                                                                                                                                                      |
| SubPart / model / view       | `KSA/SubPartTemplate.cs`, `PartModelModule.cs`, `PartModelGlassModule.cs`, `MeshViewModule.cs` | `<SubPart Id>`→`<PartModel Id>`/`<PartModelGlass Id>`(`<Mesh Id>`+`<Material Id>`)+`<MeshView>`.                                                                                                                                                                                                                                                                                  |
| Opaque renderer (glow gate)  | `KSA/PartModelRenderer.cs` (`BuildPipelineModel`)                                              | compiles `MeshIndirectFrag` **with `ENABLE_EMISSIVE`+`ENABLE_THIN_FILM`**.                                                                                                                                                                                                                                                                                                        |
| Glow constant                | `Content/Core/Shaders/Common/Lighting.glsl`                                                    | `EMISSIVE_MULTIPLIER = 1.25`.                                                                                                                                                                                                                                                                                                                                                     |
| Glass shader (export path)   | `Content/Core/Shaders/Mesh/MeshGlassIndirect.frag`                                             | opacity 0.75; `glassColor=mix(albedo,0.1,0.9)`; emissive ignored.                                                                                                                                                                                                                                                                                                                 |

## The contract — what flexo bakes in (each gotcha already caused an in-game crash)

1. **GLB mesh-name from node.** KSA reads the SubPart id from glTF `meshes[i].Name`, but `THREE.GLTFExporter` writes only the _node_ name → `null.StartsWith('_')` NRE. `nameMeshesFromNodes()` copies node→mesh name. _(`MeshAtlasFileReference.DoLoad`)_
2. **`_`-prefix skip.** Meshes whose name starts with `_` are skipped. flexo's `<id>_VM` view meshes start with the id letter (registered); the render/view pair must be **distinct geometry instances** or GLTFExporter dedups them.
3. **Every `<PbrMaterial>` must carry Diffuse + Normal + AoRoughMetal.** Both `ThumbnailRenderResources.AddDraw` AND `PartModel.WriteInstancesToGpu` (every placed part, `PartModel.cs:414-418`) deref `DiffuseReference`/`NormalReference`/`PBRMap` with no null check (only `EmissiveMap?`/`ThinFilmMap?` are null-safe). flexo resolves uniform channels into deduped 1×1 solids (`BundleTextures` in modExport): `_FlatNormal.ktx2` (128,128,255), `_NeutralORM.ktx2` (255,128,0 — the no-material legacy), `_ORM_<aarrmm-hex>.ktx2` (a CustomMaterial's uniform rough/metal; AO fixed 255, **R=AO G=rough B=metal per MeshIndirect.frag "Following GLTF spec"**), `_BaseColor_<rrggbb-hex>.ktx2` (picked base colors).
4. **KTX2 flavor = uncompressed `R8G8B8A8_UNORM` + linear DFD + Zstd — NEVER `_SRGB`-tagged** (vs KSA's BC7/BC5/BC4+Zstd). With no `.toml` sidecar, KSA's loader honors the KTX2's real `vkFormat` verbatim (`Brutal.TextureApi.Ktx/Loader.cs`; only UASTC is transcoded, default target `Rgba32`), **and** `MeshIndirect.frag` gamma-decodes the diffuse sample itself (`gammaToLinear` = pow 2.2). An `_SRGB`-tagged diffuse therefore decodes TWICE in-game — mid-tones render too dark (saturated colors are fixed points, which is why early validation passed). Convention (matches Core's own linear-tagged BC7 atlases): **sRGB-encoded bytes, UNORM/linear container tags, one decode in the shader.** The editor is agnostic — `TextureCache.loadTexture` forces `colorSpace` per call site. Stale `_SRGB`-tagged IndexedDB caches are regenerated from the stored source on hydrate (`ensureCurrentKtx2`).
5. **Element/attribute names**: `<MeshAtlas Path>`, `<PbrMaterial Id>`+`<Diffuse|Normal|AoRoughMetal|Emissive Path Category>`, `<SubPart Id>`→`<PartModel|PartModelGlass Id>`(`<Mesh Id>`,`<Material Id>`)+`<MeshView>`(`<Mesh Id>`). All match the C# classes exactly.
6. **mod.toml fields** = `name` + `assets=[...xml paths]`. (flexo emits `name="flexo-parts"`.)
7. **Path sandboxing** = assets referenced by relative `Path=` from the Assets XML, resolved mod-dir-relative. `Category` is a max-texture-size cap only.
8. **`PartModel Id` must be unique** (KSA dedupes PartModels by `Template.Id`); flexo uses `<subPartId>_Model`. **`PbrMaterial Id`s dedupe the same way** (`PbrMaterialReference.OnDataLoad` → `ModLibrary.Register`; a duplicate silently becomes a reference to the first) — flexo exploits this deliberately: identical resolved channel sets intern into ONE shared `<PbrMaterial>` referenced by many SubParts (`flexo_<MatName>_<hex>_Material` for a verbatim CustomMaterial, `<subPartId>_Material` otherwise), exactly Core's one-pack-material pattern.
9. **Glass: emissive ignored + ~10% diffuse tint.** `MeshGlassIndirect.frag` hard-codes opacity 0.75, `glassColor=mix(albedo,0.1,0.9)`. `$simulateGlass` mirrors this; glass can't glow, so the `glassGlow` layered two-SubPart export is required.
10. **Every exported primitive MUST be indexed.** `GltfUtils.LoadMeshAssetForPrim` builds an index buffer only `if (prim.Indices.HasValue)` (`RenderCore.Gltf/GltfUtils.cs:484-488`), and `MeshReference.Load` (`:90-96`) walks that same span to build `PositionsCompare` for picking. A primitive with no `indices` therefore draws zero triangles and can't be picked — **silently, with no load error**. `GLTFExporter` faithfully omits `indices` for a non-indexed `BufferGeometry`, and three's MikkTSpace tangent generator **de-indexes** (`MeshAtlasCache` runs it for the editor's normal-map preview), so `toKsaGeometry()` rebuilds a 0..count-1 index whenever one is missing. Index `componentType` must be ushort/uint/ubyte (`AddIntsToBuffer`, `:540-566`).
11. **Vertex accessors: float32, tight, POSITION/NORMAL/TEXCOORD_0 only, with POSITION `min`/`max`.** `GetGltfBufferWithStride` (`:386-404`) throws on any accessor whose element size ≠ 12/12/8 bytes or whose bufferView `byteStride` disagrees — so no `KHR_mesh_quantization`, no interleaving, no Draco in the shipped GLB. `MeshReference.Load` (`:83`) imports with `VertexImportFlags.Normals | UVs`, so TANGENT/COLOR_0/TEXCOORD_1/JOINTS_0/WEIGHTS_0 are never read and `toKsaGeometry()` strips them. `AddPositionExtremes` (`:568-584`) reads the POSITION accessor's `min`/`max` for the bounding sphere. `GLTFExporter` satisfies the float32/tight/min-max parts by construction; all of it is regression-guarded in `exportGlb.test.ts` (`describe('KSA glTF loader requirements')`).
12. **Glow = WHITE × mask × 1.25, added after lighting.** `glowComposite` bakes glow color into the diffuse and emits a white mask; `MeshIndirect.frag` does `gammaToLinear(vec3(sampledEmissive) * EMISSIVE_MULTIPLIER)`, `EMISSIVE_MULTIPLIER=1.25`.
13. **glTF node transforms are IGNORED.** `MeshAtlasFileReference.DoLoad` iterates `GltfJson.Meshes[]` and never walks the node graph (`decomp/KSA/MeshAtlasFileReference.cs:22-49`), so a mesh is registered purely by `meshes[i].name` and whatever local/world transform its node carried is lost. Consequence for the model importer: a node's world matrix must become either baked geometry or a flexo **placement** — it can never ride along in the GLB. (`importPlan.ts` `ImportInstance`, `importNormalize.ts` `bakeMatrixFor`.)
14. **One `<PartModel>` = one `<Mesh>` + one `<Material>`, and only glTF primitive 0 is drawn.** `PartModelModule` binds a single mesh + material (`decomp/KSA/PartModelModule.cs:17-35`); `MeshReference` loads every primitive but the part path renders `DeviceMeshesInterleaved[0]` with one bound material (`decomp/KSA/MeshReference.cs:58,76-118`, `decomp/KSA/PartModel.cs:400-418`). So **one SubPart = one mesh = one primitive = one material**, and an imported multi-material object MUST be split at import — a game limit, not a preference (`importPlan.ts` grouping by (geometry, material)).
15. **Back-face culling is unconditional; the sampler is Repeat.** `PartModelRenderer.cs:165` sets `CullMode = BackBit` for every part pipeline and `:40-42` sets `Repeat` on U/V/W; there is no double-sided, alpha-cutout or wrap-mode switch anywhere in the XML. Consequences: a **negative-scale placement would reverse winding and cull the whole piece invisible**, so the importer always bakes a mirrored transform into the geometry (winding reversed) and leaves a positive-scale placement; "make double-sided" must duplicate + flip the geometry; `alphaMode: MASK` is unsupported and `BLEND` only via `<PartModelGlass>`.

## What changed in 5018

**Nothing that reaches flexo's export.** `Mod.cs` / `ModLibrary.cs` / `FileReference.cs` /
`ShaderReference.cs` differ only in log line numbers. `AssetBundle.cs` gained exactly ONE
line — registering the new top-level `<GrainGeometry>` element (`Content/Core/GrainGeometries.xml`,
listed in `mod.toml` after `Reactions.xml`) — which flexo neither reads nor writes; it
references the shipped ids by name only (`GRAIN_GEOMETRY_IDS`). `ThumbnailRenderResources.cs`
is absent from the diff, so the **synthetic Normal + AoRoughMetal requirement still holds**.
`Content/Core/PlumeTrailAssets.xml` is likewise a new bundle entry flexo only references by
id. Re-verified **INTACT** — no code change required.

## What changed in 4980

**INTACT — no flexo change.** `ThumbnailRenderResources.cs` is absent from the 4939→4980 diff
(the `AddDraw` null-deref stays unguarded ⇒ synthetic Normal + AoRoughMetal stay required).
`PartModelRenderer.cs` / `PartModelGlass.cs` hunks only thread the new cascaded-shadow-filter
**specialization constant** (ID 10) and a per-cascade push constant into the pipelines —
`ENABLE_EMISSIVE` is still defined on the color pipelines (visible unchanged in the same
hunks). `ModLibrary.cs` is pure log-line-number noise; `Mod.cs`, `AssetBundle.cs`,
`PbrMaterialReference.cs`, `MeshAtlasFileReference.cs`, `mod.toml` handling all absent from the
diff. One additive schema note: `TextureCategory` gained `TerrainHeight` (rev 4947, exempts
height-affecting terrain textures from the max-size downmip) — part textures stay
`Category="Vessel"`, so mod export is unaffected (the celestial scaffold is —
see [ground-clutter.md](ground-clutter.md#what-changed-in-4980)). The new texture-streaming
stack (`CelestialTextureStreamer` et al.) only touches celestial diffuse/height sources.

## What changed in 4939

**INTACT — no flexo change.** Re-verified against the diff: `ThumbnailRenderResources.AddDraw`
still has NO null guard (synthetic Normal + AoRoughMetal stay required);
`PartModelRenderer` still defines `ENABLE_EMISSIVE` (and `MeshIndirect.frag` still gates on it);
`MeshAtlasFileReference.cs` / `PbrMaterialReference.cs` unchanged; `AssetBundle.cs` /
`ModLibrary.cs` / `FileReference.cs` / `ShaderReference.cs` hunks are decompiler/log noise.
Notes: `Mod.cs` gained the `[XmlElement("PlumeTrailTemplate")]` registration (new top-level
`<Assets>` child — flexo only ever REFERENCES Core's `DefaultEngine` by id from a nozzle, never
emits the template, see [engines.md](engines.md#what-changed-in-4939));
`SimpleVkMeshAtlas` now computes mesh bounding-sphere radius from the ORIGIN
(`max(|min|,|max|).Length()`) instead of the bbox center — for flexo-exported GLBs that's equal
or more conservative (no premature culling), no emit-side change. `<MeshFile>`'s `<Interleaved>`
element already existed at 4892 (Core just started authoring it); flexo emits `<MeshAtlas>`, not
`<MeshFile>`.

## What changed in 4892

**INTACT — no flexo change on the mesh/texture/mod path.** `ThumbnailRenderResources.AddDraw`
still has NO null guard (synthetic Normal + AoRoughMetal still required); `ENABLE_EMISSIVE` is
still defined in both `PartModelRenderer.BuildPipelineModel` variants; `TextureReference.cs` /
`PbrMaterialReference.cs` / `SubPartTemplate.cs` byte-identical; `mod.toml` schema (`name` +
`assets`) unchanged (Core's own manifest content swapped `Combustion.xml`/`Substances.xml` for
`Reactions.xml`/`Volatiles.xml`/`SolidPropellants.xml`/`Materials.xml`). The 4826 watch-item on
`MeshReference` **closes benignly**: the new `[XmlIgnore] PrimitiveMaterialIds` /
`MeshAtlasFileReference.MaterialCount` (multi-primitive GLBs are now first-class) are consumed
ONLY by ground clutter (`ClutterEcotypeRenderData`, `GroundClutterLodReference` — which now
throws when clutter material refs ≠ GLB material count, see
[ground-clutter.md](ground-clutter.md)); the part path still reads `HostPrimitives[0]` and the
mesh-name → SubPart-id contract (`_`-prefix skip included) is unchanged. One schema note for the
engines area: `AssetBundle.cs` dropped `<CombustionProcess>` from the `<Assets>` polymorphic
union in favor of `<MixtureReaction>`/`<FixedReaction>`/`<ThermalReaction>` — flexo's custom
propellants now export as `<FixedReaction>`. (Doc nit fixed: `AddDraw`'s null-safe read list is
`EmissiveMap?` only — the old `ThinFilmMap?` mention was stale.)

## What changed in 4826

**Export contract intact — one watch-item.** Decomp diff (4750 → 4826):

- `PbrMaterialReference.cs` — **unchanged**. The `ThumbnailRenderResources.AddDraw` null-deref still has no guard, so the synthetic Normal + AoRoughMetal on every `<PbrMaterial>` is still required. `ENABLE_EMISSIVE`, `Mod.cs`/`ModLibrary.cs`/`AssetBundle.cs`, `mod.toml` contract unchanged.
- **Watch-item — `MeshReference`/`MeshAtlasFileReference` gained multi-primitive support** (`HostPrimitives[]`, `PrimitiveCount`, `DevicePrimitives[]`; `MeshAtlasFileReference.DoLoad` now registers every GLB mesh node by name, skipping `_`-prefixed). These are **runtime fields, not `[XmlElement]`** — the `<Mesh Id/>`/`<MeshAtlas>` reference schema is unchanged, and flexo exports **single-primitive** meshes named by SubPart id (the `meshes[i].name` → SubPart mapping still holds). No change needed, but the GLB node→SubPart mapping is now atlas-aware game-side — re-confirm a `flexo-parts/` mod still imports cleanly if the export mesh layout ever changes.

## What changed in 4750

- ✅ **`ThumbnailRenderResources.cs` deref site unchanged** — synthetic Normal + ORM still required (quirk #3 holds).
- ✅ **Mod loading contract unchanged** — `Mod.cs`/`ModLibrary.cs`/`AssetBundle.cs`/`mod.toml` format identical (logging-codegen noise + an additive `[XmlElement("EditorTagDef", …)]` union entry flexo doesn't emit). `flexo-parts/` still loads.
- ✅ **All PbrMaterial / MeshAtlas / SubPart / Texture schema classes byte-identical**; sample `CoreStructuralAAssets.xml` byte-identical. No element flexo emits changed.
- ✅ **Glass merge** doesn't touch the export path (`MeshGlassIndirect.frag` zero-diff; the merged `ModelTranslucent.frag` is the live-character path only). `$simulateGlass` + glassGlow remain correct.
- ✅ **Glow math byte-identical** (`EMISSIVE_MULTIPLIER=1.25`). `ModelPbr.frag` only reordered SSAO (drives characters, not exported parts).

### Durable watch-items (not breaking today)

- **`ENABLE_EMISSIVE` is now a hard dependency for glow.** flexo's opaque glow renders only because `PartModelRenderer.BuildPipelineModel` defines `ENABLE_EMISSIVE`. If a future build routed plain part SubParts through the temperature/"Dynamic" pipeline (which omits it), glow would **silently vanish** with no XML/crash signal. → After each KSA bump, grep `PartModelRenderer.cs` for `ENABLE_EMISSIVE` near the `MeshIndirectFrag` `BuildPipelineModel`.
- **New optional capabilities** flexo could later adopt (already in the PbrMaterial schema, now with live feature paths): `<ThinFilm>` (`ENABLE_THIN_FILM`) and `<Normal Power="…">` (`TexturePowerReference`). Out of current v1 scope; classify as opportunities.
