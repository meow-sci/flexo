# Custom assets — user textures, materials + primitive meshes

Lets a flexo user, entirely in-browser: upload images → encode them to KTX2
textures (per PBR channel), author reusable **materials** (base color as a picked
color or an image, metalness/roughness as sliders or grayscale maps, normal maps,
packed ORM), create a parametric primitive mesh (box / cylinder / sphere / plane),
texture it, place/transform it like any built-in SubPart, and export the whole
thing as a KSA part mod that **loads and renders in the game** (diffuse pipeline
validated in-game 2026-05-30; the full-material pipeline + UNORM re-tag await an
in-game pass — see "Pending in-game verification" below).

A **model imported from Blender** (`.glb` / `.gltf`) rides the same machinery: it becomes
ordinary `CustomMesh` descriptors — one SubPart per (glTF mesh × material), one placement
per node that references it — so the catalog, scene, selection, gizmos, layers and undo are
unchanged. Geometry import is shipped; its materials/textures and mod export are the next
phases (see [plans/IMPORT_MODELS.md](../plans/IMPORT_MODELS.md); the user-facing
`docs/importing-models.md` lands with them).

The design rationale and format research live in
[plans/done/FLEXO_CUSTOM_ASSETS.md](../plans/done/FLEXO_CUSTOM_ASSETS.md). This doc is the
maintenance reference for the shipped code: what each module does, the decisions
baked into the on-disk formats, and the deliberate v1 shortcomings.

Related: [texturing.md](texturing.md) (how KTX2 loads/renders),
[subpart-catalog.md](subpart-catalog.md) (how SubParts resolve geometry/textures),
[xml-io.md](xml-io.md) (XML serialize patterns), [projects.md](projects.md) +
[state-persistence.md](state-persistence.md) (persistence),
[asset-pipeline.md](asset-pipeline.md) (`/ksa/` dev serving + build bundling).

## End-to-end pipeline

```
upload image ─▶ decodeImage() ─▶ RGBA8 + mip chain
                                   │
                                   ▼
              encodeImageToKtx2() ─▶ .ktx2 bytes ─▶ IndexedDB (assetDb)
                                                       │           │
create primitive ─▶ buildPrimitiveGeometry()           │           ▼
                       │                                │      blob: URLs
                       ▼                                │           │
              buildMeshAtlasGlb() ─▶ .glb (blob:) ◀─────┘           ▼
                       │                                    $customCatalog
                       └──────────────────────────────────▶ (CatalogSubPart[])
                                                                    │
                                          EditorScene rebuilds via existing
                                          SubPartObject pipeline (no special-casing)

export ─▶ buildCustomBundle() ─▶ Assets.xml + Meshes/*.glb + Textures/*.ktx2
                                  ─▶ zip download OR FS-Access folder write
```

The defining architectural choice: **custom meshes flow through the EXACT same
catalog → `SubPartObject` rendering path as built-in KSA SubParts.** The only
flexo-specific code is the upload/encode/build orchestration in
`customAssetStore.ts`; the scene, selection, transform, placement, and XML-export
of *placements* are all unchanged. A custom mesh is just a synthetic
`CatalogSubPart` whose URLs happen to be `blob:` instead of `/ksa/`.

`refreshCatalog()` publishes one `$customCatalog` entry per custom mesh **and** fills
`customMeshRenderCache` (`subPartId → {geometry, materials[]}`) — `SubPartObject` prefers
the cache (pre-built geometry + per-face materials, cloned per instance) and falls back to
the entry's `atlasUrl` + `meshNodeName` like a Core SubPart. The `atlasUrl` differs per
mesh kind:

| Mesh kind | `atlasUrl` | Geometry |
| --- | --- | --- |
| primitive | the shared rebuilt atlas blob | `buildPrimitiveGeometry` + baked face UVs |
| kitten submesh | the shared rebuilt atlas blob | CPU bind-pose bake (`kittenBake`) |
| **imported** | **that import batch's own GLB blob** | `importedMeshCache` → `MeshAtlasCache` (node transform baked, MikkTSpace tangents) |

