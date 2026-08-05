# Area analysis: Part/SubPart catalog, browsers, placement, duplication & layers

Repo: `/Users/asherwin/repos/meow-sci/flexo`. All paths below relative to repo root unless absolute.
Verified against code (docs cross-checked): `docs/layers.md` and `docs/subpart-catalog.md` are current and accurate as of this analysis.

---

## 1. Feature inventory

### 1.1 The Add menu (single entry point for everything addable)

**UI path:** desktop: floating top toolbar → "Add" (`CirclePlus` icon) — `src/ui/Toolbar.tsx:29` mounts `AddButton`; phone: `src/ui/MobileTopBar.tsx:56` mounts the same `AddButton` in the phone top bar.
**Component:** `src/ui/AddButton.tsx:40-179` — one react-aria `MenuTrigger` + `Popover placement="bottom start"` with nested `SubmenuTrigger`s. The AddButton component also owns the open-state for five overlays it can spawn: SubPart browser, Part browser, CustomTextureDialog, MaterialDialog, CreateMeshDialog (`AddButton.tsx:46-50`, rendered at `:172-176`).

Complete menu contents (top→bottom), each with its action:

| Menu item | Action | Store call | File:line |
|---|---|---|---|
| **SubPart** | opens the full-viewport SubPart browser | — (opens `SubPartPopup`) | AddButton.tsx:62,77 |
| **Connector** | adds an attach node at origin (facing local +X), active layer, selects it | `addConnector()` `src/state/editorStore.ts:976-993` | AddButton.tsx:63 |
| **Import built-in Part** | opens the full-viewport Part browser | — (opens `PartPopup`) | AddButton.tsx:64,79 |
| **Define Engine…** | switches the inspector into engine mode | `enterEngineMode()` (`src/state/engineStore.ts`) | AddButton.tsx:70,80 |
| **Upload texture…** | opens `CustomTextureDialog` | — | AddButton.tsx:65,81 |
| **Create material…** | opens `MaterialDialog` | — | AddButton.tsx:66,82 |
| **Create mesh…** | opens `CreateMeshDialog` (primitive mesh); on submit `addCustomMesh` pushes the mesh AND immediately `addSubPart(mesh.subPartId)` places it at origin (`src/state/customAssetStore.ts:944-978`) | `addCustomMesh` | AddButton.tsx:67,83 |
| **Import model…** | opens `ImportModelDialog` at its drop/pick step | `openImportModel()` (`src/state/customAssetStore.ts:181`) | AddButton.tsx:69,84 |
| **Custom Meshes ▸** (only when non-kitten custom meshes exist) | submenu listing every re-placeable custom SubPart (primitives + imported glTF meshes; kitten submeshes excluded — `meshKind(m) !== 'kitten'` filter at :45); clicking places another instance at origin | `addSubPart(subPartId)` | AddButton.tsx:85-98 |
| **Collider ▸** | two menus in one popover: "Add at origin" (per `COLLIDER_SHAPES` shape) and "Fit to selection" (per shape). Fit publishes an intent atom the 3D scene consumes (needs world geometry) rather than a store mutator | `addCollider(shape)` `editorStore.ts:1002`; `requestColliderFit(shape)` (`src/state/colliderStore.ts`) | AddButton.tsx:99-121 |
| **IVA Seat** | adds a seat at origin looking +X (KSA `<IVASeat>` defaults); no submenu (one seat kind) | `addIvaSeat()` `editorStore.ts:1129` | AddButton.tsx:73,122 |
| **Light ▸** | Spot / Point. Adds a part-level light at origin, selects it, and `revealEntity` scrolls the Assets list to it. (SubPart-owned lights are authored elsewhere — from the SubPart Data dialog.) | `addLight(null, {type})` + `selectLight` + `revealEntity` | AddButton.tsx:123-142 |
| **Kitten ▸** | Hunter / Polaris / Banjo — editor-only visual aide at origin on pinned Kittens layer | `addKitten(kind)` `editorStore.ts:1224-1239` | AddButton.tsx:143-152 |
| **Make Kitten Mesh ▸** | Hunter / Polaris / Banjo — part-ifies a kitten into exportable custom SubParts: creates a "`<Name>` Mesh" layer, adds submeshes (suit/head/eyes/helmet/visor/pack…) as custom meshes + identity placements on that layer, one undo step, then selects them and makes the layer active | `makeKittenMeshPart(kind)` `src/state/customAssetStore.ts:986-1022` | AddButton.tsx:153-168 |

There is also a second kitten entry point outside the Add menu: **"Add kitten at seat"** (`addKittenAtSeat`, `editorStore.ts:1265-1282`) reachable from the IVA seat inspector — places the kitten at the seat position with pure-yaw facing (`kittenYawFacing`, :1252).

And a second model-import entry point: **drag-and-drop a `.glb`/`.gltf` onto the 3D viewport** — `src/ui/ViewportDropZone.tsx:20-62` wraps `ViewportCanvas` (`src/App.tsx:63-65`); shows a dashed accent overlay while dragging (`:52-58`), only accepts OS file drags containing a model file (`isModelFile` `:65-67`), and calls `openImportModel(files)`. `ImportModelDialog` is mounted once at app level (`App.tsx:128`) for both entry points.

### 1.2 SubPart browser ("Add SubPart")

