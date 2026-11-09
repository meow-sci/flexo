# SubPart Catalog & Asset Loading

How flexo discovers the game's SubParts and resolves the GLB/texture files needed to
render them.

## Current Core content and resolution

KSA 5801 declares top-level `SubPart` rows. Renderable rows carry
`PartModel`, `PartModelDynamic`, or `PartModelGlass` components; `Mesh` and
`Material` use `Ref`. Some templates carry gameplay without any model. Part placements are `SubParts/SubPart` entries with a local `Key` and a
template `Ref`. Materials and textures are global rows, not file-local paths.

`coreFiles.ts` lists the relevant Core files in manifest order, including the
standalone fuel-port gameplay file and the global PartGameData file. Both Part
and SubPart loaders share the cached `loadCoreContent()` result. The prepass
flattens `Parent` inheritance only after all later patches have been collected,
then applies current `Patch`, `Replace`, `Remove`, `IfExists` and `Extend`
semantics. It rejects malformed content with an exception. KSA instead reports
individual errors and can continue with unaffected rows; flexo currently fails
closed at the catalog boundary. File-backed paths are resolved within the one
Core mod; multi-mod file ownership is not modeled here.

`vite/meshIndex.ts` reads GLB JSON chunks to map referenced mesh names to their
non-HostOnly atlas. `ksaAssets` serves the index in development and writes it on
build. The browser resolves each material's texture refs globally. Missing model,
material or texture refs fail the catalog rather than silently rendering an
unrelated atlas. `CatalogSubPart.models` preserves all native models and their
kinds; scalar fields mirror the first model for existing consumers. `raw` and
`components` retain the flattened template for export; `renderComponents` includes
MeshView. Metadata-only templates have `models: []`, an empty atlas URL and no mesh node. Their gameplay remains available to whole-Part import and export, while the visual SubPart picker and ICRP piece conversion exclude them. The editor and Part preview create an empty scene group without requesting geometry. Related-appearance metadata combines curated geometry matches with mutually exclusive
placements from explicit Part families. It is an editor convenience and does not assert a
game-defined SubPart family.

Whole Parts are also parsed from the flattened document, preserving every
concrete ID and its explicit valid ordered `Variants` references. A member
inherits its parent's final gameplay while retaining its own placements. The
preview manifest uses the same resolved Part catalog. Tests use byte-identical
Core XML fixtures and, when available, verify the current private asset mirror and
mesh index. No licensed binary assets are committed.

## Catalog in state — `src/state/catalogStore.ts`

- `$catalog` (atom), `$catalogLoading` (atom), `$catalogIndex` (computed map).
- `ensureCatalogLoaded()` loads once (idempotent); called from `App`'s effect.
- The SubPart browser dialog (`src/ui/build/SubPartBrowserDialog.tsx`, dialog id
  `'subpart-browser'`, **Add ▸ SubPart…**) reads `$catalog`; `EditorScene` reads
  `$catalogIndex` to build meshes.

## Mesh extraction — `src/three/MeshAtlasCache.ts`

`getSubPartGeometry(atlasUrl, nodeName)`:
- Loads the GLB via `GLTFLoader` (memoized per `atlasUrl`).
- `gltf.scene.getObjectByName(nodeName)` (or first mesh in the scene if `nodeName`
  is null), clones the mesh geometry, and bakes the node's world matrix so the
  SubPart sits at its authored local origin.
- Caches the resulting geometry per `atlasUrl#node`. **Shared across instances —
  never disposed per-instance.**

## Where SubPart geometry can come from

The Core catalog above is only one source. `$customCatalog` (see
[custom-assets.md](./custom-assets.md)) publishes **synthetic `CatalogSubPart` entries** for
user-authored SubParts, which flow through this exact same `atlasUrl` + `meshNodeName`
resolution — the only difference is that their URLs are `blob:` instead of `/ksa/`:

| Source           | `atlasUrl`                                | Geometry                                                |
| ---------------- | ----------------------------------------- | ------------------------------------------------------- |
| Core SubPart     | `/ksa/Meshes/*.glb`                       | `getSubPartGeometry(atlasUrl, meshNodeName)`            |
| primitive mesh   | the shared rebuilt atlas blob             | `buildPrimitiveGeometry` + baked face UVs               |
| kitten submesh   | the shared rebuilt atlas blob             | CPU bind-pose bake (`kittenBake`)                       |
| **imported model** | **that import batch's own GLB blob**    | `importedMeshCache` → `getSubPartGeometry` (same cache) |

An **import batch's normalized GLB is itself a mesh atlas** — one named mesh per imported
SubPart, exactly the layout above — so it is its own `atlasUrl` and its meshes resolve by
name (`imported.meshName`) through the same `MeshAtlasCache`. See
[importing-models.md](./importing-models.md).

## Where the asset files come from

`/ksa/...` is served in development and copied for production by the `ksaAssets()` Vite plugin from `KSA_ASSETS_DIR`; see [asset-pipeline.md](./asset-pipeline.md).

## Tests

`contentXml.test.ts` covers merge semantics and malformed input. `partCatalog.test.ts`
uses the vendored closure and verifies fixture bytes against the private mirror when
available. `corpus5801.test.ts` checks live mesh and material references, and
`previewManifest.test.ts` compares the browser and Node catalog results.

## Browsing families and appearances

The Part browser displays one row for each explicit Part variant family. Its Variant
selector chooses the concrete member for preview and import; searching an exact member
ID selects that member. Standalone Parts remain separate. The SubPart browser keeps renderable
IDs searchable and offers a Related appearances selector for verified geometry matches and mutually exclusive
placements in explicit Part families. Its
selection previews and adds that concrete template, including its own gameplay data.
These selections are dialog state, not stored variant links in the document. Each import
or Add remains one undo step.

All render models in a catalog SubPart appear together in the editor and both previews.
Custom meshes retain their per-face materials and geometry overrides.