An imported batch's normalized GLB *is* a mesh atlas (one named mesh per SubPart), so it is
its own `atlasUrl` — and it is deliberately **not** re-encoded into the shared atlas, which
would re-run `GLTFExporter` over a multi-megabyte model on every rebuild.

## Modules

### Texture encoding (`src/ktx/`) — the only place that knows the on-disk texture format

- **`decodeImage.ts`** — `decodeImage(blob, maxSize=2048) → DecodedImage`. Decodes
  any browser-supported image (PNG/JPG/WebP, file/drag-drop/paste) via
  `createImageBitmap` + a canvas, reads back RGBA8, downscales so the longest edge
  ≤ `maxSize` (respects the ~6 MP browser decode ceiling), and builds a full mip
  chain down to 1×1 by 2×2 box-filtering in sRGB space.
- **`encodeKtx2.ts`** — `encodeImageToKtx2(image, {zstd}) → Uint8Array`.
  Assembles a standards-compliant KTX2 via [`ktx-parse`](https://github.com/donmccurdy/KTX-Parse)'s
  `write()`. **This is the single chokepoint for the texture format** — a future
  BC7 swap touches only this file. Hand-builds the Data Format Descriptor (DFD) for
  a 4×8-bit RGBA texel.
  - Container tags are **always `VK_FORMAT_R8G8B8A8_UNORM` (23) + linear transfer**,
    even for sRGB content: KSA honors the file's vkFormat verbatim AND its shader
    gamma-decodes the diffuse sample itself (`gammaToLinear` = pow 2.2), so an
    `_SRGB`-tagged file double-decodes in-game (mid-tones too dark). Diffuse content
    keeps sRGB **bytes**; Core's own BC7 atlases follow the same convention. The
    editor is unaffected (TextureCache forces `colorSpace` per call site).
    `isLegacySrgbKtx2()` detects pre-convention caches; `ensureCurrentKtx2` in
    `customAssetStore` regenerates them from the stored source on hydrate.
  - `container.levelCount` is set explicitly to the mip-chain length — `write()`
    emits exactly that many levels (it does **not** infer from the array).
- **`zstd.ts`** — lazy `@bokuweb/zstd-wasm` `compress` wrapper (`compressZstd`,
  default level 10). Applies KTX2 `supercompressionScheme = 2` (Zstd) per mip level
  — the same scheme KSA's own atlases use. *Decompression* at load time is the
  KTX2Loader worker's job (see [texturing.md](texturing.md)), not ours.

### Mesh generation + GLB export

- **`src/three/primitives.ts`** — `buildPrimitiveGeometry(spec) → BufferGeometry`
  for box/cylinder/sphere/plane (three.js built-ins), with `DEFAULT_PRIMITIVE_PARAMS`,
  `defaultSpec`, `PRIMITIVE_LABELS`, `PRIMITIVE_KINDS`. Each returns POSITION /
  NORMAL / TEXCOORD_0 — the exact attribute set KSA's built-in atlases use. Authored
  Y-up, centered on origin. The shape/param **types** live in `ksa/types.ts` so the
  framework-agnostic document model can reference them without importing three.
- **`src/ksa/exportGlb.ts`** — `buildMeshAtlasGlb(nodes) → Uint8Array`. A
  geometry-only binary GLB "mesh atlas" mirroring KSA's built-ins: one render mesh
  **plus a paired `<id>_VM` view (picking) mesh** per SubPart, a single shared
  placeholder material (KSA ignores GLB materials and applies the XML
  `<PbrMaterial>`), **no embedded textures**. See the GLB naming decision below — this
  file post-processes the GLB JSON chunk. See **View meshes (pickability)** below for
  why the `_VM` mesh exists.

### Imported models (glTF)

- **`src/three/loadModelFile.ts`** — File(s) → a three scene (`GLTFLoader` + DRACO/meshopt
  decoders; `.gltf` sidecars resolve through a `blob:` URL map). Also exposes `ModelSource`,
  a narrow façade over `GLTFParser`: the glTF **JSON** (factors/extensions/samplers three
  folds away), `materialIndex(threeMaterial)` via `parser.associations`, and
  `imageBytes(i)` — each image's **original encoded PNG/JPEG bytes** (GLB `bufferView`,
  `data:` URI, or the retained sidecar `File`). Original bytes matter because flexo stores
  the source under `tex-src:<id>` and **re-encodes from it** on every later channel /
  normal-strength change; a canvas readback would silently become the new "source".
