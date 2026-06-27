# Scope — Custom assets, textures, GLB pipeline, mod export

> The deepest integration: a user-authored texture (image→KTX2) + primitive mesh (→GLB) is
> exported as a KSA part mod that **loads and renders in-game**. It must satisfy KSA's mod
> loader, KTX2/PBR pipeline, and several null-check-free renderer quirks **exactly**. Read
> alongside [docs/custom-assets.md](../docs/custom-assets.md), [docs/texturing.md](../docs/texturing.md),
> [docs/asset-pipeline.md](../docs/asset-pipeline.md).

**Baseline:** verified against KSA build **2026.6.9.4750**.
**Baseline status:** ✅ **INTACT** — every schema/reference class and renderer quirk flexo's
export depends on is byte-identical or behavior-preserving. No code change required. Two
durable watch-items noted below.

---

## Flexo modules

| Path                                                    | Role                                                                                                                                                                                         |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/ksa/modExport.ts`                                  | Export orchestration. `buildCustomBundle`, `buildModZip`/`writeModToFolder`, `serializeModToml`, `expandGlassGlow` (two-SubPart visor), `buildIvaVariantMap`, synthesizes shared Normal/ORM. |
| `src/ksa/exportGlb.ts`                                  | `buildMeshAtlasGlb(nodes)` — geometry-only GLB atlas; render mesh + paired `_VM` view mesh per SubPart; **`nameMeshesFromNodes()`** copies node name → `meshes[i].name`.                     |
| `src/ksa/assetsXmlSerializer.ts`                        | Emits `<MeshAtlas>`, `<PbrMaterial>` (`<Diffuse>/<Normal>/<AoRoughMetal>/<Emissive>`), `<SubPart>` (`<PartModel>`\|`<PartModelGlass>` + `<Mesh>` + `<Material>` + `<MeshView>`).             |
| `src/state/customAssetStore.ts`                         | Ties descriptors ↔ IndexedDB blobs ↔ `blob:` URLs ↔ `$customCatalog`. `$simulateGlass` preview.                                                                                              |
| `src/state/assetDb.ts`                                  | IndexedDB blob store (binaries too big for the localStorage snapshot).                                                                                                                       |
| `src/ktx/encodeKtx2.ts`                                 | **Single texture-format chokepoint.** `R8G8B8A8_SRGB`(43)/`_UNORM`(23) + hand-built DFD; `makeSolidKtx2()` for 1×1 synthetics.                                                               |
| `src/ktx/decodeImage.ts`, `zstd.ts`, `glowComposite.ts` | image→RGBA8+mips; Zstd (`supercompressionScheme=2`); glow composite (`{diffuse, mask}`).                                                                                                     |
| `src/three/primitives.ts`                               | box/cyl/sphere/plane `BufferGeometry`.                                                                                                                                                       |

## Game-side anchors (`decomp/KSA/`, `decomp/KSA.Rendering.Thumbnails/`)

| Concern                      | Class / file                                                                                   | Key fact                                                                                                                                                      |
| ---------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Thumbnail null-deref**     | `KSA.Rendering.Thumbnails/ThumbnailRenderResources.cs` (`AddDraw`)                             | reads `Material.NormalReference.BindlessHandle` + `Material.PBRMap.BindlessHandle` with **no null guard** (only `EmissiveMap?`/`ThinFilmMap?` are null-safe). |
| Mod load / discovery         | `KSA/Mod.cs`, `KSA/ModLibrary.cs`                                                              | iterate mod.toml `Assets`, `XmlLoader.Load<AssetBundle>` per file.                                                                                            |
| Asset bundle root            | `KSA/AssetBundle.cs`                                                                           | `[XmlRoot("Assets")]`, polymorphic `[XmlElement(...)]` map.                                                                                                   |
| MeshAtlas + mesh-name read   | `KSA/MeshAtlasFileReference.cs`                                                                | `DoLoad`: `if !Meshes[i].Name.StartsWith('_'): register MeshReference{Id=Meshes[i].Name}`.                                                                    |
| PbrMaterial schema           | `KSA/PbrMaterialReference.cs`                                                                  | `[XmlElement]` `Diffuse`/`Normal`(`TexturePowerReference`)/`AoRoughMetal`/`Emissive`/`ThinFilm`.                                                              |
| Texture schema + KTX2 accept | `KSA/TextureReference.cs` (+ `TexturePowerReference.cs`)                                       | `[XmlAttribute("Category")] Default`; no `.toml` sidecar ⇒ transcode target defaults to `R8G8B8A8UNorm`/`Rgba32`.                                             |
| SubPart / model / view       | `KSA/SubPartTemplate.cs`, `PartModelModule.cs`, `PartModelGlassModule.cs`, `MeshViewModule.cs` | `<SubPart Id>`→`<PartModel Id>`/`<PartModelGlass Id>`(`<Mesh Id>`+`<Material Id>`)+`<MeshView>`.                                                              |
| Opaque renderer (glow gate)  | `KSA/PartModelRenderer.cs` (`BuildPipelineModel`)                                              | compiles `MeshIndirectFrag` **with `ENABLE_EMISSIVE`+`ENABLE_THIN_FILM`**.                                                                                    |
| Glow constant                | `Content/Core/Shaders/Common/Lighting.glsl`                                                    | `EMISSIVE_MULTIPLIER = 1.25`.                                                                                                                                 |
| Glass shader (export path)   | `Content/Core/Shaders/Mesh/MeshGlassIndirect.frag`                                             | opacity 0.75; `glassColor=mix(albedo,0.1,0.9)`; emissive ignored.                                                                                             |

## The contract — what flexo bakes in (each gotcha already caused an in-game crash)

1. **GLB mesh-name from node.** KSA reads the SubPart id from glTF `meshes[i].Name`, but `THREE.GLTFExporter` writes only the _node_ name → `null.StartsWith('_')` NRE. `nameMeshesFromNodes()` copies node→mesh name. _(`MeshAtlasFileReference.DoLoad`)_
2. **`_`-prefix skip.** Meshes whose name starts with `_` are skipped. flexo's `<id>_VM` view meshes start with the id letter (registered); the render/view pair must be **distinct geometry instances** or GLTFExporter dedups them.
3. **Synthetic Normal + AoRoughMetal required even for diffuse-only.** `ThumbnailRenderResources.AddDraw` derefs `NormalReference`/`PBRMap` with no null check → a `<PbrMaterial>` with only `<Diffuse>` crashes at thumbnail time. flexo emits shared 1×1 `_FlatNormal.ktx2` (128,128,255) + `_NeutralORM.ktx2` (255,128,0).
4. **KTX2 flavor = uncompressed `R8G8B8A8` + Zstd** (vs KSA's BC7/BC5/BC4+Zstd). With no `.toml` sidecar, KSA's loader reads the KTX2's real `vkFormat` and defaults transcode to `R8G8B8A8UNorm`/`Rgba32`. Core part atlases ship **no sidecar**, so flexo's self-describing RGBA8 KTX2 is accepted natively (larger VRAM; most compatible).
5. **Element/attribute names**: `<MeshAtlas Path>`, `<PbrMaterial Id>`+`<Diffuse|Normal|AoRoughMetal|Emissive Path Category>`, `<SubPart Id>`→`<PartModel|PartModelGlass Id>`(`<Mesh Id>`,`<Material Id>`)+`<MeshView>`(`<Mesh Id>`). All match the C# classes exactly.
6. **mod.toml fields** = `name` + `assets=[...xml paths]`. (flexo emits `name="flexo-parts"`.)
7. **Path sandboxing** = assets referenced by relative `Path=` from the Assets XML, resolved mod-dir-relative. `Category` is a max-texture-size cap only.
8. **`PartModel Id` must be unique** (KSA dedupes PartModels by `Template.Id`); flexo uses `<subPartId>_Model`.
9. **Glass: emissive ignored + ~10% diffuse tint.** `MeshGlassIndirect.frag` hard-codes opacity 0.75, `glassColor=mix(albedo,0.1,0.9)`. `$simulateGlass` mirrors this; glass can't glow, so the `glassGlow` layered two-SubPart export is required.
10. **Glow = WHITE × mask × 1.25, added after lighting.** `glowComposite` bakes glow color into the diffuse and emits a white mask; `MeshIndirect.frag` does `gammaToLinear(vec3(sampledEmissive) * EMISSIVE_MULTIPLIER)`, `EMISSIVE_MULTIPLIER=1.25`.

## What changed in 4750

- ✅ **`ThumbnailRenderResources.cs` deref site unchanged** — synthetic Normal + ORM still required (quirk #3 holds).
- ✅ **Mod loading contract unchanged** — `Mod.cs`/`ModLibrary.cs`/`AssetBundle.cs`/`mod.toml` format identical (logging-codegen noise + an additive `[XmlElement("EditorTagDef", …)]` union entry flexo doesn't emit). `flexo-parts/` still loads.
- ✅ **All PbrMaterial / MeshAtlas / SubPart / Texture schema classes byte-identical**; sample `CoreStructuralAAssets.xml` byte-identical. No element flexo emits changed.
- ✅ **Glass merge** doesn't touch the export path (`MeshGlassIndirect.frag` zero-diff; the merged `ModelTranslucent.frag` is the live-character path only). `$simulateGlass` + glassGlow remain correct.
- ✅ **Glow math byte-identical** (`EMISSIVE_MULTIPLIER=1.25`). `ModelPbr.frag` only reordered SSAO (drives characters, not exported parts).

### Durable watch-items (not breaking today)

- **`ENABLE_EMISSIVE` is now a hard dependency for glow.** flexo's opaque glow renders only because `PartModelRenderer.BuildPipelineModel` defines `ENABLE_EMISSIVE`. If a future build routed plain part SubParts through the temperature/"Dynamic" pipeline (which omits it), glow would **silently vanish** with no XML/crash signal. → After each KSA bump, grep `PartModelRenderer.cs` for `ENABLE_EMISSIVE` near the `MeshIndirectFrag` `BuildPipelineModel`.
- **New optional capabilities** flexo could later adopt (already in the PbrMaterial schema, now with live feature paths): `<ThinFilm>` (`ENABLE_THIN_FILM`) and `<Normal Power="…">` (`TexturePowerReference`). Out of current v1 scope; classify as opportunities.
