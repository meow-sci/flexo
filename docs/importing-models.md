# Importing models (Blender → flexo → KSA)

Drop a `.glb` (or a `.gltf` plus its sidecars) authored in Blender — or any DCC — onto the 3D
workspace and it becomes real KSA SubParts: one SubPart per (glTF mesh × material), one
placement per node that references it, each dressed in a real `<PbrMaterial>` built from the
file's own base-colour / metallic-roughness / occlusion / normal / emissive maps, and each
exportable into a KSA part mod. The governing architectural choice is the same one that made
custom primitives work: an imported model becomes ordinary `CustomMesh` descriptors, so the
catalog, scene, selection, gizmos, layers, undo/redo, Part XML and mod export are all
**unchanged** — the new code is confined to _file → descriptors + binaries_.

This doc is the maintenance + user reference for the shipped importer: what each module owns,
the decisions baked in, and the deliberate shortcomings. The research, the game-fact evidence
and the phase breakdown live in [plans/IMPORT_MODELS.md](../plans/IMPORT_MODELS.md).

Related: [custom-assets.md](custom-assets.md) (the machinery this extends — textures, materials,
mesh atlas, mod export), [texturing.md](texturing.md) (how KTX2 loads/renders),
[subpart-catalog.md](subpart-catalog.md) (how SubParts resolve geometry/textures),
[asset-pipeline.md](asset-pipeline.md) (`public/draco/`),
[scope/custom-assets-and-mod-export.md](../scope/custom-assets-and-mod-export.md) (the game
contract, with `decomp/…:line` citations).

> **Nothing in this feature has been verified in the actual game yet.** The automated side is
> green and the editor side is exercised by hand, but no imported model has been loaded into KSA.
> See **Pending in-game verification** at the bottom for the exact checklist.

## End-to-end pipeline

```
 .glb  /  .gltf + .bin + images
   │  drag onto the 3D viewport (ViewportDropZone) or Add ▸ Import Model…
   ▼
 loadModelFile()            GLTFLoader (+ DRACO / meshopt decoders)
   │                        multi-file drop → blob: URL map + LoadingManager URL modifier
   │                        → LoadedModel { scene, fileName, source }
   ▼
 analyzeImport()  ─────▶  ImportPlan { groups[], instances[], warnings[], totals, bounds }
   │                        grouping = (glTF mesh × material) → one SubPart
   │                        every referencing node → one placement (instancing for free)
   ▼
 planImportMaterials()  ─▶  ImportTextureSpec[] + ImportMaterialSpec[]  (factors baked to pixels)
   │
   ▼
 Import Review (Drop → Review → Importing)                                       
   │               preview · stats · VRAM/mod-size estimate · options · warnings
   │               NOTHING has touched the document yet
   ▼
 normalizeImport(plan, opts)
   │   bake node/mirror/skin transforms · strip unread attributes · force indices
   │   promote UV1→UV0 · optional double-siding · optional merge
   └─▶ buildMeshAtlasGlb({viewMeshes:false})  ─▶  ONE atlas GLB per import batch
   │
   ▼
 customAssetStore.importModelAsMeshes()      ONE undo step
   │   binaries first: import-glb:<importId>, tex-src:/tex-ktx2: per texture, emissive-paint:
   │   then one mutate(): a layer named after the file + textures + materials
   │                      + one CustomMesh{imported} per group + one placement per instance
   ▼
 existing machinery, unchanged:
   $customCatalog → customMeshRenderCache → SubPartObject             (editor render)
   buildCustomBundle → MeshAtlas GLB + <PbrMaterial> + <SubPart> + <MeshView>   (mod export)
```

## The Blender export recipe

File ▸ Export ▸ **glTF 2.0 (.glb/.gltf)**, format **glTF Binary (.glb)**. The same table is a
"How to export from Blender" disclosure on the Import Review dialog's Drop view
(`BLENDER_RECIPE` in `src/ui/assets/ImportReviewDialog.tsx`).

| Section                 | Setting                                                                       | Why                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Format                  | **glTF Binary (`.glb`)**                                                      | one file carries geometry _and_ images — a single drop, no missing-texture hunt                            |
| Include                 | Selected Objects (optional), **Custom Properties off**                        | keeps the file to what you meant                                                                           |
| Transform               | **+Y Up** (the default — leave it on)                                         | glTF, three.js and KSA all use right-handed Y-up metres, so no axis conversion is needed                    |
| Data ▸ Mesh             | **Apply Modifiers ON, UVs ON, Normals ON**, Tangents **OFF**, Vertex Colors **OFF** | KSA imports POSITION / NORMAL / TEXCOORD_0 only; everything else is stripped at import                 |
| Data ▸ Material         | Materials **Export**, Images **Automatic** (PNG/JPEG)                         | flexo re-encodes images to KTX2 from their original bytes; a KTX2-in-glTF source cannot be re-encoded       |
| Data ▸ Shape Keys / Skinning | off                                                                      | KSA parts have no morph targets and no GPU skinning (a skinned mesh imports as its baked bind pose)         |
| Compression (Draco)     | **off preferred** (accepted either way)                                       | flexo decodes Draco and meshopt on import, but off is one less thing to go wrong                            |