- **`src/ksa/importPlan.ts`** — `analyzeImport()`: (glTF mesh × material) → one SubPart,
  every referencing node → one placement, the glTF material index on each group, plus the
  "KSA can't do this" warning catalog (including the JSON-only ones: unsupported material
  extensions, `KHR_texture_basisu` sources, non-Repeat sampler wraps, `KHR_texture_transform`,
  per-channel `TEXCOORD_1`).
- **`src/ksa/importMaterials.ts`** — `planImportMaterials()`: the glTF metallic-roughness
  material model → flexo `CustomTexture`/`CustomMaterial` specs. See **Imported materials**
  below. Pure and descriptor-shaped (image codecs are injectable), so it unit-tests without
  a canvas.
- **`src/ksa/importNormalize.ts`** — `normalizeImport()`: bakes transforms/mirror/bind-pose,
  strips unread attributes, forces indices, and emits ONE atlas GLB per import batch
  (`viewMeshes: false` — `_VM` meshes are generated at export instead).
- **`src/three/importedMeshCache.ts`** — the runtime registry: `importId → blob:` URL over
  the stored GLBs, `getImportedGeometry()` (editor: shared `MeshAtlasCache`, tangents) and
  `getImportedRawGeometry()` (export: **no** tangents, because MikkTSpace de-indexes and KSA
  requires indices). Cached geometries are shared — clone, never dispose.