**UI path:** Add → SubPart. **Files:** `src/ui/SubPartBrowser.tsx` (UI), `src/ui/BrowserShell.tsx` (modal shell + responsive layout), `src/state/catalogStore.ts` ($catalog/$catalogLoading/$catalogIndex), `src/ksa/catalog.ts` (loader), `src/ui/SubPartPreview.tsx` + `src/three/SubPartPreviewViewport.ts` (3D preview), `src/ui/LoadProgress.tsx` (`PreviewLoadProgress` overlay), `src/state/loadProgressStore.ts:98-106` (`openBrowserPopup`/`closeBrowserPopup` suppress the workspace progress bar while a browser is open — registered in a mount effect, SubPartBrowser.tsx:51-54).

Behavior details:
- **Shell:** `BrowserPopup` (`BrowserShell.tsx:9-34`) = react-aria `Modal variant="cover"` (`sm:w-[95vw] sm:max-w-[75rem]`), dismissable, `DialogHeader` with close X. Body only mounts while open ⇒ every open is a fresh session (search/selection/split positions reset).
- **Layout:** desktop `list | (preview / details)` with two draggable dividers (`HorizontalSplit`/`VerticalSplit`, `src/ui/VerticalSplit.tsx`), both reset to 50/50 per open; phone collapses to a 45/55 vertical list-over-preview (`BrowserShell.tsx:42-63`).
- **Search:** single `SearchField`, substring match on **id only**, lowercase (`SubPartBrowser.tsx:56-58`). Results capped at `MAX_RESULTS = 200` (`:22`) with **no indicator** that the list was truncated. Autofocus on desktop only (phone keyboard would cover the preview, `:156`).
- **List:** react-aria `GridList selectionMode="single" selectionBehavior="replace"` — arrow keys move the actual selection so keyboard nav drives the preview (`:87-99`). **No categories, no grouping, no thumbnails** — text rows only. Rows carry an "interior" `Chip` when the template is `<Internal>` (interior-only IVA prop) with an explanatory title (`:104-114`).
- **Commit gestures:** desktop double-purpose — clicking a row (onAction) **adds and closes**; the explicit "Add" button adds **without closing** (multi-add path). On phone tap only selects (drives preview); the Add button is the sole commit (`:96-98`). Both paths toast "SubPart Added" (2.5 s).
- **Placement:** `addSubPart(templateId)` (`editorStore.ts:561-578`) — pushes a placement at **origin (0,0,0), identity rotation, unit scale**, on the **active layer**, instanceId `<lastSegmentLower(templateId)>_<count+1>`, selects it. There is **no drag-from-browser-to-viewport placement anywhere** — everything lands at the origin and is then moved with the gizmo/nudge keys.
- **Preview pane:** `SubPartPreviewViewport` — read-only three.js scene mirroring the main viewport's lighting/tonemapping/IBL ($lighting subscription), orbit + zoom only (OrbitControls with damping), on-demand rendering (`RenderLoop`), shared geometry/material caches (never disposed per-preview) (`SubPartPreviewViewport.ts:11-62`). `PreviewLoadProgress` renders byte-level download bars over the preview.
- **Details pane (desktop bottom-right):** `SubPartDetails` (`SubPartBrowser.tsx:169-224`) — id, source XML file, mesh atlas URL + node name, material id, and each texture URL (Diffuse/Normal/AO-Rough-Metal/Emissive).

**Catalog data model:** `CatalogSubPart` (`src/ksa/catalog.ts:~20-67`): `id, atlasUrl, meshNodeName, materialId?, {diffuse,normal,aoRoughMetal,emissive}Url?, internal?, colliders?, sourceFile`. Loaded once, idempotently, from the fixed `ASSET_FILES` list of 16 Core `*Assets.xml` (`catalog.ts:70-87`) via browser DOMParser; `$customCatalog` (custom meshes, blob URLs) merges into `$catalogIndex` (`catalogStore.ts:14-19`) so the scene and previews resolve custom + Core identically.

### 1.3 Part browser ("Import built-in Part")

**UI path:** Add → Import built-in Part. **Files:** `src/ui/PartBrowser.tsx`, same `BrowserShell`, `src/state/partCatalogStore.ts`, `src/ksa/partCatalog.ts` (parses whole `<Part>` prefabs from the same Core XML files), `src/state/partImport.ts` (`importBuiltInPart`), `src/ui/PartPreview.tsx` + `src/three/PartPreviewViewport.ts`.

Differences from the SubPart browser:
- **Search matches id OR editorTags** (`PartBrowser.tsx:77-81`; tags come from `<EditorTag Value>` e.g. "Fuel Tanks"). Still substring, still MAX 200.
- Row shows the placement count on the right (`:141`).
- **Destination-layer Select** in the top row (`:193-211`): choices are **"New Layer"** (default; creates "New Layer N" via `nextNewLayerName` `:32-39` + `createLayer`), **"Current Layer"**, or any existing **ordinary** layer (pinned entity-only layers filtered out `:204-205`). Phone stacks search on its own row above Select+Add (`:175-180`).
- **Commit:** `importBuiltInPart(part, resolveLayerId())` then `revealLayer(layerId)` (forces the target layer visible + listed in Assets so an import is never invisible — `src/state/layerStore.ts:90-92`), toast "Part Added". Desktop row-click = add-and-close; Add button = add-and-stay.
- **Preview:** `PartPreviewViewport` assembles all SubPart instances at their relative transforms, renders connector markers (size from `$connectorSettings`), same lighting mirror, orbit/zoom, on-demand render. Options exist for an embedder (standalone wiki part-preview mini app): fill-fraction framing, axis gizmo, turntable azimuth, bounds callback (`PartPreviewViewport.ts:33-80`).
- **Details:** desktop `PartDetails` (`PartBrowser.tsx:279-363`) — counts (SubParts / unique types / connectors / animations), source file, editor tag chips, per-template breakdown with ×count and non-previewable warning; phone gets `CompactPartSummary` strip above the preview (`:238-272`).

