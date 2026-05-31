# Custom assets — user textures + primitive meshes

Lets a flexo user, entirely in-browser: upload an image → encode it to a KTX2
texture, create a parametric primitive mesh (box / cylinder / sphere / plane),
texture it, place/transform it like any built-in SubPart, and export the whole
thing as a KSA part mod that **loads and renders in the game** (validated in-game
2026-05-30).

The design rationale and format research live in
[plans/FLEXO_CUSTOM_ASSETS.md](../plans/FLEXO_CUSTOM_ASSETS.md). This doc is the
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

## Modules

### Texture encoding (`src/ktx/`) — the only place that knows the on-disk texture format

- **`decodeImage.ts`** — `decodeImage(blob, maxSize=2048) → DecodedImage`. Decodes
  any browser-supported image (PNG/JPG/WebP, file/drag-drop/paste) via
  `createImageBitmap` + a canvas, reads back RGBA8, downscales so the longest edge
  ≤ `maxSize` (respects the ~6 MP browser decode ceiling), and builds a full mip
  chain down to 1×1 by 2×2 box-filtering in sRGB space.
- **`encodeKtx2.ts`** — `encodeImageToKtx2(image, {srgb, zstd}) → Uint8Array`.
  Assembles a standards-compliant KTX2 via [`ktx-parse`](https://github.com/donmccurdy/KTX-Parse)'s
  `write()`. **This is the single chokepoint for the texture format** — a future
  BC7 swap touches only this file. Hand-builds the Data Format Descriptor (DFD) for
  a 4×8-bit RGBA texel (R/G/B at the chosen transfer function, A always linear).
  - `srgb: true`  → `VK_FORMAT_R8G8B8A8_SRGB` (43) + sRGB transfer (diffuse).
  - `srgb: false` → `VK_FORMAT_R8G8B8A8_UNORM` (23) + linear transfer (normal / ORM).
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
  `updateCustomMesh`, `removeCustomMesh`, `hydrateCustomAssets`. All document
  mutations go through `mutate()`, which calls `pushUndo()` — so custom assets
  **enroll in undo/redo** (see [editor-state.md](editor-state.md)). Re-hydrates on
  every `$projectName` change. Diffuse `blob:` URL is the catalog cache key
  (`materialId` left undefined) so replacing a texture busts `MaterialFactory`'s cache.
- **`src/state/assetDb.ts`** — tiny promise-wrapped IndexedDB key→Blob store
  (`flexo-assets`/`blobs`). `putAsset`/`getAsset`/`deleteAsset` + `assetKeys`
  (`tex-src:<id>`, `tex-ktx2:<id>`, `mesh-glb:<id>`). Binaries are too big for the
  localStorage `ProjectSnapshot`, so only lightweight descriptors persist there; the
  bytes live here. **Mesh GLBs are not persisted** — they're cheap to regenerate from
  the primitive params.

### Export plumbing (`src/ksa/modExport.ts`)

- `buildCustomBundle(part, base)` — generates the combined mesh-atlas GLB (one node
  per *placed* custom mesh), pulls each referenced diffuse `.ktx2` from IndexedDB
  (deduped by texture id), synthesizes the shared Normal/ORM textures (see below),
  and returns `{ assetsFile, assetsXml, binaries }`.
- `buildModZip` / `writeModToFolder` — both call `buildCustomBundle` and lay the
  binaries out under `Meshes/` + `Textures/`. The FS-Access path is non-destructive
  for XML (suffixes on collision) but **overwrites binaries** deterministically.

### UI (`src/ui/`)

- `CustomTextureDialog.tsx` — image upload (picker / drag-drop / paste) + encode.
- `CreateMeshDialog.tsx` — primitive picker, params, texture assignment, preview.
- `CustomAssetsPanel.tsx` — list/rename/delete textures + meshes.
- entry points wired from the **Add** menu (`AddButton.tsx`).

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

### Synthetic Normal + AoRoughMetal channels — REQUIRED, even for diffuse-only

KSA's thumbnail renderer (`ThumbnailRenderResources.AddDraw`) dereferences
`Material.NormalReference` **and** `Material.PBRMap` with **no null check**. A
`<PbrMaterial>` with only `<Diffuse>` throws a `NullReferenceException` at startup.

So even though v1 is diffuse-only, every emitted `PbrMaterial` carries all three
channels. `buildCustomBundle` synthesizes two shared **1×1 solid-color** linear KTX2
textures (`makeSolid1x1Ktx2`) whenever any subpart is textured:

- `<base>_FlatNormal.ktx2` — RGB (128,128,255) ≈ +Z in tangent space (flat normal).
- `<base>_NeutralORM.ktx2` — (AO=255, Rough=128, Metal=0), a neutral dielectric.

`serializeAssets` emits `<Normal>` / `<AoRoughMetal>` lines pointing at these when
`normalPath` / `aoRoughMetalPath` are present in the `AssetsPlan`.

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

## v1 scope — deliberate limitations

- **Diffuse only.** Normal / AoRoughMetal / Emissive are not user-authored; we emit
  synthetic flat-normal + neutral-ORM only to satisfy KSA's renderer (above). KSA
  `PbrMaterial` supports all four channels and built-in parts use all four.
- **One texture per whole mesh** via the primitive's default UVs — no per-face /
  multi-material texturing.
- **Uncompressed RGBA8 + Zstd**, not BC7/BC5/BC4 — larger VRAM, no byte-match to KSA.
- **Four primitives only** (box / cylinder / sphere / plane) — no imported/custom
  meshes, no CSG.
- **Mesh GLBs not persisted** — regenerated from params each session (fine; cheap).
- **No per-project namespacing in IndexedDB** — all assets share one store (OK for
  the current single-active-project model).

### Reaching full parity later

- **Full PBR channels:** add upload slots + encoder formats for Normal (BC5; needs the
  `normalMapPatch` decode + GLB tangents via `computeTangents`), AoRoughMetal (packed),
  Emissive (BC4); emit the matching lines in `assetsXmlSerializer`. (The synthetic
  Normal/ORM scaffolding already proves the multi-channel `<PbrMaterial>` path.)
- **BC7/BC5/BC4 block compression** to byte-match KSA + cut VRAM: swap **only**
  `src/ktx/encodeKtx2.ts` to a BC7 WASM encoder (e.g. a `bc7enc`/libktx WASM build).
  Container assembly (`ktx-parse`), mips, and Zstd stay.
- **Per-face / multi-material** texturing via geometry groups + multiple materials.
- **Basis-flavored KTX2** is an option only after confirming KSA's loader accepts it
  (it uses raw-BCn+Zstd for its own assets; basis acceptance is unverified).
