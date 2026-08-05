# Area analysis: App shell, layout & floating-surface inventory

Analysis for the flexo v2 mode-based desktop refactor. Repo: `/Users/asherwin/repos/meow-sci/flexo`. All paths below are repo-relative unless absolute. Verified against source (not docs) on 2026-08-04, branch `main` @ fcd5e07.

---

## 0. Shell architecture at a glance

- `index.html` — bare `#root`, viewport meta locks zoom (`user-scalable=no`, `viewport-fit=cover`) so iOS pinch/double-tap never hijacks 3D gestures. Vite base path is `/flexo/`.
- `src/main.tsx` — boot sequence **before first render**: `registerEditorAidStores` (wires container/measurement stores into undo), `hydrateProjectOnBoot()` (restores the current project synchronously so the first paint is correct), `initCustomAssets()`, `initAnimationStore()`, share-link detection (`?load=<payload>` → skip build check + suppress About intro; async Zstd decode lands after first paint), `checkBuildId()` otherwise, `initModFolder()` (async FS-Access grant restore). Renders `<App/> + <GlobalToastRegion/> + <BuildIdMismatchDialog/>` under StrictMode.
- `src/app.tsx` — the entire shell. There is **no CSS grid/flex layout**: the 3D viewport fills `fixed inset-0` and every other surface is **absolutely positioned over it** (floating chrome over a full-bleed canvas). Desktop vs phone is a single `useIsPhone()` branch (`src/ui/kit/useIsPhone.ts`, matchMedia `(max-width: 639px)` = Tailwind `sm`).

The app root (`src/app.tsx:56`) is `<div className="fixed inset-0 bg-canvas text-fg">` containing, in mount order: GlobalHotkeys (no UI), HelpDialog, AboutDialog, ViewportDropZone→ViewportCanvas, top toolbar (desktop `EditorToolbar` / phone `MobileTopBar`), the centered toolbar stack (phone `FloatingPreviewToolbar` + `SelectionToolbar` + `MultiSelectToolbar`), inspector (`RightPanel` desktop / `MobileInspector` phone), `FloatingInspector` (desktop), `FloatingPreviewToolbar` (desktop), `SeatViewBar`, `MeasurementEditor`, `ContainerEditor`, `ManageTexturesPanel`, `GlowPaintDialog`, `ImportModelDialog`, `ImportReportCard`, `MeasurementInfo`, `WorkspaceLoadProgress`, `TransformHud`, `ChainPalette`.

Nearly every floating surface **self-gates** (renders `null` unless its store says otherwise), so app.tsx mounts everything unconditionally. This is the core pattern the v2 mode system replaces: today "modes" are emergent from which stores are non-null (`$inspectorMode`, `$chainSession`, `$seatView`, `$activeMeasurementId`, `$activeContainerId`, `$managingMeshId`, selection).

---

## 1. Feature inventory

### 1.1 Top toolbar (desktop) — `src/ui/Toolbar.tsx` (`EditorToolbar`)

Mounted at `src/app.tsx:78`: `absolute left-3 top-3 right-[19rem] lg:right-auto lg:left-1/2 lg:-translate-x-1/2` — centered at `lg`+; below `lg` it left-aligns with a right boundary reserving 19rem for the inspector and `flex-wrap` lets it span two rows on portrait tablets (`Toolbar.tsx:24`).

Full desktop toolbar structure, in order (`Toolbar.tsx:23-66`):

1. **Project** (`src/ui/ProjectButton.tsx`) — trigger shows current project name (truncated at 14ch). Popover (`bottom start`, w-64):
   - _Project Name_ text input — rename on blur/Enter (`renameCurrentProject`, remount-keyed on name).
   - **Load Project...** → centered modal listing every saved project (name, SubPart count, saved-at; Load button disabled for current; per-project delete with nested ConfirmDialog). `projectStore.listProjects/loadProject/deleteProject`; list refresh via a manual `setTick` because localStorage isn't reactive (`ProjectButton.tsx:164`).
   - **New Project** → `createProject(uniqueProjectName())`.
   - _Project Data_ section: **Share Project...** (`src/ui/ShareProjectDialog.tsx` — stateless deep link: JSON→Zstd→Base64 URL; disabled when `hasCustomAssets(part)`), **Export...** / **Import...** (`src/ui/ProjectTransferDialogs.tsx` — data-only JSON export (blocked with custom assets, Phase 2 TODO) and ADDITIVE import merged as one undo step via `importProjectData`).
   - Workspace autosaves; there is deliberately **no Save action**.
2. Separator.
3. **Add** (`src/ui/AddButton.tsx`) — menu (`bottom start`, w-52), items in order:
   - **SubPart** → `SubPartPopup` (catalog browser modal, `src/ui/SubPartBrowser.tsx` via `BrowserPopup`).
   - **Connector** → `addConnector()` (immediate).
   - **Import built-in Part** → `PartPopup` (`src/ui/PartBrowser.tsx`).
   - **Define Engine…** → `enterEngineMode()` (switches right sidebar to `engine` mode).
   - **Upload texture…** → `CustomTextureDialog`.
   - **Create material…** → `MaterialDialog`.
   - **Create mesh…** → `CreateMeshDialog` (primitive meshes).
   - **Import model…** → `openImportModel()` (ImportModelDialog on its file-pick step).
   - **Custom Meshes ▸** submenu (only when non-kitten custom meshes exist) → re-place any custom mesh (`addSubPart(subPartId)`).
   - **Collider ▸** submenu with TWO menus: "Add at origin" (per `COLLIDER_SHAPES`) and "Fit to selection" (`requestColliderFit` — publishes an intent the three-layer consumes because fitting needs world geometry, `AddButton.tsx:110`).
   - **IVA Seat** → `addIvaSeat()` (origin, +X look — KSA defaults).
   - **Light ▸** submenu: Spot / Point → `addLight(null,…)` + select + `revealEntity`.
   - **Kitten ▸** submenu: hunter / polaris / banjo → `addKitten`.
   - **Make Kitten Mesh ▸** submenu: hunter / polaris / banjo → `makeKittenMeshPart` (bakes a kitten into exportable SubParts).
