# Area analysis: Selection, gizmos, transforms, nudge/rotate, multi-select, undo/history

Repo: /Users/asherwin/repos/meow-sci/flexo. All paths below are repo-relative unless absolute.
Verified against code (not docs) on 2026-08-04, branch `main` @ fcd5e07.

---

## 1. Feature inventory

### 1.1 Viewport click selection

- **What**: Raycast click-to-select in the 3D viewport. Fires on `pointerup` only when the pointer moved ≤4 px since `pointerdown` (so orbit/gizmo drags never count as clicks). Resolves the hit object's owning entity by walking up the three.js parent chain looking for `userData.selectable`.
- **Files**: `src/three/SelectionManager.ts:27-101` (gesture + raycast); consumer callback in `src/three/EditorScene.ts:299-414`.
- **Selectable kinds** (`SelectionManager.Selectable`, `src/three/SelectionManager.ts:7-17`): `subpart | connector | collider | ivaSeat | kitten | light | nozzle`, with an optional `instanceIndex` for multi-visual entities (SubPart-owned colliders and lights are drawn once per placement of their owner template).
- **Modifiers**: `metaKey || ctrlKey || shiftKey` ⇒ _additive_ (`SelectionManager.ts:73`). Additive click calls `toggleEntity(kind, index)` (adds or removes from selection, leaves other kinds intact — `editorStore.ts:2065-2081`); plain click calls the single-kind `selectX(index)` setter (replaces everything). Click on empty space clears selection only when non-additive (`EditorScene.ts:304-307`).
- **Priority rule**: nozzle-exhaust handles win over depth order (they render depth-test-free inside the engine bell; `SelectionManager.ts:78-84`). Clicking one re-targets the exhaust gizmo (`setActiveNozzleRef`) and deliberately does NOT change the entity selection (`EditorScene.ts:311-315`).
- **Guards** (per kind, `EditorScene.ts:317-412`): a click on an entity on a **locked** layer is ignored; a click resolving to an entity on a **hidden** layer is ignored (three.js raycasts invisible objects, so this is an explicit check). Clicking any mesh closes measurement editing (`setActiveMeasurement(null)`, line 316) and container editing (line ~499).
- **Reveal-in-list**: every viewport selection publishes `revealEntity(kind, id)` (`editorStore.ts:2091-2096`) so the Assets list scrolls the row into view.
- **Context capture**: clicking a collider visual records which placement instance was hit (`EditorScene.colliderInstance` map, line 355); clicking a light visual writes `setLightEditContext(lightId, instanceIndex)` (`editorStore.ts:2683-2691`) — these decide the frame the gizmo and the inspector edit through.
- **Suppression**: picking is suppressed while a gizmo drag is live, while a measure tool is active, and while sitting in an IVA seat (three independent flags OR-ed into `SelectionManager.setSuppressed`, `EditorScene.ts:272-277, 756-761`).
- **NOT present**: there is **no box/marquee selection**, no double-click semantics, no alt-click, no alt-drag-duplicate anywhere in the viewport.

### 1.2 Selection model (cross-kind multi-select)

- **What**: Six per-kind index-array atoms + per-kind "primary = last" computed indices; a selection may span all kinds at once.
- **Files**: `src/state/editorStore.ts:113-184` (atoms), `1858-2081` (setters), `src/state/selectors.ts` (derived).
- **Atoms**: `$selectedIndices` (SubParts), `$selectedConnectorIndices`, `$selectedKittenIndices`, `$selectedColliderIndices`, `$selectedIvaSeatIndices`, `$selectedLightIndices`; each with a computed `...Index` = last element or -1.
- **Semantics**:
  - Single-kind setters (`selectPlacement`, `selectConnector`, `setSelectedColliders`, …) are **mutually exclusive** — each clears all five other kind stores (`editorStore.ts:1858-2010`).
  - `setSelection(sub, con, kit, col=[], seat=[], light=[])` (`editorStore.ts:2044-2058`) sets all six at once WITHOUT the exclusivity clearing — this is what lets the Assets list and `selectLayerEntities` build cross-kind selections. Note: omitted trailing lists are still cleared.
  - `toggleEntity(kind, index)` (`editorStore.ts:2065-2081`) adds/removes one entity leaving other kinds intact (additive viewport click).
  - `clearSelection()` clears all six.
- **Derived** (`src/state/selectors.ts`): `$hasSelection`, `$hasMultiSelection` (>1 across kinds — trigger for MultiSelectToolbar + bulk panel), `$selectionCount`, `$selectedEntity` (discriminated union for exactly-one selection, `selectors.ts:124-155`), `$selectedPlacement(s)`, `$selectedRefs` (recomputed `selectedTransformRefs()`).
- **`selectedTransformRefs()`** (`editorStore.ts:2117-2160`): flattens the whole selection into `{kind, index, transform, layerId, name}` in fixed kind order (subparts, connectors, colliders, seats, kittens, lights). This one function is what makes any kind participate in the gizmo, nudge, rotate and bulk panels "for free". NOTE: transforms are **owner-local** for SubPart-owned colliders/lights.
- **Clamping**: `clampSelection()` (`editorStore.ts:357-382`) filters out-of-range indices after undo/redo; `deselectLayer(layerId)` (`editorStore.ts:3946-3970`) prunes every kind when a layer is locked (must cover ALL kinds — see comment about stale gizmo attach at 3939-3945).
- **Selection is by INDEX, not id** — indices are positional into `$part` arrays and are remapped/filtered on delete (`removePlacement` at 1463-1474 shifts indices down) but simply clamped after undo (may land on a different entity of the same kind).

### 1.3 Shift+click range selection in lists (Assets list)

- **What**: Custom Shift+click range-select for controlled react-aria GridLists (react-aria's own anchor-based range extension breaks under controlled selection).
- **Files**: `src/ui/rangeSelect.ts` (whole file; `shiftRangeSelection` pure rule + `useShiftRangeSelect` hook), consumed by `src/ui/AssetsList.tsx:334-361, 394, 423-454`.
- **Semantics** (`rangeSelect.ts:36-86`): Shift+click selects everything between the clicked row and the **nearest already-selected row**, inclusive; only ever **grows** the selection; skips non-selectable rows (locked/hidden layer) rather than stopping; keeps holes in a Cmd/Ctrl-built discontiguous selection; ties resolve to the earlier row; with no selection a Shift+click is a plain click. Shift+right-click is left to the row context menu (`rangeSelect.ts:117-118`).
- Plain click / Cmd-Ctrl+click / Cmd+A go through react-aria's native multiple-selection behavior; the resulting keys are pushed into the store via `setSelection` (AssetsList side — that area's report covers the list itself).

### 1.4 Transform gizmo (translate/rotate/scale)

