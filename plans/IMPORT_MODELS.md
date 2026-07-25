# Import Models (Blender → flexo → KSA) — Analysis & Implementation Plan

> **STATUS: PROPOSED (2026-07-24).** Nothing implemented yet. This doc is the research +
> design + phased work breakdown for letting a user drop a model authored in Blender (or any
> DCC) into flexo, have it become real KSA SubParts with real KSA textures, and export it as a
> part mod that loads and renders in-game.

**Goal (user's words, translated):** import a model exported from Blender *with its textures*,
have it land in flexo aligned to KSA's Part/SubPart paradigm, and use the **full** set of
texture slots and variations KSA actually supports — not just a diffuse.

**Canonical acceptance test:** in Blender, model a small greebled RCS pod with two materials
(painted metal + a glowing indicator strip), UV-unwrap it, give it base-color / normal /
roughness-metallic / AO / emissive maps, export one `.glb`. In flexo: drag it in, see it render
identically to Blender's Eevee-ish look, place it next to a Core fuel tank at correct scale,
export the mod, and in KSA see **two SubParts** with correct textures, correct normals, a glowing
strip, and working mouse hover/select in the vehicle editor.

**Companion docs:** [docs/custom-assets.md](../docs/custom-assets.md) (current custom-asset
pipeline — the machinery this feature extends), [docs/texturing.md](../docs/texturing.md),
[docs/subpart-catalog.md](../docs/subpart-catalog.md),
[scope/custom-assets-and-mod-export.md](../scope/custom-assets-and-mod-export.md) (the game
contract this must extend), [plans/CUSTOM_TEXTURES_PLAN.md](CUSTOM_TEXTURES_PLAN.md) (the
material model), [plans/done/FLEXO_CUSTOM_ASSETS.md](done/FLEXO_CUSTOM_ASSETS.md) (v1 rationale).

**Evidence baseline:** KSA build **2026.7.9.5018** — decompiled C# at
`ksa-game-assemblies/current/decomp/`, shaders at `ksa-game-assemblies/current/Content/Core/Shaders/`.
Every game-side claim in §2 was read out of those sources on 2026-07-24; file + line refs are
given so the next `upgrade-ksa` pass can re-verify.

---

## 1. Format decision — what to import from

### 1.1 Candidates

| Format | PBR materials | Textures in one file | Blender export quality | Browser parse | Verdict |
| --- | --- | --- | --- | --- | --- |
| **glTF 2.0 binary (`.glb`)** | ✅ metallic-roughness + normal + occlusion + emissive, the exact model KSA uses | ✅ images embedded in the binary chunk | ✅ first-party exporter (`io_scene_gltf2`), maintained by Khronos+Blender | ✅ `GLTFLoader` already in flexo | **PRIMARY** |
| glTF 2.0 JSON (`.gltf` + `.bin` + images) | ✅ same | ❌ multi-file | ✅ same exporter | ✅ same loader (needs URI resolution) | **SECONDARY** (multi-file drop) |
| FBX | ⚠️ proprietary material blob; PBR only by convention | ❌ usually external | ⚠️ Blender's FBX PBR export is lossy/ad-hoc | ⚠️ `FBXLoader` is best-effort/heuristic | ❌ out |
| OBJ + MTL | ❌ no normal/metal/rough in the standard | ❌ external | ✅ but lossy | ✅ `OBJLoader` | ❌ out (v1); possible geometry-only later |
| USD / USDZ | ⚠️ rich but sprawling; material export inconsistent | ⚠️ USDZ only | ⚠️ Blender USD material export is uneven | ⚠️ `USDZLoader` is partial | ❌ out |
| STL / PLY | ❌ none | ❌ | ✅ | ✅ | ❌ out (no UVs ⇒ untexturable) |
| `.blend` | — | — | — | ❌ proprietary binary | ❌ out |

### 1.2 Decision

**Import `.glb` (primary) and `.gltf` + sidecars (secondary). Nothing else in v1.**

Rationale, in priority order:

1. **KSA itself speaks glTF.** Mesh atlases are GLB; `MeshAtlasFileReference` is a glTF loader
   (`decomp/KSA/MeshAtlasFileReference.cs:24`). flexo already *writes* GLB
   (`src/ksa/exportGlb.ts`). Importing glTF makes the whole path one format end to end — the
   fewest conversions, the fewest surprises.
2. **The material model matches 1:1.** glTF metallic-roughness (baseColor / metallicRoughness /
   normal / occlusion / emissive) maps directly onto KSA's five `<PbrMaterial>` slots
   (`Diffuse` / `AoRoughMetal` / `Normal` / `Emissive` / `ThinFilm`), *including* the ORM channel
   packing convention — KSA's shader comment literally says "Following GLTF spec"
   (R=AO, G=rough, B=metal). No re-authoring, no guesswork.
3. **One file = one drop.** `.glb` embeds geometry *and* images, so "import a model with its
   textures" is a single drag-and-drop with zero missing-texture hunts. This is the whole UX ask.
4. **Blender's exporter is first-party and predictable**, and it emits exactly the attribute set
   KSA reads (POSITION / NORMAL / TEXCOORD_0 + indices) with float32 accessors.
5. **The decoders already ship with our `three` dependency** — `DRACOLoader`,
   `meshopt_decoder`, `KTX2Loader` — so compressed exports can be accepted without new deps.

`.gltf` (JSON) support is cheap once `.glb` works: accept a multi-file / folder drop, build a
`filename → blob: URL` map, and hand `GLTFLoader` a `LoadingManager` with a URL modifier — the
exact trick `src/three/kittenBake.ts:39-43` already uses for `DefaultORM.png`.

### 1.3 The Blender-side recipe (goes in the user docs + a "?" popover in the import dialog)

File ▸ Export ▸ **glTF 2.0 (.glb/.gltf)**, format **glTF Binary (.glb)**:

| Section | Setting | Why |
| --- | --- | --- |
| Include | Selected Objects (optional), **Custom Properties off** | keeps the file to what you meant |
| Transform | **+Y Up** (default, leave on) | glTF/KSA/three all use Y-up right-handed metres — see §3.3 |
| Data ▸ Mesh | **Apply Modifiers ON**, **UVs ON**, **Normals ON**, Tangents **OFF**, Vertex Colors **OFF** | KSA reads POSITION/NORMAL/TEXCOORD_0 only (§2 fact 3); tangents/colors are dead weight |
| Data ▸ Material | Materials **Export**, Images **Automatic** (PNG/JPEG) | flexo re-encodes them to KTX2; KTX2-in-glTF is *not* re-encodable (§3.5) |
| Data ▸ Shape Keys / Skinning | off | KSA parts have no morphs and no GPU skinning (§2 fact 3) |
| Compression (Draco) | **off preferred** (accepted either way) | flexo decodes it, but off is simplest |

Modelling rules that map to hard game limits (surfaced as import warnings, §4.4):

- **One material per object per SubPart.** A Blender object with 3 materials becomes 3 SubParts
  (§2 fact 2). Deliberate splits are fine — that's how you get separate colours *and* separate
  KSA GameData per piece.
- **Everything is single-sided.** KSA culls back faces (§2 fact 7). Solidify open surfaces, or
  tick flexo's "make double-sided" import option (which duplicates + flips the geometry).
- **Keep UVs in 0..1 unless you mean to tile.** The game sampler is `Repeat` on all axes
  (`PartModelRenderer.cs:40-42`), so tiling works, but clamp/mirror wrap modes are ignored.
- **Metres.** 1 Blender unit = 1 m = 1 KSA unit. flexo shows the measured bounding box at import
  and offers a scale factor if you authored in cm/inches.

---

## 2. What KSA actually accepts — the hard constraints (verified 2026-07-24)

These are the facts that shape every design decision below. Each one, if violated, is a silent
no-draw or a hard crash on mod load.

| # | Fact | Evidence | Consequence for the importer |
| --- | --- | --- | --- |
| 1 | **Node transforms are ignored.** The atlas loader iterates `GltfJson.Meshes[]`, never the node graph; a mesh is registered by `meshes[i].name` (skipping `_`-prefixed). | `decomp/KSA/MeshAtlasFileReference.cs:22-49` | Geometry must be baked into its **final local space** at import; the node's world transform becomes the flexo **placement** (§3.3). |
| 2 | **Only glTF primitive 0 is drawn.** `MeshReference` loads every primitive, but the part path renders `DeviceMeshesInterleaved[0]` and binds exactly one material. | `decomp/KSA/MeshReference.cs:58,76-118`; `decomp/KSA/PartModel.cs:400-418`; `decomp/KSA/PartModelModule.cs:17-35` (`<PartModel>` = one `<Mesh>` + one `<Material>`) | **One SubPart = one mesh = one primitive = one material.** Multi-material objects MUST be split at import. |
| 3 | **Attribute set is POSITION / NORMAL / TEXCOORD_0 only.** Loaded with `VertexImportFlags.Normals \| UVs`; no TANGENT, COLOR_0, TEXCOORD_1, JOINTS/WEIGHTS. | `decomp/KSA/MeshReference.cs:83`; `decomp/RenderCore.Gltf/GltfUtils.cs:450-491` | Drop everything else at import. UV1-only materials, vertex colours, morphs and skinning need baking or a warning. |
| 4 | **Accessors must be float32 and tightly packed.** `GetGltfBufferWithStride` throws unless element size == 12/12/8 bytes and the bufferView `byteStride` equals it. | `decomp/RenderCore.Gltf/GltfUtils.cs:386-404` | No `KHR_mesh_quantization`, no interleaving, no Draco **in the exported file**. flexo re-emits geometry through `GLTFExporter`, which is float32 + tight by construction — so decode-anything-in, emit-clean-out. |
| 5 | **Indices are required.** The index buffer is only built `if (prim.Indices.HasValue)`; without it the draw has `IndexCount = 0` and picking reads an empty span. `ushort`→`uint` conversion is supported. | `decomp/RenderCore.Gltf/GltfUtils.cs:484-488,540-566`; `decomp/KSA/MeshReference.cs:90-96` | Every emitted primitive must be **indexed**. This is a new regression trap: three's MikkTSpace tangent generator **de-indexes** geometry (`src/three/MeshAtlasCache.ts:71-75`), so the editor's cached geometry must never be the thing we export (§3.6). |
| 6 | **POSITION accessor `min`/`max` are read** for the bounding sphere / culling. | `decomp/RenderCore.Gltf/GltfUtils.cs:568-584` | `GLTFExporter` writes them; just never hand-roll an accessor without them. |
| 7 | **Back-face culling is always on** for part pipelines (`CullMode = BackBit`), and the global sampler is `Repeat` on U/V/W. There is no double-sided or alpha-cutout switch in the XML. | `decomp/KSA/PartModelRenderer.cs:40-42,165,254` | Warn on `doubleSided` materials; offer geometry duplication. `alphaMode: MASK` is unsupported; `BLEND` only via `<PartModelGlass>` (fixed ~0.75 opacity, ~10 % diffuse tint, ignores emissive). |
| 8 | **glTF materials/images inside the GLB are ignored by the part path.** Only `materials.length` is read (for ground clutter). Part surfaces come exclusively from `<PbrMaterial>` → `.ktx2`. | `decomp/KSA/MeshAtlasFileReference.cs:34-35` | Embedded textures must be **extracted, re-encoded to KTX2, and re-declared in XML**. This is the core of the feature. |
| 9 | **Every `<PbrMaterial>` must carry Diffuse + Normal + AoRoughMetal.** Dereferenced with no null check by both the thumbnail renderer and every placed part. | `decomp/KSA/PartModel.cs:414-418`; `KSA.Rendering.Thumbnails/ThumbnailRenderResources.cs` (`AddDraw`) | Unchanged existing contract — `BundleTextures` in `modExport.ts` already synthesises the missing channels as deduped 1×1 solids. |
| 10 | **Picking needs a `<MeshView>` mesh with NORMAL + indices**, and the raycast is a CPU watertight triangle test over its vertices. | `decomp/KSA/Part.cs:1854-1887` | Keep emitting `<id>_VM`; for heavy imported meshes, **decimate** the view mesh (§3.7) or the in-game editor pays per-triangle CPU cost on every hover. |
| 11 | `<Assets>` is a flat `List<SerializedId>`, so **multiple `<MeshAtlas>` elements are legal** in one file, and mesh names register **globally** in `ModLibrary`. | `decomp/KSA/AssetBundle.cs:9-50`; `decomp/KSA/MeshReference.cs:60-63` | Enables the Phase-5 "ship the imported GLB verbatim" optimisation — but it's an unverified game assumption, so v1 re-packs into the single existing atlas (§3.6). Global naming also means every emitted mesh name must stay `flexo_`-prefixed to avoid colliding with Core. |

---

## 3. Design

### 3.1 Pipeline

```
 .glb / (.gltf + .bin + images)
        │  drag-drop / picker (multi-file → blob: URL map + LoadingManager URL modifier)
        ▼
 loadModelFile()            three GLTFLoader (+ DRACO / meshopt / KTX2 decoders)
        │
        ▼
 analyzeImport()  ──────▶  ImportPlan  { groups[], instances[], materials[], images[], warnings[] }
        │                    │  grouping = (glTF mesh × material) → one SubPart
        │                    │  every referencing node → one placement (instancing for free)
        ▼                    ▼
 (user reviews stats + warnings, tweaks options in ImportModelDialog)
        │
        ▼
 normalizeImport(plan, opts)
        │   bake node/mirror/skin transforms · drop unread attributes · ensure indices+normals
        │   promote UV1→UV0 · bake KHR_texture_transform · optional double-sided duplication
        ├──▶ buildImportAtlasGlb()  ──▶ IndexedDB  `import-glb:<importId>`   (geometry)
        └──▶ per-material image extraction
                 ├─ bake factors (baseColorFactor, metallic/roughnessFactor, emissiveStrength…)
                 ├─ pack ORM (occlusion.R + metallicRoughness.G/B)      → packOrmLevel()
                 └─ addCustomTexture() ×N  → KTX2 in IndexedDB          (existing pipeline)
        │
        ▼
 importModelAsMeshes()   ONE undo step, mirroring makeKittenMeshPart():
        │   + a layer named after the file
        │   + one CustomMesh{ imported } per group   (+ its CustomMaterial)
        │   + one placement per node instance
        ▼
 existing machinery, unchanged:
   $customCatalog → customMeshRenderCache → SubPartObject   (editor render)
   buildCustomBundle → MeshAtlas GLB + <PbrMaterial> + <SubPart> + <MeshView>   (export)
```

**The governing principle is the same one that made custom primitives work:** an imported model
becomes ordinary `CustomMesh` descriptors, and everything downstream — catalog, scene,
selection, transform gizmos, layers, undo, Part XML, Assets XML, mod zip — stays untouched.
The new code is confined to *file → descriptors + binaries*.

### 3.2 SubPart granularity (the "KSA paradigm alignment" the ask is about)

| glTF concept | KSA/flexo concept |
| --- | --- |
| mesh primitive (unique `mesh` × `material` pair) | **one SubPart template** (`CustomMesh` + `<SubPart>` + `<Mesh>` + `<PbrMaterial>` + `<MeshView>`) |
| node referencing that mesh | **one placement** (`SubPartPlacement` with the node's world transform) |
| the same mesh referenced by N nodes | **1 SubPart, N placements** — free instancing, exactly KSA's own pattern |
| glTF material | **one `CustomMaterial`** (deduped: two groups sharing a material share the flexo material, and export already interns identical channel sets into one `<PbrMaterial>`) |
| glTF scene | **one flexo layer**, named after the file, holding all the new placements |

Naming: `subPartId = flexo_<Object>_<Material>_<hash8>` (sanitised, `flexo_`-prefixed per fact 11),
`name = "<Object> · <Material>"` when the object splits, else just `<Object>`. `subPartId` is
stable across renames (existing invariant, `CustomMesh.subPartId` doc comment).

Import options that change granularity:

- **Split by material** (forced — it's a game limit, shown as an explanation not a choice).
- **Merge all into one SubPart** — offered only when the model has exactly one material; merges
  every node's baked geometry into a single mesh (cheaper: one draw, one placement).
- **Keep hierarchy as placements** (default) vs **Bake to origin** — the latter bakes world
  transforms into geometry and places everything at identity (useful when the Blender scene has
  junk transforms the user doesn't want to see in the inspector).

### 3.3 Transforms, orientation, scale

- glTF, three.js and KSA all use **right-handed, Y-up, −Z-forward, metres** (`src/three/coords.ts:8-18`),
  so a default Blender export (`+Y Up`) needs **no axis conversion**. An import option offers a
  `Z-up → Y-up` correction (`RotX(−90°)`) for files exported without the conversion.
- Each node's **world matrix** (relative to the glTF scene root, times the import's
  scale/up-axis correction) decomposes into the placement via the existing
  `transformFromMatrix()` (`src/three/coords.ts:66-77`) — which routes through the calibrated
  `ZYX` euler order, so imported placements are indistinguishable from hand-authored ones.
- **Negative determinant (mirror modifiers, negative scale) is baked into the geometry**
  (positions transformed, triangle winding reversed, normals flipped) and the placement gets the
  positive-scale remainder. Leaving a negative scale on the placement would flip winding in-game
  and back-face-cull the whole piece (fact 7).
- **Non-uniform positive scale** may ride on the placement (KSA placements carry a Vec3 scale) —
  but the import dialog defaults to **baking scale into geometry** so UV-space texel density and
  the in-editor gizmo behave predictably. (Option: "keep scale on placements".)
- **Skinned meshes** bake their bind pose exactly like the kitten pipeline —
  `bakeGeometry()` in `src/three/kittenBake.ts:86-121` already handles `SkinnedMesh` +
  normal-matrix transform and is reused verbatim. **Morph targets** bake to the base shape with a
  warning.

### 3.4 Material mapping — the *full* KSA slot set

KSA's `<PbrMaterial>` has exactly five texture slots and **zero scalars**
(`decomp/KSA/PbrMaterialReference.cs`), so every glTF factor must be baked into pixels. flexo's
existing `CustomMaterial` model already expresses all of this; the importer's job is to fill it in.

| KSA slot | glTF source | Import handling |
| --- | --- | --- |
| `<Diffuse>` | `pbrMetallicRoughness.baseColorTexture` (+ `baseColorFactor`) | Texture → `CustomTexture{channel:'baseColor'}`. A non-white `baseColorFactor` is **multiplied into the pixels** at import (KSA has no tint). No texture ⇒ `baseColor:{kind:'color'}` (exports as a deduped 1×1 solid — existing path). |
| `<AoRoughMetal>` | `metallicRoughnessTexture` (G=rough, B=metal) + `occlusionTexture` (R) + `metallicFactor`/`roughnessFactor`/`occlusionStrength` | Same channel layout as KSA ("Following GLTF spec"). If MR and AO are the **same image** (Blender's "glTF Settings" ORM packing) → store once as `channel:'orm'` → `CustomMaterial.ormPacked`. If they differ → `packOrmLevel()` (`src/ktx/channelTransforms.ts:84`) merges them into one image at import. All-scalar materials → `metalness/roughness:{kind:'value'}` (1×1 solids on export). Factors < 1 are baked into the packed channels. |
| `<Normal>` | `normalTexture` + `scale` | `CustomTexture{channel:'normal'}` → the existing encode applies KSA's **X-flip** and bakes strength into RG (`transformNormalLevel`). No TANGENT is exported — KSA derives TBN from screen-space derivatives. |
| `<Emissive>` | `emissiveTexture`, `emissiveFactor`, `KHR_materials_emissive_strength` | KSA glow is **white × mask × 1.25 added after lighting** — there is no emissive colour. So: the emissive colour is **composited into the diffuse** and a **grayscale mask** is emitted, using the existing `compositeGlow()` machinery. Model change: a new `EmissiveShape: 'map'` whose `GlowBitmap` is built from the emissive texture (RGB = colour, luminance → alpha = intensity), joining the existing `'whole'` / `'painted'` shapes. Emissive factor-only (no texture) maps to the existing `'whole'` shape for free. |
| `<ThinFilm>` | — | No glTF equivalent, and it's `<PartModelDynamic>`-only + heat-gated (invisible on a bench part). Out of scope, as today. |

Extensions and cases that **cannot** survive, surfaced as warnings (§4.4):
`KHR_materials_clearcoat / transmission / sheen / specular / volume / ior / unlit`,
`alphaMode: MASK` (no cutout in the part shader), per-texture wrap modes other than repeat,
`KHR_texture_transform` differing between channels (the base-colour transform is baked into UV0;
others warn), TEXCOORD_1 (promoted to UV0 only when *every* channel uses it), vertex colours,
`KHR_texture_basisu` source images (already-compressed KTX2 cannot be CPU-decoded for re-encode —
ask the user to re-export with PNG/JPEG images).

`alphaMode: BLEND` maps to an **opt-in** "render as glass" toggle per SubPart, reusing the
existing `<PartModelGlass>` path (today gated to kitten visors) — with the honest caveat that
KSA's glass is a fixed ~0.75-opacity, ~10 %-tinted, non-glowing shader.

### 3.5 Textures — extraction, dedup, budget

- **Extract the original encoded bytes** (PNG/JPEG) from the GLB `bufferView` / URI — *not* the
  decoded `ImageBitmap` — because flexo stores the source blob (`tex-src:<id>`) and re-encodes
  from it whenever the channel or normal-strength changes (`customAssetStore.setTextureChannel`,
  `ensureCurrentKtx2`).
- **Dedup by content hash** (SHA-256 of the source bytes) so one image shared by five materials
  becomes one `CustomTexture`, one `.ktx2`, one file in the mod.
- **Size cap**: a new persisted setting (`$modelImportSettings.maxTextureSize`, default 2048,
  options 1024/2048/4096) feeding `decodeImage`'s existing `maxSize`. The dialog shows the
  **VRAM cost live**, because flexo's KTX2s are uncompressed RGBA8 + Zstd: a 4096² texture is
  ~64 MB base + ~21 MB mips **per texture** in-game. This is the single most important number to
  put in front of the user, and the strongest motivation for the UASTC phase (§6, Phase 6).
- **UV origin**: glTF's UV origin is top-left, which is what KSA samples and what flexo's
  canvas-based encoder writes — no V-flip anywhere (already true for uploaded images; call it out
  in a comment so nobody "fixes" it).

### 3.6 Storage, persistence, rendering, export

**Data model** (`src/ksa/types.ts`) — a third `CustomMesh` source kind alongside
`primitive` and `kitten`:

```ts
/** An imported (glTF/GLB) SubPart's geometry source. Mutually exclusive with primitive/kitten. */
export interface ImportedMeshSource {
  /** Import batch id — IndexedDB key of the normalized geometry GLB (assetKeys.importGlb). */
  importId: string
  /** Node/mesh name inside that GLB (== CustomMesh.subPartId). */
  meshName: string
  /** Provenance, for the UI + re-import matching. */
  sourceFile: string
  sourceNode: string
  sourceMaterial: string
  triangles: number
  vertices: number
  /** Export through KSA's translucent <PartModelGlass> path (glTF alphaMode BLEND, opt-in). */
  transparent?: boolean
}
```

`CustomMesh` gains `imported?: ImportedMeshSource`. Because two call sites currently assume
"`kitten` or else `primitive!`", introduce `meshKind(m): 'primitive' | 'kitten' | 'imported'` in
`types.ts` and convert those to exhaustive switches. **Audit list** (every `m.primitive!` /
`m.kitten ?` branch): `customAssetStore.refreshCatalog`, `customAssetStore.rebuildAtlasNow`,
`customAssetStore.getPrimaryTextureId`, `modExport.buildCustomBundle`, `modExport.expandGlassGlow`,
`ManageTexturesPanel`, `CustomAssetsModal`, `AddButton`, `projectCodec.encCustomMesh/decCustomMesh`,
`projectTransfer.isKittenMesh/hasBinaryCustomAssets`.

**Binaries** (`src/state/assetDb.ts`): one new key, `importGlb: (id) => 'import-glb:' + id`,
holding the **normalized** geometry GLB for the whole import batch (one named mesh per SubPart,
no textures, no `_VM` — those are generated at export as today). Unlike primitives (regenerable
from params) this GLB is the only copy of the geometry, so it *must* persist; unlike the
localStorage `ProjectSnapshot` it is far too big for it — exactly the split `assetDb` exists for.

**Editor rendering**: a new `src/three/importedMeshCache.ts` maps `importId → blob: URL`
(created on hydrate, revoked on project switch) and resolves geometry by mesh name.
`refreshCatalog()` gains an `imported` branch that awaits the geometry and builds the material via
the existing `buildCustomMaterial()` path, then writes `{geometry, materials:[mat]}` into
`customMeshRenderCache` — so `SubPartObject` needs **zero** changes.

- Editor geometry goes through `MeshAtlasCache.getSubPartGeometry()` (which bakes the node
  transform and adds MikkTSpace tangents for faithful normal-map preview, matching how Core
  SubParts render).
- **Export geometry must NOT** — MikkTSpace **de-indexes**, and KSA requires indices (fact 5).
  So `importedMeshCache` exposes a second accessor, `getRawGeometry(importId, meshName)`, that
  loads the same GLB through a plain `GLTFLoader` with **no tangent generation**, used only by
  `buildCustomBundle`. Guarded by a test (§5).

**Export**: `buildCustomBundle` gains an `imported` branch that pushes
`{ name: subPartId, geometry: rawGeometry.clone() }` into the existing node list — everything
else (`buildMeshAtlasGlb` naming post-process, `_VM` pairing, `<PbrMaterial>` interning,
`<SubPart>`/`<MeshView>` emission, zip/folder writing) is unchanged. **v1 re-packs into the
single existing atlas**; shipping the imported GLB verbatim as an extra `<MeshAtlas>` (legal per
fact 11, saves a re-encode) is a Phase-6 optimisation gated on an in-game check.

**Project persistence**: `projectCodec` gains `imported` encoding for `CustomMesh`. Per the
no-migration rule, bump `PROJECT_EXPORT_VERSION` (4 → 5) and let older payloads be rejected.
`projectTransfer.hasBinaryCustomAssets()` must return **true** when any imported mesh exists, so
data-only project JSON export stays correctly gated off (imported geometry is a binary).
Adding a field to `CustomMesh` doesn't break `snapshotMatchesModel` (it checks top-level
`EditingPart` keys), but the boot purge must still be exercised — see the test list.

### 3.7 Performance and budgets

- **View meshes**: for imported meshes above a threshold (~2 000 triangles), decimate the `_VM`
  mesh with `meshopt_simplifier` (ships in `three/addons/libs/`) to ≤2 000 tris, preserving
  attributes and indices (KSA's raycast reads NORMAL at the hit vertex — fact 10). This is a
  *real* in-game win: `RayCastEgoSubPart` is a CPU triangle loop run on hover.
- **Triangle budget warnings** at import: >100 k triangles per SubPart, >500 k total.
- **Import-time work is chunked** (`await` between groups) so the UI doesn't jank; the existing
  `loadProgressStore` gets progress events.
- Geometry caches follow the established ownership rule: cached geometries are shared and never
  disposed per-instance; only per-instance cloned materials are.

---

## 4. UX

### 4.1 Entry points

- **Add ▸ Import model…** (`AddButton.tsx`, next to "Create mesh…").
- **Drag a `.glb` onto the 3D viewport** — the fastest path, and the one users will try first.
  Multi-file / folder drop is accepted for `.gltf` + `.bin` + images.

### 4.2 The import dialog (`src/ui/ImportModelDialog.tsx`)

Three states in one modal, no wizard chrome:

1. **Drop** — file picker + drop zone + "How to export from Blender" disclosure (§1.3).
2. **Review** (after parse — nothing has been committed to the document yet):
   - **Preview viewport** reusing `SubPartPreviewViewport` machinery, lit by the same
     RoomEnvironment/tonemapping as the editor, so what's shown is what will render.
   - **Stats**: objects → SubParts, placements, triangles, vertices, materials, textures,
     measured bounding box (m), estimated mod size, **estimated in-game VRAM**.
   - **Options**: name prefix · scale (with `×0.01` / `×0.0254` presets) · up-axis
     (`Y-up` / `Z-up`) · bake transforms vs keep as placements · bake scale into geometry ·
     make double-sided · max texture size · decimate view meshes · (single-material only)
     merge into one SubPart.
   - **Warnings list** (§4.4), each with a plain-English remedy.
3. **Import** — one undo step; the dialog closes, the new layer becomes active, and the new
   placements are selected (mirroring `makeKittenMeshPart`, `customAssetStore.ts:704-740`).

### 4.3 After import

- New **layer** named after the file; assets appear in the Assets list like anything else.
- **Custom Assets modal** gets an "Imported models" section grouped by import batch: file name,
  date, SubPart count, texture count, "Add another instance", "Remove import" (removes its
  meshes, placements, orphaned textures, and the IndexedDB GLB).
- **Per-mesh panel** (`ManageTexturesPanel`): imported meshes show material assignment, glow, and
  the glass toggle — but **not** the per-face texture grid (they have no primitive faces; same
  gating that already exists for kitten meshes), plus a read-only provenance block
  (source file / object / material / tri count).
- **Re-import / replace**: pick a new file for an existing import batch and match SubParts by
  `sourceNode + sourceMaterial`; matched ones keep their `subPartId` (so placements, GameData,
  animations and connectors survive), unmatched ones are reported. This is the difference between
  "a toy" and "something you can iterate on in Blender" — Phase 5.

### 4.4 Warning catalogue (condition → message → remedy)

| Condition | Message | Remedy offered |
| --- | --- | --- |
| Object has N>1 materials | "*Hull* uses 3 materials → 3 SubParts (KSA renders one material per SubPart)." | informational |
| `doubleSided` material | "KSA culls back faces; single-sided surfaces will be invisible from behind." | "Make double-sided" option |
| `alphaMode: MASK` | "Alpha cutout isn't supported by KSA's part shader." | bake the cutout into geometry |
| `alphaMode: BLEND` | "Exports opaque unless you enable glass; KSA glass is fixed ~75 % opacity and can't glow." | per-mesh glass toggle |
| No UVs | "No UV map — textures can't be applied to *Bolt*." | UV-unwrap in Blender |
| No normals | "Missing normals — flat shading will be computed." | auto (computed) |
| TEXCOORD_1 used | "Second UV set ignored (KSA reads UV0)." | auto-promote when unambiguous |
| Vertex colours | "Vertex colours aren't read by KSA." | bake to base colour texture |
| Morph targets / animations in file | "Shape keys and glTF animations aren't imported (base shape used)." | flexo's own animation editor |
| `KHR_texture_basisu` images | "Compressed KTX2 source images can't be re-encoded." | re-export with PNG/JPEG images |
| Unsupported material extension | "*clearcoat* has no KSA equivalent and is ignored." | informational |
| >100 k tris in one SubPart | "Very heavy SubPart — in-game editor picking may be slow." | decimate view mesh (on by default) |
| Textures > cap | "4096² textures cost ~85 MB VRAM each in-game." | max-size setting |
| Negative scale / mirror | "Mirrored transform baked into geometry (winding fixed)." | auto |

---

## 5. Phased implementation

Each phase ends green: `pnpm typecheck && pnpm test && pnpm lint && pnpm fmt:check`, and follows
the Rules of React (no manual memo, hooks at top level) per AGENTS.md.

### Phase 0 — Spike + guard rails (½ day)
- `src/ksa/exportGlb.test.ts`: add assertions that every emitted primitive **has `indices`** and
  that POSITION/NORMAL/TEXCOORD_0 accessors are `componentType 5126` with no `byteStride`
  mismatch — the fact-4/fact-5 trap, guarded *before* any importer exists.
- Spike script/test: load a hand-made Blender `.glb` fixture through `GLTFLoader` in vitest
  (happy-dom + `parse()` on bytes) to confirm the parse path works headless.
- Fixture: commit a tiny (<100 KB) two-material, textured `.glb` under `src/ksa/__fixtures__/`
  (authored by us, so no licensing question) for all later tests.

### Phase 1 — Geometry-only import (2–3 days)
- `src/three/loadModelFile.ts` — File(s) → `GLTF`, with DRACO/meshopt decoders (copy
  `three/examples/jsm/libs/draco/gltf/*` into `public/draco/` and wire the path like
  `public/basis/`; document it in `docs/asset-pipeline.md`), multi-file URL resolution, and
  clear error messages.
- `src/ksa/importPlan.ts` — `analyzeImport(gltf, opts): ImportPlan` (grouping, instancing,
  transforms, warnings). Pure over three objects → unit-testable with a synthetic scene.
- `src/ksa/importNormalize.ts` — `normalizeImport(plan, opts)`: bake transforms/mirror/bind-pose
  (reuse `kittenBake.bakeGeometry`), strip unread attributes, ensure indices + normals + UV0,
  optional double-siding, then `buildImportAtlasGlb()` (thin wrapper over `exportGlb`'s
  scene-build + `nameMeshesFromNodes`, **without** `_VM` nodes).
- `types.ts`: `ImportedMeshSource`, `CustomMesh.imported`, `meshKind()`; audit the `primitive!`
  sites listed in §3.6.
- `assetDb.ts`: `assetKeys.importGlb`.
- `src/three/importedMeshCache.ts`: blob-URL registry + `getGeometry` (tangents, editor) +
  `getRawGeometry` (no tangents, export) + hydrate/dispose.
- `customAssetStore.ts`: `importModelAsMeshes(normalized)` (one `mutate()`: layer + meshes +
  placements, then `scheduleRebuild()`), `refreshCatalog`/`rebuildAtlasNow` imported branches,
  hydrate imported GLBs on project load.
- Minimal UI: **Add ▸ Import model…** → file picker → import with defaults.
- **Done when**: a textureless Blender GLB renders in the viewport with correct scale and
  placement, survives reload, and undo/redo removes/restores it cleanly.

### Phase 2 — Textures + materials (2–3 days)
- `src/ksa/importMaterials.ts`: image extraction (raw bytes + mime), content-hash dedup, factor
  baking, ORM packing, normal strength, emissive → composited diffuse + mask.
- `types.ts`: `EmissiveShape` gains `'map'` (+ `EmissiveConfig.textureId`);
  `glowBitmapFor()` gains the `'map'` branch.
- Wire through `addCustomTexture` / `addCustomMaterial` so imported textures and materials are
  ordinary flexo assets (editable, reusable, deletable) — not a parallel universe.
- **Done when**: the fixture model renders in flexo with base colour, normal, roughness/metal, AO
  and glow visibly correct, and the textures appear in the Custom Assets modal.

### Phase 3 — Export (1–2 days)
- `modExport.buildCustomBundle`: imported branch (raw geometry, no tangents).
- `_VM` decimation via `meshopt_simplifier` for heavy meshes.
- `expandGlassGlow` / glass toggle generalised beyond kitten visors.
- `projectCodec` v5 + `projectTransfer` gating.
- **Done when**: `pnpm test` covers the emitted Assets XML/atlas for an imported SubPart, and a
  real mod folder loads in KSA (see §6).

### Phase 4 — The dialog + warnings (2 days)
- `ImportModelDialog.tsx` with preview, stats, options, warning list; drag-drop onto the viewport;
  `$modelImportSettings` persisted store; progress reporting for big files.
- `CustomAssetsModal` "Imported models" section; `ManageTexturesPanel` imported-mesh mode.

### Phase 5 — Iteration UX (1–2 days)
- Re-import / replace with `sourceNode + sourceMaterial` matching (keeps `subPartId`s alive).
- "Remove import" cleanup (meshes, placements, orphan textures, IndexedDB blob).
- Import report toast/panel summarising what was created.

### Phase 6 — Deferred / opportunistic
- **UASTC (or BC7) KTX2 encoding + `.toml` sidecar** — the real fix for imported-texture VRAM.
  Already the documented preferred future route in `docs/custom-assets.md`; imported models make
  it *much* more urgent (a 4-texture model at 2048² costs ~90 MB VRAM uncompressed — 22.4 MB per
  texture with mips — vs ~22 MB block-compressed at 1 byte/texel). Needs an in-browser encoder
  evaluation (Basis Universal `basis_encoder.wasm`
  / libktx WASM) — treat the encoder availability as **unverified** until spiked.
- Ship the imported GLB **verbatim** as a second `<MeshAtlas>` (legal per fact 11) to skip the
  export re-encode — gated on an in-game check that multiple Id-less atlases load.
- glTF **animation** import mapped onto flexo's joint/keyframe model.
- Vertex-colour bake into base colour; planar/box UV generation for unwrapped meshes.
- Geometry-only OBJ/STL import.
- LOD authoring (`<LOD>`) once the ground-clutter LOD work lands.

---

## 6. Acceptance tests

**Automated** (vitest):
1. `importPlan.test.ts` — (mesh × material) grouping; N nodes → N placements on one SubPart;
   world transform → placement round-trips through `transformFromMatrix`; mirrored transform is
   baked and winding flipped; warnings fire for doubleSided / no-UV / UV1 / vertex colours.
2. `importNormalize.test.ts` — output geometry is **indexed**, float32, POSITION+NORMAL+UV0 only,
   no TANGENT; UV1 promotion; double-siding doubles triangles and flips the copies.
3. `exportGlb.test.ts` (extended) — indices + accessor component types survive the atlas build
   for imported geometry (facts 4 & 5).
4. `modExport.test.ts` — an imported SubPart emits `<Mesh>`, a complete `<PbrMaterial>`
   (Diffuse+Normal+AoRoughMetal, plus Emissive when glowing), and a `<MeshView>`; a shared
   material interns to one `<PbrMaterial>`.
5. `customAssetStore.test.ts` / `editorStore.test.ts` — import is **one** undo step; undo removes
   meshes + placements + layer; redo restores; the `$part` subscriber rebuild path repopulates
   `$customCatalog` after undo (the existing `meshSignature` mechanism must include `imported`).
6. `projectCodec.test.ts` — imported descriptor round-trip; v4 payloads rejected (no migration).

**Manual, in-editor**: fixture model renders identically to Blender's preview; scale matches a
Core fuel tank; reload restores everything; deleting an import cleans up.

**Manual, in-game (the real bar)** — export to `mods/flexo-parts/`, load KSA:
1. The mod loads with **no** exception (mesh names, indices, complete materials).
2. Both SubParts render with correct textures, normals oriented correctly (bumps punch the right
   way), and the emissive strip glows.
3. **Hover / click / right-click works** on each piece in the vehicle editor (the `_VM` contract).
4. The part thumbnail renders (the `ThumbnailRenderResources` null-deref path).
5. A multi-instance import (same mesh, 4 nodes) shows 4 pieces, not 1.

---

## 7. Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Tangent-generated (de-indexed) geometry reaches the exporter → invisible part in-game, no error | medium | Separate `getRawGeometry` accessor + the Phase-0 index assertion test |
| Imported texture VRAM blows up a user's GPU budget (uncompressed RGBA8) | **high** | Live VRAM estimate in the dialog, default 2048 cap, Phase-6 UASTC |
| Heavy view meshes make the in-game editor sluggish (CPU raycast) | medium | Decimate `_VM` by default |
| Users export Z-up / wrong scale and blame flexo | high | Measured bbox + scale/up-axis options + the Blender recipe in-dialog |
| Blender exports with Draco and we don't wire the decoder | medium | Ship `public/draco/` in Phase 1; clear error if absent |
| A model relies on doubleSided/alpha-cutout and looks broken in-game | medium | Explicit warnings + double-siding option |
| `CustomMesh` grows a third variant and the `primitive!` assertions rot | medium | `meshKind()` switch + the §3.6 audit list |
| Multiple `<MeshAtlas>` assumption (Phase 6) proves wrong in-game | low | v1 doesn't rely on it |

---

## 8. Non-goals (v1)

Skinned/animated playback, morph targets, glTF cameras/lights, scene-level hierarchy beyond
flattening to placements, material extensions with no KSA equivalent, alpha cutout, LOD chains,
automatic UV unwrapping, mesh editing inside flexo, and FBX/USD/OBJ import.

---

## 9. Documentation + scope obligations (mandatory, per AGENTS.md)

Landing this feature **must** include, in the same change:

- **`scope/custom-assets-and-mod-export.md`** — extend "The contract" with the new game facts
  proven in §2 that flexo now depends on: node transforms ignored (fact 1), primitive-0-only
  rendering (fact 2), the float32/tight-packing accessor requirement (fact 4), **indices
  required** (fact 5), back-face culling + Repeat sampler (fact 7), view-mesh NORMAL requirement
  (fact 10), and the multi-`<MeshAtlas>` observation (fact 11) — each with its `decomp/…:line`
  citation. Add the new modules to the "Flexo modules" table.
- **`docs/importing-models.md`** (new) — the user-facing feature doc: the Blender recipe, what
  becomes a SubPart, the material mapping table, the warning catalogue, the limitations.
- **`docs/custom-assets.md`** — cross-link the new doc; update "Current scope" (it currently says
  "Four primitives only — no imported meshes").
- **`docs/asset-pipeline.md`** — the new `public/draco/` decoder assets.
- **`AGENTS.md`** — add `docs/importing-models.md` to the documentation list and a short
  "Imported models" subsection under Custom assets.
- **`plans/FEATURE_TODOS.md`** — mark the feature done with a pointer here when it lands.