4. **Part Data** (`src/ui/PartDataButton.tsx`) — fullscreen modal (phone: `cover`), DisclosureSections: Identity (Part Id, IdentityFields, Editor Tags, SizeControlFields), Mass, Tanks (part-level `<Tank>`s), Power (badge = batteries+generators+solarPanels+powerConsumer), Coupling (decoupler/dockingPort/evaDoor), Engine (all part-level engine modules + `EngineIssuesPanel` inline validation) — KSA GameData authoring.
5. **Export** (`src/ui/ExportButton.tsx`) — fullscreen modal, max-w-2xl. Two modes (XML / Mod), tabs part|gamedata|assets. Runs the full pre-flight (`validateEngines/Colliders/IvaSeats/Lights` + basic id checks) rendering three severity boxes: `block` (KSA refuses to load), `warn` (loads but misbehaves), `info`. Mod mode writes into a granted mods folder (`modFolderStore`, FS Access API) or downloads a zip.
6. Separator.
7. **View** (`src/ui/ViewButton.tsx`) — popover (`bottom`, `w-[min(24rem,calc(100vw-1.5rem))]`, max-h-80vh scroll):
   - _Camera Snap_: left/right, front/back, top/bottom buttons → `snapCamera` (one-shot nonce atom `$cameraSnap`, `src/state/viewStore.ts:58`).
   - _Grids_: per-axis (X/Y/Z-normal) enable switch + spacing `PreciseNumberInput` (m) → `$grids` (persisted).
   - _Visibility_: **Hide interior** switch (`$hideInterior` — renders the part the way KSA does outside IVA); **Light coverage** select (Selected/All/Off), **Exposure** select (Auto/Absolute + absolute value input), **Preview lighting** switch with over-cap warning (`MAX_PREVIEW_LIGHTS`) — all `$lightSettings` (`settingsStore`).
   - _Lighting_: Environment preset select (HDRs stream with progress → LoadProgress), Tone map select, Exposure slider (0.1–3), Reflections slider (0–3), **Show sky background** switch, Sky blur slider — `$lighting` (`lightingStore`, persisted `flexo:lighting`).
8. **Measure** (`src/ui/MeasureButton.tsx`) — popover (`bottom`, `w-[min(22rem,…)]`):
   - _Selection bounds_: show bounding box switch, orientation toggle (World/Oriented), per-mesh dimensions switch, distance-between-two-meshes switch → `$measurementSettings` (persisted `flexo:measure`).
   - _Tools_: **Add reference line** (`addReferenceLine`, closes popover), **Point-to-point** toggle tool (`setMeasureTool('point')` — click 2 points in the viewport).
   - _Measurements_: `MeasurementList` (select/activate; activating opens the MeasurementEditor card).
   - _Reference containers_: Box/Cylinder/Sphere add buttons (`addContainer`), `ContainerList`, warn-precision toggle (Fast bbox / Accurate vertex) → `$containerSettings`.
   - _Units_: m/cm/mm select.
9. Separator.
10. **Undo** / **Redo** icon buttons — `undo()/redo()` with toast of the step label; disabled off `$canUndo/$canRedo`.
11. **History** (`src/ui/HistoryButton.tsx`) — popover (`bottom end`, w-56, max-h-80): the full undo/redo stack as rows with a "current" divider; clicking a row `jumpToHistory(stepsFromCurrent)` + toast. Disabled when no history.
12. Separator.
13. **Menu (☰)** (`src/ui/SettingsButton.tsx`) — menu (`bottom end`, w-44):
    - **Scale Everything** → `ScaleEverythingDialog` (center modal): per-axis factors with linked toggle, scales every placement/connector/kitten AND animation keyframes around origin in one undo step (`scaleEverything`).
    - **Settings** → `SettingsModal` (center modal): FPS counter switch (`$showFpsCounter` → stats.js overlay in the viewport, `src/three/Viewport.ts:156` — also switches the render loop to continuous); Connector size (m); IVA seat marker size + gaze-cone switch; Selection highlight color+alpha rows for Meshes and Kittens; Kitten mesh texture export mode (reference game install w/ Content/Core path field vs bundle copies).
    - **Shortcuts** → `openHelp()` (HelpDialog).
    - **About** → `openAbout()` (AboutDialog).
    - **Reset Everything 🔥** → ConfirmDialog with "Reset folder access grants" switch → `nukeAndReload({resetFsGrants})` (`src/ui/nukeAndReload.ts` — clears localStorage/sessionStorage + deletes IndexedDB DBs except `flexo-fs` unless opted in, then reloads).

### 1.2 Mobile top bar — `src/ui/MobileTopBar.tsx` (phone only)

Full-width bar (`absolute inset-x-0 top-0`, `rounded-none border-x-0 border-t-0`): Project, spacer, Add, separator, Undo, Redo, **☰ overflow menu** (`bottom end`, w-48) with items: Part Data, Export, View, Measure, Scale Everything, History | Settings, Shortcuts, About | Reset Everything 🔥. Each item opens the SAME dialog components as desktop but in **controlled mode** (`isOpen/onOpenChange` props) so there is no menu-inside-menu nesting (`MobileTopBar.tsx:34`); View/Measure/History become bottom **sheets** (`variant="sheet"`) instead of popovers. This controlled/uncontrolled dual API (`PartDataButton`, `ExportButton`, `ViewButton`, `MeasureButton`, `HistoryButton` all implement `isControlled = externalOpen !== undefined`) is a shell-wide pattern v2 must subsume.