Modelling rules that map to hard game limits — each one is surfaced as an import warning:

- **One material per object per SubPart.** A Blender object with 3 materials becomes 3 SubParts.
  Deliberate splits are fine — that is how you get separate surfaces _and_ separate KSA GameData
  per piece.
- **Everything is single-sided.** KSA culls back faces unconditionally. Solidify open surfaces in
  Blender, or tick **Make double-sided** at import (which duplicates + flips the geometry).
- **Keep UVs in 0..1 unless you mean to tile.** The in-game sampler is `Repeat` on all axes, so
  tiling works, but clamp/mirror wrap modes are ignored.
- **Model in metres.** 1 Blender unit = 1 m = 1 KSA unit. The dialog shows the measured bounding
  box and offers `×0.01` / `×0.0254` / `×1` scale presets if you authored in cm or inches.
- **UV-unwrap everything you want textured.** flexo never invents UVs.

## How a glTF scene maps onto KSA's paradigm

| glTF concept                                   | KSA / flexo concept                                                                                    |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| a unique (mesh × material) pair                | **one SubPart** — a `CustomMesh` + `<SubPart>` + `<Mesh>` + `<PbrMaterial>` + `<MeshView>`              |
| a node referencing that mesh                   | **one placement** (`SubPartPlacement`) carrying the node's world transform                             |
| the same mesh referenced by N **same-handed** nodes | **1 SubPart, N placements** — free instancing, exactly KSA's own pattern                           |
| a mirrored (negative-scale) reference of it    | **its own SubPart** — one baked geometry can't carry both triangle windings (see Transforms below)     |
| a glTF material                                | **one `CustomMaterial`**, deduped by glTF material index; identical channel sets intern to one `<PbrMaterial>` on export |
| the glTF scene                                 | **one flexo layer**, named after the file, holding every new placement                                 |

Three game facts force that shape, and none of them is a preference:

- **One `<PartModel>` = one `<Mesh>` + one `<Material>`, and only primitive 0 is drawn.**
  `PartModelModule.Template` carries a single `Mesh` + `Material`
  (`decomp/KSA/PartModelModule.cs:17-35`); `MeshReference` loads every primitive but the part path
  renders `DeviceMeshesInterleaved[0]` with one bound material
  (`decomp/KSA/MeshReference.cs:58,76-118`, `decomp/KSA/PartModel.cs:400-418`). A multi-material
  object therefore **must** split at import.
- **glTF node transforms are ignored.** KSA's atlas loader iterates `GltfJson.Meshes[]` and never
  walks the node graph — a mesh registers purely by `meshes[i].name`
  (`decomp/KSA/MeshAtlasFileReference.cs:22-49`). A node's world matrix has to become either baked
  geometry or a flexo placement; it can never ride along in the GLB.
- **Mesh names are a global namespace.** `MeshAtlasFileReference.DoLoad` registers every mesh into
  `ModLibrary` by name, so every emitted SubPart id is `flexo_<Sanitized(name)>_<hash8>` — the
  `flexo_` prefix is what keeps an import from colliding with Core content.

Naming: `subPartId = flexo_<Sanitized(name)>_<hash8>` (`importNormalize.ts`), display name
`"<Object> · <Material>"` when the object split across materials, else plain `<Object>`, both
prefixed with the dialog's optional **Name prefix**.

`<Object>` is the glTF **node** name — the Blender object name — read through
`ModelSource.nodeName`, **not** the three object's own `name`. They differ in exactly the case
that matters most: a multi-primitive glTF mesh becomes one three `Mesh` per primitive, each
named after the glTF *mesh* (a data-block name, often something like `Cube.003`, uniquified to
`Cube.003_1`…) under a `Group` that carries the node name. Since `(sourceNode, sourceMaterial)`
is also the identity a **replace** matches on, that distinction is load-bearing, not cosmetic.

## Transforms, orientation, scale

- **No axis conversion by default.** glTF, three.js and KSA all use right-handed, Y-up,
  −Z-forward metres (`src/three/coords.ts`), so a default Blender export needs nothing. The
  **Up axis in the file** option applies `RotX(−90°)` for a file exported Z-up.
- **Uniform scale** from the **Scale** field (with the cm/inch presets) multiplies every instance
  matrix and the skinned bake, so bounds, placements and geometry always agree
  (`correctionMatrix()` in `importPlan.ts`).
- **Each node's world matrix**, relative to the glTF scene root and after that correction,
  decomposes into a placement through the existing `transformFromMatrix()` — which routes through
  the calibrated `ZYX` euler order, so imported placements are indistinguishable from
  hand-authored ones. Never hand-roll euler extraction here.
