# Area analysis: Custom assets — meshes, textures, materials, model import, kitten part-ify

Analysis for the flexo v2 UI refactor. Repo root: `/Users/asherwin/repos/meow-sci/flexo`.
All paths below are repo-relative unless stated. Verified against code (docs cross-checked:
`docs/custom-assets.md`, `docs/texturing.md`, `docs/importing-models.md`,
`scope/custom-assets-and-mod-export.md`, `plans/CUSTOM_TEXTURES_PLAN.md`, `plans/IMPORT_MODELS.md` —
docs are current and unusually accurate; code is authoritative where they differ).

---

## 1. Feature inventory

### 1.1 Upload texture (image → KTX2)

- **What**: Upload/drag-drop/**clipboard-paste** an image, name it, declare which PBR channel it is
  authored for (`baseColor | normal | orm | roughness | metalness | occlusion | emissiveMask`), and
  encode it into the project's custom-texture library. Channel drives encode transforms: normal maps
  get the KSA X-flip (+ strength scaling baked into RG), linear channels stored as-is, mips rebuilt.
- **UI path**: top Toolbar → **Add** menu → "Upload texture…" (`src/ui/AddButton.tsx:81`). That is the
  ONLY creation entry point; the Custom Assets modal's empty state merely *tells* you to go there
  (`CustomAssetsModal.tsx:186` "Use 'Upload texture…' in the Add menu").
- **Files**: `src/ui/CustomTextureDialog.tsx` (dialog; paste listener at :57-70, drop at :72),
  `src/state/customAssetStore.ts:759-795` (`createTextureAsset`/`addCustomTexture` — decode →
  `prepareChannelImage` → `encodeImageToKtx2` → two IndexedDB blobs + two blob URLs),
  `src/ktx/decodeImage.ts`, `src/ktx/channelTransforms.ts` (X-flip/strength), `src/ktx/encodeKtx2.ts`
  (RGBA8 UNORM+linear tags + Zstd — the double-gamma fix), `src/state/assetDb.ts` (keys
  `tex-src:<id>` / `tex-ktx2:<id>`).
- **Data model**: `CustomTexture` descriptor (`src/ksa/types.ts:1594`) pushed into
  `$part.customTextures` (one undo step); bytes in IndexedDB `flexo-assets/blobs`.
- **Interactions**: window-level paste works while the dialog is open; non-image files toast a
  warning; name defaults from filename; a `channel === 'normal'` pick shows the OpenGL/glTF
  convention hint.

### 1.2 Change a texture's channel after upload

- **What**: Re-declare which PBR channel an uploaded image is for. Re-encodes the stored `.ktx2`
  from the original source with the new channel's transforms.
- **UI path**: right sidebar (Assets tab) → **AssetsToolbar → "Custom (N)"** → Custom Assets modal →
  Textures section → per-row channel `Select` (`CustomAssetsModal.tsx:214-225`).
- **Files**: `customAssetStore.setTextureChannel` (`customAssetStore.ts:802-819`).
- **Notes**: this is the only texture *edit* that exists — no rename, no re-upload-in-place,
  no preview-at-size.

### 1.3 Delete texture

- **UI path**: Custom Assets modal → Textures row → trash button → ConfirmDialog (shows face-use
  count) (`CustomAssetsModal.tsx:354-368`).
- **Files**: `removeCustomTexture` (`customAssetStore.ts:842-860`) — removes descriptor, clears the
  id from every primitive face and every material channel (`clearMaterialTextureRefs`,
  :826-840 — keeps the invariant that map channels only point at live textures, which
  `projectTransfer.hasCustomAssets` relies on), deletes both IndexedDB blobs, revokes URLs.
- **Notes**: undo restores the **descriptor but not the bytes** (blobs are deleted immediately) —
  same contract as import removal; the dialog does NOT say this for plain textures (it does for
  imports).

### 1.4 Create material (full-PBR `CustomMaterial`)

- **What**: Reusable PBR material: base color (picked color OR base-color image), metalness +
  roughness sliders (with 9 named presets), and an "Advanced maps" disclosure — normal map (+
  strength 0–2 slider), packed ORM, or separate AO / roughness / metalness maps (packed ORM
  supersedes the three). Live PBR preview sphere rendered with its own `THREE.WebGLRenderer` under
  the same RoomEnvironment as the editor. Uniform values export as 1×1 solid texels (KSA
  `<PbrMaterial>` is textures-only).
- **UI paths** (three):
  1. top Toolbar → Add menu → "Create material…" (`AddButton.tsx:82`);
  2. Custom Assets modal → Materials row → pencil (edit) (`CustomAssetsModal.tsx:263-269`);
  3. ManageTexturesPanel → Material section → "Edit…" / "New material…" (auto-assigns on create)
     (`ManageTexturesPanel.tsx:327-357`).
- **Files**: `src/ui/MaterialDialog.tsx` (whole dialog + `MaterialPreview` :437-551 with its own
  renderer/PMREM), `customAssetStore.addCustomMaterial/updateCustomMaterial` (:883-905),
  `src/ksa/types.ts:1643` (`CustomMaterial`), `createDefaultMaterial` (:1664).
- **Data model**: `$part.customMaterials`; meshes reference by `CustomMesh.materialId`.
- **Notes**: map selects only offer textures whose declared channel matches the slot (a
  channel-typed library, `MaterialDialog.tsx:58-64`); slider shows "map" and disables when a map
  drives the channel; save = one undo step. **Non-conforming input**: metal/rough sliders are plain
  kit `Slider`s (fine), normal strength likewise — no numeric fields here.

### 1.5 Delete material

- **UI path**: Custom Assets modal → Materials row → trash → ConfirmDialog (shows mesh-use count;
  "they'll revert to the neutral look") (`CustomAssetsModal.tsx:386-400`).
- **Files**: `removeCustomMaterial` (`customAssetStore.ts:908-917`) — unassigns from every mesh.

### 1.6 Assign / clear a mesh's material

- **UI path**: ManageTexturesPanel → Material section → Select (includes "(none)")
  (`ManageTexturesPanel.tsx:315-326`).
- **Files**: `setMeshMaterial` (`customAssetStore.ts:920-932`).
- **Notes**: per-face texture overrides the material's base color on that face; a warning appears
  when faces mix >1 texture ("KSA export applies the first face's texture to the whole mesh",
  `ManageTexturesPanel.tsx:343-347`).

### 1.7 Create primitive mesh

- **What**: Box / cylinder / sphere / plane with numeric dimension fields (per-kind param sets,
  `CreateMeshDialog.tsx:216-236`), a name, optional material, optional base-color texture seeded
  onto every face. On confirm: creates the `CustomMesh`, rebuilds the shared atlas, **places one
  instance in the scene on the active layer and selects it**, closes dialog.
- **UI path**: top Toolbar → Add menu → "Create mesh…" (`AddButton.tsx:83`).
- **Files**: `src/ui/CreateMeshDialog.tsx`, `customAssetStore.addCustomMesh` (:944-977),
  `src/three/primitives.ts` (`buildPrimitiveGeometry`, `PRIMITIVE_FACE_KEYS`, `FACE_LABELS`,
  `applyFaceUvTransforms`), `src/ksa/exportGlb.ts` (`buildMeshAtlasGlb`).
- **Data model**: `$part.customMeshes` (+ `$part.placements` via `addSubPart`); `subPartId` is
  `flexo_<SanitizedName>_<shortId>` — the GLB node name and Assets.xml SubPart id, decoupled from
  the display name so renames never break placements.
- **Numeric fields**: `ParamNumberField` uses `useNumberDraft` + `inputMode="url"`
  (`CreateMeshDialog.tsx:197-209`) — the mandatory convention.

### 1.8 Add another instance of a custom mesh

- **UI paths** (three):
  1. Add menu → "Custom Meshes" submenu (primitives + imported, kitten meshes excluded)
     (`AddButton.tsx:85-98`);
  2. Custom Assets modal → Meshes / Imported rows → "Add instance" (dismisses the modal)
     (`CustomAssetsModal.tsx:152-155,302`);
  3. (implicitly) copy/paste of a placement, which is generic editor behavior.
- **Files**: `editorStore.addSubPart` (cross-area).

### 1.9 Edit primitive dimensions after creation

- **Does not exist as UI.** `updateCustomMesh(id, {primitive})` exists in the store
  (`customAssetStore.ts:1673-1683`, triggers a full atlas rebuild) but nothing in the UI calls it
  with a primitive patch — grep shows no caller passing `primitive`. A created box's dimensions are
  frozen; users scale the placement instead. **v2 opportunity flagged as a gap, not a feature.**
  (Same for renaming a mesh: `name` is in the patchable set but no UI path renames a custom mesh.)

### 1.10 Per-face texture + UV editing ("Manage Textures")

- **What**: For primitive meshes: face selector (hidden when the primitive has 1 face), per-face
  texture pick (base-color textures only), wrap mode (repeat / mirror / clamp), UV scale X/Y and UV
  offset X/Y with live viewport preview as you type. For every custom mesh: material assignment
  (1.6) and glow (1.11). For imported meshes: provenance block + "Render as glass". For kitten
  meshes: visor-surface controls instead of the plain glow section.
- **UI paths** (two):
  1. Custom Assets modal → mesh row → palette icon ("Manage textures for …") — closes the modal and
     opens the floating panel (`CustomAssetsModal.tsx:156-159`);
  2. right sidebar Assets list → SubPart row ⋮ menu → "Manage Textures" (primitives) / "Manage
     Material" (imported) (`AssetsList.tsx:579-585`) — also reachable via right-click on the row.
- **Files**: `src/ui/ManageTexturesPanel.tsx` (all sections), driven by `$managingMeshId`
  (`customAssetStore.ts:147-151`), `updateMeshFaceConfig` (:1686-1697). UV fields are
  `useNumberDraft` + `inputMode="url"` (`ManageTexturesPanel.tsx:720-739`).
- **Positioning**: desktop = a fixed-width (w-64) floating card absolutely positioned at
  `left-3 top-1/2 -translate-y-1/2 z-10`, max-h with internal scroll (`ManageTexturesPanel.tsx:148`);
  phone = fullscreen modal. Mounted once at app root (`app.tsx:121`).

### 1.11 Glow (emissive) authoring

- **What**: Per-mesh glow with modes **Off / Whole mesh / Painted spots**; color+coverage picker or
  a **color ramp (LUT)** with draggable stops, presets, and import-from-image (reads the middle row
  of the image); independent **Emissive** (white mask) slider with a wash-out warning above 0.6;
  "Add matching light" button that creates a KSA `<Light>` seeded with the glow color (the only way
  to get colored *light* in KSA — emissive is white-only).
- **UI path**: ManageTexturesPanel → "Glow (emissive)" section (`ManageTexturesPanel.tsx:566-598`,
  `GlowSettings` :448-508, `GlowRampEditor` :609-708, `AddMatchingLightButton` :515-531).
- **Files**: `setMeshGlow` (`customAssetStore.ts:1703-1709`), `src/ktx/glowComposite.ts` (the
  shared preview==export math: `diffuse = lerp(base, color, key·coverage)`,
  `mask = key·strength`), `src/ktx/glowRamp.ts`.
- **Data model**: `CustomMesh.emissive` (`EmissiveConfig`, types.ts:1832): shape, color, strength,
  coverage, optional ramp.

### 1.12 Glow paint canvas ("Painted spots" → "Edit glow…")

- **What**: 512×512 in-browser paint canvas; alpha = greyscale key, rgb = brush color; radial
  soft-falloff stamps (8 steps), painted THROUGH the ramp when one is set; brush size (4–128) and
  intensity sliders; eraser checkbox; Clear/Cancel/Apply. Apply writes a PNG to IndexedDB
  (`emissive-paint:<meshId>`) and sets shape='painted'.
- **UI path**: ManageTexturesPanel → Glow section, Mode="Painted spots" → "Edit glow…" button
  (`ManageTexturesPanel.tsx:586-589`) → modal `GlowPaintDialog`.
- **Files**: `src/ui/GlowPaintDialog.tsx` (pointer-capture painting :116-127), driven by
  `$glowPaintMeshId` (`customAssetStore.ts:154-158`), `setMeshGlowPainted` (:1769-1784).
- **Notes**: imported glTF emissive textures are stored under the SAME 'painted' shape
  (customAssetStore.ts:1104-1132), so an imported glow is retouchable in this dialog.

### 1.13 Visor surface (glass-capable kitten meshes)

- **What**: For a part-ified visor (`kitten.transparent`): Surface select **Glass / Glow (opaque) /
  Glass + Glow (layered)**; glass tint + opacity (`ColorAlphaField`); "Simulate in-game glass"
  switch (global `$simulateGlass` preview toggle mirroring KSA's muted glass shader); glow controls
  reuse 1.11. Both configs persist across mode switches.
- **UI path**: ManageTexturesPanel → "Visor surface" section (`ManageTexturesPanel.tsx:533-563`).
- **Files**: `setMeshSurface`/`setMeshGlass` (`customAssetStore.ts:1712-1760`),
  `$simulateGlass` (`settingsStore.ts:281`), export expansion `modExport.expandGlassGlow`
  (glassGlow = two SubParts: glass shell + inset opaque glow layer, kitten-only).

### 1.14 "Render as glass" (imported meshes)

- **What**: Export-only toggle routing an imported SubPart through `<PartModelGlass>` instead of
  `<PartModel>`. Editor preview deliberately stays opaque (KSA glass is one fixed shader; a preview
  would be a second wrong guess — the panel says so in one line). Offered/pre-set when the glTF
  material used `alphaMode: BLEND`.
- **UI path**: ManageTexturesPanel → "Imported model" section → Switch
  (`ManageTexturesPanel.tsx:381-391`).
- **Files**: `setMeshTransparent` (`customAssetStore.ts:1732-1741`), `ImportedMeshSource.transparent`
  (types.ts:1779-1784).

### 1.15 Import model (glTF/GLB) — the decisions/report flow

- **What**: One modal, three states (no wizard chrome):
  1. **DROP** — drop zone / file picker (`.glb`, or `.gltf` + `.bin` + images multi-pick) + the
     "How to export from Blender" recipe disclosure (`ImportModelDialog.tsx:496-600`).
  2. **REVIEW** — parsed model: live 3D preview (own `ModelPreviewViewport`) reflecting
     scale/up-axis; stats grid (SubParts, placements, materials, tris, verts, textures, measured
     bounds, estimated mod size, **estimated in-game VRAM** with tooltip); grouped warning list
     ("What KSA can't represent", each with a remedy); options column. Nothing touches the
     document; closing leaves no trace.
  3. **IMPORTING** — phase text ("Translating materials… / Normalizing geometry… / Encoding
     textures and creating SubParts…"), indeterminate progress bar, dialog undismissable.
- **Options** (review step, right column): Name prefix; **Scale** (draft numeric field, `>0`
  enforced, + preset buttons from `SCALE_PRESETS`); **Up axis** Y/Z (sticky); **Max texture size**
  1024/2048/4096 (sticky; re-runs the material translation); **Bake transforms to origin**
  (per-import); **Bake scale into geometry** (sticky); **Make double-sided** (per-import);
  **Decimate view meshes** (sticky, also read at export time); **Merge into one SubPart** (only
  when the whole model uses one material, `canMerge`); replace mode adds **Update materials from
  file** (default on).
- **Semantics** (`src/ksa/importPlan.ts`): one (glTF mesh × material × handedness) → one SubPart,
  each referencing node → one placement — a KSA game limit, not a preference; mirrored instances
  get their own SubPart (unconditional back-face culling); skinned meshes are bind-pose-baked;
  node transforms become placements (KSA atlases ignore the node graph).
- **Materials** (`src/ksa/importMaterials.ts`): glTF metallic-roughness → flexo assets: baseColor
  (factor baked into pixels when textured), metallic/roughness factors or MR texture →
  packed ORM / scalars, occlusion (+strength), normal (+scale), emissive → a 'painted' glow bitmap
  + color. Textures deduped by content hash; decode capped at the sticky max size; warnings for
  KTX2 sources, UV1, vertex colors, etc.
- **Commit** (`customAssetStore.importModelAsMeshes` :1198-1259): binaries first (import GLB under
  `import-glb:<importId>`, every texture, every glow PNG), then ONE `mutate()` = one undo step
  creating: a **new layer named after the file**, all textures, all materials, one `CustomMesh` per
  normalized mesh, one placement per instance; then selects the new placements, activates the
  layer, publishes `$importReport`.
- **UI entry points** (three, one mounted dialog driven by `$importModelRequest`):
  1. Add menu → "Import model…" (`AddButton.tsx:84`, opens on drop step);
  2. **drag-drop a .glb onto the 3D viewport** (`src/ui/ViewportDropZone.tsx`, wraps the canvas;
     shows a dashed "Drop to import a model" overlay; goes straight to review);
  3. "Replace…" on a batch in the Custom Assets modal (replace mode, below).
- **Files**: `src/ui/ImportModelDialog.tsx`, `src/three/loadModelFile.ts` (glTF-only front door;
  Draco + meshopt wired, KTX2 sources deliberately not), `src/three/ModelPreviewViewport.ts`,
  `src/ksa/importPlan.ts`, `importNormalize.ts`, `importMaterials.ts`, `importEstimates.ts`
  (VRAM/mod-size math, warning severities/grouping, scale presets).

### 1.16 Import report card

- **What**: Post-import/replace summary — mode icon, filename, counts (kept/added/placements/
  textures/materials/removed), removed SubParts **named**, non-blocking warnings in a disclosure.
  Dismissible, non-modal, never takes focus; replaced when the next import runs.
- **Where**: bottom-right corner overlay, `absolute inset-x-3 bottom-3 z-40` with
  `pointer-events-none` wrapper (`src/ui/ImportReportCard.tsx:33`), mounted at app root
  (`app.tsx:132`). Driven by `$importReport`.

### 1.17 Replace import (re-import after Blender iteration)

- **What**: Swaps one import batch's geometry in place, as one undo step. Matching by
  `(sourceNode, sourceMaterial)` — the only identity glTF keeps across exports
  (`matchImportedMeshes`, `customAssetStore.ts:1443-1496`). Matched SubParts keep `id` +
  `subPartId` (→ placements, GameData, animations, connectors, layer survive) and their arranged
  placements (new file's transforms NOT re-applied; surplus copies add placements); removed ones
  are deleted with their placements; "Update materials from file" off keeps flexo-side material
  edits. Orphaned assets are reference-count GC'd (`planOrphanedAssets` :1310-1341). Review step
  shows a match summary (Kept/New/Removed with removed names) and the confirm button reads
  "Replace (N kept, N new, N removed)".
- **UI path**: Custom Assets modal → Imported models → batch header → "Replace…" — closes the modal
  and opens the import dialog in replace mode on its drop step (`CustomAssetsModal.tsx:160-168`).
- **Files**: `replaceImport` (`customAssetStore.ts:1535-1671`), `ImportModelDialog` replace-mode
  branches (:204-229, :411-420, :675-705).

### 1.18 Remove import (reclaim a batch)

- **What**: Removes a whole batch: SubParts, placements, reference-count-orphaned materials and
  textures, and the batch's layer if nothing else lives on it. Confirm dialog states the exact
  inventory and warns: **binaries are deleted from browser storage and cannot be restored by
  undo** (undo restores descriptors, not bytes — imported geometry has no regenerable source).
- **UI path**: Custom Assets modal → Imported models → "Remove import" → ConfirmDialog
  (`CustomAssetsModal.tsx:402-428`).
- **Files**: `planImportRemoval` + `removeImport` (`customAssetStore.ts:1347-1433`),
  `releaseImportAtlas` (`src/three/importedMeshCache.ts:160`).

### 1.19 Delete a single custom mesh

- **UI path**: Custom Assets modal → mesh row (Meshes or Imported sections) → trash →
  ConfirmDialog (shows instance count). Also implicitly by deleting placements (placement delete
  does NOT delete the mesh template — only the modal deletes templates).
- **Files**: `removeCustomMesh` (`customAssetStore.ts:1794-1806`) — removes mesh + all its
  placements; deliberately does NOT delete the batch GLB (other batch SubParts still resolve from
  it; reclaiming bytes is "Remove import").

### 1.20 "Make Kitten Mesh" (kitten part-ify)

- **What**: Turns a kitten (hunter/polaris/banjo) into exportable SubParts: one undo step creating
  a "<Kitten> Mesh" layer + one `CustomMesh` per submesh (suit, head, eyes, helmet, visor, pack…)
  with identity placements; geometry CPU-baked from the shipped kitten glTF (cached, regenerated
  per session — never persisted); textures are Content/Core-relative KSA `.ktx2` references. The
  visor arrives glass-capable (1.13). New layer activated, all placements selected.
- **UI path**: top Toolbar → Add menu → "Make Kitten Mesh" submenu → Hunter/Polaris/Banjo
  (`AddButton.tsx:153-168`).
- **Files**: `makeKittenMeshPart` (`customAssetStore.ts:986-1022`), `src/ksa/kittenAssets.ts`
  (`kittenPartSubMeshes`), `src/three/kittenBake.ts` (`bakeKittenSubMeshes`,
  `buildKittenMaterial`, DefaultORM redirect gotcha).
- **Managed as**: placed SubParts on their layer — deliberately NOT listed in the Custom Assets
  modal (`CustomAssetsModal.tsx:129-131`) and excluded from the Add-menu "Custom Meshes" submenu
  (`AddButton.tsx:45`). Their surface editing happens via Assets-list row → Manage Textures.

### 1.21 Kitten texture export mode (reference-by-path vs bundle)

- **What**: Global setting for how part-ified kitten SubParts supply textures on mod export:
  `reference` = absolute `<Diffuse Path="{contentCorePath}\…">` into the user's game install (zero
  texture bytes in the mod, not portable; relies on .NET `Path.Combine` returning rooted paths
  as-is) with an editable Content/Core path field; `bundle` = copy the `.ktx2` verbatim into the
  mod's `Textures/` (portable).
- **UI path**: top Toolbar → **Settings** → "Kitten mesh textures (export)" section
  (`src/ui/SettingsButton.tsx:128-159`).
- **Files**: `$kittenTextureExport` (`settingsStore.ts:207-225`), consumed by
  `modExport.buildCustomBundle` (kitten texture resolution ~`modExport.ts:559-640`) and read in
  `ExportButton.tsx:188,287`.

### 1.22 Mod export of custom assets (the downstream consumer)

- **What** (cross-area but custom-asset-owned logic): `buildCustomBundle`
  (`src/ksa/modExport.ts:789-…`) ships one mesh-atlas GLB (one node per **placed** custom mesh,
  per source: primitive params / kitten bake clone / imported RAW indexed geometry), one deduped
  `<PbrMaterial>` per resolved channel set (uniform channels → interned 1×1 solid `.ktx2`s:
  `_FlatNormal`, `_NeutralORM`, `_ORM_<hex>`, `_BaseColor_<hex>`), uploaded `.ktx2`s copied
  verbatim (normal strength ≠ 1 re-encodes from source), grayscale channels packed into one ORM
  image, glow composited into diffuse+emissive pair, `_VM` view meshes decimated to 2000 tris when
  `decimateViewMeshes` is on (`VIEW_MESH_TRIANGLE_BUDGET`, `modExport.ts:752`). Unplaced custom
  meshes are silently NOT exported (`modExport.ts:806-807`).
- **UI path**: top Toolbar → Export → Mod tab (Export area's surface; the custom-bundle logic is
  this area's).

### 1.23 Project JSON export/share gating

- **What**: Data-only project export and share-link are **disabled when the project has
  binary-backed custom assets** (uploaded textures, primitive meshes, imported meshes); kitten
  part-meshes are data-only and export fine. `hasCustomAssets`
  (`src/state/projectTransfer.ts:155-157`); Phase-2 bundle format is an acknowledged TODO.

### 1.24 Hydration / persistence lifecycle

- On boot/project switch (`initCustomAssets`, `customAssetStore.ts:1866-1889`): `$projectName`
  subscription → `hydrateCustomAssets` (:1826-1855) reloads every texture blob (re-encoding
  legacy `_SRGB`-tagged ktx2s from source — cache invalidation, not migration,
  `ensureCurrentKtx2` :1815-1823), painted-glow bitmaps, re-registers import GLBs, rebuilds
  atlas/catalog. A `$part` subscription diffs a **mesh signature** (`meshSignature` :301-323) so
  undo/redo — which restores `$part` without running mutation helpers — retriggers rebuilds.
  `$simulateGlass` listener refreshes visor materials.

---

## 2. UI surface map

| Surface | Kind | Mounts / trigger | Positioning | Stacking | Issues |
|---|---|---|---|---|---|
| **Add menu** (texture/material/mesh/import/kitten-mesh entries) | toolbar menu | `AddButton` in `EditorToolbar` (floating top-center bar, `app.tsx:78`) | react-aria Popover (portal) | popover layer | 13+ items + 5 submenus; asset creation mixed with scene-entity creation |
| **CustomTextureDialog** | modal dialog | conditionally mounted by `AddButton` | kit `Modal` `variant="fullscreen"` `max-w-md` (portal) | modal overlay | window-level paste listener while open |
| **MaterialDialog** | modal dialog | mounted by `AddButton`, `CustomAssetsModal`, `ManageTexturesPanel` (3 hosts) | `Modal` fullscreen `max-w-md` | modal overlay | opens ON TOP of CustomAssetsModal and on top of the floating ManageTexturesPanel (modal-over-modal); own WebGL context per open |
| **CreateMeshDialog** | modal dialog | mounted by `AddButton` | `Modal` fullscreen `max-w-md` | modal overlay | no live preview of the primitive |
| **CustomAssetsModal** ("Custom (N)") | modal dialog | `AssetsToolbar` → button; toolbar lives at top of right-sidebar Assets mode (`InspectorContent.tsx:50`) | `Modal` fullscreen `max-w-2xl` | modal overlay | THE management hub, hidden behind a sidebar button label "Custom (N)"; hosts 4 ConfirmDialogs + MaterialDialog stacked |
| **ManageTexturesPanel** | floating card (desktop) / fullscreen modal (phone) | app root (`app.tsx:121`), driven by `$managingMeshId` | `absolute left-3 top-1/2 -translate-y-1/2 w-64 max-h-[calc(100vh-6rem)]` | `z-10` | overlaps left-side surfaces (MeasurementEditor/ContainerEditor cards, ChainPalette); not draggable; opening from CustomAssetsModal force-closes the modal |
| **GlowPaintDialog** | modal dialog | app root (`app.tsx:124`), driven by `$glowPaintMeshId` | `Modal` (default size) | modal overlay | canvas fixed 512²; no undo inside the painter (Clear only) |
| **ImportModelDialog** | modal dialog (3-state) | app root (`app.tsx:128`), driven by `$importModelRequest` | `Modal` fullscreen `max-w-4xl` | modal overlay | un-dismissable while importing (deliberate); review step is dense (preview + stats + warnings + 10 options) |
| **ImportReportCard** | corner overlay card | app root (`app.tsx:132`), driven by `$importReport` | `absolute inset-x-3 bottom-3 z-40` right-aligned, `sm:w-80`, max-h 60vh | `z-40` | sits in the toast corner; can cover MeasurementInfo / bottom HUD area on phone (inset-x-3 full width) |
| **ViewportDropZone overlay** | HUD overlay | wraps `ViewportCanvas` (`app.tsx:63`) | `absolute inset-3 z-10` dashed border | `z-10` | none — pointer-events-none |
| **Assets list row menus** ("Manage Textures/Material") | context/⋮ menu | right sidebar Assets list rows | Popover (portal) | popover | entry point for surface editing is 2 levels deep and named differently per mesh kind |
| **Settings → Kitten mesh textures** | modal section | `SettingsButton` in toolbar | `Modal` | modal | an export decision living in global Settings, far from Export |

Approximate z-order (app root, `fixed inset-0`): canvas < drop-zone overlay (z-10) =
ManageTexturesPanel (z-10) < toolbars < ImportReportCard (z-40) < react-aria portals
(modals/popovers, portal to body, above all).

---

## 3. State & data flow

**Stores** (`src/state/customAssetStore.ts` is the orchestrator):

- `$part` (editorStore) — the document. Custom-asset arrays: `customTextures`, `customMaterials`,
  `customMeshes` (+ placements/layers touched by import/part-ify). All mutations via local
  `mutate()` → `pushUndo` → structuredClone → `$part.set` with an `internalCustomChange` flag so
  the store's own `$part` subscriber ignores them.
- Ephemeral UI atoms: `$managingMeshId`, `$glowPaintMeshId`, `$importModelRequest` (id remounts the
  dialog per open; `replaceImportId` selects replace mode), `$importReport`.
- Runtime URL maps (module-level, not stores): `textureKtx2Urls`, `textureSrcUrls`,
  `emissivePaintUrls`, `atlasUrl` — published reactively as `$customTextureUrls`,
  `$emissivePaintUrls`.
- `customMeshRenderCache` (module-level Map: subPartId → {geometry, materials[]}) — consumed by
  `src/three/SubPartObject.ts:55` to render custom meshes directly, bypassing the atlas GLB
  round-trip.
- `$customCatalog` (catalogStore) — synthetic `CatalogSubPart` entries per custom mesh, merged into
  `$catalogIndex` so custom SubParts resolve exactly like Core ones (preview viewports, export
  variant logic, SubPartObject fallback path).
- `$modelImportSettings`, `$kittenTextureExport`, `$simulateGlass` (settingsStore,
  localStorage-persisted).

**Persistence tiers**:

| Data | Where | Undo? |
|---|---|---|
| Descriptors (textures/materials/meshes/faceTextures/glow config) | project snapshot in localStorage (projectStore) | yes — one undo step per store helper |
| Texture source + encoded ktx2, import GLBs, painted-glow PNGs | IndexedDB `flexo-assets` (`assetDb.ts`), keys `tex-src:` / `tex-ktx2:` / `import-glb:` / `emissive-paint:` | **no** — deletes are immediate; undo restores descriptors only (stated in confirm dialogs for imports) |
| Primitive & kitten geometry | not persisted — regenerated (params / re-bake) | n/a |
| Sticky import prefs, kitten export mode, simulateGlass | localStorage (`flexo:*`) | no |
| Blob URLs, atlas, render cache, catalog | session-only, rebuilt by `scheduleRebuild` (serialized, coalescing) | rebuilt on signature change |

**No per-project namespacing in IndexedDB** — one shared blob store for all projects (ids are
random so no collisions; orphans possible after deleting a project).

**Cross-store subscriptions**: `$projectName` → hydrate; `$part` (signature diff) → rebuild;
`$simulateGlass` → catalog refresh; export reads `$modelImportSettings.decimateViewMeshes` at
export time (a setting labeled as an import option silently changing export output).

---

## 4. Pain points (with evidence)

1. **Discoverability is the headline problem — creation, management, and editing live in three
   unrelated places.** Create = top-toolbar Add menu (4 items among 13). Manage = right sidebar →
   AssetsToolbar → a button labeled "Custom (N)" → fullscreen modal. Edit surface = a floating
   panel opened from either the modal (which then force-closes, `CustomAssetsModal.tsx:156-168`)
   or a per-row ⋮ menu in the Assets list (`AssetsList.tsx:579-585`) whose label changes by mesh
   kind ("Manage Textures" vs "Manage Material"). The modal's own empty states literally give
   navigation directions to a different menu ("Use 'Upload texture…' in the Add menu",
   `CustomAssetsModal.tsx:186,244,289`) — a self-admission that creation and management are split.
2. **Modal-in-modal and modal↔panel handoffs.** MaterialDialog stacks over CustomAssetsModal
   (`CustomAssetsModal.tsx:430-432`); CustomAssetsModal must dismiss itself to open
   ManageTexturesPanel or the import dialog ("two stacked fullscreen modals would trap focus",
   comment at :160-164) — the user loses the list they were working from and must re-open it per
   mesh. GlowPaintDialog stacks over the floating panel.
3. **ManageTexturesPanel is a fixed, non-draggable card that collides with other left-side
   surfaces** (`ManageTexturesPanel.tsx:148`): MeasurementEditor/ContainerEditor cards and the
   ChainPalette also occupy the left edge; nothing arbitrates. It also does too much for a "w-64"
   column: material assign + edit + create, glow modes, ramp editor with per-stop rows, visor
   surface, imported provenance, per-face texture/wrap/UV — six disclosure-less sections stacked.
4. **No thumbnails/previews where decisions are made.** CreateMeshDialog has no 3D preview of the
   primitive; ManageTexturesPanel's texture Select is name-only (no swatch); the Custom Assets
   modal has 36px thumbs for textures but none for meshes/imported SubParts. MaterialDialog is the
   only surface with a real preview.
5. **No post-creation editing of primitive params or mesh names.** `updateCustomMesh` supports
   `name`/`primitive` patches (`customAssetStore.ts:1673`) but no UI calls them — a typo'd name or
   wrong-sized box means delete + recreate (losing placements).
6. **Texture rows can't be renamed or re-channeled safely at scale**: channel change re-encodes
   silently (good) but there's no indication which materials/faces use the texture beyond the
   delete confirm; no "where used" navigation.
7. **Import dialog review step density**: preview + 9-stat grid + match summary + warning groups +
   ~10 option controls in a `max-w-4xl` modal (`ImportModelDialog.tsx:311-427`). Works, but is the
   single densest surface in the app; on phone it's a long scroll.
8. **`decimateViewMeshes` is a sticky *import* setting that changes *export* output**
   (`modExport.viewMeshBudget()` reads `$modelImportSettings`, `modExport.ts:762`) — invisible at
   export time.
9. **Kitten texture export mode hides in global Settings** (`SettingsButton.tsx:128`) while every
   other export decision lives in the Export dialog; users exporting a kitten-mesh mod on another
   machine get an install-path-tied mod by default.
10. **Asset deletion silently destroys bytes with undo restoring only descriptors** — stated for
    imports, unstated for plain textures (`removeCustomTexture` deletes blobs immediately,
    `customAssetStore.ts:856-857`). An undo after texture delete yields a descriptor whose blobs
    are gone (faces render untextured; hydrate warns).
11. **Duplicated color conversion helpers**: `rgbToHex`/`hexToRgb` exist in `MaterialDialog.tsx:553`
    AND `ktx/glowRamp.ts` (imported by ManageTexturesPanel/GlowPaintDialog); `hexToRgb` in
    ImportReportCard-adjacent code. Minor, but symptomatic.
12. **`CustomAssetsModal` recomputes usage counts inline per render** (textureFaceUses/
    materialUses/meshInstanceCount closures at :139-149) and `groupImports` re-resolves per render
    — fine at small N, but the modal is also the only place these relationships are visible at all.
13. **The "Custom (N)" count conflates textures + meshes** (`AssetsToolbar.tsx:21`) and excludes
    materials — the number doesn't correspond to any one list the user sees.
14. **Unplaced custom meshes are silently dropped from mod export** (`modExport.ts:806`) — no
    warning anywhere that a mesh with zero placements won't ship.
15. **Three entry points for "add an instance"** (Add menu submenu, modal button, copy/paste) but
    none from the Assets list itself (a template is invisible there once its placements are
    deleted — it only reappears via Add menu/modal).

---

## 5. Invariants & constraints (MUST survive v2)

**Game contract (KSA XML/GLB semantics)** — see `scope/custom-assets-and-mod-export.md` for the
full numbered contract list; the load-bearing ones for this area:

- One SubPart = one mesh = one glTF primitive = one material; multi-material objects MUST split at
  import (`importPlan.ts` grouping); merge only when single-material (`canMerge`).
- GLB `meshes[i].name` must equal the SubPart id (`nameMeshesFromNodes` in exportGlb; KSA reads
  mesh name, not node name — NRE otherwise). `subPartId` == GLB node name == Assets.xml id;
  decoupled from display name; **must survive replace-import** (placements/GameData/animations/
  connectors reference it).
- Every `<PartModel>` must carry `<Material>`; every `<PbrMaterial>` must carry
  Diffuse+Normal+AoRoughMetal → uniform channels become interned 1×1 solid ktx2s; no-material
  meshes get `_NeutralORM` (255,128,0) + flat gray.
- KTX2 container tags are **UNORM + linear even for sRGB content** (KSA gamma-decodes in-shader;
  `_SRGB` tags double-decode → too dark; `ensureCurrentKtx2` regenerates legacy encodes — keep).
- Normal maps: user uploads OpenGL/glTF convention; **X-flip at encode**; strength baked into RG
  (KSA has no per-material normal scalar); export re-encodes at strength ≠ 1.
- ORM packing: R=AO, G=roughness, B=metalness; packed ORM overrides separate channels everywhere
  (editor preview, export) identically.
- Emissive is WHITE-only (mask × 1.25 added post-lighting): glow color must bake into the diffuse
  (`glowComposite` math is shared preview↔export — keep single source); coverage and strength stay
  INDEPENDENT sliders; the >0.6 washout warning; "Add matching light" is the colored-light path.
- Glass: `<PartModelGlass>` fixed shader (≈0.75 opacity, ~10% tint, never emissive, no
  `<Internal>`); glassGlow layered export is kitten-only (inset heuristic unsafe on arbitrary
  geometry); imported "render as glass" is export-only with an opaque editor preview *by design*.
- Back-face culling unconditional → mirrored instances split into own SubParts; double-sided =
  duplicate+flip geometry; sampler is always Repeat (wrap modes are editor-baked via UV transform).
- `_VM` view meshes: must keep indices AND normals; decimation budget 2000 tris; export path uses
  RAW indexed geometry, never the MikkTSpace-tangented editor cache (de-indexed → silent no-draw
  in KSA) — the two-accessor split in `importedMeshCache.ts` is deliberate.
- Import correction: Y-up default (no conversion); Z-up = RotX(−90°); metres; node transforms →
  placements.

**Persistence / data model**:

- IndexedDB `flexo-assets/blobs` key scheme (`assetKeys`, `assetDb.ts:83-97`) — import GLB is the
  ONLY copy of imported geometry; primitive/kitten geometry regenerates. No migration code ever
  (project constitution): stale data purges at boot.
- One-undo-step batching for import/part-ify/replace (binaries written before the single
  `mutate()`); undo restores descriptors, never bytes.
- Reference-counted GC of orphaned assets on remove/replace (`planOrphanedAssets`) — NOT
  provenance-tagged; unassigned assets are never collected.
- Replace-import match key `(sourceNode, sourceMaterial)`; matched SubParts keep arranged
  placements; "Update materials from file" semantics.
- `hasCustomAssets` gate on project JSON export/share.
- `meshKind()` discrimination — every consumer must switch on it, never assert `primitive!`.
- Material 'map' channels only ever reference live textures (delete clears them).

**UI conventions**:

- ALL numeric fields: `useNumberDraft` + `inputMode="url"` (CreateMeshDialog params, UV fields,
  import scale field already comply — keep).
- Sticky vs per-import option split (`settingsStore.ts:227-244`): scale / name prefix /
  double-sided / bake-transforms / merge must NOT persist (a leftover 0.01 scale is the worst
  failure mode); up-axis / texture cap / bakeScale / decimateViewMeshes do persist.
- Import dialog undismissable during commit; import is preview-only until confirmed.
- Import report as a persistent card, not a toast (removed SubParts must be named).
- Clipboard-paste into texture upload; `.gltf` sidecar multi-pick; viewport drag-drop entry point.
- Kitten meshes: excluded from the modal + Add-submenu; managed as placed SubParts.

---

## 6. Hotkeys

**None registered by this area.** `src/ui/hotkeys/registry.ts` contains only transform/edit/help/
seat-view bindings; no custom-asset hotkey exists. Adjacent key behaviors that touch this area:

- **Paste (ctrl/cmd+V)**: window-level `paste` listener while `CustomTextureDialog` is open
  (`CustomTextureDialog.tsx:57-70`) — captures clipboard images ahead of the editor's own paste.
- Generic Delete / copy / paste / undo / redo hotkeys act on placements of custom meshes like any
  SubPart (registry `delete`/`copy`/`paste`/`undo`/`redo`).
- Drag-drop of `.glb/.gltf` onto the viewport (not a hotkey but a global gesture reserved by this
  area, `ViewportDropZone.tsx`).

---

## 7. Cross-area dependencies

**This area calls into:**
- `editorStore`: `addSubPart`, `setSelection`, `setActiveLayer`, `nextLayerId`, `pushUndo`,
  `addLight` (glow "Add matching light"), `$part`.
- `catalogStore.$customCatalog` → merged into `$catalogIndex` (SubPart browser previews, export
  variant map, SubPartObject/SubPartPreviewViewport resolution).
- Layers: import/part-ify create + activate layers; `planImportRemoval` deletes empty ones.
- settingsStore (`$modelImportSettings`, `$kittenTextureExport`, `$simulateGlass`).

**Other areas call into this one:**
- `src/three/SubPartObject.ts` reads `customMeshRenderCache` (render path).
- `src/ksa/modExport.buildCustomBundle` reads meshes/materials/textures + IndexedDB blobs +
  `getImportedRawGeometry` + `bakeKittenSubMeshes`; `buildExportVariantMap` must skip custom
  meshes **by document lookup** (contract #19 — a regression here is a KSA startup crash).
- `AssetsList` (assets sidebar) row menu → `setManagingMeshId`.
- `AssetsToolbar` → CustomAssetsModal; the "Custom (N)" count.
- Export dialog (`ExportButton`) reads `$kittenTextureExport` and calls `buildCustomBundle`;
  `expandGlassGlow` for visors.
- `projectTransfer` (export/share gate + kitten-mesh data-only carry; id remap on paste).
- Animation area: custom meshes are animatable like any SubPart; `MeshPickerModal` is
  SubParts-only (KSA connectors can't animate — separate area). Replace-import preserves
  animation membership via `subPartId`.
- `projectStore.normalizePart` default-fills stored glow configs from `createGlow()`.
- Kitten area shares `kittenBake`/`kittenAssets` between KittenObject (visual aide) and part-ify.

---

## 8. Open questions for v2

1. **Unified asset manager shape**: one overlay covering textures + materials + meshes + imports +
   (maybe) animations/layers, vs. a persistent sidebar tab in the new left sidebar? The current
   modal force-closes to hand off to the floating surface editor — v2 must decide whether surface
   editing docks inside the manager (right pane of a two-pane manager) or stays a
   viewport-adjacent panel (live 3D feedback while tweaking UVs/glow argues for viewport
   adjacency; management argues for the manager).
2. **Where does "Manage Textures/Material" live in a mode-based layout** — a dedicated
   "material/texturing" mode with the right sidebar as the editor (like anim/engine modes), or a
   selection-driven inspector section? Per-face UV editing benefits from selected-face
   highlighting in the viewport (not currently implemented — worth considering).
3. **Should creation entries stay in the Add menu** (scene-centric muscle memory) or move into the
   asset manager (+ keep Add shortcuts)? Both defensible; duplication costs little.
4. **Mesh template visibility in the Assets list**: today templates are invisible unless placed.
   Should v2 list templates (with 0-instance state) in the manager only, or also in the scene
   list?
5. **Expose primitive param / name editing** (store support exists, no UI): in the manager, in the
   surface panel, or as an inspector for a selected placement's template?
6. **`decimateViewMeshes` placement**: keep as sticky import setting, move to export dialog, or
   both (per-export override)? Same question for kitten texture mode (Settings vs Export dialog).
7. **Byte-deletion vs undo**: keep "undo restores descriptors, not bytes", or move to deferred/
   trash-can deletion (blobs kept until project close) so undo genuinely works? Changes the
   confirm-dialog contract and storage growth profile.
8. **Import report card**: fold into the future bottom status bar / notification center, or keep a
   corner card? (It must remain persistent-until-dismissed and name removed SubParts.)
9. **Per-project IndexedDB namespacing** — adopt during the refactor (orphan cleanup, multi-project
   hygiene) or defer? Touches every assetKeys call site + hydrate.
10. **Texture "where used" / reverse references**: the delete confirms compute counts ad hoc; a v2
    manager could show usage chips (faces, material channels, meshes). Worth specifying now since
    the GC logic (`materialTextureIds`, `planOrphanedAssets`) already computes the graph.
11. **Glow paint canvas**: keep as separate modal or integrate as a paint *mode* on the mesh in the
    3D viewport (current canvas is 2D UV-space only, 512² fixed)? Big scope difference.
12. **Custom (N) count semantics** if the button survives anywhere: textures+meshes today; should
    it be per-kind badges or disappear entirely into the manager?