### 1.3 Right sidebar (desktop) — `src/ui/RightPanel.tsx` + `src/ui/InspectorContent.tsx`

- Container: `absolute right-3 top-3 bottom-3`, inline `style={{width}}` from `$inspectorWidth` (persisted `flexo:inspectorWidth`, default **450px**, clamped 240–640 by `setInspectorWidth`, `src/state/uiStore.ts:30`). The wrapper is `pointer-events-none` with each child opting back in, so empty area doesn't swallow clicks meant for the toolbar behind it (`RightPanel.tsx:72-77`). It **floats over** the viewport (canvas is not resized/centered around it).
- **Resize**: 2px-wide grab strip on the panel's left edge (`ResizeHandle`, pointer-capture drag; dragging left widens). Width persists live during drag.
- **Collapse**: PanelRight icon button toggles `$inspectorVisible` (persisted `flexo:inspectorVisible`); collapsed state renders only the toggle button at `right-3 top-3`.
- **Tabs/modes**: `$inspectorMode: 'assets' | 'anim' | 'engine'` (`src/state/uiStore.ts:17`) — ephemeral, resets to `assets` on reload. NOT tabs in the UI sense: full-body swaps.
  - `assets`: `AssetsToolbar` (Layers button stretching to fill + "Custom (N)" → `CustomAssetsModal` + "Engine (N)" → `setInspectorMode('engine')` + "Anim (N)" → `setInspectorMode('anim')`) above `AssetsList` (unified sectioned list of every entity across listed layers, search, multi-select w/ shift-range (`useShiftRangeSelect`), per-row overflow menus, per-row seat-view entry, ManageTanks/manage-textures entry points).
  - `anim`: `AnimToolbar` (Mesh Picker → `MeshPickerModal`; clip name; Close → back to assets) above `AnimationPanel` (full-sidebar animation editor). The Assets list is _hidden_ in this mode — parts reachable only via Mesh Picker.
  - `engine`: `EngineToolbar` (active engine scope label; Close → `exitEngineMode`) above `EnginePanel` (full-sidebar engine designer).
- The selected-entity **TransformInspector is NOT in the sidebar** on desktop — it floats (see 1.4). The phone sheet opts it back inline via `InspectorContent showTransform` (`InspectorContent.tsx:23`).

### 1.4 Floating Selection inspector — `src/ui/FloatingInspector.tsx` (desktop only)

Draggable window (`absolute z-30 w-72`) containing `TransformInspector` (1,134 lines: transform fields, connector capabilities/flags, light editing, IVA seat aiming, bulk transform for multi-select, etc.). Visible when `$selectionCount > 1 || $selectedEntity != null`. Default anchor bottom-left (4px margins); dragging the "Selection" grip header stores explicit top-left px in `$inspectorFloatPos` (persisted `flexo:inspectorFloatPos`, cleared only by global reset). Clamps to keep ≥80×28px on screen after viewport shrink. Body scrolls at `max-h-[calc(100dvh-6rem)]`.

### 1.5 Selection toolbar — `src/ui/SelectionToolbar.tsx`

Centered stack below the top toolbar (`app.tsx:87`, `absolute left-1/2 top-16` desktop / `top-14` phone). Shown when `$hasSelection || $isPoseEditing || $isExhaustPlacing`. Contains Move/Rotate/Scale ToggleButtonGroup driving `$toolMode` — reads `$effectiveToolMode` (engineStore computed) so exhaust placement displays the tool the gizmo is actually in; Scale disabled during exhaust placement. When a real selection exists: **Duplicate**, **Chain** (toggleChainPalette), **Delete**. Rationale for pose/exhaust gating documented at `SelectionToolbar.tsx:21-35`.

### 1.6 Multi-select toolbar — `src/ui/MultiSelectToolbar.tsx`

Stacks beneath SelectionToolbar when `$hasMultiSelection`. **Change Layer** menu (destination layers minus entity-only built-ins), **Interior (IVA only)** menu (per-TEMPLATE semantics — KSA `<Internal>` lives on the template PartModel; disabled/`n/a` when all selected templates are glass), **Delete All (N)** with confirm.

### 1.7 Floating animation preview toolbar — `src/ui/FloatingPreviewToolbar.tsx`

Visible only when `$inspectorMode === 'anim' && $activeAnimation`. Desktop: draggable (grip) `absolute z-30 w-80`, default top-center at `top: 4rem` (right below the main toolbar, i.e. same slot as SelectionToolbar); position persisted `$animPreviewFloatPos`. Phone: static in-flow bar pinned into the top toolbar stack (mounted at `app.tsx:92` inside the centered stack), no drag. Contains `PreviewScrubber`: spring-loaded scrub slider (`$animPreviewU`/`$animScrubbing` — releasing snaps back to the modeled rest pose) + play-once button (`$animPlaying`).

### 1.8 Seat view bar — `src/ui/SeatViewBar.tsx`

Bottom-center (`absolute inset-x-0 bottom-14 z-30`), visible while `$seatView` (ivaStore) holds a seat id — both desktop and phone (in seat view the viewport IS the UI). Prev/next seat (wraps document order, mirrors game `C` key; also re-selects the seat), "Seat i / N" ordinal label (KSA seats have no names), info tooltip stating preview honesty limits, **Exit (Esc)** → `exitSeatView`.

### 1.9 Measurement editor & container editor — `src/ui/MeasurementEditor.tsx`, `src/ui/ContainerEditor.tsx` via `src/ui/FloatingEditorPanel.tsx`

