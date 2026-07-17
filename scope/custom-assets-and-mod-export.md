# Scope — Custom assets, textures, GLB pipeline, mod export

> The deepest integration: a user-authored texture (image→KTX2) + primitive mesh (→GLB) is
> exported as a KSA part mod that **loads and renders in-game**. It must satisfy KSA's mod
> loader, KTX2/PBR pipeline, and several null-check-free renderer quirks **exactly**. Read
> alongside [docs/custom-assets.md](../docs/custom-assets.md), [docs/texturing.md](../docs/texturing.md),
> [docs/asset-pipeline.md](../docs/asset-pipeline.md).

**Baseline:** re-vetted against KSA build **2026.7.6.4939** (decomp @ 4939 + shipped Core XML).
**Baseline status:** ✅ **INTACT** — every schema/reference class and renderer quirk flexo's
export depends on is byte-identical or behavior-preserving. No code change required. Two
durable watch-items noted below.

---

## Flexo modules

| Path                                                    | Role                                                                                                                                                                                                                                                 |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/ksa/modExport.ts`                                  | Export orchestration. `buildCustomBundle`, `buildModZip`/`writeModToFolder`, `serializeModToml`, `expandGlassGlow` (two-SubPart visor), `buildIvaVariantMap`, synthesizes shared Normal/ORM.                                                         |
| `src/ksa/exportGlb.ts`                                  | `buildMeshAtlasGlb(nodes)` — geometry-only GLB atlas; render mesh + paired `_VM` view mesh per SubPart; **`nameMeshesFromNodes()`** copies node name → `meshes[i].name`.                                                                             |
| `src/ksa/assetsXmlSerializer.ts`                        | Emits `<MeshAtlas>`, `<PbrMaterial>` (`<Diffuse>/<Normal>/<AoRoughMetal>/<Emissive>`), `<SubPart>` (`<PartModel>`\|`<PartModelGlass>` + `<Mesh>` + `<Material>` + `<MeshView>`).                                                                     |
| `src/state/customAssetStore.ts`                         | Ties descriptors ↔ IndexedDB blobs ↔ `blob:` URLs ↔ `$customCatalog`. `$simulateGlass` preview.                                                                                                                                                      |
| `src/state/assetDb.ts`                                  | IndexedDB blob store (binaries too big for the localStorage snapshot).                                                                                                                                                                               |
| `src/ktx/encodeKtx2.ts`                                 | **Single texture-format chokepoint.** ALWAYS `R8G8B8A8_UNORM`(23) + linear DFD (sRGB content keeps sRGB **bytes**; KSA's shader decodes once — see contract #4); `makeSolidKtx2()` for 1×1 solids; `isLegacySrgbKtx2()` flags pre-convention caches. |
| `src/ktx/decodeImage.ts`, `zstd.ts`, `glowComposite.ts` | image→RGBA8+mips; Zstd (`supercompressionScheme=2`); glow composite (`{diffuse, mask}`).                                                                                                                                                             |
| `src/three/primitives.ts`                               | box/cyl/sphere/plane `BufferGeometry`.                                                                                                                                                                                                               |

## Game-side anchors (`decomp/KSA/`, `decomp/KSA.Rendering.Thumbnails/`)

| Concern                      | Class / file                                                                                   | Key fact                                                                                                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Thumbnail null-deref**     | `KSA.Rendering.Thumbnails/ThumbnailRenderResources.cs` (`AddDraw`)                             | reads `Material.NormalReference.BindlessHandle` + `Material.PBRMap.BindlessHandle` with **no null guard** (only `EmissiveMap?`/`ThinFilmMap?` are null-safe).                  |
| Mod load / discovery         | `KSA/Mod.cs`, `KSA/ModLibrary.cs`                                                              | iterate mod.toml `Assets`, `XmlLoader.Load<AssetBundle>` per file.                                                                                                             |
| Asset bundle root            | `KSA/AssetBundle.cs`                                                                           | `[XmlRoot("Assets")]`, polymorphic `[XmlElement(...)]` map.                                                                                                                    |
| MeshAtlas + mesh-name read   | `KSA/MeshAtlasFileReference.cs`                                                                | `DoLoad`: `if !Meshes[i].Name.StartsWith('_'): register MeshReference{Id=Meshes[i].Name}`.                                                                                     |
| PbrMaterial schema           | `KSA/PbrMaterialReference.cs`                                                                  | `[XmlElement]` `Diffuse`/`Normal`(`TexturePowerReference`)/`AoRoughMetal`/`Emissive`/`ThinFilm`.                                                                               |
| Texture schema + KTX2 accept | `KSA/TextureReference.cs` (+ `TexturePowerReference.cs`)                                       | `[XmlAttribute("Category")] Default`; no `.toml` sidecar ⇒ transcode target defaults to `R8G8B8A8UNorm`/`Rgba32`.                                                              |
| KTX2 vkFormat honored        | `decomp/Brutal.TextureApi.Ktx/Loader.cs` (+ `RenderCore/TextureAsset.cs`)                      | libktx `CreateFromNamedFile`; only UASTC (`NeedsTranscoding`) is transcoded — otherwise **the file's vkFormat becomes the VkImage format** (an `_SRGB` tag ⇒ hardware decode). |
| In-shader gamma decode       | `Content/Core/Shaders/Mesh/MeshIndirect.frag` + `Common/Shared.glsl`                           | `sampledColor = gammaToLinear(texture(...diffuse...))`, `gammaToLinear(x) = pow(x, 2.2)` — the shader decodes the diffuse ITSELF (Core atlases are BC7_UNORM/linear-tagged).   |
| SubPart / model / view       | `KSA/SubPartTemplate.cs`, `PartModelModule.cs`, `PartModelGlassModule.cs`, `MeshViewModule.cs` | `<SubPart Id>`→`<PartModel Id>`/`<PartModelGlass Id>`(`<Mesh Id>`+`<Material Id>`)+`<MeshView>`.                                                                               |
| Opaque renderer (glow gate)  | `KSA/PartModelRenderer.cs` (`BuildPipelineModel`)                                              | compiles `MeshIndirectFrag` **with `ENABLE_EMISSIVE`+`ENABLE_THIN_FILM`**.                                                                                                     |
| Glow constant                | `Content/Core/Shaders/Common/Lighting.glsl`                                                    | `EMISSIVE_MULTIPLIER = 1.25`.                                                                                                                                                  |
| Glass shader (export path)   | `Content/Core/Shaders/Mesh/MeshGlassIndirect.frag`                                             | opacity 0.75; `glassColor=mix(albedo,0.1,0.9)`; emissive ignored.                                                                                                              |

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
10. **Glow = WHITE × mask × 1.25, added after lighting.** `glowComposite` bakes glow color into the diffuse and emits a white mask; `MeshIndirect.frag` does `gammaToLinear(vec3(sampledEmissive) * EMISSIVE_MULTIPLIER)`, `EMISSIVE_MULTIPLIER=1.25`.

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