**Import pipeline** (`src/state/partImport.ts:20-107` → `editorStore.addPart:824-945`):
- Fetches + decodes each `KeyframeAnimationModule`'s `_Anim.glb` (three.js decode lives in partImport so editorStore stays three-free), rebuilds `PartAnimation`s through the old→new instance-id map, fits easing, and anchors deploy clips at their **last** keyframe (`restKeyframeId` — imported KSA deploy clips are modeled deployed).
- Overrides animated SubParts' placements with the GLB-faithful rest pose (`partImport.ts:44-58`) — KSA positions animated SubParts solely from the GLB.
- `addPart` (one undo step "import"): regenerates instance ids (`<base>_<n>`) and connector ids, remaps sibling refs, coupling bindings, engine-module refs, feed wiring, per-template GameData (`applyImportedGameData`), appends colliders/IVA seats/lights, puts **all geometry (placements + connectors + colliders) on ONE layer** (`targetLayerId` if valid ordinary layer, else active layer; `:856-859`), merges editorTags, and **selects exactly what was imported across every kind** (skipping kinds whose layer is hidden/locked, matching the select-all rule; `:914-943`). Returns the layer id.
- Full GameData carried: `ImportedGameData` interface `editorStore.ts:581-643` (decoupler, dockingPort, evaDoor, diameters, controllable, customMass+extras, unknown attrs/children passthrough, batteries/generators/solarPanels/powerConsumer, subPartGameData, engine modules, tanks, solid motors, feed wiring, colliders, seats, lights). Deep-cloned from the catalog entry so later edits never mutate the cached catalog (`partImport.ts:75-76`).

### 1.4 Model import placement (glTF/GLB → SubParts)

Entry points: Add → Import model…, or viewport file drop (§1.1). `src/ui/ImportModelDialog.tsx:55-…` — three states in one modal (DROP → REVIEW with 3D preview/options/warnings/estimates → IMPORTING with progress). Nothing touches the document until confirm. On import, `importModelAsMeshes` (`customAssetStore.ts:1198-1259`):
- **Creates a brand-new layer named after the file** (`fileName` minus extension) and pushes all meshes/placements onto it.
- Appends custom textures/materials from the material plan, one `mutate('import model', …)` undo step.
- Makes the new layer **active**, selects the new placements, and publishes an `$importReport` (bottom-right `ImportReportCard`, `App.tsx:132`).
- A "replace existing import" path (`replaceImport`, matched by node/material names via `matchImportedMeshes`) updates a previous batch in place.
The import batch's normalized GLB is itself a mesh atlas (one named mesh per SubPart) resolved through the same `MeshAtlasCache` as Core (docs/subpart-catalog.md table).

### 1.5 Duplication flows

There is **no alt-drag duplicate** and **no Ctrl+D hotkey** — duplication is buttons/menus + copy/paste:

1. **Selection toolbar "Duplicate" button** — floating toolbar centered under the top toolbar whenever anything is selected (`src/ui/SelectionToolbar.tsx:72-74` → `duplicateSelected()`).
2. **`duplicateSelected()`** (`editorStore.ts:1477-1588`): duplicates every selected entity of every kind in one undo step; copies land **exactly on top of the source** (same transform — user must nudge/move after); SubParts/connectors/colliders keep the **source's layer**; kittens/seats/lights re-pinned to their built-in layers; seats append at the END of the IVA cycle order; fresh ids per kind (`<base>_<n>`, `_connectorN`, `_colliderN`, `_seatN`, `_lightN`, `kitten_N`); the new copies become the selection.
3. **Assets-list per-row "Duplicate"** — SubPart rows: `duplicatePlacement(index)` (`editorStore.ts:1750-1768`, acts on its row regardless of selection); other kinds: select-then-`duplicateSelected` (`AssetsList.tsx:578, 711-718`).
4. **Copy/paste** — `mod+c`/`mod+v` (`src/ui/hotkeys/registry.ts:148-160`): `copySelected` (`editorStore.ts:1626-1645`) snapshots placements/connectors/kittens/colliders/ivaSeats into the in-memory `$clipboard` (**note: lights are NOT copyable** — `PartClipboard` `editorStore.ts:195-201` has no lights field, though `duplicateSelected` does handle them); `pasteClipboard` (`:1656-1743`) pastes in place with regenerated ids, keeps the source layer if it still exists else falls back to active (`pasteLayerId` `:1595-1597`), selects the pastes, toasts a count. Clipboard is ephemeral (survives layer deletion, not reload).
5. **Action chains** (adjacent area; `applyActionChain` `editorStore.ts:1814` clones seed placements) — bulk patterned duplication via ⌘K palette.

### 1.6 Layers system (complete capability map)

**Data model** (verified `docs/layers.md` ↔ code):
- `Layer = { id, name }` (`src/ksa/types.ts`) — **no color, no icon, no nesting, no per-layer description**. Array order in `part.layers` = display order.
- Membership: `layerId` string on every placement/connector/collider/kitten/seat/light.
- Built-in layers seeded by `createEmptyPart()`, never deletable (`BUILT_IN_LAYER_IDS`): **Default** (`default`), **IVA Seats** (`ivaSeats`), **Lights** (`lights`), **Kittens** (`kittens`). The last three are `ENTITY_ONLY_LAYER_IDS` — pinned: only their own kind lives there, nothing may be moved on or off.
- `LayerableKind` (ordinary layer citizens): `'subpart' | 'connector' | 'collider'`.