- **`customAssetStore.importModelAsMeshes()`** — commits a normalized import as ONE undo
  step: a layer named after the file, every imported texture + material, one
  `CustomMesh{imported}` per group, one placement per instance. **Every binary is written
  first** (the atlas GLB, each texture's source + `.ktx2`, each glow bitmap), then a single
  `mutate()` appends all the descriptors — both because `mutate()` is one undo entry each,
  and because the rebuild it triggers resolves geometry/textures/glow out of those binaries.
  The non-mutating halves it needs are `createTextureAsset()` and
  `buildCustomMaterialDescriptor()`; `addCustomTexture`/`addCustomMaterial` are thin
  wrappers over them.

#### Imported materials — the glTF → KSA slot mapping

KSA's `<PbrMaterial>` has **five texture slots and zero scalars**, so **every glTF factor is
baked into pixels** at import (there is nowhere downstream to put a number):

| KSA slot | glTF source | Import handling |
| --- | --- | --- |
| `<Diffuse>` | `baseColorTexture` × `baseColorFactor` | White factor ⇒ the image ships **verbatim**. Otherwise the factor is multiplied in **linear space** (sRGB byte → linear → × → sRGB byte; multiplying the bytes would darken wrongly) and the result is PNG-encoded as the texture's source. No texture ⇒ `baseColor` as a picked colour (exports as a deduped 1×1 solid). Factor **alpha is ignored** — KSA parts are opaque or glass, never per-texel alpha. |
| `<AoRoughMetal>` | `occlusionTexture`(R) + `metallicRoughnessTexture`(G,B) + their factors/`occlusionStrength` | Same channel layout as KSA ("Following GLTF spec"). Occlusion and MR **sharing one image with all factors at 1** (Blender's "glTF Settings" ORM packing) is reused **verbatim** — smaller mod, no requantize loss. Otherwise `packOrmLevel()` repacks (`ao = 255 + strength*(texR-255)`; rough/metal are linear data, so the factors multiply in byte space). No maps ⇒ scalars only (a solid ORM texel). |
| `<Normal>` | `normalTexture` + `scale` | Verbatim bytes + `strength = scale`. **Not** pre-transformed: `prepareChannelImage(…, 'normal', strength)` owns KSA's X-flip and the strength bake at encode, and `modExport.normalPathFor` re-derives a strength ≠ 1 from the same source. |
| `<Emissive>` | `emissiveTexture` × `emissiveFactor` × `KHR_materials_emissive_strength` | KSA's glow is WHITE × mask × 1.25 added after lighting — there is no emissive colour — so the colour is composited into the **diffuse** and only the intensity is a mask. The import composes a glow bitmap (`rgb` = the emissive product as sRGB, `a` = its linear luminance) and stores it under the **existing `'painted'` emissive shape** (see below). |
| `<ThinFilm>` | — | No glTF equivalent; `<PartModelDynamic>`-only and heat-gated. Out of scope. |

`alphaMode: BLEND` sets `ImportedMeshSource.transparent` (the opt-in `<PartModelGlass>`
path); `MASK` is a warning only — KSA's part shader has no cutout.

**Dedup.** Textures are keyed by a pure FNV-1a-64 hash of the **source bytes** + the channel +
any baked-factor parameters, so one image shared by five materials becomes one `CustomTexture`
— but the same image used as *two* channels correctly becomes two (each channel encodes
differently). Materials are keyed by the glTF material index, so two SubParts cut from one
Blender material share one flexo `CustomMaterial` (and therefore one exported `<PbrMaterial>`).

**Imported textures and materials are ordinary flexo assets** from the moment they land:
editable in the material dialog, reusable on other meshes, deletable, and exported through the
same path as hand-authored ones. Nothing about them is a parallel universe.

### Assets XML

- **`src/ksa/assetsXmlSerializer.ts`** — `serializeAssets(plan) → string`. Emits the
  `<Assets>` doc that **defines** custom SubParts (mirroring Core's `*Assets.xml`):
  one `<MeshAtlas>`, one `<PbrMaterial>` per textured SubPart, one `<SubPart>` per
  custom mesh. Reuses `partXmlSerializer`'s `prettyXml`. Only custom SubParts
  actually placed are emitted — built-in/Core SubParts are owned by KSA Core and must
  **not** be re-declared.

### State / orchestration

- **`src/state/customAssetStore.ts`** — the one place that ties document descriptors
  (`EditingPart.customTextures` / `customMeshes`) to (a) IndexedDB binaries, (b)
  runtime `blob:` URLs, and (c) the synthetic `$customCatalog` entries the renderer
  consumes. Actions: `addCustomTexture`, `removeCustomTexture`, `addCustomMesh`,
  `updateCustomMesh`, `removeCustomMesh`, `makeKittenMeshPart`, `importModelAsMeshes`,
  `hydrateCustomAssets`. All document
  mutations go through `mutate()`, which calls `pushUndo()` — so custom assets
  **enroll in undo/redo** (see [editor-state.md](editor-state.md)). Re-hydrates on
  every `$projectName` change. Diffuse `blob:` URL is the catalog cache key
  (`materialId` left undefined) so replacing a texture busts `MaterialFactory`'s cache.
- **`src/state/assetDb.ts`** — tiny promise-wrapped IndexedDB key→Blob store
  (`flexo-assets`/`blobs`). `putAsset`/`getAsset`/`deleteAsset` + `assetKeys`
  (`tex-src:<id>`, `tex-ktx2:<id>`, `mesh-glb:<id>`, `import-glb:<id>`,
  `emissive-paint:<id>`). Binaries are too big for the localStorage `ProjectSnapshot`, so
  only lightweight descriptors persist there; the bytes live here. **Generated mesh GLBs
  are not persisted** — they're cheap to regenerate from the primitive params. **Imported
  model GLBs are** (`import-glb:<importId>`, one per import batch): nothing can regenerate
  imported geometry, so that file is the only copy. Deleting an imported mesh therefore
  does *not* delete the batch GLB (undo must restore it, and its sibling SubParts still
  read from it) — reclaiming it is an explicit user action.

### Export plumbing (`src/ksa/modExport.ts`)

- `buildCustomBundle(part, base)` — generates the combined mesh-atlas GLB (one node
  per *placed* custom mesh), pulls each referenced diffuse `.ktx2` from IndexedDB
  (deduped by texture id), synthesizes the shared Normal/ORM textures (see below),
  and returns `{ assetsFile, assetsXml, binaries }`.
- `buildModZip` / `writeModToFolder` — both call `buildCustomBundle` and lay the
  binaries out under `Meshes/` + `Textures/`. The FS-Access path is non-destructive
  for XML (suffixes on collision) but **overwrites binaries** deterministically.

### UI (`src/ui/`)

- `CustomTextureDialog.tsx` — image upload (picker / drag-drop / paste) + a channel
  picker ("This image is…" — base color / normal / grayscale / packed ORM) + encode.
- `MaterialDialog.tsx` — create/edit a `CustomMaterial`: presets, base color
  (picker ⟷ image), metal/rough sliders, advanced maps (normal + strength, AO,
  packed ORM, grayscale rough/metal), and a live PBR preview sphere under the same
  RoomEnvironment/tonemapping as the viewport.
- `CreateMeshDialog.tsx` — primitive picker, params, material + texture assignment.
- `ManageTexturesPanel.tsx` — per-mesh: material assignment (+ edit / new), glow /
  visor surface, per-face texture + UV controls (warns when faces mix textures).
- `CustomAssetsModal.tsx` — textures (channel select, delete), materials (swatch,
  usage counts, edit, delete), meshes (add instance / manage / delete).
- entry points wired from the **Add** menu (`AddButton.tsx`) — including **Import model…**,
  which is deliberately a bare file picker that imports with the default options (the
  preview/options/warnings dialog is a later phase).

## On-disk format decisions

### KTX2: uncompressed RGBA8 + Zstd (NOT block-compressed)

KSA's own atlases are raw `VK_FORMAT_BC7_UNORM_BLOCK` (diffuse/ORM) / `BC5` (normal) /
`BC4` (emissive) + Zstd — **not** Basis Universal (confirmed in
`src/three/textureSupport.ts`; the bundled basis worker is there mainly for its Zstd
decoder). We deliberately do **not** byte-match that:

- There is no turnkey in-browser BC7 encoder. Uncompressed RGBA8 is the most
  universally accepted KTX2 flavor and — crucially — loads through three's
  `KTX2Loader` so the editor previews exactly what it exports (self-validating).
- Trade-off: **larger VRAM** in-game than BC7 (Zstd keeps the *file* small but it
  decompresses to full RGBA8). Acceptable for v1 custom textures.

### GLB mesh naming — CRITICAL (caused an in-game NullReferenceException)

KSA's `MeshAtlasFileReference.DoLoad()` (decompiled, `thirdparty/ksa/KSA/`) reads
the SubPart id from the glTF **`meshes[i].name`** array (and skips names starting
with `_`). In glTF the **mesh** name and the **node** name are distinct fields.

`THREE.GLTFExporter` writes only the **node** name (`Object3D.name`) and leaves
`meshes[i].name` unset → KSA hits `null.StartsWith('_')` → `NullReferenceException`,
registers no `MeshReference`, then fails with "MeshReference is null for '<id>'".

**Fix (in `exportGlb.ts`):** after `GLTFExporter`, `nameMeshesFromNodes()`
post-processes the binary GLB — it parses the JSON chunk, copies each node's name
onto the mesh it references (`meshes[node.mesh].name = node.name`), and re-packs both
chunks with correct 4-byte (space) padding and updated lengths. Both fields end up
set to the SubPart id: the **mesh** name is what KSA reads; the **node** name is what
flexo's own `MeshAtlasCache.getObjectByName` resolves on re-import. Guarded by
`exportGlb.test.ts`.

> Note: an earlier attempt set `geometry.name` (expecting GLTFExporter to derive the
> mesh name from it) — that did not work, hence the JSON post-process. The plan doc's
> original write-up of this is superseded by the code + this section.

### Custom materials (`CustomMaterial`) + solid texels — every PbrMaterial carries D+N+ORM

KSA's `<PbrMaterial>` has **exactly five texture slots and zero scalar params**
(`PbrMaterialReference.cs`: Diffuse / Normal / AoRoughMetal / Emissive / ThinFilm), and
BOTH the thumbnail renderer (`ThumbnailRenderResources.AddDraw`) **and** every placed
part (`PartModel.WriteInstancesToGpu`) dereference Diffuse/Normal/PBRMap with **no null
check** — a partial material crashes the game. Two consequences baked into the export:

- **Uniform values become 1×1 solid KTX2s** (deduped per bundle by `BundleTextures` in
  `modExport.ts`): `<base>_FlatNormal.ktx2` (128,128,255 ≈ +Z), `<base>_NeutralORM.ktx2`
  (AO 255 / rough 128 / metal 0 — the no-material legacy), `<base>_ORM_<hex>.ktx2` (a
  material's uniform rough/metal; **R=AO G=rough B=metal**, the glTF convention KSA's
  `MeshIndirect.frag` documents), and `<base>_BaseColor_<hex>.ktx2` (picked colors).
- **Materials are shared, Core-style**: identical resolved channel sets intern into ONE
  `<PbrMaterial>` referenced by many SubParts (`flexo_<MatName>_<hex>_Material` when a
  mesh renders its `CustomMaterial` verbatim, `<subPartId>_Material` otherwise). KSA
  dedupes material ids the same way it dedupes PartModels, so ids stay project-unique.

The user-facing model (`CustomMaterial` in `ksa/types.ts`): `baseColor`
(color|image), `metalness`/`roughness` (value|grayscale map), optional `occlusion`
map, optional pre-packed `ormPacked` (overrides the three), optional `normal`
(+`strength`, baked into RG on export — KSA's `<Normal Power>` is dead for parts).
Grayscale maps pack into one ORM image at export (`packOrmLevel`); a face's own
texture still overrides the material's base color on that face. Emissive/glow stays
per-mesh (below). Editor rendering resolves the same way (`resolveMaterialChannels`
in customAssetStore → `applyMaterialChannels` in MaterialFactory), so the viewport
IS the export preview.

### Normal maps — KSA convention, no tangents needed

KSA decodes part normals as RG-only, **X-flipped**, Z-reconstructed, with the TBN
derived from screen-space derivatives (`SharedFrag.glsl getNormalFromMap_ShaderX` +
`cotangent_frame`) — so exported GLBs need **no TANGENT attribute**. Uploads use the
standard OpenGL/glTF convention; `channelTransforms.ts` flips X at encode (strength ≠ 1
regenerates from source with RG scaled about the midpoint), and the editor previews
through the same KSA-replica shader patch, so editor == game by construction.

## Export layout (mirrors KSA Core)

```
flexo-parts/
  mod.toml                          # assets = [ "...Part.xml", "...GameData.xml", "...Assets.xml" ]
  <Name>Part.xml                    # placements; custom SubParts via InstanceOf="<subPartId>"
  <Name>GameData.xml
  <Name>Assets.xml                  # <MeshAtlas> + <PbrMaterial>(s) + <SubPart>(s, each with a <MeshView>)
  Meshes/<Name>_MeshAtlas.glb       # one geometry GLB; per subpart: render mesh + <id>_VM view mesh
  Textures/<tex>_<id>_Diffuse.ktx2  # one per referenced custom texture (deduped)
  Textures/<Name>_FlatNormal.ktx2   # shared synthetic normal (when any subpart is textured)
  Textures/<Name>_NeutralORM.ktx2   # shared synthetic ORM   (when any subpart is textured)
```

Example `<Name>Assets.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<Assets>
    <MeshAtlas Path="Meshes/MyMod_MeshAtlas.glb" />
    <PbrMaterial Id="flexo_Panel_ab12cd_Material">
        <Diffuse Path="Textures/dean_tex_xy_Diffuse.ktx2" Category="Vessel" />
        <Normal Path="Textures/MyMod_FlatNormal.ktx2" Category="Vessel" />
        <AoRoughMetal Path="Textures/MyMod_NeutralORM.ktx2" Category="Vessel" />
    </PbrMaterial>
    <SubPart Id="flexo_Panel_ab12cd">
        <PartModel>
            <Mesh Id="flexo_Panel_ab12cd" />
            <Material Id="flexo_Panel_ab12cd_Material" />
        </PartModel>
        <MeshView>
            <Mesh Id="flexo_Panel_ab12cd_VM" />
        </MeshView>
    </SubPart>
</Assets>
```

`mod.toml`'s `assets` lists only **XML** files; meshes/textures are referenced by
relative `Path` from the Assets XML (Core does the same). `<Mesh Id>` equals the
named mesh inside the GLB. An untextured SubPart emits no `<PbrMaterial>` / `<Material>`
but **still** emits a `<MeshView>` (pickability is independent of texturing).

### View meshes (pickability)

A placed SubPart that has only a `<PartModel>` renders fine but is **invisible to the
in-game vehicle editor's mouse picking** — you can't hover, click-to-reselect, or open
its context menu. KSA's `Part.RayCastEgoSubPart` (decompiled, `thirdparty/ksa/KSA/Part.cs`)
bails immediately unless the SubPart carries a `MeshViewModule`, which is built only from
a `<MeshView>` element. The raycast then runs a watertight triangle test against that
view mesh's vertices (`MeshReference.PositionCompare`).

So every custom SubPart emits a `<MeshView>` pointing at a `<id>_VM` mesh, and
`buildMeshAtlasGlb` writes that `_VM` mesh into the atlas (same geometry as the render
mesh — flexo primitives are low-poly, so a separate simplified hull buys nothing). Every
built-in Core SubPart ships a distinct `_VM` mesh; this mirrors that exactly. The `_VM`
node must be a **distinct** geometry instance in the GLB, or `GLTFExporter` dedupes it
with the render mesh into a single glTF mesh and KSA registers only one name.

## Tests

- `src/ktx/encodeKtx2.test.ts` — KTX2 container/header.
- `src/ksa/exportGlb.test.ts` — guards the mesh-naming regression (asserts both
  `meshes[i].name` and `nodes[i].name` are set; checks 4-byte GLB alignment).
- `src/ksa/assetsXmlSerializer.test.ts` — Assets XML shape.
- `src/ksa/modExport.test.ts` — bundle/zip/folder output.

## Emissive (glow) + visor surface

Shipped (see `plans/FEATURE_EMISSIVES_PLAN.md`). Per-mesh **glow**, and for the kitten **visor** a
translucent **glass tint** — authored in the per-mesh panel (`ManageTexturesPanel` + the
`GlowPaintDialog` paint canvas), previewed live, exported faithfully.

**How KSA renders it (verified against the decompiled shaders):**
- Opaque `<PartModel>` (`MeshIndirect.frag`) samples a **grayscale emissive mask** (`.x`) and ADDS
  it as WHITE light × `EMISSIVE_MULTIPLIER` (1.25) after lighting. There is **no per-material
  emissive color**, so the glow COLOR must live in the **diffuse** at the glowing texels (we
  composite color into the diffuse; the mask is where/how-much). See `src/ktx/glowComposite.ts`.
- Translucent `<PartModelGlass>` (`MeshGlassIndirect.frag`) hard-codes opacity ~0.75, derives only
  ~10% of its color from the diffuse, and **never samples emissive**. So **glass can't glow**, and
  its tint reads subtle/dark in-game.

**The model:**
- **Glow** (`CustomMesh.emissive: EmissiveConfig`): `whole` (uniform color + strength) or `painted`
  (RGBA bitmap in IndexedDB under `assetKeys.emissivePaint`). On every primitive, kitten submesh
  AND imported mesh. Exports a composited `*_Diffuse.ktx2` (color baked in) + `*_Emissive.ktx2`
  (white mask) + `<Emissive>` in the Assets XML.
- **An IMPORTED emissive reuses `'painted'`** rather than adding a shape of its own: a glTF
  `emissiveTexture × emissiveFactor` composes to exactly what `'painted'` already models — an RGBA
  bitmap whose `rgb` is the glow colour and whose `a` is the intensity. So `glowBitmapFor()`,
  `compositeGlow()`, the editor material and the exporter all work unchanged, and an imported glow
  can be retouched in the existing paint dialog. (`plans/IMPORT_MODELS.md` §3.4 originally proposed
  a new `'map'` shape; the reuse is strictly less code for the same result.)
- **A synthesised base is sized to the glow.** `compositeGlow` outputs at the BASE's resolution, so
  a colour-only (or kitten) material's 4×4 solid would have collapsed a 2048² painted/imported glow
  to 4×4. `glowComposite.baseSizeFor(glow)` gives both resolvers (`customAssetStore.faceBaseImage`,
  `modExport.exportBaseImage`) the glow's dimensions — a uniform colour has no intrinsic resolution,
  so generating it larger costs nothing and loses nothing.
- **Visor surface** (`CustomMesh.surface`, only on a `transparent` kitten submesh — the visor):
  `glass` (translucent, tintable via `GlassConfig` → a solid sRGB diffuse on the `<PartModelGlass>`
  path), `glow` (opaque emissive `<PartModel>`), or `glassGlow` (layered — export `expandGlassGlow`
  emits a glass shell + an inset opaque emissive layer, two SubParts at one transform, KSA's own
  window pattern). A **"Simulate in-game glass"** editor toggle (`$simulateGlass`) previews the
  muted in-game look.

Kitten `.ktx2` can't be CPU-decoded (they load only via the GPU `KTX2Loader`), so a tinted/glowing
kitten submesh uses a **solid generated diffuse** — it drops the kitten texture under the glow/tint
(fine: KSA glass mutes detail anyway, and "whole glow" means the mesh glows a color).

## Current scope — remaining limitations

Full PBR materials ARE shipped (base color / metal / rough / AO / packed ORM / normal
+ per-mesh glow) — see `plans/CUSTOM_TEXTURES_PLAN.md` for the analysis behind the
design. Still deliberately out of scope:

- **Per-face textures export lossily.** The editor renders a different texture per
  face, but KSA gets ONE material per SubPart — export uses the first textured face
  (the ManageTexturesPanel warns when faces mix textures). Faithful export would need
  one SubPart per face group.
- **ThinFilm (heat effects)** — the fifth PbrMaterial slot. It's a packed mask
  (R = re-entry iridescence, G = heat glow, B = frost) driven by runtime temperature
  and plumbed only through `<PartModelDynamic>`; invisible on a bench part. See the
  plan's Phase 3.
- **Uncompressed RGBA8 + Zstd**, not block-compressed — larger VRAM than BC7. The
  preferred future route is UASTC + a `.toml` sidecar (`scblockformatfamily` → BC7);
  KSA transcodes UASTC natively (its own `_TFI_Heat.ktx2` files prove the path), but
  the no-sidecar default target is uncompressed Rgba32, so the sidecar is required
  for the VRAM win.
- **Four primitives** (box / cylinder / sphere / plane) **+ imported glTF models** — no CSG,
  no mesh editing in flexo. Imported models now carry their real glTF surfaces (see **Imported
  materials** above); their **mod export** is the next phase
  ([plans/IMPORT_MODELS.md](../plans/IMPORT_MODELS.md) Phase 3), as are the import dialog
  (preview / options / warnings) and re-import.
- **Generated mesh GLBs not persisted** — regenerated from params each session (fine; cheap).
  Imported model GLBs are the exception (see `assetDb.ts` above).
- **No per-project namespacing in IndexedDB** — all assets share one store (OK for
  the current single-active-project model).
- **Emissive masks export full-res** — KSA's own are 128–512 px BC4; shrinking painted
  masks on export is an easy byte win.

## Pending in-game verification

- **UNORM/linear re-tag (double-gamma fix):** export a gray-swatch strip
  (0/25/50/75/100% + a mid-tone color) next to a Core part and compare mid-tone
  brightness. Revert point: the vkFormat mapping in `encodeKtx2.ts`.
- **Red metallic button:** primitive + material (base color red, metal 1, rough
  ~0.15) → shiny red metal in-game; two meshes sharing the material must both render
  (shared `<PbrMaterial>`).
- **Normal-map orientation:** an asymmetric bump texture (arrow/dome) — confirm the
  X-flip convention reads correctly in-game.
