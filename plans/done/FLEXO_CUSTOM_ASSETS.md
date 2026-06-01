# Flexo Custom Assets — Image → KTX2 Texture → Primitive GLB → Custom SubPart

Status: PLAN (proposed). Scope decided with user 2026-05-30.

## Goal

Let a flexo user, entirely in-browser:

1. Upload/paste an image (PNG/JPG) into the workspace.
2. Encode it into a **KTX2 texture container** (valid `.ktx2`, in-browser, WASM where needed).
3. Create a **new primitive GLB mesh** (box / cylinder / sphere / plane) that follows the
   same patterns as the built-in KSA mesh atlases.
4. Apply the texture to the mesh (one texture per whole mesh).
5. See it live in the editor, place/transform it like any other SubPart.
6. On export (zip **and** mod-folder), write out the `.ktx2` + `.glb` **and** an `Assets.xml`
   that defines the MeshAtlas / PbrMaterial / SubPart, with the Part.xml referencing it —
   exactly mirroring how built-in KSA Core assets are laid out.

## v1 scope (agreed)

- **Channels:** Diffuse only. (Normal / AoRoughMetal / Emissive are deferred — see
  "Deferred / future" + AGENTS.md note.)
- **Mapping:** one texture stretched across the whole mesh via the primitive's default UVs.
- **Primitives:** Box, Cylinder, Sphere, Plane.

---

## Key findings from codebase + format research

### KSA texture format reality (CRITICAL)

Inspecting real KSA `.ktx2` files (`.tmp/ksa-private/Textures/*`) shows they are **NOT Basis
Universal**. They are raw Vulkan block-compressed formats + Zstd supercompression + full mip
chains:

| Map      | vkFormat | meaning                      | supercompression |
|----------|----------|------------------------------|------------------|
| Diffuse  | 145      | `VK_FORMAT_BC7_UNORM_BLOCK`  | 2 = Zstd, 12 mips|
| PBR/ORM  | 145      | `VK_FORMAT_BC7_UNORM_BLOCK`  | 2 = Zstd         |
| Normal   | 141      | `VK_FORMAT_BC5_UNORM_BLOCK`  | 2 = Zstd         |
| Emissive | (BC4)    | `VK_FORMAT_BC4_UNORM_BLOCK`  | 2 = Zstd         |

This is confirmed by `src/three/textureSupport.ts`'s own comment: *"these files are not Basis
Universal"* — the basis transcoder worker is bundled mainly because it **also runs the Zstd
decoder**. `three`'s `KTX2Loader` loads these raw-BCn + Zstd files directly.

**Implication:** the originally-suggested basis/UASTC encoders (`ktx2-encoder`,
`@h00w/basis-universal-transcoder`, `basis_encoder.wasm`) produce `vkFormat 0` (basis-
supercompressed) KTX2. Those render fine in flexo (KTX2Loader transcodes basis→BC7) but it is
**unverified whether KSA's own loader accepts basis-flavored KTX2** vs. the raw-BCn+Zstd flavor
its own assets use. Matching KSA's exact container flavor is the safe path.

### v1 texture-encoding decision: uncompressed RGBA8 + Zstd + mips