- **Bake scale into geometry** (persisted, default ON) bakes the first instance's scale — import
  scale included — leaving rotation + translation on the placement, so texel density and the
  editor gizmo behave predictably. Off keeps the scale on the placement.
- **Bake transforms to origin** (per-import, default OFF) bakes the first instance's _full_ world
  matrix instead: instance 0 lands at identity, and any further instance keeps its offset
  **relative to instance 0** rather than duplicating the geometry — the one-SubPart-N-placements
  rule still holds.
- **A mirrored (negative-determinant) transform is always baked**, even with "bake scale" off:
  three's `decompose` folds a mirror into `scale.x`, the geometry is transformed and its triangle
  winding reversed, and the placement keeps the positive-scale remainder. A negative placement
  scale would reverse winding in-game and back-face-cull the whole piece invisible
  (`CullMode = BackBit` is unconditional, `decomp/KSA/PartModelRenderer.cs:165`).
  **Handedness is therefore part of the group identity** (`importPlan.ts`): a bake is a single
  matrix, so a group holding both handednesses could only fix one of them and would leave the
  others negative-scaled. Mirroring one of four copies of a strut yields 2 SubParts (3
  placements + 1), not 1 SubPart with an invisible instance.
- **Skinned meshes** have no usable node-local space, so the plan CPU-bakes their bind pose to
  scene-root space with the kitten pipeline's `bakeGeometry()` (authored normals transformed by
  the normal matrix, never recomputed) and their single instance is the import correction alone.
- **Merge into one SubPart** is offered only when the whole model uses a single material
  (`canMerge()`): every group × instance is baked into one geometry with one identity placement.
  It falls back to an unmerged import with a `mergeFailed` warning when the pieces' attribute
  layouts differ (typically one object UV-unwrapped and another not).

## Material mapping — glTF → the five `<PbrMaterial>` slots

KSA's `<PbrMaterial>` has **five texture slots and zero scalars**
(`decomp/KSA/PbrMaterialReference.cs`: `Diffuse` / `Normal` / `AoRoughMetal` / `Emissive` /
`ThinFilm`), so **every glTF factor is baked into pixels at import** — there is nowhere
downstream to put a number. `importMaterials.ts` owns this translation and is pure: image codecs
are injectable, so it unit-tests without a canvas.

| KSA slot         | glTF source                                                                              | What import bakes                                                                                                                                                                                                                                                                                                                                     |
| ---------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `<Diffuse>`      | `baseColorTexture` × `baseColorFactor`                                                    | A white factor ships the image **verbatim**. Otherwise the factor multiplies in **linear space** (sRGB byte → linear → × → sRGB byte) and the result is PNG-encoded as the texture's source. No texture ⇒ `baseColor` as a picked colour, which exports as a deduped 1×1 solid. Factor **alpha is ignored** — KSA parts are opaque or glass.        |
| `<AoRoughMetal>` | `occlusionTexture`(R) + `metallicRoughnessTexture`(G,B) + `metallicFactor`/`roughnessFactor`/`occlusionStrength` | Same channel layout as KSA, whose shader comment says "Following GLTF spec" (R=AO, G=rough, B=metal). Occlusion and MR **sharing one image with every factor at 1** — Blender's "glTF Settings" ORM packing — is reused verbatim. Otherwise `packOrmLevel()` repacks: `ao = 255 + strength·(texR−255)`, rough/metal multiply in byte space (linear data). No maps ⇒ scalars only, exported as a solid ORM texel. |
| `<Normal>`       | `normalTexture` + `scale`                                                                 | Bytes stored **verbatim**, with `strength = scale`. Deliberately not pre-transformed: `prepareChannelImage(…, 'normal', strength)` owns KSA's X-flip and the strength bake at encode time, and `modExport.normalPathFor` re-derives a strength ≠ 1 from the same source — pre-transforming would apply both twice.                                     |
| `<Emissive>`     | `emissiveTexture` × `emissiveFactor` × `KHR_materials_emissive_strength`                  | KSA's glow is WHITE × mask × 1.25 added after lighting — there is **no emissive colour** — so the colour is composited into the **diffuse** and only the intensity becomes a mask. Import composes a glow bitmap (`rgb` = the emissive product as sRGB, `a` = its linear luminance) and stores it under the existing **`'painted'`** emissive shape.  |
| `<ThinFilm>`     | —                                                                                         | No glTF equivalent; `<PartModelDynamic>`-only and heat-gated, therefore invisible on a bench part. Out of scope.                                                                                                                                                                                                                                       |

**Why `'painted'` and not a new emissive shape.** A glTF emissive composes to exactly what
`'painted'` already models — an RGBA bitmap under `assetKeys.emissivePaint(meshId)` whose RGB is
the glow colour and whose alpha is the greyscale key. Reusing it means `glowFor()`,
`compositeGlow()`, the editor material and the exporter all work unchanged, **and** an imported
glow can be retouched in the existing paint dialog. (`plans/IMPORT_MODELS.md` §3.4 originally
proposed a new `'map'` shape; the reuse is strictly less code for the same result.) The imported
config lands at `coverage`/`strength` = 1 so the source material's own falloff — already baked
into the alpha — passes through unscaled; KSA adds that mask as WHITE, so a strong glTF emissive
may need the Emissive slider pulled back (and a matching `<Light>`) to read as a colour in-game.

