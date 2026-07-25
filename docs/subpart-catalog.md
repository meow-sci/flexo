# SubPart Catalog & Asset Loading

How flexo discovers the game's SubParts and resolves the GLB/texture files needed to
render them.

## What a SubPart is (KSA data model)

In KSA `*Assets.xml`, a `<SubPart Id="...">` template contains a `<PartModel>` with:
- `<Mesh Id="X"/>` — **X is the name of a node inside a GLB mesh atlas** (verified:
  the atlas GLB's glTF JSON has `nodes[].name === X`).
- `<Material Id="...">` — references a `<PbrMaterial>` declared in the same file,
  whose children (`<Diffuse>/<Normal>/<AoRoughMetal>/<Emissive>`) point at `.ktx2`
  texture atlases.

The file also declares `<MeshAtlas Path="Meshes/....glb"/>` — usually one default
(no `Id`) atlas per file; occasionally a named one (e.g. `circle_light.glb`).

Composite `<Part>` definitions list `<SubPart InstanceOf="templateId">` with
`<Transform>` — these are placements, not templates (no `<PartModel>`).

## Runtime catalog loader — `src/ksa/catalog.ts`

`loadCoreCatalog()` fetches a fixed list (`ASSET_FILES`) of Core `*Assets.xml` files
from `/ksa/...`, parses each with the browser `DOMParser`, and produces
`CatalogSubPart[]`:

```ts
interface CatalogSubPart {
  id: string                 // SubPart template id
  atlasUrl: string           // "/ksa/Meshes/....glb"
  meshNodeName: string | null// node name in the atlas (null = whole-atlas/named)
  materialId?: string
  diffuseUrl?, normalUrl?, aoRoughMetalUrl?, emissiveUrl?  // "/ksa/Textures/*.ktx2"
  sourceFile: string
}
```

Resolution rules per file:
- Collect the default `<MeshAtlas>` (no `Id`) + any named ones.
- Map `<PbrMaterial Id>` → its texture child `Path`s.
- For each `<SubPart>` **that has a `<PartModel>`** (templates only): take the
  `<PartModel><Mesh Id>`; if it matches a named atlas, `atlasUrl`=that atlas and
  `meshNodeName=null`, else `atlasUrl`=default atlas and `meshNodeName=<Mesh Id>`.
  Resolve the `<Material>` to texture URLs. Skip (warn) entries with no `<PartModel>`
  or no resolvable atlas.

`indexCatalog(entries)` builds an `id → entry` map.

## Catalog in state — `src/state/catalogStore.ts`

- `$catalog` (atom), `$catalogLoading` (atom), `$catalogIndex` (computed map).
- `ensureCatalogLoaded()` loads once (idempotent); called from `App`'s effect.
- The browser SubPart list (`src/ui/SubPartBrowser.tsx`) reads `$catalog`;
  `EditorScene` reads `$catalogIndex` to build meshes.

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

`/ksa/...` is served by the `ksaAssets()` Vite plugin in **dev only**, mapping
`thirdparty/ksa/Content/Core`. Production bundling requires extra work — see
[asset-pipeline.md](./asset-pipeline.md).

## Tests
`src/ksa/catalog.test.ts` parses real Core XML offline (node + `@xmldom/xmldom`),
asserts a known SubPart resolves correctly, and verifies **every resolved
`meshNodeName` actually exists as a node in its GLB atlas** (reads the GLB JSON
chunk).