For v1 we produce a **standards-compliant KTX2 with an uncompressed color format**
(`VK_FORMAT_R8G8B8A8_SRGB` = 43 for diffuse) + **Zstd supercompression** + a generated mip
chain, assembled with [`ktx-parse`](https://github.com/donmccurdy/KTX-Parse)'s `write()`.

Why this for v1:
- **100% feasible in-browser today** with no exotic encoder: canvas decodes the image →
  RGBA8 bytes → downscaled mips → Zstd-compress each level → `ktx-parse` container. No BC7
  encoder, no basis, no transcoder needed on the *write* path.
- **Maximally compatible:** uncompressed RGBA8 is the most universally accepted texture format;
  if KSA uses libktx (very likely), uncompressed KTX2 needs no transcode at all.
- Zstd keeps the *file* small even though VRAM use is higher than BC7. Acceptable for v1 custom
  textures.
- **Self-validating:** the produced `.ktx2` is loaded back through flexo's own `KTX2Loader`
  for the live preview — if it renders in flexo, it is a valid KTX2.

BC7 encoding (to byte-match KSA's BC7_UNORM files and cut VRAM) is a **deferred optimization**
(see below). It is isolated behind one module so swapping the encoder later changes nothing else.

### Zstd compressor

Need a Zstd **compressor** in-browser (the bundled basis worker only *decompresses*). Plan to
add a small WASM zstd lib that exposes `compress` (e.g. `@bokuweb/zstd-wasm`), pinned, loaded
lazily. KTX2 Zstd supercompression = zstd over the (mip-level) data; `ktx-parse` writes the
`supercompressionScheme = 2` + per-level byte offsets/lengths. (If a clean zstd-compress WASM
proves problematic, fall back to `supercompressionScheme = 0` / none for v1 — still a valid
KTX2; flexo + libktx load it. Zstd is a size optimization, not a correctness requirement.)

### GLB mesh naming — CRITICAL (caused in-game NRE on first attempt)

KSA's `MeshAtlasFileReference.DoLoad()` (decompiled, `thirdparty/ksa/KSA/`) builds mesh ids by
iterating the glTF **`meshes[]`** array and reading **`meshes[i].name`** — NOT node names:
```csharp
for (int i = 0; i < gltfJson.Meshes.Length; i++)
  if (!gltfJson.Meshes[i].Name.StartsWith('_')) {           // null name → NullReferenceException
    meshReference.Id = gltfJson.Meshes[i].Name; ...          // mesh name == SubPart <Mesh Id>
```
In glTF the **mesh name** and the **node name** are distinct. `THREE.GLTFExporter` writes
`Object3D.name` only to the **node** and never emits `meshes[i].name` at all, so a fresh GLB has
null mesh names → KSA throws `NullReferenceException` in `DoLoad()`, registers no `MeshReference`,
then fails with "MeshReference is null for '<id>'".

**Implemented fix** (`exportGlb.ts` `nameMeshesFromNodes`): an earlier attempt set `geometry.name`
hoping GLTFExporter would derive the mesh name from it — it does not. So after export we
**post-process the binary GLB**: parse the JSON chunk, copy each node's name onto the mesh it
references (`meshes[node.mesh].name = node.name`), and re-pack both chunks with correct 4-byte
(space) padding + updated lengths. Both fields end up the SubPart id — the **mesh** name is what
KSA reads, the **node** name is what flexo's own `MeshAtlasCache.getObjectByName` reads. Also: mesh
names must not start with `_` (KSA skips those). Guarded by `exportGlb.test.ts`.

### PbrMaterial channels — CRITICAL (second in-game NRE)

KSA's thumbnail renderer (`ThumbnailRenderResources.AddDraw`) dereferences `Material.NormalReference`
**and** `Material.PBRMap` with NO null check, so a `<PbrMaterial>` with only `<Diffuse>` throws a
`NullReferenceException` at startup. Even though v1 is diffuse-only, every material must carry all
three channels. `modExport.ts` (`makeSolid1x1Ktx2`) emits shared 1×1 synthetic textures — flat
normal `(128,128,255)` and neutral ORM `(AO=255,Rough=128,Metal=0)` — and `assetsXmlSerializer.ts`
emits the matching `<Normal>`/`<AoRoughMetal>` lines whenever any subpart is textured.

### GLB mesh reality

- Built-in atlases are **geometry-only GLBs**; textures live in separate `.ktx2` referenced by
  `<PbrMaterial>` in the Assets XML (NOT embedded in the GLB, NO `KHR_texture_basisu`).
- So our generated GLB needs only geometry: `position`, `normal`, `uv` (TEXCOORD_0) — exactly
  what three.js primitive geometries already provide. `three`'s `GLTFExporter` exports this
  natively with **no extension needed**.
- `MeshAtlasCache.getSubPartGeometry(atlasUrl, nodeName)` finds a node **by name** and bakes
  its world transform. So the generated GLB's mesh node must be **named** to match the SubPart's
  `<Mesh Id="...">`. `GLTFExporter` preserves `Object3D.name`.
- Catalog entry needed to render a SubPart (`CatalogSubPart`): `atlasUrl`, `meshNodeName`,
  `diffuseUrl` (+ optional normal/orm/emissive). For a custom asset these become **blob: URLs**.

### Export reality

- `src/util/zip.ts` `createZip(entries: {name, data: Uint8Array}[])` already handles **binary**
  entries — no new zip code needed for `.glb`/`.ktx2`.
- `modExport.ts` currently emits only `Part.xml` + `GameData.xml` and lists `*.xml` in
  `mod.toml`. We add: a `<Name>Assets.xml`, `Meshes/*.glb`, `Textures/*.ktx2`. `mod.toml`'s
  `assets` lists only **XML** files (Core does the same — meshes/textures are referenced by
  relative `Path` from the Assets XML), so we add the new Assets XML to that list and reference
  the binaries by path.
- `partXmlSerializer.ts` patterns (DOMImplementation/XMLSerializer + `prettyXml`) are reused to
  emit the new Assets XML.
- The FS-Access write path needs a `writeBinaryFile` + `Meshes/`/`Textures/` subdir creation,
  alongside the existing `writeTextFile`.

### Persistence reality

Projects persist to **localStorage** (`ProjectSnapshot`), which is too small for GLB+KTX2
bytes. Custom-asset binaries must go to **IndexedDB** (the app already uses IndexedDB for the
mod-folder handle). `ProjectSnapshot` stores only lightweight descriptors (ids, names, primitive
params, source-image ref); the binaries (source image, encoded ktx2, glb) live in an IndexedDB
asset store keyed by project + asset id.

---

## Mod-folder / zip output layout (mirrors KSA Core)

```
flexo-parts/
  mod.toml                         # assets = [ "...Part.xml", "...GameData.xml", "...Assets.xml" ]
  <Name>Part.xml                   # placements; custom SubParts referenced via InstanceOf
  <Name>GameData.xml
  <Name>Assets.xml                 # NEW: <MeshAtlas> + <PbrMaterial> + <SubPart> defs
  Meshes/<Name>_MeshAtlas.glb      # NEW: one geometry GLB, one named node per custom subpart
  Textures/<texId>_Diffuse.ktx2    # NEW: one per custom texture
```

Example `<Name>Assets.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<Assets>
    <MeshAtlas Path="Meshes/MyMod_MeshAtlas.glb" />
    <PbrMaterial Id="MyMod_Material_dean">
        <Diffuse Path="Textures/dean_Diffuse.ktx2" Category="Vessel" />
    </PbrMaterial>
    <SubPart Id="MyMod_Subpart_Panel">
        <PartModel>
            <Mesh Id="MyMod_Subpart_Panel" />
            <Material Id="MyMod_Material_dean" />
        </PartModel>
    </SubPart>
</Assets>
```
(`<Mesh Id>` equals the named node inside the GLB. Only custom SubParts actually referenced by a
placement are emitted; built-in/Core SubParts are NOT re-emitted — they're owned by KSA Core.)

---

## Architecture / new modules

### Texture-encoding (isolated, swappable)
- `src/ktx/encodeKtx2.ts` — `encodeImageToKtx2(rgba, width, height, {srgb}) → Uint8Array`.
  v1: build mip chain (canvas/`createImageBitmap` downscale), Zstd-compress levels, assemble via
  `ktx-parse` `write()` with `vkFormat = 43` (R8G8B8A8_SRGB). The **only** place that knows the
  on-disk texture format — BC7 upgrade swaps just this file.
- `src/ktx/zstd.ts` — lazy WASM zstd `compress` wrapper.
- `src/ktx/decodeImage.ts` — File/Blob/clipboard image → `{rgba, width, height}` via
  `createImageBitmap` + offscreen canvas. Enforce a max dimension (e.g. 2048, power-of-two pad
  or resize) and warn on the ~6MP browser limit.

### Mesh generation
- `src/three/primitives.ts` — `buildPrimitiveGeometry(spec) → BufferGeometry` for
  box/cylinder/sphere/plane (three built-ins: `BoxGeometry`, `CylinderGeometry`,
  `SphereGeometry`, `PlaneGeometry`) with parameters (dimensions, segments). Ensure
  `position`/`normal`/`uv` present.
- `src/ksa/exportGlb.ts` — `buildMeshAtlasGlb(nodes: {name, geometry}[]) → Promise<Uint8Array>`
  via `GLTFExporter` (binary, no textures, names preserved). One GLB packs all custom subparts
  for the project (one named node each), matching the atlas pattern. **Coord calibration:**
  author geometry so that flexo's existing import (`getSubPartGeometry` → `applyMatrix4`) +
  `applyPlacement` render it upright and correctly oriented vs. KSA's axis convention; validate
  against a known built-in subpart's orientation. Isolate any axis fix here.

### State / data model
- `src/ksa/types.ts` — new descriptors (persisted in `ProjectSnapshot`, lightweight):
  - `CustomTexture { id, name, sourceImageRef, width, height }`
  - `CustomMesh { id, name, primitive: { kind, params }, textureId }`  → becomes a custom SubPart
    template id (e.g. `<Base>_Subpart_<name>`).
  - Add `customTextures: CustomTexture[]` and `customMeshes: CustomMesh[]` to `EditingPart`
    (or a sibling field on the project). Placements reference custom-mesh subpart ids exactly
    like built-in template ids — **no change to `SubPartPlacement`**.
- `src/state/customAssetStore.ts` — nanostores atoms + actions:
  `addCustomTexture(file)`, `removeCustomTexture(id)`, `addCustomMesh(spec)`, edit/remove.
  Owns encode/build orchestration, blob-URL lifecycle, and registering a synthetic
  `CatalogSubPart` (blob URLs) into `$catalog` so the **existing** `SubPartObject` pipeline
  renders custom meshes with zero scene-code changes.
- `src/state/assetDb.ts` — IndexedDB store for binaries (source image, encoded ktx2, glb),
  keyed by project + id; hydrate blob URLs on project load; revoke on unload.

### UI
- `AddButton.tsx` — new menu items: "Upload image…" and "Create mesh…" (and/or a combined
  "Custom asset" submenu).
- `src/ui/CustomTextureDialog.tsx` — `Modal`: file picker / drag-drop / paste, preview,
  encode-progress (via `trackDownload`), name field. Uses the kit (`Modal`, `Dialog`,
  `TextField`, `Button`).
- `src/ui/CreateMeshDialog.tsx` — `Modal`: primitive picker, parameter fields, texture
  selector (from custom textures), live mini-preview; on confirm creates the custom mesh +
  places it.
- `src/ui/CustomAssetsPanel.tsx` — workspace list of custom textures + meshes (rename, delete,
  "add to scene"); shown in `RightPanel`/inspector.

### Export
- `src/ksa/assetsXmlSerializer.ts` — emit `<Name>Assets.xml` (MeshAtlas + PbrMaterial +
  SubPart) for the custom subparts **used by current placements**, reusing `partXmlSerializer`'s
  DOM/pretty-print helpers.
- `modExport.ts` — extend `buildModContent`/`buildModZip`/`writeModToFolder`:
  - generate the project GLB + each KTX2 (from cached IndexedDB bytes or re-encode),
  - add `Assets.xml` to outputs + `mod.toml` assets list,
  - write `Meshes/*.glb` + `Textures/*.ktx2` (binary; new `writeBinaryFile` + subdir creation
    for the FS-Access path; `createZip` already does binary for the zip path).

---

## Milestones (each independently verifiable)

1. **KTX2 encode spike** — `decodeImage` + `encodeKtx2` (uncompressed RGBA8 + Zstd + mips).
   Verify: encode `public/dean_face.png`, load the bytes via flexo's `KTX2Loader`
   (blob URL) and render on a test quad. *Proves the texture path end-to-end.*
2. **Primitive GLB + import round-trip** — `primitives.ts` + `exportGlb.ts`; export a box GLB,
   re-import via `MeshAtlasCache`, confirm orientation/placement matches a built-in. *Locks coord
   calibration.*
3. **Live custom SubPart** — `customAssetStore` registers synthetic `CatalogSubPart` (blob URLs);
   create texture+mesh in UI → appears in scene, selectable, transformable, persists (IndexedDB).
4. **Assets XML + binary export** — `assetsXmlSerializer` + `modExport` extensions; export zip,
   inspect layout/XML; round-trip the produced files back into flexo to confirm validity.
5. **Polish + docs** — progress, errors (unsupported image, too large), AGENTS.md note, tests
   (encode header bytes, XML serialization, name sanitization), Playwright UI smoke
   (project-local, base path `/flexo/`).
6. **(User) in-game validation** — user drops `flexo-parts/` into KSA mods and confirms the
   custom textured part loads. This is the real acceptance test for the chosen KTX2 flavor.

---

## Deferred / future (to be noted in AGENTS.md)

- **Full PBR channels:** Normal (BC5, with the `normalMapPatch` decode + tangents on the GLB via
  `computeTangents`), AoRoughMetal (BC7, packed AO/Rough/Metal), Emissive (BC4). Each needs a UI
  upload slot, an encoder format, a `<Normal>/<AoRoughMetal>/<Emissive>` line in the PbrMaterial,
  and (normals) tangent attributes in the exported GLB.
- **BC7/BC5/BC4 block compression** to byte-match KSA's own files + cut VRAM: swap
  `encodeKtx2.ts` to a BC7 WASM encoder (e.g. a `bc7enc`-derived WASM, or KTX-Software/libktx
  WASM if its build exposes BC encode). Container assembly (`ktx-parse`), mips, and Zstd stay.
- **Per-face / multi-material** texturing (box faces, cylinder caps vs side) via geometry groups
  + multiple PbrMaterials.
- **Confirm KSA accepts basis-flavored KTX2**; if yes, basis UASTC becomes an option for smaller
  files with good quality.

## Dependencies to add (pnpm)
- `ktx-parse` (KTX2 container read/write).
- a WASM zstd **compress** lib (e.g. `@bokuweb/zstd-wasm`) — or skip Zstd in v1 (scheme 0).
- (`three/addons` `GLTFExporter` is already available via the installed `three`.)