- **What**: three.js `TransformControls` wrapped in `src/three/TransformGizmo.ts` (70 lines). One gizmo instance serves: single-entity transforms, multi-select bulk transforms via a centroid pivot, animation joint pose editing (via `poseProxy`), and engine exhaust placement (via `engineProxy`).
- **Wiring** (`src/three/EditorScene.ts:416-463`):
  - `onDragStart`: pushes exactly ONE undo snapshot. Label depends on target: `'pose'` for joint pose, `'plume FX'|'exhaust'` for nozzle, else `'move'|'rotate'|'scale'` with entity name or "N items" detail (`EditorScene.ts:417-448`). Special case: a scale-mode drag on a seats-and/or-lights-only selection pushes NO undo (their scale is pinned; the drag is a no-op and an undo step would look dead — `EditorScene.ts:433-447`). Then `beginBulkDrag()` snapshots world-space transforms + centroid when 2+ selected (`EditorScene.ts:1971-1982`).
  - `onChange` (per-frame stream): bulk path applies the pivot's delta to every snapshotted entity via pure math in `src/three/bulkTransform.ts` and writes back in ONE store update (`applyBulkFromPivot`, `EditorScene.ts:1984-2033`); single path reads the object transform (`readPlacementTransform`) and routes it — collider → converted back to owner-local via `colliderLocalFromWorld`, light → `lightLocalFromWorld` through the context frame, else `updateSelectedTransform` (`EditorScene.ts:1745-1777`).
  - `onDraggingChanged`: disables orbit, suppresses picking, and on release drops the bulk snapshot and re-centers the pivot (`EditorScene.ts:455-462`, `2035-2040`).
- **Attach rules** (`updateSelection`, `EditorScene.ts:1597-1706`): pose editing wins, then exhaust gizmo, then: 2+ entities → empty `pivot` group at selection centroid (identity rotation/scale, `repositionPivot` 1589-1595); single collider/light → the _context instance's_ visual; else the single selected object's group. Gizmo is **detached** (null target) when: any selected entity is on a locked layer; the animation preview is posed and the selection is animated (`previewLocked`); or seat view is active (`EditorScene.ts:1666-1682`). Never re-attaches mid-drag (line 1617).
- **Modes**: `$toolMode` atom (`editorStore.ts:211`, `setToolMode` 3981) but the gizmo actually follows `$effectiveToolMode` (`src/state/engineStore.ts:284-288`): during exhaust placement `scale` degrades to `translate` (KSA nozzles have no scale field). Ephemeral, not persisted.
- **Space**: TransformControls default = **world** space. There is NO local/world toggle anywhere (no `setSpace` call). Rotation of a multi-selection is about world axes through the centroid.
- **Snapping**: `$snap` atom `{translate?, rotateDeg?}` (`editorStore.ts:95-98, 212`) is piped to `controls.setTranslationSnap/RotationSnap` (`TransformGizmo.ts:52-58`; scale snap always null) — **but no UI ever calls `setSnap`**; the only references are the store, the scene subscription (`EditorScene.ts:631`) and the wrapper. Snapping is a fully-plumbed dormant feature.
- **Bulk math** (`src/three/bulkTransform.ts`, pure & unit-tested):
  - translate: same delta to every position (`translatedTransform`).
  - rotate: rotate position about shared origin + pre-multiply orientation quat; Euler order 'ZYX' (`rotatedAroundOriginTransform`, 130-149).
  - scale: two persisted modes `$bulkScaleMode: 'smart' | 'inPlace'` (`editorStore.ts:233-234`, localStorage `flexo:bulkScaleMode`). Smart scales positions about the centroid AND each entity's own scale; inPlace multiplies own scale only. **Kind-aware**: `scalesWithGroup(kind)` returns false for connectors — a connector's `<Scale>` is KSA's attach-node size CLASS, so group scale relocates it but never re-grades it (`bulkTransform.ts:91-123`).
- **Frame lifts**: `worldTransformRefs()` (`EditorScene.ts:1570-1582`) lifts SubPart-owned collider transforms via `colliderWorld` and lights via `lightWorld` (NOT interchangeable — light rule applies owner scale to the position offset only) into Part space for centroid/bulk math, and `applyBulkFromPivot` pushes each back through the matching inverse (`EditorScene.ts:2017-2032`).
- **Write-back normalization** (`updateSelectedTransforms`, `editorStore.ts:2250-2314`): collider scale is re-normalized to its shape's degrees of freedom (`normalizeColliderSize` — a cylinder's X/Z are one diameter); IVA seat and light scale are PINNED to (1,1,1). Order trap documented in code: `'light'` must be routed before the kitten fallback else the kitten at the same index gets corrupted (line 2266-2269).

### 1.5 SelectionToolbar (floating gizmo-mode switcher bar)