Shared shell: desktop = left-pinned vertically-centered card (`absolute left-3 top-1/2 z-10 -translate-y-1/2`, width class per panel); phone = full-width sheet above the inspector FAB (`absolute inset-x-2 bottom-20 z-10`). Header = title + lock/unlock + close.

- MeasurementEditor: active line measurement (`$activeMeasurementId`) — numeric endpoints, length (preserves direction), axis lock Free/X/Y/Z, color+alpha, A/B endpoint toggle that drives the 3D gizmo. Locked = read-only.
- ContainerEditor: active reference container (`$activeContainerId`) — shape-specific size fields, position/rotation (Euler deg ↔ quat), gizmo mode toggle (Move/Rotate/Scale — its own `$containerGizmoMode`, separate from `$toolMode`), color, lock, delete.
  Both participate in undo via `registerEditorAidStores` (`main.tsx:21`).

### 1.10 Manage-textures panel — `src/ui/ManageTexturesPanel.tsx`

Visible while `$managingMeshId` (customAssetStore) set. Desktop: left-pinned card (`absolute left-3 top-1/2 z-10 w-64`, scrolling at `max-h-[calc(100vh-6rem)]`); phone: fullscreen modal. Per-mesh material/glow/visor-surface/per-face texture editor; entry to GlowPaintDialog (`setGlowPaintMeshId`). Note it occupies the SAME left-center slot as MeasurementEditor/ContainerEditor (collision, see pain points).

### 1.11 Glow paint dialog — `src/ui/GlowPaintDialog.tsx`

Center modal painting a mesh's 'painted' glow bitmap on a canvas; Clear/Cancel/Apply (`setMeshGlowPainted`). Gated on `$glowPaintMeshId`.

### 1.12 Import model dialog + report card

- `src/ui/ImportModelDialog.tsx` (768 lines) — fullscreen modal, single mount for both entry points (Add menu and viewport drag-drop). Drop/pick step → preview (own `ModelPreviewViewport`) + options (scale presets, up-axis, bake, merge, double-sided, texture budget — sticky vs per-import split documented in `docs/state-persistence.md:100`) + warnings; also drives REPLACE flows started from CustomAssetsModal. `isDismissable={!importing}`.
- `src/ui/ViewportDropZone.tsx` — wraps the canvas only (toolbars/dialogs are siblings above it, so drops on chrome never trigger it); `dragover` file-type gate, dashed-accent overlay (`absolute inset-3 z-10`) while a file drag hovers; drop calls `openImportModel(files)`.
- `src/ui/ImportReportCard.tsx` — bottom-right dismissible card (`absolute inset-x-3 bottom-3 z-40`, sm: right-3 w-80, max-h-60vh scroll), persists until dismissed or the next import; deliberately NOT a toast (rationale in file header: replace destroys SubParts and users must be able to read which). `pointer-events-none` wrapper.

### 1.13 Chain palette — `src/ui/chain/ChainPalette.tsx`

**Non-modal** floating command palette for action chains. Visible while `$chainSession` (frozen seed selection). Desktop: `absolute left-3 top-16 w-[340px] z-30 max-h-[calc(100vh-8rem)]`; phone: `absolute inset-x-2 bottom-20 max-h-[45vh]`. SearchField (autofocus) filters step commands (translate/radial/grid…); step cards (`ChainStepCard`) stack; live footer shows `N instances · +M new` / error / ghost-cap note (`PREVIEW_MAX_GHOSTS`). Apply commits via `applyActionChain` as ONE undo step; Cancel/Escape closes. Its own hotkeys: `mod+enter` apply, `escape` cancel (registered inside the component with `enableOnFormTags: true`, not via the registry). Open guards centralized in `src/ui/chain/openChainPalette.ts` (SubParts only, refuses locked layers, toggles).

### 1.14 Passive HUD / status surfaces

- **TransformHud** (`src/ui/TransformHud.tsx`) — bottom-center pill (`absolute inset-x-0 bottom-2`), desktop only (keyboard-only feature). Left cluster: rotate key pairs Q/E, W/S, A/D each showing a gizmo-colored axis arrow (X red, Y green, Z blue) + step angle; click = cycle axes (same as `R`). Right cluster: nudge axis + step; click = cycle axis. Rich hotkey tooltips (`RotateHint`/`NudgeHint`). Reads `$nudgeAxis/$nudgeStep/$rotateStep/$rotateAxisOffset` (all persisted).
- **MeasurementInfo** (`src/ui/MeasurementInfo.tsx`) — bottom-left readout card (`absolute bottom-3 left-3`, `pointer-events-none`) of selection bbox W/H/D + diagonal, unit-formatted; badge shows world/oriented mode. Driven by `$selectionBounds` written by the three.js MeasurementLayer.
- **WorkspaceLoadProgress** (`src/ui/LoadProgress.tsx:69`) — bottom-center (`absolute bottom-4 left-1/2`), per-file progress bars for HDR/GLB/KTX2 streams (`$loadProgress` via `trackDownload`); hides while `$browserPopupCount > 0` because the browsers show their own `PreviewLoadProgress` overlay variant (`absolute inset-0 z-10` over the preview pane).
- **FPS counter** — stats.js DOM injected top-left INSIDE the viewport host at `z-10` (`src/three/Viewport.ts:156-170`); enabling switches the on-demand render loop to continuous.
- **Toasts** — `src/ui/kit/Toast.tsx`: react-aria ToastRegion `fixed bottom-4 right-4 z-[100]`, max 4 visible, default timeout 4s; imperative `toast()` callable from any layer. Used for undo/redo/copy/paste feedback, share-link results, boot purge notice, chain results, errors.

### 1.15 Mobile inspector — `src/ui/MobileInspector.tsx` (phone only)