**Document mutations** (all undoable via `pushUndo`, `src/state/editorStore.ts`):
- `createLayer(name)` :3669 — appends, becomes active, blank → "Layer N"; ids `layerN` (`nextLayerId` :3660).
- `renameLayer` :3683 — committed once on blur/Enter/save button, not per keystroke.
- `deleteLayer(id, {mode, targetLayerId})` :3707 — `'move-items'` (reassign placements/connectors/colliders, invalid/pinned target → Default) or `'delete-items'`; built-ins protected; active layer falls back to Default; selection clamped.
- `clearLayer(id)` :3740 — empties without deleting (the undeletable Kittens layer's trash behavior).
- `reorderLayers(orderedIds)` :3760 — permutation-validated.
- `moveEntityToLayer(kind, index, layerId)` :3791 — single row; refuses pinned targets (`isMoveTarget` :3782).
- `moveSelectionToLayer(layerId)` :3819 — every selected SubPart+connector+collider in ONE undo step; pinned kinds silently stay; selection preserved (layerId edit doesn't reorder lists).

**Ephemeral (no undo):**
- `$activeLayerId` atom :210 (where new items land) — `setActiveLayer` :3918; clamped to a live layer on undo/redo (`clampActiveLayer` :385, called at :427/:447); reset by `newPart()` :3978. **Persisted inside each project snapshot** (`projectStore.ts:157, 279-280` — validated on load) and autosave-subscribed (`:466`).
- `selectLayerEntities(id)` :3927 — selects every entity of every kind on the layer (the "bulk subpart selection via layers" primitive v2 wants).
- `deselectLayer(id)` :3946 — prunes a layer's entities from selection; MUST cover every selectable kind (gizmo-stuck-on-locked-entity hazard documented in the comment :3941-3945).

**View state** — `src/state/layerStore.ts`: `$layerView = persistentJSON('flexo:layerView', {})` — per-layer `{ visible, locked, listed, opacity }`, sparse with defaults (`DEFAULT_LAYER_STATE` :31), localStorage-persisted, deliberately **not** undo-tracked. Actions: `toggleLayerVisible` :72, `toggleLayerListed` :81 (Assets-list display only, does NOT prune selection), `revealLayer` :90 (visible+listed, used post-import), `setLayerLocked`/`toggleLayerLocked` :99-107 (locking prunes selection via one-way import `layerStore → editorStore`), `setLayerOpacity` :110 (clamped 0–1).

**3D enforcement** — `src/three/EditorScene.ts`:
- `applyLayerView()` :907-980 (subscribed to `$layerView` :625) sets each entity group's `.visible` and applies opacity dimming; re-applied after async builds (:701) and reconcile (:718, :753, :895). Light glows honor layer visibility at :1218-1230.
- Click-select callbacks reject hits on locked **or hidden** layers for every kind (six guards, :322-403 — three.js raycaster does NOT skip invisible objects, hence the explicit visible check).
- Gizmo/transform path refuses when any selected entity's layer is locked (:1669-1674).
- Opacity dimming mechanics: `src/three/layerOpacity.ts` — snapshots each material's base opacity/transparent/depthWrite (`captureOpacityBase`) and re-derives dimmed state from base (never from live values); `needsUpdate` flips only when `transparent` crosses so slider drags don't recompile shaders.

**Group transforms are kind-aware** (`src/three/bulkTransform.ts` `scalesWithGroup`/`groupScaledTransform`, mirrored by `scaleEverything` `editorStore.ts:2349`): SubParts/kittens position+scale multiply; colliders same (scale IS meters); **connectors move but scale is NEVER touched** (KSA `<Scale>` = attach-node size CLASS, re-grading would change how the part connects); seats/lights position+rotation only, scale pinned (1,1,1).

### 1.7 Layers panel UI

**UI path:** right inspector → Assets toolbar → "Layers (N) · <active name>" button (stretches to fill; `src/ui/AssetsToolbar.tsx:30-32`, `src/ui/LayersButton.tsx:15-43`) → `Popover placement="bottom end"` `w-[min(450px, 100vw-1.5rem)]` containing `LayersPanel`.

`src/ui/LayersPanel.tsx:98-194`:
- **Create:** name TextField + Add button (Enter commits; disabled when blank) — new layer becomes active.
- **List:** react-aria `GridList selectionMode="single" selectionBehavior="replace" disallowEmptySelection`; the single selection **IS the active layer**; selecting a layer **closes the popover** (`onLayerSelected` → `setOpen(false)`, LayersButton.tsx:38). Max height 50vh, scrolls.
- **Drag-and-drop reorder** via `useDragAndDrop` + explicit grip handle (`DragButton slot="drag"` :240-246) → `reorderLayers` (custom `computeReorder` :64-76).
- **Per-row controls** (each `stopPropagation`s pointer-down so it doesn't change the active layer, :236): count `Chip` (total with per-kind tooltip from `$layerSummaries`, `src/state/selectors.ts:162-197`); rename (pencil button or double-click name → inline `RenameInput`, Enter/save commits, Escape cancels :412-441); eye (visibility); **opacity** (`LayerOpacityButton` :349-410 — Blend icon opens a nested popover with a 0-100 `useNumberDraft` text field `inputMode="url"` + slider, icon tints accent when <100%); lock; "listed in Assets" toggle; **select-all-in-layer** (disabled when locked or empty → `selectLayerEntities`); delete (disabled for built-ins; repurposed as "Delete all items in layer" for Kittens → `ClearLayerDialog` :525-545).
- **Delete flow:** `DeleteLayerDialog` (`:443-518`) — a `ConfirmDialog` (modal!) with entity counts, a Move-items/Delete-items `ToggleButtonGroup`, and a destination `Select` for move mode.

### 1.8 Layer surfaces elsewhere

- **Assets list sections** — `src/ui/AssetsList.tsx:136-485`: one `GridListSection` per **listed** layer (unlisted layers vanish from the list but keep their 3D state), rows grouped by kind (SubParts, connectors, colliders, seats, lights, kittens), header shows layer name + count + "· hidden"/"· locked" flags. One GridList spanning sections ⇒ **multi-select spans kinds and layers**; kind-prefixed row keys (`sp:`/`con:`/`col:`/`iva:`/`kit:`/`lig:` :88-96) partitioned back into the six per-kind selection stores in `onSelectionChange` (:340-395). Selection gestures: click replaces; Cmd/Ctrl+click toggles; Cmd/Ctrl+A selects every enabled row; **Shift+click range** via the custom `useShiftRangeSelect` (`src/ui/rangeSelect.ts` — react-aria's own range extension can't survive a store-controlled list) — ranges run over displayed order and can span layers. Locked-layer rows fully disabled; hidden-layer rows listed at 40% opacity, un-selectable (matching 3D) but keep their row menu (:295-301, :364-368). Search filter (substring, matches id/template/flags/"interior"/seat-ordinal etc., :158-159). Right-click a row opens the same ⋮ menu (synthetic click on the button, :459-464). `$revealEntity` scroll-into-view via `data-asset-key` DOM query (:400-407).
- **Assets row menus** (see §1.5 for Duplicate): SubPart rows get Duplicate / Manage Material|Textures (custom meshes) / SubPart Data (tanks modal) / Interior (IVA only) submenu (per-TEMPLATE, selection-aware, glass-disabled) / **Change Layer** submenu / Delete-with-confirm (`SubPartRowMenu` :538-641). Connector+collider rows get Change Layer too; seats/lights/kittens don't (pinned) (`SimpleRowMenu` :649-743; seats additionally get "Sit in this seat").
- **Multi-select floating toolbar** — `src/ui/MultiSelectToolbar.tsx:32-49`: appears (stacked under SelectionToolbar) when >1 entity selected; **Change Layer** menu (`moveSelectionToLayer`) when any SubPart/connector/collider selected; Interior (IVA only) bulk toggle; Delete All (N) with confirm.
- **Part browser destination-layer Select** (§1.3).
- **Model import → new layer per file**, **Make Kitten Mesh → new "<Name> Mesh" layer** (§1.4, §1.1).
- **Project import** (`importProjectData` `editorStore.ts:954-973` / `mergeProjectImport`): each source layer mirrored as a NEW layer; first new layer becomes active.
- **KSA XML paste-import** (parser assigns everything `DEFAULT_LAYER_ID` — XML has no layers).

### 1.9 What layers can NOT do today (v2 leans on layers — explicit gaps)

- No layer **color** or **icon** (`src/ui/layerIcons.tsx` is just a shared lucide icon-set for the panel's buttons, not per-layer icons).
- No **solo/isolate** mode (hide all but one), no "invert visibility".
- No per-entity visibility/lock — only per-layer.
- No layer **groups/nesting/folders**.
- No drag-entities-between-layers in the Assets list (menu-only moves).
- No layer-scoped **filtering** anywhere except the Assets list sections; notably the animation **Mesh Picker ignores layers entirely** — `src/ui/MeshPickerModal.tsx:39-43` lists ALL placements flat (no layer grouping, includes hidden/locked layers' placements) with only a text filter + shift-range select.
- Layer opacity does not affect the pinned marker kinds' rendering the way it does meshes (dimming targets mesh materials via SubPart/Connector/Kitten objects — `layerOpacity.ts` header).
- Active layer is not visible anywhere outside the Layers button label; no status-bar indicator.
- No hotkeys for any layer operation.

---

## 2. UI surface map

All floating chrome is absolutely positioned over the full-viewport 3D canvas (`App.tsx:56-146`); react-aria overlays (Popover/Modal) portal to the document root and manage their own stacking.

| Surface | Kind | Mounts / positioning | Notes |
|---|---|---|---|
| Add menu | toolbar-menu (Popover `bottom start`, portal) | top toolbar (desktop centered `left-1/2 top-3`; phone top bar) | 4 nested submenus; opens 2 cover-modals + 3 dialogs |
| SubPart browser | dialog (Modal `variant="cover"`, ~95vw ×75rem max, portal) | app root via `AddButton` state | 2 draggable split dividers; internal preview canvas; suppresses workspace progress bar via `$browserPopupCount` |
| Part browser | dialog (Modal cover) | same | + destination-layer Select |
| Import model dialog | dialog (Modal, 3-state wizard-in-one) | `App.tsx:128`, opened by atom `$importModelRequest` | own 3D preview viewport; drop zone inside |
| Viewport drop overlay | HUD (absolute `inset-3 z-10`, pointer-events-none) | inside `ViewportDropZone` | only while an OS file drag hovers |
| Import report card | HUD (bottom-right, non-modal) | `App.tsx:132` | dismissible |
| Selection toolbar | floating-bar (absolute `top-16 left-1/2`) | `App.tsx:93` | Move/Rotate/Scale + Duplicate + Chain + Delete |
| Multi-select toolbar | floating-bar (stacks under Selection toolbar) | `App.tsx:94` | Change Layer / Interior / Delete All; the vertical stack can grow tall and overlap the workspace center |
| Assets toolbar | sidebar strip | right inspector top (`InspectorContent.tsx:50`) | Layers + Custom(N) + Engine(N) + Anim(N) |
| Layers button + popover | sidebar button → Popover `bottom end` (portal, ≤450px wide) | Assets toolbar | popover closes on active-layer pick |
| Layers panel | panel inside that popover | — | GridList ≤50vh scroll |
| Layer opacity popover | popover-in-popover (DialogTrigger inside LayersPanel row) | portal | number field + slider |
| Delete/Clear layer dialogs | modal (`ConfirmDialog`) spawned from popover | portal | modal-over-popover stack |
| Assets list | sidebar panel (fills inspector below toolbar) | `InspectorContent.tsx:52`; phone: bottom-sheet `MobileInspector` | per-layer sections; per-row ⋮ menus (Popover), confirm dialogs, ManageTanksModal (modal from row menu) |
| Mesh Picker | dialog (Modal fullscreen `max-w-2xl`) | AnimToolbar (anim mode) | SubParts only, layer-blind |
| Right inspector | sidebar (absolute right-3 top-3 bottom-3, resizable via left-edge drag, width persisted) | `RightPanel.tsx:50-91` | container is pointer-events-none with opt-in children to avoid swallowing toolbar clicks — a known fragility pattern |
| Mobile top bar | full-width bar + ☰ overflow menu | `MobileTopBar.tsx` | Add is a primary action; secondary overlays controlled from here to avoid menu-in-menu |

Known overlap/clipping characteristics: the centered toolbar reserves `right-[19rem]` below `lg` to avoid the inspector (`App.tsx:78`); the selection/multi-select stack is not draggable and sits over the model; the Layers popover + opacity popover + confirm modal is a 3-deep stack; browser modals cover the entire workspace (no side-by-side compare with the scene).

---

## 3. State & data flow

**Stores:**
- `$part` (document, `editorStore.ts:113`) — layers array, per-entity `layerId`, placements/connectors/colliders/kittens/seats/lights, customMeshes. Undo/redo via snapshot stacks (`pushUndo` :399, undo/redo :413-451 clamp selection AND active layer). Autosaved (debounced) into the current project (IndexedDB via `projectStore`/`assetDb`); serialized compactly by `projectCodec.ts` (layers as `l:[{i,n}]` :1364-1388; per-entity `l` field; pinned kinds' layerId restored as constants on decode, not stored — :272-314, :535-580).
- Six per-kind selection index atoms + computed single-index views (`editorStore.ts:119-193`); ephemeral, never persisted; clamped on undo/redo/mutations.
- `$activeLayerId` — ephemeral atom but snapshotted per project (see §1.6).
- `$layerView` — localStorage `flexo:layerView` (visible/locked/listed/opacity per layer id); NOT per-project (global — a layer id collision across projects shares view state; ids are `layerN` so collisions are routine).
- `$clipboard` — in-memory only.
- `$catalog`/`$catalogLoading`/`$customCatalog`/`$catalogIndex` (`catalogStore.ts`) and `$partCatalog`/`$partCatalogIndex` (`partCatalogStore.ts`) — loaded once per session from `/ksa/` XML; not persisted.
- `$layerSummaries`, `$activeLayer`, `$hasSelection`, `$hasMultiSelection`, `$selectionCount`, `$selectedRefs`, `$selectedEntity` (`src/state/selectors.ts`).
- `$browserPopupCount` (`loadProgressStore.ts:98`), `$revealEntity` (`editorStore.ts:2091`).

**Cross-store subscriptions:** `layerStore` imports `deselectLayer` from `editorStore` (one-way, acknowledged at `editorStore.ts:80`); `EditorScene` subscribes `$layerView`, `$part`, selection atoms with vanilla `subscribe()`; `SubPartPreviewViewport`/`PartPreviewViewport` subscribe `$lighting` and `$connectorSettings`.

**Undo participation:** layer defs/membership/entity mutations = yes (discrete, self-recorded with human-readable description+detail strings that feed the History panel and undo/redo toasts); active layer / selection / layer view = no.

---

## 4. Pain points (file:line evidence)

1. **The Add menu is a flat grab-bag** mixing entity placement (SubPart/Connector/Seat/Light/Kitten), mode entry (Define Engine…), asset authoring (texture/material/mesh), and importers (Part/model) — 13 top-level entries + 4 submenus in one popover (`AddButton.tsx:76-168`), with no icons or grouping separators. `AddButton` also owns five overlays' open state (:46-50) — component doing too much.
2. **Layers UI is a dense popover, not a panel**: 8 interactive controls per row squeezed into ≤450px (`LayersPanel.tsx:238-337`), opacity is a popover-inside-a-popover (:349-371), delete confirm is a modal spawned from a popover (:443-518), and **picking the active layer closes the whole popover** (`LayersButton.tsx:38`) so multi-step layer workflows require reopening repeatedly.
3. **No placement positioning**: every add lands at origin (0,0,0) (`addSubPart` `editorStore.ts:571`, `addConnector` :983, `addCollider`, `addIvaSeat`, `addKitten`) — no drop-at-cursor, no drag-from-browser, no "place near selection". After add, users always immediately transform.
4. **Duplicates/pastes land exactly on the source** (`duplicateSelected` copies transforms verbatim :1521-1523; `pasteClipboard` "in place" :1692-1694) — invisible until nudged; easy to create unnoticed doubled geometry.
5. **Clipboard silently drops lights** — `PartClipboard` has no lights field (`editorStore.ts:195-201`), while `duplicateSelected` supports them (:1576-1585). Inconsistent bulk semantics.
6. **Browser search is primitive**: substring on raw XML ids only (`SubPartBrowser.tsx:56-58`), `MAX_RESULTS=200` truncation with no "N more" indicator, no category/tag facets (Part editorTags are searchable but not browsable), no thumbnails in the list, single-preview-at-a-time.
7. **Desktop row-click adds AND closes** (`onAction` `SubPartBrowser.tsx:98`) while the Add button adds-and-stays — two commit gestures with different consequences and no visual differentiation; accidental single click on a row while browsing commits an add.
8. **Selection plumbing is six parallel index-array stores** partitioned/reassembled everywhere (`AssetsList.tsx:340-395`, `selectors.ts:51-98`, `deselectLayer` `editorStore.ts:3946-3970` which "MUST cover every selectable kind" by hand) — index-based (not id-based), fragile against reorder, and every new kind touches ~10 call sites.
9. **Assets-list reveal is a DOM query hack** — `$revealEntity` + `querySelector('[data-asset-key=…]')` (`AssetsList.tsx:400-407, 449-451`) because the 3D layer can't reach the list.
10. **MeshPickerModal is layer-blind** (`MeshPickerModal.tsx:39-43`): no layer grouping/filter, shows placements on hidden AND locked layers — inconsistent with the Assets list's own rules, and exactly where layer-based bulk attach would shine.
11. **`$layerView` is global localStorage keyed by `layerN` ids** (`layerStore.ts:39`) — two projects both having `layer1` share visibility/lock/opacity state across projects; stale entries accumulate forever.
12. **Hidden-layer rows keep a live Duplicate menu item** (`AssetsList.tsx:299-301` keeps menus for hidden rows; `duplicatePlacement` then selects the invisible copy `editorStore.ts:1767`) — you can duplicate into a hidden layer and see nothing happen.
13. **Right-click menu is a synthetic button click** (`AssetsList.tsx:459-464`) — clever but positions the menu at the ⋮ button, not the cursor.
14. **Layer summaries recompute maps on every $part change** and AssetsList rebuilds all index maps + row arrays each render (`AssetsList.tsx:150-293`) — fine today, but the pattern is O(entities) per keystroke of the filter.
15. **Interior toggle duplicated** in both the row menu (`AssetsList.tsx:587-614`) and MultiSelectToolbar (`MultiSelectToolbar.tsx:86-119`) with near-identical glass-gating logic — shared candidate.
16. **Two browsers are near-clones** (`SubPartBrowser.tsx` vs `PartBrowser.tsx` — same shell, same selection code, same toasts) differing only in details pane + layer Select; drift risk (e.g. the tags-searchable difference already diverged).

---

## 5. Invariants & constraints (MUST survive v2)

- **Layers are editor-only** — never serialized to KSA XML; serializers ignore `layerId` entirely; the XML parser assigns `DEFAULT_LAYER_ID`. Export output must remain byte-identical regardless of layer arrangement.
- **Pinned entity-only layers**: seats/lights/kittens always on their built-in layers; nothing else may move on, they may never move off (`ENTITY_ONLY_LAYER_IDS` guards in `addPart` :856-859, `isMoveTarget` :3782, delete-layer target validation :3713-3719).
- **Kittens are never exported** (editor-only aides); the Kittens layer is undeletable but clearable.
- **IVA seat array order IS the in-game cycle order** — seat rows are ordinals; duplicates/pastes must append at the END; imports preserve source order verbatim (`ImportedGameData.ivaSeats` doc `editorStore.ts:626-635`).
- **Connector `<Scale>` is a size CLASS, not geometry** — group scale must never touch it (`bulkTransform.ts` rule; docs/layers.md §Transforms). Seats/lights pin scale to (1,1,1).
- **Import id remapping**: `addPart` regenerates instance/connector ids and remaps animations, coupling, engine modules, feed wiring, sibling refs through old→new maps in the SAME undo step; collider/light `ownerTemplateId` names a TEMPLATE and is never remapped (:645-652, :620-643).
- **Deploy-clip rest anchor**: imported KSA animations anchor at the LAST keyframe (`restKeyframeId`, `partImport.ts:66-73`) — flexo-internal, not exported.
- **`<Internal>` is per-TEMPLATE** (lives on the template's `<PartModel>`) — the toggle applies to every placement of a template and glass templates (`<PartModelGlass>`) have no such field (`setPlacementsInternal` :3896-3915, `isGlassTemplate` :3871).
- **Locked ⇒ never selected**: locking prunes selection (`setLayerLocked`), click-select rejects locked/hidden layers per-kind, imports skip selecting entities on hidden/locked layers, and `deselectLayer` must cover every kind (comment :3941-3945). Hidden ⇒ unclickable in 3D requires the explicit `isLayerVisible` raycast guard (three.js does NOT skip invisible objects — `EditorScene.ts:323` comment).
- **Numeric inputs**: `useNumberDraft` + `inputMode="url"` everywhere (layer opacity field `LayersPanel.tsx:388-391` is the in-area example); never `type="number"`, never ad-hoc `Number(v)` controlled fields.
- **Visibility/lock/listed/opacity are view prefs**: persisted (localStorage) but excluded from undo; toggling the eye must never create an undo step.
- **Layer membership survives duplication/paste with fallback**: copies keep the source layer; pastes fall back to active layer only when the source layer no longer exists (`pasteLayerId` :1595).
- **`revealLayer` after part import** — an import must never land invisible/unlisted (`PartBrowser.tsx:101-113`, `layerStore.ts:86-92`).
- **Instance-id scheme**: `<lowercased-last-template-segment>_<count+1>` for SubParts, `_connectorN` / `_colliderN` / `_seatN` / `_lightN` / `kitten_N` / `layerN` counters probed against existing max — imported-model ids additionally probe for gaps (`pushImportedPlacement` `customAssetStore.ts:1035-1055`).
- **Catalog loading is idempotent-once** (`ensureCatalogLoaded`/`ensurePartCatalogLoaded`), Core + custom catalogs stay separate atoms merged in `$catalogIndex`; shared `MeshAtlasCache` geometries are never disposed per-instance.
- **`/ksa/` asset base** respects Vite `base` / `VITE_ASSET_BASE` (`toUrl`, `catalog.ts:89-96`); dev server base path is `/flexo/`.
- **Add menu placement defaults are KSA semantics**: seat at origin looking +X (KSA `<IVASeat>` defaults), connector facing local +X, kitten faces local −Z (KSA `Forward`; `kittenYawFacing` math `editorStore.ts:1241-1255`).
- **Browser popups suppress the workspace progress bar** while open (they show their own overlay) — `$browserPopupCount` contract.
- **No data migration** (project constitution): stale persisted shapes are purged at boot, never converted.

## 6. Hotkeys

Registry: `src/ui/hotkeys/registry.ts` (single source for bindings AND the help overlay). This area's relevant bindings — **none are layer- or browser-specific**:
- `mod+c` Copy selection (:148) / `mod+v` Paste in place (:155) / `Delete`/`Backspace` Delete selection (:141)
- `mod+z` Undo, `mod+y`/`mod+shift+z` Redo (:170-185)
- `mod+k` Action-chain palette over selection (:162)
- W/S, A/D, Q/E rotate pairs; R cycle axes; F/⇧F step (:63-102); arrows nudge, shift-arrows fast/step/axis (:104-135) — these act on whatever a layer-based selection swept in.
- `?` help; `Escape` leave seat view (:190-217).
- **In-list (react-aria built-ins, not registry):** Cmd/Ctrl+A select-all in Assets list / Mesh Picker; Shift+click range extend (custom `useShiftRangeSelect`); Cmd/Ctrl+click toggle; typeahead in GridLists; Enter/arrows in browsers drive selection/commit.
- **Notably absent:** no Duplicate hotkey (Ctrl/Cmd+D), no layer visibility/lock/next-active hotkeys, no "select all in active layer" hotkey.

## 7. Cross-area dependencies

**This area → others:**
- Animation: `importBuiltInPart` builds `PartAnimation`s (animationImport/easingFit); `restKeyframeId` anchoring; deletion of placements cascades into joints (removeSelected/removePlacement handle member pruning elsewhere in editorStore).
- Engine: Add → "Define Engine…" calls `enterEngineMode`; imported GameData carries engine modules; Assets toolbar shows Engine(N).
- Custom assets: Add menu opens texture/material/mesh dialogs and model import; `addCustomMesh` calls back into `addSubPart`; `$customCatalog` feeds the shared `$catalogIndex`; Assets row menu opens Manage Textures/Material (`setManagingMeshId`).
- IVA: Add → IVA Seat / Kitten-at-seat; seat rows' "Sit in this seat" (`enterSeatView`).
- Colliders: Add → Collider Fit publishes `requestColliderFit` intent consumed by the 3D scene.
- Project transfer: `importProjectData` mirrors layers; project save/load snapshots `activeLayerId`.

**Others → this area:**
- 3D viewport click-select honors layer visible/lock; `revealEntity` scrolls the Assets list; EditorScene consumes `$layerView` for visibility/opacity and `$catalogIndex` for geometry.
- Action chains clone placements (keeping layer) via `applyActionChain`.
- History panel surfaces the layer-mutation descriptions ("add layer", "move to layer", …).
- The standalone wiki part-preview mini app embeds `PartPreviewViewport` with options (`PartPreviewViewportOptions`).
- Export (modExport) reads `internalFlags` set from this area's Interior toggles and resolves against catalog `internal`.

## 8. Open questions for v2

1. **Layers popover → sidebar panel?** v2's left/right sidebar model could host layers as a permanent tab (fixes popover-stack pain), but the current popover is reachable while any selection/tool state is live — does a mode-based UI keep layers global across modes?
2. **Should the browsers stay full-viewport modals** or become a sidebar/overlay that coexists with the 3D scene (enabling drag-to-place and visual comparison)? If drag-to-viewport placement is added, what is the drop semantic (ground-plane raycast? surface snap? still-origin)?
3. **Row-click commit gesture:** keep add-and-close on click, or make click=preview and double-click/Enter=commit everywhere (phone already does click=preview)?
4. **Duplicate offset:** keep in-place duplicates (precise stacking workflows may rely on it) or add a small offset / immediately-armed drag?
5. **Per-project vs global `$layerView`:** move visibility/lock/opacity into the project snapshot (fixes cross-project id collisions) or keep as machine-local view prefs? Constitution forbids migration code — a purge is acceptable.
6. **Layer colors/icons:** v2 wants richer layers; `Layer = {id,name}` is the persisted document shape — adding fields changes the project schema version (compatibility contract per repo constitution #8).
7. **Clipboard lights:** intentionally excluded or an omission to fix in v2's unified model?
8. **Mesh Picker × layers:** should joint attachment adopt layer sections/filters and respect hidden/locked, or is layer-blindness deliberate (animating hidden things is legitimate)?
9. **Six per-kind selection stores:** keep (each kind has genuinely different transform semantics) or unify behind typed refs (`SelectedTransformRef` already exists at `editorStore.ts:2099`) with per-kind views?
10. **Entity-only pinned layers as "layers" at all** — in v2 they could become filter categories instead of pseudo-layers (their rows already behave differently: ordinals, undeletable, unmovable). Which model do users depend on?
11. **MAX_RESULTS=200 + id-substring search:** invest in tag/category facets and thumbnails (Part editorTags exist; SubParts have no tags — would need a derived taxonomy from source files)?
12. **Where does "Add" live in a menubar world:** one Add menu, or split placement (SubPart/Connector/Seat/Light/Kitten/Collider) from asset creation (texture/material/mesh/import) into different menus/modes?