- **What**: Floating toolbar with Move/Rotate/Scale toggle group + Duplicate + Chain + Delete.
- **UI path**: appears top-center, stacked directly below the main toolbar, whenever `$hasSelection` OR `$isPoseEditing` (animation) OR `$isExhaustPlacing` (engine) — during the latter two only the mode switcher shows (duplicate/chain/delete are gated on a real selection). Mounted in `src/app.tsx:87-95` inside an `absolute left-1/2 -translate-x-1/2 top-16` (top-14 on phone) flex column.
- **Files**: `src/ui/SelectionToolbar.tsx` (88 lines). Mode group reads `$effectiveToolMode` so the displayed tool always equals the actual tool; Scale button disabled while placing exhaust (line 61).
- **Actions**: `duplicateSelected()`, `toggleChainPalette()` (action chains — cross-area), `removeSelected()` (no confirm here, unlike MultiSelectToolbar's Delete All).

### 1.6 MultiSelectToolbar

- **What**: Second floating toolbar stacked beneath SelectionToolbar, shown only when `$hasMultiSelection` (2+ entities across kinds).
- **Files**: `src/ui/MultiSelectToolbar.tsx` (142 lines); mounted in `src/app.tsx:94`.
- **Actions**:
  - **Change Layer** (menu of layers, excluding entity-only built-ins `ENTITY_ONLY_LAYER_IDS`): calls `moveSelectionToLayer(layerId)` (`editorStore.ts:3819-3855`) which moves **SubParts, connectors and colliders only** — seats/lights/kittens are pinned to their own built-in layers and silently left. Button hidden when the selection holds none of the movable kinds.
  - **Interior (IVA only)** (SubParts present): per-TEMPLATE `<Internal>` flag menu (On/Off) with a header explaining it hits every placement of the N distinct templates. Disabled with label "Interior — n/a for glass" when all selected templates export as `<PartModelGlass>` (`isGlassTemplate`, `editorStore.ts:3871-3881`; write path `setPlacementsInternal` 3896-3915).
  - **Delete All (N)**: opens a `ConfirmDialog` then `removeSelected()`.

### 1.7 TransformInspector (1134 lines — full inventory)

- **Mounting**: desktop — inside `FloatingInspector` (draggable window over the workspace, `src/ui/FloatingInspector.tsx`); phone — inline at the bottom of the inspector sheet (`InspectorContent showTransform`, `src/ui/InspectorContent.tsx:54-58` ← `MobileInspector.tsx:69`). NOT part of the right panel on desktop.
- **Top-level dispatch** (`TransformInspector.tsx:107-240`): `count > 1` → `BulkTransformPanel`; no entity → null; `kind === 'light'` → dedicated `LightHeader` panel replacing all generic groups; else per-kind header + generic numeric groups. Subscribes `$layerView` so lock-state changes re-render; every field is `isDisabled={locked}` when the entity's layer is locked.
- **Generic single-entity groups** (SubPart / connector / collider / seat):
  - **Position (m)** — 3 × `NumberField`, commits into `updateSelectedTransform`; `onInteractionStart` pushes `pushUndo('move', entityName)` once per focus session (lines 159-167).
  - **Rotation (°)** — displayed degrees, stored radians (`* RAD2DEG` / `* DEG2RAD`, lines 168-176); undo label `'rotate'`.
  - **Third group varies by kind** (lines 223-237):
    - SubPart/connector: **Scale** (X/Y/Z multipliers).
    - Collider: **Size (m)** with per-shape axis labels from `colliderSizeLabels(shape)` — only independently-editable axes get a field (a cylinder's X/Z are one diameter) (line 189, 225-230).
    - IVA seat: group omitted entirely (KSA `<IVASeat>` has no size).
- **SubPartHeader** (lines 251-287): editable **Instance ID** text field (mono; undo `'edit instance ID'` pushed on focus; `setSubPartInstanceId` per keystroke, trims, ignores empty) + read-only template id caption.
- **ConnectorHeader** (lines 440-511): connector id; **Flags** switches (all of `CONNECTOR_FLAGS`, re-emitted in canonical order regardless of click order); **Capabilities** switches (`CONNECTOR_CAPABILITIES`); inline hint text about BulkFluid / SolidMotorCase / DecouplerJoint semantics.
- **ColliderHeader** (lines 513-619): collider id; **Fit to selection** button (`requestColliderFit` intent to the 3D scene); **Shape** select (`COLLIDER_SHAPES`); **Owner** select — `Part (assembly)` vs any placed SubPart template; changing owner CONVERTS the transform through old→world→new frames so the shape doesn't jump (`colliderWorld`/`colliderLocalFromWorld`, lines 545-550); status lines: "Owner template is not placed — dead data", "Applies to all N placements … follows joint animation"; warning when the owner has non-unit placement scale (KSA ignores placement scale for colliders). Plus the **CoveragePanel** (lines 630-678): on-demand Check/Clear of collision coverage (% of sampled points covered, missing count, bloat ratio, "gaps marked in red in the viewport") and a "Sample every vertex (slower, accurate)" precision switch (persisted collider settings).
- **IvaSeatHeader** (lines 998-1131): "Seat i of N" + **reorder buttons** (▲▼ `moveIvaSeat` — seat order is exported IVA cycle order; index 0 chip "IVA opens on this seat"); **Sit in this seat** (`enterSeatView`, allowed on locked layers — camera only); **Add kitten at this seat** (`addKittenAtSeat`, allowed on locked layers); read-only **Axes (exported)** Forward/Up vectors through the same G6 formatter the exporter uses; **Aim** presets (±X/±Y/±Z with +X labeled "nose") that re-aim keeping the current up axis unless near-parallel (NaN guard, `PARALLEL_DOT` 0.999, lines 1026-1035); **Aim at selection** (publishes `requestIvaSeatAim` intent — only the 3D scene has the world centroid); warning when the part has no `<Internal>` geometry.
- **LightHeader** (lines 727-996, replaces everything for a selected light): type + id header; owner status line ("via template · N instances" / "part-level" / "dead data"); context note when >1 instance ("Editing through `<instanceId>` — one light per template; edits affect every instance"); **Owner** select (re-homes between part-level and a template, converting the world pose through first placements — `setLightOwner`, lines 763-776); **Light type** select (Spot/Point); **Position (m, owner frame)** group (only when a placed owner gives a distinct frame); **Aim rotation (°, owner frame)** (Spot only); **Position (m, part frame)** group (converted through the context instance — the SAME `$lightEditContext` atom the gizmo uses, so fields and gizmo can never disagree); **Aim (part frame, unit vector)** (Spot only; commits via `lightAimRotation` — minimal ΔQ so re-aiming never rolls; degenerate vector rejected); **Range (m)** and **Intensity** `PreciseNumberInput`s; **Color** native color input (undo pushed on pointerdown); Spot-only **Inner/Outer Angle (°, half-cone)** (0–90); **Falloff along the aim axis** curve (`LightFalloffCurve`, on the same exposure as the viewport's coverage shells); **Ray tracing (IVA only)** switch.
- **BulkTransformPanel** (2+ selected, lines 296-377): "N items selected"; three `VectorApply` groups applying a _relative_ delta to EVERY selected entity in one undo step:
  - **Move by (m)** — `translatedTransform` per ref.
  - **Rotate by (°) around centroid** — `quatFromEulerDeg` + `rotatedAroundOriginTransform` about `centroidOf(positions)`.
  - **Scale by (×) around centroid / in place** — `groupScaledTransform` honoring `$bulkScaleMode`; plus a **"Scale positions too (smart)"** Switch writing `$bulkScaleMode`.
  - All disabled when any selected entity's layer is locked. NOTE: this panel iterates `$selectedRefs` = raw **owner-local** transforms — unlike the gizmo, it does NOT lift SubPart-owned colliders/lights into part space (see Pain points).
- **VectorApply** (lines 384-438): three text drafts (X/Y/Z) + Apply; keystroke filtering via `isPartialNumber`, parse-or-default on Apply, drafts reset to defaults afterward; inputs are raw `TextField inputMode="url"` (not `useNumberDraft` — a local re-implementation).

### 1.8 Keyboard nudge (arrow keys)

- **What**: Move the whole selection along ONE active world axis by a configurable step.
- **Files**: `src/three/nudgeSelection.ts` (math + action), `src/three/selectionTransform.ts` (shared apply), `src/ui/nudgeControls.ts` (toast wrappers), hotkeys in `src/ui/hotkeys/registry.ts:104-135`.
- **Keys**: `↑`/`↓` = ±`$nudgeStep` along `$nudgeAxis`; `Shift+↑/↓` = ×5 coarse (`FAST_NUDGE_MULTIPLIER = 5`); `←`/`→` cycle the axis x→y→z (with toast); `Shift+←/→` decrease/increase the step. (Function docs in nudgeControls/editorStore still mention an old "M/Shift+M" binding — the registry has no M binding; docs drifted.)
- **State**: `$nudgeAxis` (default `'y'`), `$nudgeStep` (default 0.1 m) — persisted localStorage `flexo:nudgeAxis` / `flexo:nudgeStep` (`editorStore.ts:217-219`). Step adjustment is decade-aware: increments by the value's power of ten (0.1→0.2…0.9→1→2; downward refines 0.1→0.09), floor `MIN_NUDGE_STEP = 0.001`, rounded to 3 decimals (`editorStore.ts:3993-4053`).
- **Apply semantics** (`applySelectionTransform`, `selectionTransform.ts:25-41`): one `pushUndo('nudge', name|N items)` + one `updateSelectedTransforms` batch over `selectedTransformRefs()`; **no-op if nothing selected or ANY selected entity is on a locked layer**.

### 1.9 Keyboard rotate (W/S, A/D, Q/E)

- **What**: Rotate the selection about the selection centroid, in world-axis Euler degrees, by `$rotateStep` per keypress.
- **Files**: `src/three/rotateSelection.ts`, `src/ui/rotateControls.ts`, registry `registry.ts:63-102`.
- **Keys**: three pairs — `W/S`, `A/D`, `Q/E` — each mapped to a world axis; base mapping W/S=X, A/D=Y, Q/E=Z; `R` cycles ALL pairs' axes together (offset 0/1/2, `rotatePairAxis`, `editorStore.ts:4059-4084`); `F` increases / `Shift+F` decreases the step by 15°, clamped 15°–180° (`editorStore.ts:4066-4094`). Signs: W=-1/S=+1, A=+1/D=-1, Q=+1/E=-1 (registry lines 72-86).
- **State**: `$rotateStep` (default 45°) and `$rotateAxisOffset` (default 0) — persisted `flexo:rotateStep` / `flexo:rotateAxisOffset`.
- **Math**: identical to the inspector's "Rotate by" (same `rotatedAroundOriginTransform` about centroid) — one undo step labeled `'rotate'`; same locked-layer no-op via `applySelectionTransform`.

### 1.10 TransformHud (bottom-center status bubble)

- **What**: Single pill-shaped HUD with two clickable clusters: left = rotate tool (each key pair with a colored double-headed arrow for its current axis + step angle; click = cycle axes = R), right = nudge tool (active axis arrow + letter + step distance; click = cycle axis = →). Rich tooltips list all the chords (`RotateHint`/`NudgeHint`).
- **Files**: `src/ui/TransformHud.tsx` (169 lines); mounted `src/app.tsx:141` at `absolute inset-x-0 bottom-2 flex justify-center`.
- **Details**: axis arrow colors match the gizmo handles (X red, Y green, Z blue, lines 20-24); icon orientation matches the default camera (X horizontal, Y vertical, Z diagonal); **hidden on phones** (`useIsPhone`) — the nudge/rotate tools are keyboard-only and have no touch affordance at all.

### 1.11 Duplicate / Delete / Copy / Paste

- **Duplicate** (`duplicateSelected`, `editorStore.ts:1477-1588`): duplicates every selected entity of all six kinds, one undo step `'duplicate'`; copies land at the same transform (no offset); fresh ids (`instanceId` = `<baseName>_<count+1>` for SubParts; `nextConnectorId`/`nextKittenId`/`nextColliderId`/`nextIvaSeatId`/`nextLightId` for the rest); copies keep the source layer (kittens/seats/lights pinned to their built-in layers); duplicated seats land last in the IVA cycle order; duplicated lights keep their owner template. New copies become the selection. UI: SelectionToolbar "Duplicate"; also per-row `duplicatePlacement(index)` from the Assets-list row menu (1750-1768).
- **Delete** (`removeSelected`, `editorStore.ts:1361-1455`): deletes the entire cross-kind selection in one undo step with a carefully-worded description ("delete part(s)"/"delete connector(s)"/… or just "delete" for mixed kinds) and detail (single name, or "2 parts, 1 connector, …"); splices descending so indices stay valid; after a single-entity delete, selects the next entity of the same kind, else clears. UI: SelectionToolbar "Delete" (no confirm), MultiSelectToolbar "Delete All (N)" (confirm dialog), `Delete`/`Backspace` hotkeys, Assets list row menu (`removePlacement`).
- **Copy** (`copySelected`, `editorStore.ts:1626-1645`): snapshots the selection into the in-app `$clipboard` (NOT the OS clipboard) — **placements, connectors, kittens, colliders, IVA seats only. Lights are NOT copyable** (absent from `PartClipboard`, `editorStore.ts:195-201`). Clipboard is ephemeral (not persisted, not undoable). `mod+c` with toast "Copied N items".
- **Paste** (`pasteClipboard`, `editorStore.ts:1656-1743`): pastes in place (same transforms), regenerates all ids, one undo step `'paste'`; pasted entities keep their source layer if it still exists else the active layer (`pasteLayerId`); pasted seats land last in cycle order; pasted set becomes the selection. `mod+v` with toast.

### 1.12 Undo / redo / history

- **Architecture** (`editorStore.ts:298-553`): full-document **snapshot** history. `pushUndo(description, detail)` deep-clones (`structuredClone`) the entire `EditingPart` PLUS the reference containers and line measurements (registered via `registerEditorAidStores` from main.tsx to avoid circular imports, lines 242-273) onto a module-private `undoStack`; cap `MAX_UNDO = 50`; any push clears `redoStack`.
- **The two enrollment patterns** (invariant block, lines 298-324): (1) _discrete_ mutations call `pushUndo` internally; (2) _streaming_ mutations (gizmo drags, typing sessions) never push — the caller pushes ONCE at interaction start (gizmo `onDragStart`, field `onInteractionStart`/focus). Any `$part` mutator that picks neither silently bypasses undo — flagged as a bug class in both code and `docs/editor-state.md` / AGENTS.md.
- **What is NOT in history**: selection, tool mode, snap, active layer, layer visibility/lock (layerStore view state), `$lightEditContext`, clipboard, nudge/rotate prefs. Selection + active layer are clamped after each restore (`clampSelection`/`clampActiveLayer`).
- **Restore**: `undo()`/`redo()` swap snapshots between stacks, set `$part`, restore containers/measurements, clamp, and return a display label ("move · thruster_1_1") for toasts (lines 413-450).
- **Jump-to**: `$historyList` atom of `{description, detail, stepsFromCurrent}` rebuilt by `refreshHistoryFlags()` (redo-first → current marker → undo-last, lines 333-355); `jumpToHistory(steps)` just loops `undo()`/`redo()` N times (544-553).
- **Persistence**: `exportHistory()`/`importHistory()` (453-537) deep-copy the stacks; `projectStore` saves history WITH the project (`projectStore.ts:158, 277`) so undo survives reload; legacy-shaped entries tolerated on import. `newPart()` clears both stacks (3972-3979).
- **UI**:
  - Toolbar **Undo/Redo buttons** with `$canUndo`/`$canRedo` enablement + toast of the restored label (`src/ui/Toolbar.tsx:40-59`); same pair on the phone top bar (`MobileTopBar.tsx`).
  - **HistoryButton** (`src/ui/HistoryButton.tsx`): desktop = toolbar icon → `Popover placement="bottom end" w-56` listing Redo items, an accent "→ current" divider row, then Undo items; clicking a row jumps (multi-step) and toasts. Mobile = controlled bottom-sheet Modal variant (opened from the phone overflow menu). Disabled when no history.
  - Hotkeys `mod+z` undo, `mod+y` / `mod+shift+z` redo, with toasts (`registry.ts:170-185`).

### 1.13 Scale Everything dialog

- **What**: Multiplies the ENTIRE workspace by per-axis factors about the world origin — every placement, kitten (position+scale), connector (position ONLY — size class preserved), collider (position + shape-normalized size), IVA seat (position only), AND every animation keyframe pose **translation** (rotations, times, pose scales untouched — conjugation math documented in the store). One undo step `'scale everything'`. The animation-safe alternative to a multi-select resize.
- **UI path**: top Toolbar → Settings menu → "Scale Everything" menu item → centered modal (`src/ui/SettingsButton.tsx:233, 248`).
- **Files**: `src/ui/ScaleEverythingDialog.tsx` (dialog: Link-axes switch — X drives all three when linked; three `PreciseNumberInput`s min 0.0001; Apply disabled at 1×1×1; toast on apply); `editorStore.scaleEverything` (`editorStore.ts:2316-2380`). Containers/measurements intentionally untouched.

### 1.14 Selection-size readout (MeasurementInfo)

- **What**: Bottom-left floating card showing the live selection's bounding box (Width/Height/Depth + diagonal) in the chosen measurement unit, with a mode badge; written by the three-layer `MeasurementLayer` into `$selectionBounds`.
- **Files**: `src/ui/MeasurementInfo.tsx`; mounted `app.tsx:135`. `pointer-events-none` overlay.

### 1.15 Number input system (project-wide convention, heavily used here)

- **Files**: `src/ui/numberDraft.ts` (`useNumberDraft`, `isPartialNumber`, `parseNumericDraft`, `clampNumber`, `trimFloatNoise`), `src/ui/NumberField.tsx` (draft field with 1-char label, display rounded ~5 decimals via `fmt`), `src/ui/PreciseNumberInput.tsx` (exact-value variant), `src/ui/Vec3Field.tsx` (X/Y/Z row of PreciseNumberInputs with per-axis disable).
- **Rules**: text inputs, never `type=number`; raw string draft while focused; partial entries (`-`, `.`, `0.`, `1e-`) survive; every in-range keystroke commits live (3D follows along); out-of-range keystrokes skipped not clamped; blur/Enter finalize with clamp; Escape cancels; ArrowUp/Down step (Shift ×10, Alt ×0.1 — the only Alt modifier in the app, `numberDraft.ts:111`); `onInteractionStart` fires once on focus to push a single undo step per typing session; **`inputMode="url"`** is mandatory (only keyboard variant on mobile with a minus key).

### 1.16 Gizmo reuse by other modes (cross-area but wired here)

- **Animation pose editing**: `poseProxy` empty group posed at the joint world frame; drag writes back to the joint's local pose; at rest (t=0) translate moves the pivot anchor and rotate re-orients it, scale is a no-op (`EditorScene.ts:1832-1882`); `pivotHelper` AxesHelper marks the rest pivot whenever the Animations editor has a joint active (1721-1743).
- **Engine exhaust placement**: `engineProxy` posed at the nozzle exhaust point/direction; Move relocates the point, Rotate re-aims, Scale is clamped away by `$effectiveToolMode` (`EditorScene.ts:1630-1645, 1926-1968`).

---

## 2. UI surface map

All overlays live inside App's `fixed inset-0` root (`src/app.tsx:56`); everything is absolutely positioned over the full-viewport 3D canvas. No CSS z-index is set on most bars (DOM order stacks them); react-aria Popovers/Modals portal to the body.

| Surface                                      | Kind            | Mounts / position                                                                                                                                                                                                                    | Notes                                                                  |
| -------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Main toolbar (undo/redo/history/settings)    | floating-bar    | `app.tsx:78` — desktop: `absolute left-3 top-3 right-[19rem] lg:left-1/2 lg:-translate-x-1/2` (centered ≥lg, else left-aligned reserving inspector width, flex-wrap to 2 rows on portrait tablets); phone: full-width `MobileTopBar` | Container-level responsive hack; history popover `bottom end`          |
| SelectionToolbar                             | floating-bar    | `app.tsx:87-95`, top-center stack `top-16` (phone `top-14`)                                                                                                                                                                          | Shows for selection OR pose-editing OR exhaust-placing                 |
| MultiSelectToolbar                           | floating-bar    | same stack, beneath SelectionToolbar                                                                                                                                                                                                 | Only when 2+ selected                                                  |
| FloatingPreviewToolbar (anim scrubber)       | floating-bar    | phone: pinned at top of the same top-center stack (`app.tsx:92`); desktop: separate draggable window (`app.tsx:107`)                                                                                                                 | shares the stack with selection bars on phone                          |
| FloatingInspector (hosts TransformInspector) | floating window | `app.tsx:102`, `absolute z-30 w-72`; default anchor bottom-left (`left:4, bottom:4`), draggable by header, position persisted in `$inspectorFloatPos` (uiStore), clamped on resize                                                   | Desktop only; `max-h-[calc(100dvh-6rem)] overflow-auto` body           |
| RightPanel (Assets/Anim/Engine inspector)    | sidebar         | `app.tsx:98`, right side, resizable                                                                                                                                                                                                  | TransformInspector NOT inside it on desktop                            |
| MobileInspector                              | bottom sheet    | `app.tsx:98` phone                                                                                                                                                                                                                   | includes TransformInspector inline (`showTransform`)                   |
| TransformHud                                 | HUD             | `app.tsx:141`, `absolute inset-x-0 bottom-2` centered pill                                                                                                                                                                           | hidden on phone                                                        |
| MeasurementInfo                              | HUD             | `app.tsx:135`, `absolute bottom-3 left-3`                                                                                                                                                                                            | **collides with FloatingInspector's default bottom-left anchor**       |
| WorkspaceLoadProgress                        | HUD             | `app.tsx:138`, bottom-center                                                                                                                                                                                                         | stacks near TransformHud                                               |
| SeatViewBar                                  | floating-bar    | `app.tsx:111`, bottom-center while seated                                                                                                                                                                                            | gizmo + picking suppressed while seated                                |
| History popover                              | popover         | react-aria Popover `bottom end`, `w-56 max-h-80`                                                                                                                                                                                     | portal; phone variant = sheet Modal                                    |
| History sheet (phone)                        | dialog (sheet)  | controlled Modal `variant="sheet"` from overflow menu                                                                                                                                                                                |                                                                        |
| Delete-all confirm                           | dialog          | `ConfirmDialog` from MultiSelectToolbar                                                                                                                                                                                              | modal over floating bar                                                |
| ScaleEverythingDialog                        | dialog          | centered Modal from Settings menu                                                                                                                                                                                                    |                                                                        |
| Change Layer / Interior menus                | popover menus   | react-aria Popover `bottom start` from MultiSelectToolbar buttons                                                                                                                                                                    |                                                                        |
| Gizmo itself                                 | 3D overlay      | three.js TransformControls helper in the scene                                                                                                                                                                                       | plus bulk `pivot` group, `pivotHelper` AxesHelper, pose/engine proxies |

Known overlap/clipping issues (see Pain points): bottom edge hosts four independent surfaces (MeasurementInfo, TransformHud, LoadProgress, SeatViewBar) plus the FloatingInspector default anchor; top-center hosts up to three stacked bars that can cover the scene on small heights.

---

## 3. State & data flow

**Stores:**

- `src/state/editorStore.ts` — `$part` (document), 6×selection atoms + primaries, `$clipboard`, `$activeLayerId`, `$toolMode`, `$snap`, `$nudgeAxis/$nudgeStep/$rotateStep/$rotateAxisOffset/$bulkScaleMode` (persisted prefs), `$canUndo/$canRedo/$undoDescription/$redoDescription/$historyList`, `$lightEditContext`, `$revealEntity`; undo/redo stacks are module-private arrays.
- `src/state/selectors.ts` — derived selection selectors (see 1.2).
- `src/state/engineStore.ts` — `$effectiveToolMode`, `$isExhaustPlacing`, `$engineExhaustGizmo`.
- `src/state/animationStore.ts` — `$isPoseEditing` (shows the toolbar while posing).
- `src/state/layerStore.ts` — `$layerView` (visibility/lock); `isLayerLocked`/`isLayerVisible` consulted by selection, gizmo attach, inspector disable, nudge/rotate no-op.
- `src/state/uiStore.ts` — `$inspectorFloatPos` (persisted floating-window position), `$inspectorMode`.
- `src/state/colliderStore.ts`, `src/state/ivaSeatStore.ts`, `src/state/ivaStore.ts` — intent atoms the inspector publishes for the 3D scene (`requestColliderFit`, `requestCoverageCheck`, `requestIvaSeatAim`, `enterSeatView`).
- `src/state/measurementStore.ts` — `$selectionBounds` (written by MeasurementLayer from the selection).

**Persistence:**

- localStorage (global prefs, wiped by "Reset Everything"): `flexo:nudgeAxis`, `flexo:nudgeStep`, `flexo:rotateStep`, `flexo:rotateAxisOffset`, `flexo:bulkScaleMode`, inspector float position, layer view state.
- Project persistence (IndexedDB via projectStore): `$part` + **full undo/redo history** (`exportHistory` in `projectStore.ts:158`, restored at 277). Undo survives reloads; history inflates project size (50 × full document snapshots worst-case).
- Ephemeral: selection, clipboard, `$toolMode`, `$snap`, `$activeLayerId`, `$lightEditContext`, `$revealEntity`.

**Flow (gizmo drag)**: pointerdown on gizmo → `dragging-changed` → orbit off, pick suppressed, `pushUndo` once, bulk snapshot (world-lifted) → per-frame `objectChange` → pivot delta → pure bulkTransform math → `updateSelectedTransforms` (one `$part.set` per frame) → `$part` subscribers: EditorScene reconcile (re-renders visuals), TransformInspector fields update live (two-way binding via store) → release → snapshot dropped, pivot recentered.

**Flow (typed field)**: focus → `onInteractionStart` → `pushUndo` once → every valid keystroke commits → 3D updates live → blur/Enter finalize.

---

## 4. Pain points (with evidence)

1. **Snap is a ghost feature.** `$snap`/`setSnap`/`SnapSettings` are fully plumbed to `TransformControls` (`editorStore.ts:95-98, 212, 3985`; `TransformGizmo.ts:52-58`; `EditorScene.ts:631`) but **no UI calls `setSnap` anywhere** — grep confirms the only references are store/scene/wrapper. Users have no grid or angle snapping despite the engine supporting it. `docs/editor-state.md` documents it as if it worked.
2. **No local/world gizmo space toggle** — TransformControls left on default world space; multi-rotate is world-axes-about-centroid only. Fine as a decision, but it's invisible/undocumented.
3. **TransformInspector.tsx does far too much** (1134 lines): generic transform panels, bulk panel, connector flag editor, the entire collider tool suite (owner re-homing with frame conversion, coverage analytics), the full IVA seat workflow (reorder, seat view, kitten spawn, aim presets), and the complete light editor (dual-frame position/aim math, scalar editors, falloff viz). Five distinct inspectors + a bulk panel share one file and one mount point.
4. **Bulk numeric panel vs gizmo frame inconsistency.** The gizmo lifts SubPart-owned collider/light transforms to part space (`EditorScene.worldTransformRefs`, 1570-1582) before bulk math; `BulkTransformPanel` uses raw `$selectedRefs` (owner-local) — `TransformInspector.tsx:297, 304-343`. A "Move by 1 m X" on a selection containing an owned light moves the light 1 m along the _owner's_ X (scaled by owner scale on write-back), not world X — silently different from dragging the same selection with the gizmo. Same for keyboard nudge/rotate (`selectionTransform.ts:29-32` uses `selectedTransformRefs()` directly).
5. **Copy/paste silently drops lights** — `PartClipboard` has no lights field (`editorStore.ts:195-201`); `copySelected` counts them as 0. Duplicate handles lights fine; ⌘C/⌘V loses them with a toast count that just excludes them.
6. **Bottom-edge overlay pile-up**: MeasurementInfo (`bottom-3 left-3`), FloatingInspector default anchor (`left:4, bottom:4` — directly on top of MeasurementInfo until dragged), TransformHud (`bottom-2` center), WorkspaceLoadProgress (bottom-center), SeatViewBar (bottom-center). No coordination, no stacking manager; only DOM order + one `z-30` (`FloatingInspector.tsx:80`).
7. **Aggressive global hotkeys without a mode concept**: single unmodified letters (W/A/S/D/Q/E/R/F/M-era leftovers) and all four arrow keys act on the document from anywhere outside a form field (`GlobalHotkeys.tsx:43-47`). The virtual-focus workaround (`isTypingInField`, lines 24-40) exists precisely because this leaks. Arrow keys can never be used for camera or list navigation. A mode-based v2 must decide which of these are viewport-scoped.
8. **Six-fold duplicated selection code**: per-kind setter blobs (`editorStore.ts:1858-2010`), `clampSelection` (357-382), `deselectLayer` (3946-3970), `removeSelected`'s description/detail ladder (1372-1427), `duplicateSelected`, `copySelected` — each is the same pattern hand-expanded per kind; adding a 7th selectable kind touches ~10 sites. The `updateSelectedTransforms` kitten-fallback ordering trap (2266-2269) exists only because of this shape.
9. **Snapshot-based history cost**: every `pushUndo` `structuredClone`s the whole part + containers + measurements (399-410); a 50-deep stack of large parts is persisted verbatim into the project JSON (projectStore.ts:158). Jump-to-history replays N undos each doing 2 more deep clones (544-553).
10. **Delete confirmation inconsistency**: MultiSelectToolbar "Delete All (N)" confirms (`MultiSelectToolbar.tsx:122-141`); SelectionToolbar "Delete" and the Delete/Backspace hotkey nuke a 50-item cross-kind selection with no confirmation (undo is the only recourse).
11. **VectorApply reimplements the number-draft rules** (`TransformInspector.tsx:384-438`) with local `useState` drafts + `isPartialNumber` instead of `useNumberDraft` — a third numeric-editing code path to keep in sync (NumberField, PreciseNumberInput, VectorApply).
12. **No marquee/box selection and no select-all-in-viewport**; large selections require the Assets list (Cmd+A / shift-range there) or layer "select all" — viewport-only workflows are click-by-click.
13. **Doc drift**: nudge step functions' comments say "the M hotkey / Shift+M" (`nudgeControls.ts:31-40`, `editorStore.ts:4031-4045`) but the registry binds `Shift+←/→`; `docs/editor-state.md` still calls `$snap` a live feature and describes `$selectedConnectorIndex` as singular.
14. **Selection by index, clamped not remapped, after undo/redo** (`clampSelection` 357-382): after an undo that removes/reorders entities, retained indices can point at _different_ entities (only out-of-range ones are dropped). Rarely noticed but a real correctness wart for a v2 id-based selection model to fix.
15. **HUD discoverability**: the entire nudge/rotate system is discoverable only via the small bottom pill's tooltips or the `?` help dialog; on phones it's hidden entirely, leaving no touch path to nudge/rotate at all.

---

## 5. Invariants & constraints (MUST survive v2)

**Coordinate/game contract:**

- KSA and three.js share basis (RH, Y-up, −Z-forward, meters); **KSA's Euler "XYZ" == three.js `'ZYX'` order** — conversion lives ONLY in `src/three/coords.ts` (`EULER_ORDER`, applyPlacement/readPlacementTransform/matrixFromTransform); `bulkTransform.ts:27` repeats the same order and must stay in lockstep. Calibration part: `?debug=dockingport`.
- Rotation stored/exported in **radians**, displayed in degrees (RAD2DEG at every inspector boundary).
- **Connector `<Scale>` is a size CLASS, not geometry** — group scale and Scale-Everything must move connectors but never re-grade them (`scalesWithGroup`, `bulkTransform.ts:91-105`; `scaleEverything` `editorStore.ts:2362-2363`).
- **Collider `scale` IS its size in meters**; write path must re-normalize to the shape's degrees of freedom (`normalizeColliderSize` via `assignCollider`, `editorStore.ts:2279-2284`) — a cylinder can't have independent X/Z. KSA ignores placement scale for colliders (inspector warning, `TransformInspector.tsx:610-615`).
- **IVA seat and light scale are pinned to (1,1,1)** on every write (`assignIvaSeat`/`assignLight`, `editorStore.ts:2294-2314`); seats have no size, KSA parses-but-ignores light scale. Seat/light-only scale drags must not create undo steps (`EditorScene.ts:433-447`).
- **Owner-frame entities**: SubPart-owned colliders/lights store owner-local transforms; all world-space editing must lift via `colliderWorld`/`lightWorld` and write back via the matching inverse _through the context instance_ (`colliderInstance` map / `$lightEditContext`) — the single-atom context rule is what keeps gizmo and inspector in agreement (`TransformInspector.tsx:727-760`, `EditorScene.ts:1570-1582, 1745-1777`).
- Seat aim: `<ForwardAxis>`/`<UpAxis>` pair must never be near-parallel (KSA `Camera.LookAtRotation` NaN); re-aims preserve up with the perpendicular fallback (`TransformInspector.tsx:696-699, 1026-1035`). Seat ORDER is exported data (IVA cycle + opening seat).
- Light re-aim uses minimal-rotation ΔQ (roll continuity) and rejects degenerate aim vectors (`lightAimRotation`).
- `scaleEverything` semantics: keyframe pose **translations only** scale (conjugation Σ·L·Σ⁻¹); connector positions only; origin-anchored (`editorStore.ts:2316-2380`).

**Undo/history:**

- The two enrollment patterns (discrete = internal `pushUndo`; streaming = caller pushes once at interaction start) are a hard invariant documented in `editorStore.ts:298-324`, `docs/editor-state.md`, AGENTS.md. Every numeric field's `onInteractionStart` and the gizmo's `onDragStart` are the streaming push points.
- History = `$part` + containers + measurements ONLY; selection/toolMode/snap/activeLayer/layerView deliberately excluded; selection + active layer clamped on restore.
- History persists with the project (exportHistory/importHistory) — undo surviving reload is a user-visible feature.

**Selection/locking:**

- Locked layers: not clickable in viewport; entities _can_ still be selected from the Assets list for inspection, but the gizmo detaches, inspector fields disable, and nudge/rotate/bulk-apply are whole-selection no-ops if ANY member is locked (`EditorScene.ts:1666-1682`, `selectionTransform.ts:30`, `TransformInspector.tsx:300, 351`). Locking a layer prunes it from the selection for every kind (`deselectLayer`).
- Posed animation preview locks the gizmo on animated selections (never write a posed transform back as the modeled one, `EditorScene.ts:1675-1678`); seat view suppresses gizmo + picking.
- Additive-click modifier set is Ctrl/Cmd/Shift (all three) in the viewport; list Shift-range semantics per `rangeSelect.ts` (grow-only, nearest-anchor).

**Numeric input:**

- ALL numeric fields go through `useNumberDraft` (or PreciseNumberInput/NumberField/Vec3Field wrappers) with **`inputMode="url"`** — mandatory project-wide (memory + repeated code comments). Draft rules: partial entries survive, live commit per valid keystroke, skip-don't-clamp out-of-range, Escape cancels, arrows step with Shift ×10 / Alt ×0.1.

**Tool prefs:**

- Nudge/rotate axis-and-step prefs are persisted localStorage globals with fixed keys (`flexo:*`); step laws: nudge decade-stepping floored at 0.001 m / 3 decimals; rotate 15°–180° in 15° increments; FAST_NUDGE_MULTIPLIER = 5.
- `$effectiveToolMode` clamp (Scale→Move during exhaust placement) must remain the single source for both gizmo and switcher.

---

## 6. Hotkeys (complete registry, `src/ui/hotkeys/registry.ts` — drives both bindings AND the `?` help overlay)

| Keys                   | Action                                       | Notes                                       |
| ---------------------- | -------------------------------------------- | ------------------------------------------- |
| `W`/`S`                | Rotate selection about pair-1 axis (∓/±step) | default X; pairs remapped by R              |
| `A`/`D`                | Rotate about pair-2 axis (±/∓)               | default Y                                   |
| `Q`/`E`                | Rotate about pair-3 axis (±/∓)               | default Z                                   |
| `R`                    | Cycle all rotate-pair axes (x→y→z offset)    | toast                                       |
| `F` / `Shift+F`        | Rotate step +15° / −15° (15–180)             | toast                                       |
| `↑`/`↓`                | Nudge selection ± step along active axis     |                                             |
| `Shift+↑`/`Shift+↓`    | Nudge ×5                                     |                                             |
| `←`/`→`                | Cycle nudge axis back/forward                | toast                                       |
| `Shift+←`/`Shift+→`    | Nudge step smaller/larger (decade-aware)     | toast                                       |
| `Delete`/`Backspace`   | Delete selection                             | no confirm                                  |
| `mod+C`                | Copy selection (in-app clipboard)            | toast count; lights excluded                |
| `mod+V`                | Paste in place                               | toast count                                 |
| `mod+K`                | Toggle action-chain palette                  | cross-area                                  |
| `mod+Z`                | Undo                                         | toast label                                 |
| `mod+Y`, `mod+Shift+Z` | Redo                                         | toast label                                 |
| `?`                    | Keyboard-shortcuts help overlay              | `useKey`, ignoreModifiers                   |
| `Escape`               | Exit IVA seat view (only when seated)        | never preventDefault; layered under dialogs |

All bindings: `preventDefault: true` by default, suppressed while typing (`enableOnFormTags:false` + `isTypingInField` activeElement guard for react-aria virtual focus, `GlobalHotkeys.tsx:24-47`). Additional non-registry key behaviors: viewport additive-select modifiers (Shift/Ctrl/Cmd click), list Shift+click range / Cmd+click toggle / Cmd+A (react-aria), number-field arrows (Shift ×10 / Alt ×0.1), Escape in fields cancels edit. `Escape` also cancels pose-editing gizmo state (animation area).

---

## 7. Cross-area dependencies

**Others → this area:**

- **Assets list / Layers** (list-selection area): calls `setSelection`, `toggleEntity`, `selectLayerEntities`, `deselectLayer`, consumes `$revealEntity` for scroll-into-view, uses `useShiftRangeSelect`; layer lock/visibility gates all transforms here.
- **Animation editor**: `$isPoseEditing` shows SelectionToolbar; pose gizmo reuses TransformGizmo via `poseProxy`; posed preview locks the selection gizmo; `pivotHelper` rest-pivot marker; pose drags push `'pose'` undo entries into the same history.
- **Engine designer**: `$isExhaustPlacing`/`$engineExhaustGizmo` reuse the gizmo via `engineProxy`; `$effectiveToolMode` clamps Scale; nozzle handles ride the SelectionManager with priority.
- **Action chains**: SelectionToolbar "Chain" button + `mod+K` open the palette over the current SubPart selection; `applyActionChain` commits through the same undo.
- **Measurements / containers**: snapshotted INTO undo history (`registerEditorAidStores`); measure tool suppresses picking; selecting a mesh closes measurement/container editing; `MeasurementLayer` computes `$selectionBounds` from the selection.
- **IVA**: seat view suppresses gizmo/picking; seat inspector calls `enterSeatView`, `addKittenAtSeat`.
- **Project persistence**: saves/restores undo stacks; boot purge (`newPart`) clears them.

**This area → others:**

- Inspector publishes intents consumed by the 3D scene: `requestColliderFit`, `requestCoverageCheck` (colliderStore), `requestIvaSeatAim` (ivaSeatStore).
- Selection drives: highlight/outline, MeasurementLayer bounds, container out-of-bounds refresh, light coverage shells, Assets-list reveal, Engine/Anim panel context.
- `moveSelectionToLayer` / `setPlacementsInternal` write layer/template data owned by the layers/export areas.
- Delete/duplicate/paste regenerate ids consumed by animation joints/couplings etc. (id remapping handled in those areas' import paths).

---

## 8. Open questions for v2

1. **Snap**: expose `$snap` (grid + angle snapping UI — it already works end-to-end) or delete the plumbing? If exposed: global setting, per-mode toolbar toggle, or hold-modifier (e.g. Ctrl-drag) semantics?
2. **Gizmo space**: keep world-only, or add a local/world toggle (TransformControls supports `setSpace`)? Affects the multi-select pivot too (centroid pivot currently always identity-oriented).
3. **Hotkey scoping in a mode-based app**: do W/A/S/D/Q/E/R/F and the arrow keys stay _global_, or become viewport-focused-only / mode-scoped? (They currently conflict with any future camera-fly or list-navigation bindings.)
4. **Where does the mode switcher live**: keep a floating selection bar, move Move/Rotate/Scale into a persistent left toolbar/menubar (visible even with nothing selected), or both? The current bar doubles as the only gizmo-mode UI during pose/exhaust editing — v2 modes could own that.
5. **Bulk numeric panel frames**: should "Move by / Rotate by" lift owned colliders/lights to part space to match the gizmo (fix pain point 4), or is owner-local numeric editing intentional for those kinds?
6. **History representation**: keep full-document snapshots persisted with the project (simple, survives reload, but heavy) vs diffs/command pattern vs capping persisted history? The v2 status bar/notification design may also want richer history entries (grouping, timestamps).
7. **Delete confirmation policy**: confirm above a threshold everywhere, nowhere (rely on undo + toast with inline Undo), or keep the current split?
8. **Selection identity**: move from positional indices to stable ids (fixes post-undo clamping aliasing, simplifies the six-store shape — possibly one `Set<{kind,id}>`), at the cost of touching every consumer.
9. **Marquee/box selection & viewport select-all**: add them (users currently must round-trip through the Assets list), and if so how do they interact with locked/hidden layers and cross-kind selection?
10. **Touch story for nudge/rotate**: TransformHud is hidden on phones and the tools are keyboard-only; does v2 give touch users step-nudge buttons (e.g. in the bottom status bar) or drop the feature on phone deliberately?
11. **Clipboard**: include lights (fix the gap)? Move to OS clipboard (serialized JSON) to enable cross-project paste, given project export/import already exists?
12. **Alt-drag duplicate** (asked about in the brief — does NOT exist today): worth adding as a gizmo-drag modifier in v2, or keep Duplicate/⌘C⌘V only?
13. **VectorApply vs live-commit**: bulk panel is apply-button-based while single-entity fields commit live; unify on one model (live relative deltas are awkward — but the Apply flow is a discoverability outlier)?