Pinned bottom-right FAB (`absolute bottom-3 right-3`, size lg) showing active layer name + selection-count badge (subparts+connectors+kittens). Opens a bottom sheet Modal (`variant="sheet"`, h-78vh) containing `InspectorContent showTransform` — i.e. assets/anim/engine modes AND the inline TransformInspector. Local `useState` open (not persisted).

### 1.16 Catalog browsers — `src/ui/BrowserShell.tsx`, `SubPartBrowser.tsx`, `PartBrowser.tsx`

`BrowserPopup`: cover-variant modal (`sm:w-[95vw] sm:max-w-[75rem]`), body only mounts while open so each open is a fresh session (search/selection/split reset — relied upon, `BrowserShell.tsx:6`). `BrowserLayout`: desktop `list | (preview / details)` with `HorizontalSplit`/`VerticalSplit` draggable dividers (`src/ui/VerticalSplit.tsx` — local state %, clamped 15–85, resets on remount); phone: list over preview. Both browsers bump `$browserPopupCount` on mount to swap the load-progress surface.

### 1.17 Global dialogs & boot surfaces

- **HelpDialog** (`src/ui/hotkeys/HelpDialog.tsx`) — shortcuts overlay generated from `HOTKEY_GROUPS` (single source of truth with the live bindings); fullscreen desktop / cover phone; opened by `?`, Settings menu, mobile menu via shared `$helpOpen` (helpStore).
- **AboutDialog** (`src/ui/AboutDialog.tsx`) — blurb/license/attribution; center desktop / cover phone; `$aboutOpen` + auto-open-on-first-use via persisted `flexo:aboutSeen` (suppressed for share-link launches, `aboutStore.ts:35`).
- **BuildIdMismatchDialog** (`src/ui/BuildIdMismatchDialog.tsx`, mounted in main.tsx OUTSIDE App) — non-dismissable alertdialog when the deployed build id changed since last visit; "No thanks" or "Reset everything" (+ FS-grants switch confirm).
- **Boot purge toast** (`app.tsx:42-53`) — one-shot warning naming saved projects removed by a schema-version bump (`consumeRemovedProjectsNotice`).

### 1.18 Viewport focus management

`src/three/ViewportCanvas.tsx:31`: host div is `tabIndex={-1}` and grabs focus on pointerdown so arrow-key nudges aren't swallowed by a still-focused toolbar/menu (react-aria keyboard nav overlaps the nudge arrows). Any v2 shell must keep an equivalent focus-stealing mechanism.

---

## 2. UI surface map (census)

Stacking context: everything is in one `fixed inset-0` root; `absolute` children stack by z-index then DOM order. React-aria Popovers/Menus render in a **portal at document.body** (above everything except toasts, effectively). Layers, lowest → highest:

| #   | Surface                                                                               | Kind                       | Mount / position                                                                | z                  | Visible when                                         | Overlaps / collisions                                                                                                     |
| --- | ------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1   | ViewportCanvas                                                                        | canvas                     | `absolute inset-0` in root                                                      | auto (0)           | always                                               | base layer                                                                                                                |
| 2   | FPS stats.js                                                                          | hud                        | injected `absolute top-0 left-0` in viewport host                               | 10                 | `$showFpsCounter`                                    | under top toolbar on desktop-left                                                                                         |
| 3   | ViewportDropZone overlay                                                              | hud                        | `absolute inset-3`                                                              | 10                 | during file drag                                     | covers viewport only                                                                                                      |
| 4   | EditorToolbar (desktop)                                                               | toolbar                    | `absolute left-3 top-3 right-[19rem] lg:centered`                               | auto               | !isPhone                                             | RightPanel container overlays it (mitigated w/ pointer-events-none); wraps to 2 rows < lg                                 |
| 5   | MobileTopBar                                                                          | toolbar                    | `absolute inset-x-0 top-0`                                                      | auto               | isPhone                                              | —                                                                                                                         |
| 6   | Top-center stack (SelectionToolbar, MultiSelectToolbar, phone FloatingPreviewToolbar) | floating-bar               | `absolute left-1/2 top-16` (phone top-14), flex-col                             | auto               | selection / pose / exhaust; multi; anim clip (phone) | desktop FloatingPreviewToolbar default pos = same top-center slot → **stacks visually onto SelectionToolbar area**        |
| 7   | RightPanel                                                                            | sidebar                    | `absolute right-3 top-3 bottom-3`, width 240–640px, pointer-events-none shell   | auto (handle z-10) | !isPhone (collapsed = button only)                   | floats over viewport; over toolbar at narrow widths                                                                       |
| 8   | MobileInspector FAB                                                                   | hud                        | `absolute bottom-3 right-3`                                                     | auto               | isPhone                                              | shares corner with toasts (z-100) and ImportReportCard                                                                    |
| 9   | MeasurementEditor / ContainerEditor / ManageTexturesPanel                             | floating panel             | desktop `absolute left-3 top-1/2 -translate-y-1/2`; phone `inset-x-2 bottom-20` | 10                 | active measurement / container / managing mesh       | **all three share the exact left-center slot — two active = full overlap**; also collides with ChainPalette (left column) |
| 10  | MeasurementInfo                                                                       | hud                        | `absolute bottom-3 left-3`                                                      | auto               | selection bounds exist                               | under left-center panels on short screens                                                                                 |
| 11  | WorkspaceLoadProgress                                                                 | hud                        | `absolute bottom-4 left-1/2`                                                    | auto               | downloads active & no browser popup                  | shares bottom-center with TransformHud & SeatViewBar                                                                      |
| 12  | TransformHud                                                                          | hud                        | `absolute inset-x-0 bottom-2` centered                                          | auto               | !isPhone                                             | just under load progress; SeatViewBar sits above it                                                                       |
| 13  | SeatViewBar                                                                           | floating-bar               | `absolute inset-x-0 bottom-14`                                                  | 30                 | `$seatView` ≠ null                                   | above TransformHud slot                                                                                                   |
| 14  | FloatingInspector                                                                     | floating window            | `absolute z-30 w-72`, default bottom-left, draggable, pos persisted             | 30                 | selection (desktop)                                  | default slot on top of MeasurementInfo's corner; user-draggable anywhere                                                  |
| 15  | FloatingPreviewToolbar (desktop)                                                      | floating-bar               | `absolute z-30 w-80`, default top-center `top:4rem`, draggable, pos persisted   | 30                 | anim mode + clip                                     | default collides with SelectionToolbar during pose editing                                                                |
| 16  | ChainPalette                                                                          | floating panel (non-modal) | desktop `absolute left-3 top-16 w-[340px]`; phone `inset-x-2 bottom-20`         | 30                 | `$chainSession`                                      | left column: over Measurement/Container/Textures panels                                                                   |
| 17  | ImportReportCard                                                                      | card                       | `absolute bottom-3 right-3 w-80` (phone full-width)                             | 40                 | `$importReport`                                      | under toasts; over FAB corner on phone                                                                                    |
| 18  | All Modals (kit Modal: center/sheet/fullscreen/cover)                                 | dialog                     | `fixed inset-0` overlay                                                         | 50                 | per dialog                                           | modal-over-modal happens (ConfirmDialog inside LoadProjectDialog etc.)                                                    |
| 19  | Popovers / Menus / Tooltips                                                           | popover                    | react-aria portal, positioned to trigger                                        | portal             | open                                                 | can extend past viewport edge on small screens                                                                            |
| 20  | GlobalToastRegion                                                                     | toasts                     | `fixed bottom-4 right-4`                                                        | 100                | queue non-empty                                      | topmost                                                                                                                   |