`alphaMode: BLEND` sets `ImportedMeshSource.transparent`, the opt-in `<PartModelGlass>` route
(toggled per mesh afterwards in Surface mode's Imported section). `alphaMode: MASK` is a warning only — KSA's
part shader has no cutout.

**Dedup.** Textures are keyed by an FNV-1a-64 hash of the **source bytes** + the channel + any
baked-factor parameters, so one image shared by five materials becomes one `CustomTexture` — but
the same image used as _two_ channels correctly becomes two, because each channel encodes
differently (sRGB vs linear, the normal X-flip). Materials are keyed by the glTF material index,
so two SubParts cut from one Blender material share one flexo `CustomMaterial` and therefore one
exported `<PbrMaterial>`.

**Imported textures and materials are ordinary flexo assets** from the moment they land: editable
in the material dialog, reusable on other meshes, deletable, and exported through the same path as
hand-authored ones. Nothing about them is a parallel universe.

## Module map

| Module                             | Owns                                                                                                                                                                                    |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/three/loadModelFile.ts`       | File(s) → a three scene. `GLTFLoader` + DRACO/meshopt decoders, `.gltf` sidecar resolution, and the `ModelSource` façade over `GLTFParser` (glTF JSON, material indices, **node names**, original image bytes). |
| `src/ksa/importPlan.ts`            | `analyzeImport()` — the (mesh × material) grouping, instances, scale/up-axis correction, bounds, totals, and the whole warning catalogue. Pure over three objects.                        |
| `src/ksa/importMaterials.ts`       | `planImportMaterials()` — glTF metallic-roughness → texture/material specs, every factor baked into pixels. Pure; codecs injectable.                                                     |
| `src/ksa/importNormalize.ts`       | `normalizeImport()` — KSA-legal geometry (indexed, POSITION/NORMAL/UV0), transform/mirror/bind-pose bake, optional double-siding and merge, and the batch's atlas GLB.                   |
| `src/ksa/importEstimates.ts`       | The numbers and labels the dialog shows: image-header size reads, the size cap, VRAM/mod-size formulas, warning severities + grouping, scale presets. Pure, no three, no DOM.            |
| `src/three/importedMeshCache.ts`   | `importId → blob:` registry over the stored atlas GLBs; `getImportedGeometry()` (editor, tangented) and `getImportedRawGeometry()` (export, untangented); per-batch and all-batch release. |
| `src/three/ModelPreviewViewport.ts`| The dialog's read-only 3D preview: editor lighting/tonemapping, orbit, an adaptive metre grid, camera auto-framed on the bounding sphere. Shows the file's **own** glTF materials.       |
| `src/ui/assets/ImportReviewDialog.tsx` | **Import Review** — dialog id `'import-review'`, three views (Drop / Review / Importing) for both import and replace, with the D11 sticky-vs-per-import option split. Root-hosted by `DialogRoot`; its payload rides `$importModelRequest`. |
| `src/ui/ViewportDropZone.tsx`      | Drag-and-drop onto the 3D workspace. Plain React drag handlers; opens the dialog pre-loaded.                                                                                             |
| `src/ui/status/ImportReportBody.tsx` | The post-import summary, rendered as a sticky **rich notification-center entry** (kind `'import-report'`) — what was created, what a replace kept/removed (named), the non-blocking warnings, and the `[Open Asset Manager]` / `[Edit surfaces →]` actions. |
| `src/state/customAssetStore.ts`    | `importModelAsMeshes`, `removeImport`, `replaceImport`, `matchImportedMeshes`, `planImportRemoval`, `setMeshTransparent`, and the catalog/render-cache `imported` branch.               |
| `src/ksa/modExport.ts`             | The `imported` branch of `buildCustomBundle` (raw geometry) and the `_VM` triangle budget.                                                                                              |
| `src/ksa/exportGlb.ts`             | `buildMeshAtlasGlb` — used both for the import batch's internal atlas (`viewMeshes:false`) and the shipped mod atlas (with decimated `_VM` meshes).                                     |

## Warnings

Every warning carries a `code`, a `subject` (an object, material or the file), a plain-English
message and — when the user can do something — a remedy. They are deduped by `(code, subject)`,
grouped by subject and sorted loudest-first for display (`groupWarnings` in `importEstimates.ts`).
Severities: **error** = the model will be visibly wrong or unusable unless the user acts;
**warning** = something was dropped or costs something real in-game; **info** = flexo already
handled it and is only telling you what it did.

| Code                | Severity | Condition                                                                       | Remedy offered                                                     |
| ------------------- | -------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `noMeshes`          | error    | the file contains no meshes                                                      | export with "Selected Objects" off, or check the objects have geometry |
| `noUv`              | error    | an object has neither UV0 nor UV1 — it can never be textured                     | UV-unwrap in Blender and re-export                                  |
| `alphaMask`         | error    | `alphaMode: MASK` (three maps it to `alphaTest`) — no cutout in KSA's part shader | bake the cutout into the geometry                                   |
| `basisuImage`       | error    | a `KHR_texture_basisu` source image — already block-compressed, not re-encodable | re-export with Images = Automatic (PNG/JPEG)                        |
| `imageDecode`       | error    | a source image flexo could not decode, so its factors couldn't be baked in       | re-export with PNG or JPEG images                                   |
| `mergeFailed`       | error    | "merge into one SubPart" asked for, but the attribute layouts differ             | UV-unwrap every object, or import without merging                   |
| `doubleSided`       | warning  | a double-sided material — KSA always culls back faces                            | turn on "Make double-sided", or solidify in Blender                 |
| `alphaBlend`        | warning  | `alphaMode: BLEND` — exports opaque unless glass is enabled, and glass can't glow | enable the per-mesh glass toggle after importing                    |
| `vertexColors`      | warning  | a `COLOR_0` attribute, which KSA never reads                                     | bake it into a base-colour texture                                  |
| `morphTargets`      | warning  | shape keys — only the base shape is imported                                     | —                                                                    |
| `animations`        | warning  | glTF animation clips in the file — not imported                                  | author motion with flexo's own animation editor                     |
| `heavyMesh`         | warning  | >100 000 triangles in one SubPart, or >500 000 in the whole import               | decimate in Blender, or import only what you need                   |
| `materialExtension` | warning  | clearcoat / transmission / sheen / specular / volume / IOR / unlit — no KSA equivalent | bake the look into base colour / roughness                    |
| `samplerWrap`       | warning  | a clamp/mirror wrap mode; KSA's sampler is hard-wired to Repeat                   | keep UVs inside 0–1, or bake the clamped result into the image      |
| `textureTransform`  | warning  | `KHR_texture_transform` on a texture reference — KSA has no UV transform          | apply the transform to the UV map itself and re-export              |
| `textureUv1`        | warning  | a material channel sampling TEXCOORD_1; KSA reads UV0 for all five slots          | use the first UV set for every map                                  |
| `uv1`               | warning  | a second UV set exists (dropped when UV0 is present; promoted when it is the only one) | make the map you texture with the first UV set                 |
| `multiMaterial`     | info     | an object with N>1 materials → N SubParts                                        | — (a game limit, not a choice)                                      |
| `noNormals`         | info     | no normals — flat shading is computed at import                                  | —                                                                    |
| `skinned`           | info     | a skinned mesh — its bind pose was baked into static geometry                     | —                                                                    |
| `mirrored`          | info     | a negative-scale transform — baked into the geometry with the winding fixed, in its own SubPart | —                                                     |

## Storage + persistence

- **The import GLB lives in IndexedDB** under `assetKeys.importGlb(importId)` =
  `import-glb:<importId>` — one normalized, geometry-only atlas per import batch, one named mesh
  per SubPart, no textures and no `_VM` meshes (those are generated at export). Unlike a primitive
  (regenerable from its params) or a kitten submesh (re-baked from the shipped gltf), **this file
  is the only copy of the geometry**, so it is persisted and is never dropped when a single
  imported mesh is deleted — undo has to be able to restore it, and its sibling SubParts still
  read from it. Reclaiming it is an explicit **Remove import**.
- **Only descriptors go in the project snapshot.** `CustomMesh.imported: ImportedMeshSource`
  carries `importId`, `meshName`, `sourceFile`, `sourceNode`, `sourceMaterial`, `triangles`,
  `vertices` and the optional `transparent` flag — lightweight enough for the project
  snapshot, which is why the bytes live in `assetDb` instead.
- **Blob URLs are per session.** `importedMeshCache` registers `importId → blob:` on hydrate,
  loads missing batches out of IndexedDB on demand (`ensureImportAtlas`), frees one batch on
  removal (`releaseImportAtlas`) and all of them on project switch (`clearImportAtlases`).
- **The codec is v5.** `PROJECT_EXPORT_VERSION = 5` added the `imp` (imported source) and `mid`
  (mesh-level `materialId`) fields. Per the no-migration rule, a v4 payload is rejected outright.
- **Imported geometry gates data-only project export off.** `hasCustomAssets()` returns true for
  any imported mesh, so the Export-Project and Share-Link dialogs disable themselves — the payload
  carries descriptors, not binaries, and an imported descriptor on the wire would decode into a
  SubPart pointing at an `importId` the receiving browser has no geometry for: an invisible,
  unfixable placement. The codec still _encodes_ it losslessly, ready for a future bundle format.
- **Sticky vs per-import options.** `$modelImportSettings` (persisted) holds the four preferences
  that describe a working style: **max texture size** (1024/2048/4096, default 2048), **up axis**,
  **bake scale into geometry** and **decimate view meshes**. Everything that describes ONE model
  stays dialog state and is deliberately not persisted — scale, name prefix, make double-sided,
  bake transforms to origin, merge. A `0.01` scale left over from a centimetre export would
  silently mis-size the next import.

## What an imported SubPart exports

An imported mesh is just another `meshKind()` case in `buildCustomBundle`, so it ships exactly
what a primitive does:

- **One node in the shared `Meshes/<Name>_MeshAtlas.glb`**, named `<subPartId>`, built from
  `getImportedRawGeometry()` — the untangented, still-indexed copy of the batch's GLB. **Never**
  the editor's `MeshAtlasCache` geometry: MikkTSpace de-indexes it, and KSA builds an index buffer
  only `if (prim.Indices.HasValue)` (`decomp/RenderCore.Gltf/GltfUtils.cs:484-488`), so a
  de-indexed mesh draws and picks nothing, silently and with no load error.
- **A `<subPartId>_VM` picking mesh beside it, decimated.** In-game hover runs
  `Part.RayCastEgoSubPart` (`decomp/KSA/Part.cs:1854-1887`) → `Ray.RaycastWatertight`
  (`decomp/KSA/Ray.cs:194-213`), a plain triangle loop over the view mesh **de-indexed at load**
  into one `double3` (24 B) per index (`decomp/KSA/MeshReference.cs:87-95`) — per SubPart, per
  hover frame. So `buildCustomBundle` passes `viewMeshBudget: 2000` and `exportGlb` replaces the
  `_VM` index buffer with a meshopt-simplified one over the **same vertex arrays**: POSITION /
  NORMAL / TEXCOORD_0 ride along untouched, the mesh stays indexed, and the render mesh is never
  modified. Picking precision is the only trade; the user can turn decimation off, and a
  simplifier failure ships the full-resolution copy with a `console.warn`.
- **One `<PbrMaterial>`** built from its `CustomMaterial` — base-colour map or 1×1 solid, plus
  `<Normal>` and `<AoRoughMetal>` always (both are dereferenced with no null check by the
  thumbnail renderer and every placed part), plus `<Emissive>` and a composited diffuse when it
  glows. Imported meshes have no per-face texture grid, so they take the "material verbatim"
  interning path: **N meshes sharing one `CustomMaterial` ship ONE `<PbrMaterial>`**, which is how
  a multi-object Blender import stays cheap. A glow is per-MESH, not per-material, so a glowing
  material needs a second entry (its `<Diffuse>` has the glow composited in) — but that composite
  is content-addressed (base image + glow bitmap + coverage/strength/ramp), so the N meshes still
  share one entry and one pair of texture files, and fork only where the glow itself differs.
- **A `<SubPart>`** wiring `<PartModel>` — or `<PartModelGlass>` when `imported.transparent` —
  to `<Mesh>` + `<Material>` + `<MeshView>`. An imported glass mesh never carries `<Emissive>`:
  KSA's glass shader never samples it, and the layered `glassGlow` trick stays kitten-only
  (insetting a copy of arbitrary imported geometry toward its bbox centre is a guess that pokes
  through non-convex shells).
- A mesh whose geometry can't be resolved is **skipped from both the atlas and the Assets XML**
  with a warning, rather than shipped as a `<SubPart>` pointing at a `<Mesh Id>` that doesn't
  exist.

## Interior props and the `<Internal>` flag

> **Behaviour change.** A placed interior prop now **stays interior on export**. It used to be
> silently made visible everywhere.

Several Core SubParts — the `CoreIVASpaceA_*` / `CoreIVAPropA_*` cockpit fittings — carry
`<Internal>true</Internal>`, KSA's *interior-only* flag: the mesh renders in the IVA camera and
nowhere else (`PartModel.cs`'s `!Template.Internal || viewport.Mode == IVA` gate). Placing one
in flexo and exporting used to run **the old automatic interior-prop rewrite**: every such
placement was re-homed onto a redeclared SubPart variant that dropped `<Internal>` (and, as a
latent bug, `<RayTracing>`), so the prop rendered in the exterior view. That was right for
"decorate an exterior part with a cockpit chair" and exactly wrong for "build a real interior",
and there was no way to ask for the other one.

That rewrite is **deleted**. `<Internal>` is now plain user data — `EditingPart.internalFlags`,
keyed by SubPart **template** id and resolved by `resolveInternal` (explicit user flag → the
catalogued built-in's own value → `false`) — so by default flexo mirrors the game's own data,
and the decision is yours.

**To flip it for a whole selection:** select the placements, then use **Interior (IVA only) ▸
On / Off** in the SubPart list's row menu (right-click works too) or in the multi-select
toolbar. It is the one item in that menu that acts on the multi-selection: if the row you
opened it from is part of the current selection it applies to all of it — the submenu is
labelled `Interior (IVA only) — N selected` in that case so it is never ambiguous — otherwise
to that row alone. A template resolving to interior gets a `· interior` badge on its Outliner
row (and in the SubPart browser, so you know before placing), and `interior` is a search term.

Three consequences worth knowing:

- **The common cases now emit no variant at all.** A variant is minted only when flexo actually
  changes something: the template carries SubPart GameData, **or** its wanted `<Internal>`
  differs from the built-in's own. An untouched prop references the built-in id directly and
  keeps the built-in's `<Internal>` / `<RayTracing>` / `<ShadowCaster>` for free.
- **A variant now carries `<RayTracing>` and `<ShadowCaster>` forward.** A variant inherits
  nothing but the `<Mesh>`/`<Material>` it names, so dropping those turned a `ShadowProxy`
  occluder into a *visible* mesh and made a built-in's explicit `ShadowCaster false` start
  casting shadows.
- **Interior geometry with no seat is invisible in every camera mode** — `<Internal>` hides it
  outside IVA, and with no `<IVASeat>` anywhere in the vehicle the IVA mode is never offered.
  That is the failure the old rewrite used to mask, and it is now an export warning. An
  imported glTF mesh can be marked interior the same way; **glass cannot** (see
  [custom-assets.md](custom-assets.md#interior-only-meshes-internal)). Full
  treatment in [iva-seats.md](iva-seats.md).

## Managing imports

The **Asset Manager** (`⇧⌘A`, Window ▸ Asset Manager…) has an **Imported models** category that
groups by batch: a header card with the file name, SubPart / placement / texture / material /
triangle totals and the stored GLB size, then that batch's SubPart cards (thumbnail, name,
provenance, usage chips, ⋮ actions). The header carries **Replace…** and **Remove import…**.

**Surface mode** (`5`) is where an imported mesh's surface is edited: the right sidebar gives it
material assignment and glow just like a primitive, plus an **Imported** section with the
read-only **provenance block** (file / object / material / triangles / vertices), the **Render as
glass** switch, and the same **Replace… / Remove import…** pair. There is **no per-face texture
grid**, because there are no primitive faces (the same gating kitten meshes already had).

### Replace (re-import in place)

"Replace…" opens Import Review in replace mode; the Review view shows the match summary
before anything is committed. **Matching is `(sourceNode, sourceMaterial)`** — the Blender object
name × the material on it — because that pair is the only identity glTF carries across exports
(mesh/material _indices_ reshuffle on every edit, and flexo's `subPartId` embeds a random suffix
minted at import time).

| Outcome     | What happens                                                                                                                                                                                                                                                                                                            |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **matched** | The `CustomMesh` keeps its `id` **and `subPartId`**, so every placement, SubPart GameData block, animation membership, connector reference and layer assignment survives. Its display name and glass flag stay, and **its placements are left exactly as arranged** — the new file's node transforms are not re-applied. |
| **added**   | A new `CustomMesh` + its placements, on the batch's existing layer.                                                                                                                                                                                                                                                     |
| **removed** | The new file has no geometry for it, so the SubPart and its placements go. Named explicitly in both the review step and the report.                                                                                                                                                                                     |

**Update materials from file** (default on) decides whether the new file's textures / materials /
glow are created and assigned, or whether matched SubParts keep the material and glow they wear
today. Merging is not offered in replace mode: collapsing everything into one SubPart could not
preserve a single existing identity.

Because a replaced mesh keeps its original `subPartId` while its geometry lives under the new
file's generated name, **`imported.meshName` is the only truthful mesh lookup key** — it is what
`CatalogSubPart.meshNodeName`, `getImportedGeometry()` and `buildCustomBundle()` all use.

### Remove import — and the undo caveat

**Remove import** is ONE undo step over `planImportRemoval()`: every SubPart of the batch, their
placements, the assets the batch leaves behind, and its layer when nothing else is on it. Orphaned
materials/textures are found by **reference counting over the post-removal document**, not by
provenance tags — imported assets are ordinary flexo assets, so "which material came from this
file" stops being true the moment the user re-assigns one. A material the batch brought in but
that now dresses a hand-made box survives; a hand-made material that only an imported SubPart wore
is collected; an asset created and never assigned is never a candidate.

> **Undo restores the descriptors, never the bytes.** The batch's `import-glb:`, each collected
> texture's `tex-src:`/`tex-ktx2:` and each removed mesh's `emissive-paint:` are deleted from
> IndexedDB outright, and `releaseImportAtlas()` revokes that batch's blob URL. This mirrors
> `removeCustomTexture`'s long-standing contract, and — unlike a primitive — there is no
> regenerable source, so the confirm dialog says so in as many words before the user commits.

## Deliberate limitations

- **Uncompressed RGBA8 + Zstd KTX2, not block-compressed.** Every imported texture costs
  `w · h · 4 · 4⁄3` bytes of **resident VRAM** in-game: a 2048² map ≈ 21 MB, a 4096² map ≈ 85 MB,
  _per texture_. Nothing else in flexo can blow a GPU budget that fast, which is why the dialog
  shows the estimate live next to the max-size cap (default 2048). The preferred fix is UASTC +
  a `.toml` sidecar (`scblockformatfamily` → BC7); it needs an in-browser encoder evaluation and
  is deferred (`plans/IMPORT_MODELS.md` Phase 6).
- **No alpha cutout.** `alphaMode: MASK` has no equivalent in KSA's part shader — bake the cutout
  into the geometry.
- **Single-sided only.** `CullMode = BackBit` is unconditional
  (`decomp/KSA/PartModelRenderer.cs:165`) and there is **no double-sided flag anywhere in the
  XML**, so "make double-sided" has to duplicate + flip the geometry — twice the triangles, twice
  the picking cost.
- **Translucency is one fixed shader.** `alphaMode: BLEND` can only become `<PartModelGlass>`:
  ~0.75 opacity, ~10% of its colour from the diffuse, and it never samples emissive — so imported
  glass can't glow.
- **No morph targets.** Shape keys collapse to the base shape.
- **No glTF animation import.** Clips in the file are reported and dropped; author motion in
  flexo's own animation editor.
- **No vertex colours.** `COLOR_0` is never read by KSA and is stripped; bake it into the
  base-colour texture.
- **KTX2 source images are unsupported.** A `KHR_texture_basisu` image is already
  block-compressed and can't be CPU-decoded back to pixels for flexo's own re-encode (and
  `KTX2Loader` needs a WebGLRenderer to pick a transcode target) — re-export with PNG/JPEG.
- **One UV set.** KSA samples all five material slots from TEXCOORD_0; UV1 is promoted only when
  it is the _only_ UV set, and a per-channel `KHR_texture_transform` can only be warned about.
- **No LODs.** `<LOD>` authoring waits on the ground-clutter LOD work.
- **Material extensions with no KSA equivalent** (clearcoat, transmission, sheen, specular,
  volume, IOR, unlit) are ignored with a warning — KSA's part shader is plain metallic-roughness
  with five texture slots and no scalars.
- **The import GLB is re-packed at export**, not shipped verbatim as a second `<MeshAtlas>`.
  Multiple `<MeshAtlas>` elements per file are legal (`<Assets>` is a flat list and mesh names
  register globally), but that shortcut is unverified in-game and stays a Phase-6 optimisation.
- **Geometry can't leave the browser as project JSON** — see **Storage + persistence** above.

## Tests

- `src/three/loadModelFile.test.ts` — `ModelSource.nodeName` over a real `GLTFLoader` parse: the
  glTF node name survives three's per-primitive mesh split and its per-instance clones.
- `src/ksa/importPlan.test.ts` — grouping, instancing, transform round-trips, mirrored bakes, the
  warning conditions.
- `src/ksa/importNormalize.test.ts` — output is indexed, float32, POSITION/NORMAL/UV0 only, no
  TANGENT; UV1 promotion; double-siding.
- `src/ksa/importMaterials.test.ts` / `importEstimates.test.ts` — factor baking, ORM packing, the
  glow bitmap, dedup keys; image-header sizes, the cap, the VRAM/mod formulas, warning grouping.
- `src/ksa/exportGlb.test.ts` — the KSA glTF loader requirements (indices, float32 tight
  accessors, POSITION min/max, attribute stripping) and `_VM` decimation.
- `src/ksa/modExport.test.ts` — an imported SubPart's atlas node, complete `<PbrMaterial>`,
  `<SubPart>`/`<MeshView>`, glow, the `<PartModelGlass>` route, shared-material interning, and the
  missing-geometry skip.
- `src/state/customAssetStore.test.ts` / `editorStore.test.ts` — the import commit, `removeImport`
  and its orphan GC, and that each is exactly ONE undo step.
- `src/state/projectCodec.test.ts` / `projectTransfer.test.ts` — the imported-descriptor
  round-trip, the v4-payload rejection, and the binary-asset export gate.

## Pending in-game verification

**No part of this feature has been loaded into KSA yet.** Export a two-material, textured Blender
`.glb` (one painted-metal surface + one glowing strip) to `mods/flexo-parts/` and check, in order:

1. The mod **loads with no exception** — mesh names, indices, and a complete `<PbrMaterial>` on
   every SubPart.
2. Both SubParts **render with their textures**, normals oriented correctly (bumps punch the right
   way), and the emissive strip **glows**.
3. **Hover, click and right-click work** on each piece in the vehicle editor — the decimated `_VM`
   contract, including that decimation didn't make picking miss the silhouette.
4. The **part thumbnail renders** (the `ThumbnailRenderResources.AddDraw` null-deref path).
5. A **multi-instance import** (one mesh, four nodes) shows four pieces, not one.

Also still unverified from the custom-asset work this builds on: the UNORM/linear re-tag
(gray-swatch A/B), the shared-material path, and normal-map orientation — see
[custom-assets.md](custom-assets.md#pending-in-game-verification).
