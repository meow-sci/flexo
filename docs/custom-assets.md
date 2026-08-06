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
unchanged. Geometry, materials/textures, mod export, the import dialog (preview / options /
warnings) and **re-import in place** are all shipped. **The user-facing reference for that
feature is [importing-models.md](importing-models.md)** (Blender recipe, the glTF→KSA
mapping, the warning catalog, the limits); this doc covers only the shared machinery it
rides on. Design + evidence: [plans/IMPORT_MODELS.md](../plans/IMPORT_MODELS.md).

The design rationale and format research live in
[plans/done/FLEXO_CUSTOM_ASSETS.md](../plans/done/FLEXO_CUSTOM_ASSETS.md). This doc is the
maintenance reference for the shipped code: what each module does, the decisions
baked into the on-disk formats, and the deliberate v1 shortcomings.

Related: [importing-models.md](importing-models.md) (importing a Blender model as SubParts),
[texturing.md](texturing.md) (how KTX2 loads/renders),
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

export ─▶ buildMultiCustomBundle() ─▶ Assets.xml + Meshes/*.glb + Textures/*.ktx2
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
  - Container tags are **always `VK_FORMAT_R8G8B8A8_UNORM` (vkFormat 37) + linear transfer**,
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
  `releaseImportAtlas(importId)` drops ONE batch (used by `removeImport`);
  `clearImportAtlases()` drops them all on project switch.
- **`customAssetStore.importModelAsMeshes()`** — commits a normalized import as ONE undo
  step: a layer named after the file, every imported texture + material, one
  `CustomMesh{imported}` per group, one placement per instance. **Every binary is written
  first** (the atlas GLB, each texture's source + `.ktx2`, each glow bitmap), then a single
  `mutate()` appends all the descriptors — both because `mutate()` is one undo entry each,
  and because the rebuild it triggers resolves geometry/textures/glow out of those binaries.
  The non-mutating halves it needs are `createTextureAsset()` and
  `buildCustomMaterialDescriptor()`; `addCustomTexture`/`addCustomMaterial` are thin
  wrappers over them.
- **`customAssetStore.removeImport(importId)`** — the inverse: ONE undo step removing every
  SubPart of that batch, their placements, the assets it leaves behind, and its layer when
  the batch was the only thing on it. `planImportRemoval(part, importId)` computes the
  inventory (and feeds the confirm dialog's counts) — see **Removing an import** below.
- **`customAssetStore.replaceImport(importId, normalized, opts, materialPlan?)`** — the
  iteration loop: swap one batch's geometry for a re-export, in place, as ONE undo step. See
  **Replacing an import** below.

#### Replacing an import (re-import) — identity is preserved, arrangement is not touched

"Replace…" — on a batch header in the Asset Manager, or in Surface mode's Imported section —
opens the **same** Import Review dialog in replace mode
(`$importModelRequest.replaceImportId`); its Review view shows the match summary before
anything is committed.

**Matching rule: `(imported.sourceNode, imported.sourceMaterial)`** — the Blender object name ×
the material on it (`matchImportedMeshes()`, shared by the dialog's preview and the commit).
That pair is the only identity glTF carries across exports: mesh/material *indices* reshuffle
on every edit, and flexo's own `subPartId` embeds a random suffix minted at import time.

| Outcome | What happens |
| --- | --- |
| **matched** | The existing `CustomMesh` keeps its `id` **and `subPartId`**, so every placement, SubPart GameData block, animation membership, connector reference and layer assignment survives. Only `imported` is rewritten (new `importId`/`meshName`/`sourceFile`/`triangles`/`vertices`); the display name and the "render as glass" flag are the user's, and stay. **Its placements are left exactly as arranged** — the file's node transforms are NOT re-applied. More copies in the new file than the project has placements ⇒ only the surplus is added; fewer ⇒ the extras are left alone. |
| **added** | A new `CustomMesh` + its placements, on the batch's existing layer. |
| **removed** | The new file has no geometry for it, so the SubPart and its placements go (a `<SubPart>` pointing at a mesh name the atlas no longer defines is a dangling reference). Named explicitly in both the review step and the report. |

**"Update materials from file" (default on)** decides whether the new file's textures /
materials / glow are created and assigned, or whether matched SubParts keep the material and
glow they wear today (off = material edits made in flexo survive; nothing is encoded and
nothing is collected). With it on, a matched SubPart whose new material doesn't emit also
loses the glow the previous file gave it.

Because a replaced mesh keeps its original `subPartId` while its geometry lives under the new
file's generated name, **`imported.meshName` is the only truthful mesh lookup key** — it is
what `CatalogSubPart.meshNodeName`, `getImportedGeometry()` and the export bundle builder all
use.

Binaries follow `removeImport`'s contract: the new GLB is written before the mutation, the old
batch's GLB + every collected texture is deleted after, and `releaseImportAtlas()` frees the
old blob URL — so **undo restores the descriptors, not the bytes**.

#### Removing or replacing an import — reference-counted, not provenance-tagged

Imported textures and materials are ordinary flexo assets, so "which material came from this
file" stops being true the moment the user re-assigns one. `planOrphanedAssets()` — shared by
`planImportRemoval()` and `replaceImport()` — therefore garbage-collects by **reference
counting over the post-change document**: the candidates are the assets the released meshes
were *using*, and a candidate is collected only when nothing that remains references it.

- a **material** is collected when the batch's meshes wore it and no surviving mesh does;
- a **texture** is collected when a collected material's channel (or a removed mesh's face)
  pointed at it and no surviving material channel / mesh face does;
- an asset the user created and never assigned is **never** a candidate;
- the **layer** goes only when it holds no placement, connector or kitten afterwards.

**Undo restores the document, never the bytes.** The batch's `import-glb:<importId>`, each
collected texture's `tex-src:`/`tex-ktx2:`, and each removed mesh's `emissive-paint:` are
deleted from IndexedDB outright, and `releaseImportAtlas()` revokes just that batch's blob URL
(`clearImportAtlases()` is the project-switch, all-or-nothing one). This mirrors
`removeCustomTexture`'s long-standing contract, and unlike a primitive there is no regenerable
source — so the confirm dialog says it in as many words before the user commits.

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

- **`src/ksa/assetsXmlSerializer.ts`** — `serializeAssets(plans: AssetsPlan[]) → string`.
  Emits the `<Assets>` doc that **defines** custom SubParts (mirroring Core's `*Assets.xml`),
  one plan per exported part and all of them as siblings in ONE file: per plan a
  `<MeshAtlas>`, one `<PbrMaterial>` per textured SubPart, one `<SubPart>` per custom mesh.
  Reuses `partXmlSerializer`'s `prettyXml`. Only custom SubParts actually placed are emitted —
  built-in/Core SubParts are owned by KSA Core and must **not** be re-declared. `claimId`
  throws if two plans ever declare the same `<SubPart>`/`<PbrMaterial>` id, which KSA would
  silently collapse onto the first.

### State / orchestration

- **`src/state/customAssetStore.ts`** — the one place that ties document descriptors
  (`EditingPart.customTextures` / `customMeshes`) to (a) IndexedDB binaries, (b)
  runtime `blob:` URLs, and (c) the synthetic `$customCatalog` entries the renderer
  consumes. Actions: `addCustomTexture`, `removeCustomTexture`, `addCustomMesh`,
  `updateCustomMesh`, `removeCustomMesh`, `makeKittenMeshPart`, `importModelAsMeshes`,
  `removeImport`, `setMeshTransparent`, `hydrateCustomAssets`. All document
  mutations go through `mutate()`, which calls `pushUndo()` — so custom assets
  **enroll in undo/redo** (see [editor-state.md](editor-state.md)). Re-hydrates on
  every `$currentProjectId` change (ids are unique, so two projects sharing a display name can
  no longer skip the re-hydrate). Diffuse `blob:` URL is the catalog cache key
  (`materialId` left undefined) so replacing a texture busts `MaterialFactory`'s cache.
- **`src/state/assetDb.ts`** — tiny promise-wrapped IndexedDB key→Blob store
  (`flexo-assets`/`blobs`). `putAsset`/`getAsset`/`deleteAsset` + `assetKeys`, whose helpers
  now take `(projectId, id)` and build a **project-namespaced** key:
  `pa:<projectId>:<kind>:<assetId>`, where kind is `tex-src`, `tex-ktx2`, `mesh-glb`,
  `import-glb` or `emissive-paint`. This module is the only place a blob-key literal appears,
  and nothing outside it opens the database. The prefix makes each project's bytes one range
  query, which is what the three lifecycle helpers are: `listProjectBlobs(projectId)`,
  `copyProjectAssets(from, to)` — so a project's binaries **follow it through Duplicate**, asset
  ids unchanged (the namespace makes them collision-free, so no descriptor is rewritten) — and
  `deleteProjectAssets(projectId)`, so deleting a project **sweeps its blobs** instead of
  leaking them. `purgeUnprefixedAssetKeys()` runs once at boot and discards any key without a
  `pa:` prefix (v1 blobs whose project no longer exists), reporting the count in a warning
  notification. Binaries are too big for the project snapshot, so
  only lightweight descriptors persist there; the bytes live here. **Generated mesh GLBs
  are not persisted** — they're cheap to regenerate from the primitive params. **Imported
  model GLBs are** (`import-glb:<importId>`, one per import batch): nothing can regenerate
  imported geometry, so that file is the only copy. Deleting an imported mesh therefore
  does *not* delete the batch GLB (undo must restore it, and its sibling SubParts still
  read from it) — reclaiming it is an explicit user action. `ASSET_KINDS` / `assetKeyFor` /
  `parseAssetKey` are the runtime-kind half of the same ownership: the `.flexo.tar.gz` archive
  lays every blob out as `assets/<kind>/<assetId>` and reads them back through those three,
  so the container never spells a key of its own.

  **Leaving the project.** A project archive carries these binaries verbatim (see
  [projects.md](projects.md)): on import as a NEW project they are adopted under the new
  namespace with their ids unchanged, and on a MERGE they get fresh ids — a byte-identical
  texture instead dedups onto the one already there (SHA-256 over the `tex-src` bytes, cached on
  the descriptor as `CustomTexture.sha256`), while meshes and import batches never dedup because
  identity is load-bearing. A primitive mesh needs no blob at all, so it travels on its
  `PrimitiveSpec` alone; an imported mesh cannot travel without its batch GLB and is dropped —
  with its placements — when the container did not bring it.

### Export plumbing (`src/ksa/modExport.ts`)

- `buildMultiCustomBundle(content, kittenTex?, {signal}?)` — the orchestrator, over the
  `MultiModContent` that `buildMultiModContent` planned. Per included part it builds that
  part's combined mesh-atlas GLB (one node per *placed* custom mesh), pulls each referenced
  diffuse `.ktx2` from IndexedDB (deduped by texture id) and synthesizes the shared Normal/ORM
  textures (see below); it then serializes every part's plan as siblings into ONE
  `<Base>Assets.xml` and returns `{ assetsFile, assetsXml, binaries }`. Parts are built
  **sequentially**, so a cancelled preview stops at the next part boundary. Binaries dedupe by
  path and a repeat must be **byte-identical** (only a verbatim-bundled kitten texture can
  repeat) — differing bytes at one path throw rather than let one part overwrite another.
- Geometry is resolved per `meshKind(m)` — primitives rebuild from their params, kitten
  submeshes clone the shared bake, and **imported meshes clone
  `getImportedRawGeometry()`**: the untangented, still-indexed copy of the import batch's
  GLB. Never the editor's `MeshAtlasCache` geometry — MikkTSpace de-indexes it and KSA
  draws/picks nothing without `indices`. A mesh whose geometry can't be resolved is
  skipped from BOTH the atlas and the Assets XML (with a warning) rather than shipped as
  a `<SubPart>` pointing at a `<Mesh Id>` that doesn't exist.
- **What an imported SubPart ships:** one node in the shared `Meshes/<Name>_MeshAtlas.glb`
  named `<subPartId>`, a decimated `<subPartId>_VM` picking mesh beside it (see *View
  meshes* below), one `<PbrMaterial>` built from its `CustomMaterial` — base-colour map or
  1×1 solid, `<Normal>`, `<AoRoughMetal>`, plus `<Emissive>` + a composited diffuse when it
  glows — and a `<SubPart>` wiring `<PartModel>`(or `<PartModelGlass>` when
  `imported.transparent`) → `<Mesh>` + `<Material>` + `<MeshView>`. Imported meshes have no
  per-face texture grid, so they take the "material verbatim" interning path: **N meshes
  sharing one `CustomMaterial` ship ONE `<PbrMaterial>`**, which is how a multi-object
  Blender import stays cheap.
- `buildModZip(parts, projectName, kittenTex?, catalog?)` /
  `writeModToFolder(modsDir, parts, projectName, kittenTex?, catalog?)` — both take the
  project's included parts as `NamedExportPart[]`, run `buildMultiModContent` +
  `buildMultiCustomBundle`, and lay the binaries out under `Meshes/` + `Textures/` (+
  `Animations/`). The FS-Access path is non-destructive for XML (suffixes on collision) but
  **overwrites binaries** deterministically.
- **One mod, N parts, one atlas each.** Every included part with custom meshes contributes its
  own `<MeshAtlas>` to the shared `<Base>Assets.xml`; multiple atlases per file are legal
  because KSA registers GLB meshes by NAME into one global first-wins registry. That is also
  why every id here — mesh names, `_VM` names, `<SubPart>`/`<PartModel>`/`<PbrMaterial>` ids —
  must be unique across the whole PROJECT, not per part; `assetsXmlSerializer.claimId` throws
  if one ever repeats. See [scope/part-and-subpart-xml.md](../scope/part-and-subpart-xml.md)
  ▸ *Multi-part export*.

#### Interior-only meshes (`<Internal>`)

A custom mesh can be marked **interior-only**, so it renders in KSA's IVA camera and nowhere
else — that is how you build a cockpit interior out of your own geometry. It needs **no export
variant**: `assetsXmlSerializer` already declares the SubPart, so it simply emits
`<Internal>true</Internal>` inside that mesh's own `<PartModel>` when
`resolveInternal(part, subPartId, undefined)` says so. The flag is set from the same
**Interior (IVA only)** menu built-in props use, and it is per SubPart **template** (which, for
a custom mesh, is one mesh) — see [iva-seats.md](iva-seats.md).

**A glass mesh can never be interior-only.** `<PartModelGlass>` has no `<Internal>` field —
there is exactly one `[XmlElement("Internal")]` in the whole decomp, on `PartModelModule` — so
the plan's `internal` is forced `false` on the glass path (a `kitten.transparent` visor in a
`glass`/`glassGlow` surface, or an `imported.transparent` mesh), the UI disables the toggle
with a tooltip rather than silently ignoring it, and export validation warns as a backstop. A
layered `glassGlow` visor counts as glass **whole**: marking only half of a two-SubPart surface
interior-only is worse than not offering it.

### UI (`src/ui/`)

All three creation dialogs are mounted once by `shell/DialogRoot.tsx` and opened by a command
— from the **Add** menu, the ⌘K palette, or the Asset Manager's `＋ New ▾`. None of them is
owned by a trigger button.

- `CustomTextureDialog.tsx` (dialog id `'upload-texture'`, **Add ▸ Upload Texture…**) — image
  upload (picker / drag-drop / paste) + a channel
  picker ("This image is…" — base color / normal / grayscale / packed ORM) + encode.
- `MaterialDialog.tsx` (dialog id `'material'`, **Add ▸ New Material…**) — create/edit a
  `CustomMaterial`: presets, base color
  (picker ⟷ image), metal/rough sliders, advanced maps (normal + strength, AO,
  packed ORM, grayscale rough/metal), and a live PBR preview sphere under the same
  RoomEnvironment/tonemapping as the viewport.
- `CreateMeshDialog.tsx` (dialog id `'create-mesh'`, **Add ▸ Primitive Mesh…**) — primitive
  picker, params, material + texture assignment.
- **Surface mode** (`5` / the mode switcher / "Edit Surface →" from Build) — the per-mesh
  surface editor, and the only one. Its RIGHT sidebar (`src/ui/surface/SurfaceSidebar.tsx`)
  is the mode primary: a pinned **mesh picker** listing every `CustomMesh` — primitives,
  imported SubParts AND kitten submeshes — with a kind chip, its placement count and a ⚠ chip
  on templates placed zero times (those are silently not exported), a `＋` per row that adds
  an instance, and a `＋ New Mesh ▾` menu. Below it, the picked mesh's editor as sections,
  gated on `meshKind()`: **Identity** (rename + the read-only `subPartId` + live primitive
  dimension fields — the v1 store-only gap), **Material** (assign / edit / new, plus the
  first-face-texture-wins warning), **Faces** (the chip row; primitives with >1 face key),
  **Glow (emissive)**, **Visor surface** (a `kitten.transparent` visor), and **Imported** (a
  read-only provenance block — file / object / material / triangles / vertices — the
  **Render as glass** switch, and `Replace… / Remove import…`).
  Its LEFT sidebar (`SurfaceLeftPanel.tsx`) is the focus editor: the **Face card** (texture,
  wrap, UV scale/offset, Copy to all faces, Clear face) for the selected face, the standard
  Build selection inspector beneath it, and a read-only **Built-in surface** card when the
  selection is a Core SubPart.
- `assets/AssetManagerDialog.tsx` — the **Asset Manager** (`⇧⌘A`, Window ▸ Asset Manager…):
  one overlay over textures, materials, meshes and import batches, with a per-kind category
  rail (no conflated count), fuzzy search, grid/list, sort, thumbnails from the shared
  offscreen renderer (`src/three/assetThumbs.ts`), where-used chips from the `$assetUsage`
  selector, an **⚠ Unused** review filter, and per-item detail views. **Imported models**
  groups by batch: a header card with file name, SubPart / placement / texture / material /
  triangle totals and the stored GLB size, carrying **Replace…** and **Remove import…** (the
  latter confirmed with the exact inventory `planImportRemoval()` computed plus the byte
  warning). Creation, per-item detail and every tier-3 confirm are **pushed views of one
  `DialogViewStack`** — never a second modal; Import Model and Make Kitten Mesh are jumps.
- `assets/ImportReviewDialog.tsx` — **Import Review** (dialog id `'import-review'`): three
  views in one dialog — _Drop_ (drop zone + file picker + the "How to export from Blender"
  recipe), _Review_ (3D preview, stats, warnings, options) and _Importing_ (phase line +
  indeterminate bar, undismissable). **Nothing touches the document until the user
  confirms**: the file is parsed and analyzed in memory, and cancelling leaves no trace. Its
  payload — the picked files and any replace target — rides `$importModelRequest`, whose id
  changes on every open so the body remounts with fresh per-import state.
  - The Review view re-runs `analyzeImport()` on every scale / up-axis change — cheap, since
    it walks the already-parsed scene graph and never re-reads the file — while the
    expensive `planImportMaterials()` (image decodes) runs ONCE per (model, texture cap) and
    is handed straight to the import, so nothing is decoded twice.
  - **Stats**: SubParts / placements / materials / triangles / vertices / textures, the
    **measured bounding box in metres** (the wrong-units check), estimated mod size and
    **estimated in-game VRAM** — the last one because flexo's KTX2 is uncompressed RGBA8 +
    Zstd, so each texture costs `w·h·4·4⁄3` bytes resident (a 4096² map ≈ 85 MB). Both
    numbers come from `src/ksa/importEstimates.ts` (pure, unit-tested: image-header size
    reads, the cap, the VRAM/mod formulas, warning grouping + severities, scale presets).
  - **Warnings** are `ImportPlan.warnings` + the material plan's, grouped by subject and
    styled by severity, each with its plain-English remedy.
  - **The options are split into two labelled groups**, which is the structural fix for the
    leftover-scale trap: **"This import only"** (name prefix, scale with an amber `≠1` badge
    and the `SCALE_PRESETS` buttons, bake transforms, make double-sided, merge, and in
    replace mode "Update materials from file") resets on every open; **"Saved preferences
    📌"** (up axis, max texture size, bake scale, decimate view meshes) reads and writes
    `$modelImportSettings`, and its decimate toggle is captioned "affects export" with a
    deep-link to its single editable home, Settings ▸ Import & Export.
  - **Replace mode** (`$importModelRequest.replaceImportId`) adds the match summary to the
    Review view (kept / new / removed, with the removed SubParts named) and the **Update
    materials from file** switch; merging is not offered, since collapsing everything into
    one SubPart could not preserve a single existing identity.
- `GlowPaintDialog.tsx` — the 512² glow paint canvas (dialog id `'glow-paint'`): soft radial
  stamps painted through the ramp, a composited-diffuse underlay, per-stroke `⌘Z`/`⇧⌘Z` undo
  at hotkey scope `surface:glow-paint` (the DOCUMENT's undo is untouched — Apply is the one
  document step), a live 3D preview on stroke end through the shared `glowComposite` path,
  and a dirty-discard confirm on Cancel/Esc.
- `settings/ImportExportSettings.tsx` — **Settings ▸ Import & Export**, the single editable
  home for the four sticky import preferences (up axis, max texture size, bake scale,
  **decimate view meshes — labelled "affects export"**) and the kitten texture export mode +
  Content/Core path.
- `ExportKsaDialog.tsx` — **File ▸ Export to KSA…** (`⌘E`). Two things here matter to custom
  assets. Its **Inspect XML ▸ Assets** tab is the only place `buildMultiCustomBundle` runs for a
  preview, and it runs **only when that tab is focused** — v1 re-encoded every KTX2 on every
  document change for as long as the dialog was open. Later changes flip a
  `Project changed — [Rebuild]` chip instead of re-encoding, and a rebuild aborts the previous
  chain through the `AbortSignal` `buildMultiCustomBundle` accepts
  (`src/state/exportPreviewStore.ts`; output bytes are unchanged). Its **Deliver mod** mode
  shows the kitten-texture mode and the `_VM` decimation switch as read-only chips deep-linking
  to Settings ▸ Import & Export, and its pre-flight lists custom meshes with **no placements**
  as an `info` row, because those are exactly the meshes the bundle builder skips (per part).
  Full description in
  [xml-io.md](xml-io.md#the-export-to-ksa-dialog).
- The **post-import summary** — a sticky *rich* entry in the notification center
  (`src/ui/status/ImportReportBody.tsx`, registered under the `'import-report'` kind in
  `notificationBodies.tsx`), posted by `customAssetStore.postImportReport()` from both
  `importModelAsMeshes()` and `replaceImport()`. It reports what was created (SubParts /
  placements / textures / materials), and for a replace the kept / removed counts with the
  **removed SubParts named**, plus the non-blocking warnings, and carries two actions —
  `[Open Asset Manager]` and `[Edit surfaces →]` (which jumps to Surface mode with the first
  imported mesh picked). A one-line status message could not carry that, so the flash beside
  it is only the one-line summary. The entry is sticky (survives "Clear all", dismissed only
  by its ✕) and each import posts its own, so the center keeps a history of the last imports.
- `ViewportDropZone.tsx` — wraps the 3D workspace so dropping a `.glb`/`.gltf` (or a
  multi-file `.gltf` set) opens Import Review straight on its Review view. Plain React drag
  handlers, not three.js: `dragover` must `preventDefault()` or no `drop` fires, drags with
  no file are ignored, and the affordance is a `pointer-events-none` overlay.
- `src/three/ModelPreviewViewport.ts` — Import Review's preview: the editor's
  environment/tonemapping + orbit, an adaptive power-of-ten-metre grid for scale, camera
  auto-framed on the bounding sphere. It shows the loaded glTF with **its own** materials
  ("is this oriented, scaled and split the way I meant?"); the accurate surface preview is
  the editor viewport after import, which renders the real KSA channels. It clones the
  scene (SkeletonUtils) and never disposes geometry/materials it doesn't own.
- entry points wired from the **Add** menu (`src/ui/commands/addCommands.ts`, rendered by
  `src/ui/menu/menuSpec.ts`) — including **Import Model…**, which opens Import Review on its
  Drop view, and **Make Kitten Mesh ▸**, which part-ifies a kitten, auto-switches to Build
  and flashes `<Kitten> meshes added ✓` with an `[Edit surfaces →]` action that lands on the
  visor. The Asset Manager's `＋ New ▾` and the Surface picker's `＋ New Mesh ▾` run the same
  command ids, so no entry point can diverge.

#### Import settings — sticky vs per-import

`$modelImportSettings` (`state/settingsStore.ts`, persisted) holds the four preferences that
describe a working style: **max texture size** (1024/2048/4096, default 2048 — it feeds
`decodeImage`'s `maxSize` for BOTH the dialog's estimate and the encoded `.ktx2`, so the
number shown is the number shipped), **up axis**, **bake scale into geometry** and
**decimate view meshes** (read by `modExport.viewMeshBudget` for the `_VM` budget).

Everything that describes ONE model stays dialog state and is deliberately NOT persisted:
scale factor, name prefix, make double-sided, bake transforms to origin, and merge. A 0.01
scale left over from a centimetre export would silently mis-size the next import.

"Merge into one SubPart" is offered only when the whole model uses a single material
(`canMerge()`) — a `<PartModel>` binds exactly one material, so merging across materials is
illegal, not merely undesirable. `normalizeImport()` bakes every group × instance into one
geometry with one identity placement, and falls back to an unmerged import with a
`mergeFailed` warning when the pieces' attribute layouts don't match.

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
                                    #   (primitive params, kitten bakes AND imported glTF geometry
                                    #    all land here; heavy <id>_VM meshes are decimated)
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
named mesh inside the GLB. Every SubPart also emits a `<MeshView>` (pickability is
independent of texturing).

**Every `<PartModel>` carries a `<Material>` — there is no "untextured" SubPart.**
`ThumbnailRenderResources.AddDraw` reads `Material.DiffuseReference` with no null guard,
over every registered part at startup, so omitting `<Material>` crashes the game before the
main menu (zero shipped Core PartModels omit one). A mesh that resolves no face texture, no
material and no glow gets a shared `<base>_NeutralMaterial` — a neutral-grey diffuse matching
the editor's untextured look, plus the usual flat-normal and neutral-ORM solids. The plan types
make `materialId` non-nullable so the omission is not expressible.

### View meshes (pickability)

A placed SubPart that has only a `<PartModel>` renders fine but is **invisible to the
in-game vehicle editor's mouse picking** — you can't hover, click-to-reselect, or open
its context menu. KSA's `Part.RayCastEgoSubPart` (decompiled, `thirdparty/ksa/KSA/Part.cs`)
bails immediately unless the SubPart carries a `MeshViewModule`, which is built only from
a `<MeshView>` element. The raycast then runs a watertight triangle test against that
view mesh's vertices (`MeshReference.PositionCompare`).

So every custom SubPart emits a `<MeshView>` pointing at a `<id>_VM` mesh, and
`buildMeshAtlasGlb` writes that `_VM` mesh into the atlas. Every built-in Core SubPart ships
a distinct `_VM` mesh; this mirrors that exactly. The `_VM` node must be a **distinct**
geometry instance in the GLB, or `GLTFExporter` dedupes it with the render mesh into a
single glTF mesh and KSA registers only one name.

**The view mesh is a CPU budget.** `MeshReference.Load` de-indexes it at mod load into
`PositionCompare` — one `double3` (24 bytes) **per index** — and `RaycastWatertight` is a
plain triangle loop over that array, run on every hover frame for every SubPart under the
cursor, finishing with a read of `MeshAttribute.Normal` at the hit vertex. flexo primitives
and kitten submeshes are tens to hundreds of triangles, but an **imported** model can be six
figures. So the bundle builder passes `viewMeshBudget: 2000` and `exportGlb` simplifies any
over-budget `_VM` with meshopt: the simplifier returns a **reduced index buffer over the same
vertex arrays**, so POSITION/NORMAL/TEXCOORD_0 ride along untouched, the mesh stays indexed,
and the render mesh is never modified. Picking precision is the only trade; if the simplifier
is unavailable the full-resolution copy ships with a `console.warn` (a slow hover beats a
failed export).

## Tests

- `src/ktx/encodeKtx2.test.ts` — KTX2 container/header.
- `src/ksa/exportGlb.test.ts` — guards the mesh-naming regression (asserts both
  `meshes[i].name` and `nodes[i].name` are set; checks 4-byte GLB alignment), the KSA glTF
  loader requirements (indices / float32 tight accessors / POSITION min-max / attribute
  stripping), and `_VM` decimation (a heavy node's view mesh shrinks, stays indexed, keeps
  its attributes; the render mesh doesn't move).
- `src/ksa/assetsXmlSerializer.test.ts` — Assets XML shape.
- `src/ksa/modExport.test.ts` — bundle/zip/folder output, including imported SubParts
  (atlas node + complete `<PbrMaterial>` + `<SubPart>`/`<MeshView>`, glow, the
  `<PartModelGlass>` route, shared-material interning, and a missing-geometry skip).
- `src/state/projectCodec.test.ts` / `projectTransfer.test.ts` — imported-descriptor
  round-trip, the v4-payload rejection, and the binary-asset export gate.
- `src/state/customAssetStore.test.ts` — the import commit (layer / meshes / placements /
  textures / materials / glow) and `removeImport`: the orphan GC keeps assets another mesh
  still uses and never touches an unassigned one, a second batch is untouched, and the batch
  GLB + purged texture/glow binaries leave IndexedDB.
- `src/state/editorStore.test.ts` — an import is ONE undo step, `removeImport` is ONE undo
  step (undo restores meshes, placements, materials, textures and the layer), and
  `setMeshTransparent` enrolls in undo.

## Emissive (glow) + visor surface

Shipped (see `plans/FEATURE_EMISSIVES_PLAN.md`). Per-mesh **glow**, and for the kitten **visor** a
translucent **glass tint** — authored in Surface mode's right sidebar (its Glow and Visor
surface sections + the `GlowPaintDialog` paint canvas), previewed live, exported faithfully.

**How KSA renders it (verified against the decompiled shaders — full write-up in
[analysis/KSA_EMISSIVE_AND_LUT.md](../analysis/KSA_EMISSIVE_AND_LUT.md)):**
- Opaque `<PartModel>` (`MeshIndirect.frag:276-287`) samples a **grayscale emissive mask** (`.x`)
  and ADDS it as WHITE light × `EMISSIVE_MULTIPLIER` (1.25) after lighting. There is **no
  per-material emissive color and no LUT slot**, so the glow COLOR must live in the **diffuse** at
  the glowing texels. Because the add happens after lighting, a glow reads **pure white in
  shadow** whatever the diffuse holds — that is a hard engine limit, not a flexo shortcoming.
- The only colored branch (`addEmissiveColor`, bit 7) is hard-wired to `Battery.HasStatusLight`
  and discards the mask value. **For colored light, add a `<Light>` with a `<Color>`** — it lights
  the part's own surface through the clustered pre-pass, which is how Core's light parts read
  colored. The glow panel's **"Add matching light"** button seeds one from the glow color.
- `<PartModelDynamic>` compiles `ENABLE_TEMPERATURE` instead of `ENABLE_EMISSIVE`
  (`PartModelRenderer.cs:111`/`:200`), so an `<Emissive>` on one is never sampled. flexo only
  emits `<PartModel>`/`<PartModelGlass>`, but ThinFilm heat can never coexist with a glow.
- Translucent `<PartModelGlass>` (`MeshGlassIndirect.frag`) hard-codes opacity ~0.75, derives only
  ~10% of its color from the diffuse, and **never samples emissive**. So **glass can't glow**, and
  its tint reads subtle/dark in-game.

**The model:**
- **Glow** (`CustomMesh.emissive: EmissiveConfig`): `whole` (one key over the whole mesh) or
  `painted` (RGBA bitmap in IndexedDB under `assetKeys.emissivePaint`). On every primitive, kitten
  submesh AND imported mesh. Exports a composited `*_Diffuse.ktx2` (color baked in) +
  `*_Emissive.ktx2` (grayscale mask) + `<Emissive>` in the Assets XML.
- **The bitmap's alpha is the greyscale KEY; `coverage` and `strength` interpret it independently**
  (`src/ktx/glowComposite.ts`):

  ```
  key        = glow.a / 255
  color      = ramp ? sampleGlowRamp(ramp, key) : glow.rgb
  diffuse[i] = lerp(base[i], color, key * coverage)   → <Diffuse>   (sRGB)
  mask[i]    = key * strength                         → <Emissive>  (linear, KSA reads R)
  ```

  One slider used to drive both, which made the only setting that reads colored in-game —
  saturated color with a gentle white core — impossible to author. Rule of thumb: coverage ~100%,
  emissive ~20–40%, plus a matching `<Light>`; the panel warns past 60%.
- **Color ramp (`GlowRamp`)** — flexo's equivalent of the 1-px gradient LUTs KSA keys its own
  effects through (`Textures/TemperatureLut.png`, sampled at `vec2(key, 0.5)`). Available on a
  `painted` glow: the greyscale falloff of a brush stamp runs THROUGH the gradient (dark rim → hot
  core) instead of fading one flat color out. Stops are editable, seedable from presets
  (blackbody / red→green status / cyan), and **importable from a gradient image** —
  `glowRampFromImage` reads the middle row across the full width, resamples to 256, and reduces to
  the fewest stops within 4/255 of the original (`src/ktx/glowRamp.ts`). Since KSA has no LUT slot,
  the ramp is **baked into the diffuse at composite time** and never ships.
- **An IMPORTED emissive reuses `'painted'`** rather than adding a shape of its own: a glTF
  `emissiveTexture × emissiveFactor` composes to exactly what `'painted'` already models — an RGBA
  bitmap whose `rgb` is the glow colour and whose `a` is the key. So `glowFor()`, `compositeGlow()`,
  the editor material and the exporter all work unchanged, and an imported glow can be retouched in
  the existing paint dialog. It lands at `coverage`/`strength` = 1 so the glTF material's own
  falloff (already in the alpha) passes through unscaled. (`plans/IMPORT_MODELS.md` §3.4 originally
  proposed a new `'map'` shape; the reuse is strictly less code for the same result.)
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
  (Surface mode's Material section warns when faces mix textures). Faithful export would
  need one SubPart per face group.
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
  no mesh editing in flexo. Imported models carry their real glTF surfaces (see **Imported
  materials** above), **export into the part mod** like any other custom SubPart (see *Export
  plumbing*), and can be **re-imported in place** after a Blender iteration (see *Replacing an
  import*). Their own limits — no alpha cutout, single-sided only, no morph targets, no glTF
  animation import, no vertex colours, no KTX2 source images, no LODs — are catalogued in
  [importing-models.md](importing-models.md#deliberate-limitations).
- **Imported models can't be shared as project JSON.** The data-only project export and the
  share link carry descriptors, not binaries, and an import batch's GLB in IndexedDB is the
  only copy of its geometry — so `hasCustomAssets()` gates those dialogs off exactly as it
  does for uploaded textures and primitive meshes. The compact codec (v5) *encodes* the
  imported descriptor losslessly, ready for a future bundle format.
- **Generated mesh GLBs not persisted** — regenerated from params each session (fine; cheap).
  Imported model GLBs are the exception (see `assetDb.ts` above).
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
- **Imported model mod:** export a two-material Blender `.glb` → the mod loads with no
  exception, both SubParts render with their textures/normals/glow, **hover + click + the
  context menu work on each piece** (the decimated `_VM` contract), the part thumbnail
  renders, and a multi-instance import shows every placement.