Dialog inventory (all kit `Modal`): LoadProjectDialog (center), ShareProjectDialog (fullscreen), ExportProjectDialog / ImportProjectDialog (fullscreen), PartData (fullscreen/cover), Export (fullscreen), SettingsModal (center), ScaleEverythingDialog (center), HelpDialog (fullscreen/cover), AboutDialog (center/cover), BuildIdMismatch (center, non-dismissable), CustomAssetsModal (fullscreen), MeshPickerModal (fullscreen), ManageTanksModal (fullscreen/cover), CustomTextureDialog, MaterialDialog, CreateMeshDialog, ImportModelDialog (fullscreen), GlowPaintDialog (center), SubPart/Part BrowserPopup (cover 95vw), MobileInspector sheet, mobile variants of View/Measure/History (sheet), plus ~6 ConfirmDialogs (delete project, delete selection, reset ×3, asset deletes).

---

## 3. State & data flow

Stores owned by / central to the shell:

- `src/state/uiStore.ts` — `$inspectorMode` (**ephemeral**), `$inspectorVisible` + `$inspectorWidth` + `$inspectorFloatPos` + `$animPreviewFloatPos` (**persisted** localStorage via `@nanostores/persistent`).
- `src/state/viewStore.ts` — `$grids`, `$hideInterior` (persisted); `$cameraSnap`/`$cameraRestore` (one-shot nonce commands consumed by EditorScene); `$cameraState` (written by viewport on gesture end; **saved into the project snapshot**, `projectStore.ts:160`).
- `src/state/helpStore.ts` / `aboutStore.ts` — `$helpOpen`/`$aboutOpen` ephemeral cross-surface open flags; `$aboutSeen` persisted.
- `src/state/settingsStore.ts` — persisted preference atoms: `flexo:connectorSettings, ivaSeatSettings, lightSettings, selectionHighlight, kittenTextureExport, modelImport, simulateGlass, showFpsCounter`. NOTE the verbatim-replay gotcha: persisted objects don't merge defaults, so reads go through `{...DEFAULTS, ...stored}` (`settingsStore.ts:117`, ViewButton.tsx:62).
- `src/state/loadProgressStore.ts` — `$loadProgress` (byte-level per-file), `$browserPopupCount` (which of two progress surfaces shows).
- `src/state/editorStore.ts` — `$part` document, selection atoms, `$toolMode`, undo/redo (`$canUndo/$canRedo/$historyList/jumpToHistory`), nudge/rotate atoms (persisted: `flexo:nudgeAxis/nudgeStep/rotateStep/rotateAxisOffset`), `$bulkScaleMode` (persisted).
- Mode-ish session stores: `chainStore.$chainSession`, `ivaStore.$seatView`, `engineStore` (`$activeEngineEntry`, `$isExhaustPlacing`, `$effectiveToolMode`), `animationStore` (`$activeAnimation`, `$isPoseEditing`, `$animScrubbing/$animPreviewU/$animPlaying`), `customAssetStore` (`$managingMeshId`, `$glowPaintMeshId`, `$importModelRequest`, `$importReport`), `measurementStore.$activeMeasurementId/$measureTool/$selectionBounds`, `containerStore.$activeContainerId/$containerGizmoMode`.

Persistence tiers (see `docs/state-persistence.md`, verified):

1. **Preference atoms** → localStorage `flexo:*` (18+ keys; full list: aboutSeen, bulkScaleMode, connectorSettings, containers*, grids, hideInterior, inspectorVisible, inspectorWidth, inspectorFloatPos, animPreviewFloatPos, ivaSeatSettings, kittenTextureExport, layerView, lighting, lightSettings, measure, modelImport, nudgeAxis, nudgeStep, rotateAxisOffset, rotateStep, selectionHighlight, showFpsCounter, simulateGlass; *containers/measurements are ALSO snapshotted per-project).
2. **Project snapshots** → hand-rolled localStorage `flexo:project:<name>` + `flexo:currentProject` (`projectStore.ts:57`), schema-versioned (`PROJECT_SCHEMA_VERSION = 2`); snapshot = `$part` + layerView + undo history + camera + measurements + containers. Boot purge (never migrate) with user notice.
3. **IndexedDB** — custom-asset binaries (`assetDb.ts`) and the FS-Access mod-folder grant (`flexo-fs`, deliberately survives default reset).
4. **Ephemeral** — selection, inspector mode, seat view, chain session, all open-dialog state.

Undo/redo: shell surfaces feed the single editorStore history; measurement/container stores are grafted in via `registerEditorAidStores` (main.tsx). Chain apply = one step. View/settings/layout atoms are deliberately OUTSIDE undo (flipping Hide-interior must never create a step, `docs/state-persistence.md:125`).

---

## 4. Pain points (evidence-based)

1. **The left-center slot is triple-booked.** `MeasurementEditor`, `ContainerEditor` (both via `FloatingEditorPanel.tsx:33`) and `ManageTexturesPanel.tsx:148` all render at `absolute left-3 top-1/2 -translate-y-1/2 z-10`. Activating a measurement while managing a mesh's textures stacks two cards exactly on top of each other (DOM order wins). `ChainPalette` (left-3 top-16) also invades the same column.
2. **Top-center is double-booked in anim mode.** Desktop `FloatingPreviewToolbar` defaults to `left:50%, top:4rem` (`FloatingPreviewToolbar.tsx:86`) — the same place the `SelectionToolbar` appears during pose editing (`app.tsx:87` stack at top-16 = 4rem). The user must drag the scrubber away once; the position then persists, papering over the collision.
3. **No shared window manager.** Three independent hand-rolled drag implementations (`FloatingInspector.tsx:37`, `FloatingPreviewToolbar.tsx:48`, plus `RightPanel` resize and `VerticalSplit` dividers) with copy-pasted clamp logic (KEEP_VISIBLE_X/Y constants duplicated). No z-order management between draggables — all z-30, DOM order decides.
4. **Right panel floats over content it must not block** — solved with a fragile `pointer-events-none` shell + per-child opt-in (`RightPanel.tsx:72-77`), and the toolbar must reserve `right-[19rem]` below `lg` (`app.tsx:78`) which assumes a ~450px default inspector; a 640px-wide inspector still covers a centered toolbar at some widths.
5. **`$inspectorMode` is a hidden mode machine.** Assets/anim/engine swap the entire sidebar; discoverability of "how do I get back" rests on per-toolbar Close buttons; entering engine mode from the Add menu (`AddButton.tsx:70`) surprises by replacing the sidebar. FloatingPreviewToolbar and pose gizmos also key off this atom — it's already a "mode" in v2's sense, without a visible mode indicator.
6. **Controlled/uncontrolled dual API on every toolbar dialog** (`PartDataButton.tsx:43`, `ExportButton.tsx:83`, ViewButton, MeasureButton, HistoryButton) exists only because phone re-hosts the same dialogs from an overflow menu. A real menubar + command registry would collapse this.
7. **Modal-in-modal**: ConfirmDialog nested inside LoadProjectDialog (`ProjectButton.tsx:225`), inside MultiSelectToolbar flow, inside BuildIdMismatch; MaterialDialog can open from ManageTexturesPanel and CustomAssetsModal. Works via react-aria but stacks two z-50 overlays with double backdrops.
8. **View/Measure popovers are overloaded settings panels** — ViewButton popover holds 4 sections/15+ controls with `max-h-[80vh]` scrolling (`ViewButton.tsx:315`); Measure similarly mixes tool activation, lists, and settings. These are sidebar/panel content forced into popovers.
9. **Non-reactive project list** — LoadProjectDialog re-renders via a `setTick` hack after delete (`ProjectButton.tsx:164`) because listProjects() reads localStorage directly.
10. **Bottom edge congestion**: TransformHud (bottom-2), WorkspaceLoadProgress (bottom-4 center), SeatViewBar (bottom-14), MeasurementInfo (bottom-3 left), FloatingInspector default (bottom-left!), ImportReportCard + toasts (bottom-right), phone FAB (bottom-right) — six ad-hoc corners with no status-bar concept; FloatingInspector's default anchor sits on top of MeasurementInfo.
11. **Hotkey system is split**: registry-driven globals (`registry.ts`) vs component-local `useHotkeys` in ChainPalette (mod+enter/escape) and viewport-level key handling; Escape semantics are hand-tuned in three places (registry `exit-seat-view` options, ChainPalette comment re useNumberDraft, gizmo drag cancel).
12. **Desktop toolbar hides labels progressively** with utility hacks (`<span className="sm:hidden">` on History/Menu) rather than a responsive menubar model.

---

## 5. Invariants & constraints (MUST survive v2)

- **All numeric fields** use `useNumberDraft`/`PreciseNumberInput`/`NumberField` with `inputMode="url"` (project-wide mandate; ad-hoc `Number(v)` TextFields regress empty→0 and make ".06"/"-" untypeable).
- **Store layering**: `state/` and `ksa/` never import react/three (`docs/architecture.md:23`); three-layer talks to UI only via atoms (one-shot nonce commands like `$cameraSnap` are the sanctioned pattern for imperative viewport actions). EditorScene is the only scene mutator.
- **Project snapshot format** (`PROJECT_SCHEMA_VERSION`, `flexo:project:*`) is the compatibility contract: never migrate, boot-purge with notice. The localStorage preference keys are wiped by Reset Everything; `flexo-fs` IndexedDB grant survives unless opted in.
- **Autosave-only projects** — no Save button; any v2 project-management overlay must keep autosave + rename-in-place + additive JSON import (one undo step) + share-link/Zstd flow, including the share-link boot behaviors (skip build check, don't mark About seen).
- **Hotkey single-source-of-truth**: `HOTKEY_GROUPS` drives both bindings and the help overlay — keep that property. Hotkeys disabled while typing, including react-aria virtual-focus widgets (`GlobalHotkeys.tsx:34` activeElement gate — subtle, easy to lose).
- **Escape layering**: seat-view Escape never `preventDefault`s and gates on `$seatView`; chain Escape must not swallow useNumberDraft's dirty-revert Escape. Dialog/popover dismissal must continue to win.
- **Viewport steals focus on pointerdown** (`ViewportCanvas.tsx:31`) so arrow nudges work after clicking the 3D view.
- **KSA semantics embedded in shell chrome**: Interior toggle is per-template and n/a for glass (`MultiSelectToolbar.tsx:86`); seat cycling mirrors game `C` in document order and seats are ordinal-named; export pre-flight severity classes (block/warn/info) map to real KSA loader behavior; "count=total" etc. for chains; colliders "fit to selection" must go through the intent atom (needs world geometry).
- **Axis color convention**: X=red, Y=green, Z=blue everywhere (TransformHud matches gizmo).
- **Preview honesty**: SeatViewBar info note and FloatingPreviewToolbar's spring-loaded scrubber (release = modeled rest pose, `restAnchorTime` semantics) are deliberate; don't "fix" them into sticky scrubbing.
- **Browsers reset on open** (fresh search/splits — `BrowserShell.tsx:6`); import dialog's sticky-vs-per-import settings split ("persist a preference, never a correction").
- **On-demand render loop**: FPS counter opt-in flips to continuous rendering; any new chrome must not force continuous rendering.
- **Phone support end-to-end**: every feature reachable on <640px via sheets/overflow menu; iOS zoom-lock meta must stay.

## 6. Hotkeys (complete)

From `src/ui/hotkeys/registry.ts` (global, disabled in text fields):

- W/S, A/D, Q/E — rotate selection about the three (cycling) axes; R — cycle axis assignment; F / ⇧F — rotation step larger/smaller.
- ↑/↓ — nudge along active axis; ⇧↑/⇧↓ — ×FAST_NUDGE_MULTIPLIER; ←/→ — change nudge axis; ⇧←/⇧→ — change nudge step.
- Delete/Backspace — delete selection; mod+C / mod+V — copy/paste in place (toast counts); mod+K — toggle chain palette; mod+Z — undo; mod+Y or mod+⇧Z — redo.
- `?` (useKey, ignoreModifiers) — toggle shortcuts help; Escape (no preventDefault, gated) — leave IVA seat view.
  Component-local: ChainPalette mod+Enter (apply) and Escape (cancel), both `enableOnFormTags`. Assets list & MeshPicker: click / mod+click / mod+A / shift+click range select (`useShiftRangeSelect`). ProjectName/rename inputs: Enter commits. In-game-mirroring seat cycle is UI-only (no C hotkey in flexo).

## 7. Cross-area dependencies

- Shell hosts every other area's panels: AnimationPanel/EnginePanel swap in via `$inspectorMode`; engineStore both reads and SETS that atom (`enterEngineMode` → 'engine'); animationStore computes `$isPoseEditing` FROM `$inspectorMode` — the sidebar mode atom is load-bearing for 3D gizmo behavior.
- three-layer ↔ shell: `$cameraSnap/$cameraRestore/$cameraState` (viewStore), `$selectionBounds` (MeasurementLayer → MeasurementInfo), `requestColliderFit` intent, `$lightPreviewCount` (EditorScene → ViewButton warning), stats.js DOM injection, `$chainEval` (chainEval → palette footer), viewport focus stealing.
- Toast queue is imported by state-layer-adjacent code paths (main.tsx boot, openChainPalette guards) — a v2 notification area inherits these call sites.
- `$browserPopupCount` couples catalog browsers to the workspace progress bar.
- Export/PartData dialogs render validation from `src/ksa/*Validation.ts` (game-contract area).

## 8. Open questions for v2

1. Should `$inspectorMode` ('assets'/'anim'/'engine') become the v2 top-level mode set, or do seat-view, chain-session, measure-tool, exhaust-placement (currently orthogonal store flags) join it as first-class modes? Several can co-exist today (e.g. chain while in anim mode) — is co-existence a feature to keep or an accident to forbid?
2. Left sidebar candidates: ChainPalette, Measurement/Container editors, ManageTexturesPanel all live left today. Docked left panel vs keeping some as floating windows with a real window manager (z-order, collision-free defaults)?
3. TransformInspector: back into the right sidebar (v1 moved it OUT because it pushed the anim editor off-screen — `FloatingInspector.tsx:9`), a bottom docked panel, or stay floating?
4. Persist `$inspectorMode` and floating positions per-project vs globally vs not at all (current mix: mode ephemeral, positions global)?
5. View/Measure popovers → menubar menus, right-sidebar tabs, or a settings drawer? They mix one-shot actions (camera snap, add line) with sticky settings.
6. Status bar contents: TransformHud + MeasurementInfo + LoadProgress + toasts are the natural tenants; does ImportReportCard (sticky, rich) become a notification-center entry?
7. Phone story: keep bespoke sheet/FAB/overflow layer, or derive it from the same mode/menubar model (risk: regressions in the carefully tuned iOS behaviors)?
8. Undo History popover → menubar Edit menu, dedicated panel, or both?
9. Does the desktop toolbar's dual-position responsive hack disappear once sidebars are real layout (not overlays) — i.e. should v2 give the canvas a real flex layout and drop the pointer-events-none machinery?
