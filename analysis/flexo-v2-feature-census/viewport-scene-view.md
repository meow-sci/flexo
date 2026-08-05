# Area analysis: Viewport, scene rendering, view options, lights, measure, colliders, IVA, kittens

Analysis for the flexo v2 mode-based UI refactor. Everything below is verified against the code
(paths relative to `/Users/asherwin/repos/meow-sci/flexo`), not just docs. Docs consulted:
`docs/3d-workspace.md`, `docs/lights.md`, `docs/colliders.md`, `docs/iva-seats.md`,
`docs/coordinates.md`, `plans/LIGHT_MANAGEMENT_PLAN.md`, `plans/IVA_PLAN.md`, `plans/COLLIDERS_PLAN.md`.

---

## 0. Big picture / architecture of this area

Three strict tiers, deliberately decoupled:

1. **State** (`src/state/*`) — nanostores, **zero React and zero three.js imports**. View prefs are
   `persistentJSON` (localStorage); one-shot commands are "nonce'd" atoms (`$cameraSnap`,
   `$cameraRestore`); scene-needing operations are **intent atoms** the scene consumes
   (`$colliderFitRequest`, `$coverageRequest`, `$ivaSeatAimRequest`).
2. **Three layer** (`src/three/*`) — `Viewport` (renderer/camera/controls/grids/labels),
   `EditorScene` (THE one store→scene reconciler, `src/three/EditorScene.ts`), per-entity visual
   classes (`SubPartObject`, `ConnectorObject`, `ColliderObject`, `IvaSeatObject`, `LightObject`,
   `KittenObject`), and sub-layers (`MeasurementLayer`, `ContainerLayer`, `ChainPreviewLayer`).
3. **React UI** (`src/ui/*`) — reads stores with `useStore`, writes through store actions. Popovers
   (`ViewButton`, `MeasureButton`), floating panels (`MeasurementEditor`, `ContainerEditor`,
   `SeatViewBar`, `MeasurementInfo`), and the right-panel inspector (`TransformInspector` headers
   for colliders/seats/lights).

**Rendering is strictly on-demand** (`src/three/RenderLoop.ts`). No free-running loop; a frame draws
only on `invalidate()`. Every store subscription in `EditorScene` goes through `EditorScene.sub()`
(EditorScene.ts:651) which invalidates after each callback. Contract: *anything that can change a
pixel must invalidate*. The only continuous mode is the stats.js FPS overlay
(`Viewport.setFpsCounter`, Viewport.ts:156 — `loop.setContinuous(on)`). This is a measured ~40%→~1%
idle CPU win (RenderLoop.ts:1-20) and MUST survive v2.

### How the viewport is sized/centered today (the off-center rotation complaint)

- `App` root is `fixed inset-0` (app.tsx:56); `ViewportCanvas` renders a `div` with
  `absolute inset-0` (ViewportCanvas.tsx:31-38). **The canvas always fills the entire window.**
- The desktop inspector (`RightPanel`, RightPanel.tsx:77-90) is an `absolute right-3 top-3 bottom-3`
  overlay **floating over** the canvas, default width 450px (uiStore.ts:28), user-resizable
  240–640px, collapsible.
- `Viewport.handleResize` (Viewport.ts:378) sizes camera aspect from the host div = full window.
  OrbitControls orbit around `controls.target`, which projects to the **window** center — but with
  the 450px sidebar covering the right edge, the *visible* center is ~225px left of the orbit
  center. Hence "rotation feels off-center". Same story for the left-pinned floating editors and
  toolbars: nothing ever insets the canvas.
- There is no camera-offset compensation (`camera.setViewOffset` is never used).
- v2's docked (layout-participating) sidebars would fix this for free **if** the canvas host is the
  flex cell between the sidebars rather than the window. Note the ResizeObserver on the host
  (Viewport.ts:129) already handles any host resize, so re-parenting the canvas into a shrinking
  cell needs no three-layer change.

### Focus handling quirk (must survive)

`ViewportCanvas` gives the host div `tabIndex={-1}` and focuses it on pointerdown
(ViewportCanvas.tsx:31-37) so global hotkeys (esp. arrow-key nudge) aren't swallowed by a
still-focused react-aria toolbar/menu/list. Any v2 shell must keep an equivalent
"viewport steals focus on interaction" rule.

---

## 1. Feature inventory

### 1.1 Camera & navigation

| Feature | Details |
|---|---|
| **Orbit / pan / zoom** | `OrbitControls` with damping (Viewport.ts:102-109). Inertia keeps rendering via `change`→invalidate until settled. Orbit disabled during gizmo drags and in seat view. |
| **Camera snap presets** | Toolbar → **View** popover → "Camera Snap" section: Left/Right/Front/Back/Top/Bottom buttons (ViewButton.tsx:70-82). `snapCamera(dir)` writes a nonce'd one-shot atom (`viewStore.ts:58-63`); `EditorScene` consumes it (EditorScene.ts:633-635); `Viewport.snapCamera` (Viewport.ts:184-219) recenters target on **origin (0,0,0)**, preserves current distance, adjusts `up` for top/bottom to avoid gimbal lock. No hotkeys for snaps. |
| **Camera persistence** | `$cameraState` written on every OrbitControls `end` gesture and after snaps (Viewport.ts:355-357); saved into the per-project snapshot (projectStore.ts:160) and restored on project load via one-shot `$cameraRestore` (projectStore.ts:288-292 → EditorScene.ts:636-638). `resetCamera()` (viewStore.ts:91-94) is only called on new-project/import (projectStore.ts:376,402) — **there is no user-facing "reset camera" button**. |
| **FPS counter** | Toolbar → Settings menu → Settings → Viewport → "FPS counter" switch (SettingsButton.tsx:59-67). `$showFpsCounter` (settingsStore.ts:292) → stats.js panel pinned absolute top-left **inside the viewport host**, z-index 10 (Viewport.ts:156-175); turns the render loop continuous while on. |
| **Axis triad** | NOT in the editor viewport. `AxisGizmo` (src/three/AxisGizmo.ts) is only used by the wiki `PartPreviewViewport`. The editor shows a 1m `AxesHelper` at the origin instead (Grid.ts:39-40). A corner triad is a candidate v2 addition, code already exists. |

### 1.2 View popover (Toolbar → "View") — full contents (ViewButton.tsx)

Desktop: react-aria `Popover placement="bottom"`, width `min(24rem, 100vw-1.5rem)`, max-h 80vh
scrollable. Phone: same content in a bottom-sheet `Modal variant="sheet"` (controlled via
`MobileTopBar` overflow). Sections in order:

1. **Camera Snap** — six buttons (above).
2. **Grids** — per-axis (X/Y/Z) switch + spacing `PreciseNumberInput` (min 0.05 m)
   (ViewButton.tsx:84-108). Store: `$grids` persistentJSON `flexo:grids` (viewStore.ts:27-31);
   keyed by the axis the grid is **normal to** (`y` = XZ floor, default on, spacing 1 m).
   Three: `GridManager` (Grid.ts) rebuilds `THREE.GridHelper`s (10 m extent, opacity 0.6) on
   config change (EditorScene.ts:632). Origin axes helper always shown.
3. **Visibility**
   - **Hide interior** switch — `$hideInterior` persistentJSON `flexo:hideInterior`
     (viewStore.ts:48-52). Hides every mesh whose *resolved* `<Internal>` is true, previewing KSA's
     outside-IVA render gate. Composed with layer visibility in `applyLayerView`
     (EditorScene.ts:917-927) — that method is the **only writer of `group.visible`**.
   - **Light coverage** select — Selected / All / Off (`$lightSettings.showVolumes`, default
     'selected'). Drives the falloff shell stack + hard boundary wireframe per light
     (`applyLightCoverage`, EditorScene.ts:1216-1242).
   - **Exposure** select — Auto / Absolute (+ numeric `vizExposure` field when Absolute)
     (ViewButton.tsx:141-169) — the Reinhard knee for coverage shading.
   - **Preview lighting** switch — `$lightSettings.livePreview` (default off): hangs real
     `THREE.PointLight`/`SpotLight`s off markers (`applyLightPreview`, EditorScene.ts:1261-1278),
     budgeted to `MAX_PREVIEW_LIGHTS` instances (lightVolume.ts); warning line "Previewing N of M"
     driven by ephemeral `$lightPreviewCount` (settingsStore.ts:155) published by the scene.
4. **Lighting** (global, applies to editor viewport AND all preview viewports)
   - **Environment** select — 9 presets (`environmentPresets.ts`): procedural Studio (`room`,
     no sky) + 8 bundled 4K HDRIs (Partly Cloudy, Evening Road, Autumn Field, Adams Bridge,
     Aristea Wreck, Pretoria Gardens, Glasshouse Interior [default], Blue Lagoon Night).
   - **Tone map** select — ACES Filmic / AgX / Neutral (default) / Linear (lightingStore.ts:22-27).
   - **Exposure** slider 0.1–3 (default 0.85).
   - **Reflections** slider 0–3 (environment/background intensity).
   - **Show sky background** switch (disabled for Studio) + **Sky blur** slider 0–1 when on.
   - Store: `$lighting` persistentJSON `flexo:lighting` (lightingStore.ts:53). Three:
     `SceneEnvironment` (SceneEnvironment.ts) — synchronous tonemap/exposure half, then async HDR
     load + PMREM (token-guarded against superseded applies); solid charcoal `0x16171d` background
     when sky off. HDR download progress shows in bottom-center `WorkspaceLoadProgress`
     (LoadProgress.tsx, `$loadProgress`).

### 1.3 Grids — covered above. Note grid extent is a fixed 10 m (Grid.ts:11); only spacing is configurable.

### 1.4 Selection & picking (viewport-level interaction infrastructure)

- Click-to-select via raycast on pointerup with ≤4px movement (SelectionManager.ts). Additive
  select with **Ctrl/Cmd/Shift**. Resolves `userData.selectable` `{kind, id, instanceIndex?}` for
  kinds: subpart, connector, collider, ivaSeat, kitten, light, nozzle.
- `EditorScene`'s onSelect (EditorScene.ts:299-414) guards locked layers and invisible layers
  (three raycasts invisible objects!), records collider/light **instance context** (which
  per-placement visual was clicked), and syncs `revealEntity` scrolling in the Assets list.
- Selection suppression is an OR of independent flags: gizmo dragging, measure tool active, seat
  view active (EditorScene.ts:273-277, 757-762).
- Selection highlight: entity classes flip to shared green `0x22dd44`; SubParts/kittens use a
  configurable emissive tint — Settings → "Selection highlight" color+strength per target
  (SettingsButton.tsx:112-126, `$selectionHighlight`, settingsStore.ts:171-196).

### 1.5 Measure — end to end

**Entry: Toolbar → "Measure" popover** (MeasureButton.tsx). Desktop popover (22rem) / phone sheet.
Sections:

1. **Selection bounds** — "Show bounding box" switch, Orientation toggle (World / Oriented OBB),
   "Per-mesh dimensions" switch, "Distance between two meshes" switch. Store:
   `$measurementSettings` persistentJSON `flexo:measure` (measurementStore.ts:69-75).
2. **Tools** — "Add reference line" (adds a 1m X-axis line at origin, opens its editor,
   measurementStore.ts:149-155); "Point-to-point" toggle button (arming `$measureTool='point'`).
3. **Measurements** — `MeasurementList` (MeasurementList.tsx): GridList of placed lines with color
   dot, length, source tag (pt/ref), per-row lock and delete; selecting a row opens the editor.
4. **Reference containers** — Box/Cylinder/Sphere add buttons, `ContainerList`, "Warn check"
   Fast(bbox)/Accurate(vertex) toggle (`$containerSettings`, containerStore.ts:70-72).
5. **Units** — m / cm / mm display select.

**Point-to-point flow** (a proto-mode): `$measureTool='point'` → EditorScene sets crosshair cursor,
suppresses click-selection (EditorScene.ts:478-484); first click raycasts part meshes **snapping to
the nearest face vertex** (nearestFaceVertex, EditorScene.ts:2207-2224), falls back to the Y=0
ground plane in empty space; creates a pending measurement; second click sets endpoint B, activates
the measurement editor, and disarms the tool (EditorScene.ts:2042-2067). >4px pointer movement =
orbit, not a pick. Disarming cancels a half-placed measurement (EditorScene.ts:2095-2100).
**There is no hotkey and no Esc-cancel for measure mode — only re-toggling the button.**

**Rendering** (`MeasurementLayer`, src/three/MeasurementLayer.ts): fat lines (LineSegments2,
screen-space width, depthTest off, renderOrder 999), endpoint spheres, and **HTML labels** via the
viewport's `CSS2DRenderer` overlay (Viewport.ts:93-100, pointer-events:none). Renders: selection
AABB/OBB with 3 edge-dimension labels, per-mesh boxes, closest-distance segment between exactly 2
selected meshes, and every placed line with midpoint length label. Writes `$selectionBounds` for the
React readout.

**Editing**: `MeasurementEditor` (MeasurementEditor.tsx) is a `FloatingEditorPanel` (desktop:
left-pinned vertically-centered card w-60, z-10; phone: sheet above the FAB). A/B endpoint toggle
drives a dedicated `TransformControls` translate gizmo in `MeasurementLayer`
(updateEndpointGizmo, MeasurementLayer.ts:325-385) with axis-lock hiding the non-locked handles.
Numeric endpoint Vec3 fields, length field (re-projects B along the direction/axis), axis lock
Free/X/Y/Z, color+opacity, width slider 1–10px, lock toggle (read-only display), delete.
`MeasurementInfo` (MeasurementInfo.tsx) is the bottom-left floating readout (W/H/D + diagonal, mode
chip).

**Persistence**: placed lines persist **with the project** (projectStore.ts:161, 282); display
settings are a global localStorage pref; tool/active-id/endpoint are ephemeral. Undo: every discrete
mutation pushes undo ('add measurement', 'move endpoint', 'line length', 'line style', …); gizmo
drags push once at drag start.

**Mutual exclusion**: activating a measurement clears mesh selection and active container and vice
versa (EditorScene.ts:487-509) so only one gizmo is alive.

### 1.6 Reference containers (part of the Measure surface)

Box/cylinder/sphere wireframe volumes used as working-area envelopes (e.g. fairing/cargo-bay
limits). Store `containerStore.ts` (persist with project, never exported). `ContainerLayer`
(src/three/ContainerLayer.ts) renders fat-line outlines (configurable segment count) plus
**containment warning** highlights: translucent red regions on faces/side/cap that part meshes
exceed, evaluated bbox-corners or per-vertex (`measure/containment.ts`, warn precision global).
Refresh is driven from `EditorScene.updateSelection` (EditorScene.ts:1608-1614) to catch async mesh
builds. `ContainerEditor` (ContainerEditor.tsx) is the same `FloatingEditorPanel` (w-64): gizmo mode
toggle Move/Rotate/Scale (own `TransformControls` instance; scale snaps back through
`normalizeSize` so cylinders stay circular, spheres uniform), center/size/rotation numeric fields
(rotation stored as quaternion, edited as XYZ Euler degrees), segments, line color/opacity/width,
warn toggle + color + opacity, lock, delete.

### 1.7 Colliders

- **Add**: Toolbar → Add → Collider submenu — "Add at origin" (Box/Sphere/Cylinder/Capsule) or
  "**Fit to selection**" per shape (AddButton.tsx:99-121). Fitting publishes
  `$colliderFitRequest` → `EditorScene.handleColliderFit` (EditorScene.ts:1351-1404): samples world
  geometry of selection (or whole part), optional orient-to-last-selected frame, margin knob, pure
  `ksa/colliderFit.fitCollider`, writes result via editorStore (single undo step).
- **Visuals** (`ColliderObject`): amber fat-line wireframe + 8%-alpha fill (the raycast target).
  Geometry unit-normalised so **group scale == collider size in meters** — the scale gizmo edits
  dimensions natively. Capsule rebuilds geometry when aspect changes. A SubPart-owned collider is
  drawn **once per placement** of its template (KSA has no per-instance collider); clicking a
  specific visual records the instance so the gizmo writes back through that placement's frame
  (EditorScene.ts:186-191, 354-356, 1784-1792).
- **Inspector** (`ColliderHeader`, TransformInspector.tsx:523-619): id, shape select, **owner**
  select (Part (assembly) vs SubPart template — re-homing converts the transform through old/new
  owner frames so the shape doesn't jump), "Fit to selection" refit, dead-data notice for unplaced
  owners, warning when the owner has non-unit scale (KSA ignores placement scale for colliders).
- **Coverage check** (`CoveragePanel`, TransformInspector.tsx:630-678): manual "Check" button →
  `$coverageRequest` → scene samples geometry, scores every collider instance, reports % covered,
  count outside, bloat factor; **uncovered sample points draw as red dots** in the viewport
  (`applyCoverageDots`, EditorScene.ts:1311-1344; non-pickable). "Clear" removes report+dots.
  Precision switch bbox/per-vertex (`$colliderSettings.precision`).
- Colliders participate in layers (visibility/opacity/lock), multi-select bulk transforms (lifted
  to Part space through `colliderWorld` and back), and follow the animation preview pose when
  SubPart-owned (positionColliders, EditorScene.ts:1089-1103) — gizmo locked while a posed frame
  is displayed so a drag can't bake the pose (EditorScene.ts:794-812).
- Settings persisted: `$colliderSettings` localStorage `flexo:colliders` (precision, margin,
  orientToSelection — note margin/orientToSelection currently have **no visible UI**; only
  precision is exposed via CoveragePanel switch. Verify before dropping: margin appears unset-able
  from UI today).

### 1.8 Lights (as editable objects)

- **Add**: Toolbar → Add → Light → Spot/Point (part-level at origin, auto-selected,
  AddButton.tsx:123-142). SubPart-owned lights are authored from the SubPart Data dialog (other
  area). Deleting/moving via normal selection + gizmo + Delete.
- **Visuals** (`LightObject`, src/three/LightObject.ts): color-tinted unlit bulb sphere (tint
  floored so near-black lights stay visible) + Spot aim cone along local +X; per light **instance**
  (one per placement of the owning template). Coverage children (never raycast): hard boundary
  wireframe — Point: 3 great circles; Spot: KSA's own 12-ray debug-draw language with rims placed
  on the **range sphere** (deliberate deviation from KSA's tan-disc, documented at
  LightObject.ts:153-168) — and a 16-shell `InstancedMesh` falloff volume shaded by a GLSL port of
  KSA's exact attenuation (`LightPrePass.comp` math verbatim + display Reinhard,
  LightObject.ts:98-119). Live-preview real light optional per instance.
- **Marker size**: global `$lightSettings.markerSize`; markers rebuilt wholesale on change; coverage
  knobs re-shade live without rebuild (EditorScene.ts:609-620).
- **Inspector** (`LightHeader`, TransformInspector.tsx:727-996): type select (Spot/Point), owner
  select (re-homes with frame conversion), **dual-frame position editing** (owner frame + part
  frame, converted through the *context instance* — the placement whose marker was last clicked,
  `$lightEditContext`, one atom shared with the gizmo so they can never disagree), Spot aim as
  owner-frame Euler AND part-frame unit aim vector (roll-continuity via `lightAimRotation`),
  Range (m), Intensity, color swatch, Spot inner/outer half-angles (deg), **falloff sparkline**
  (`LightFalloffCurve.tsx` — plots KSA illuminance on the same exposure as the 3D shells so panel
  and viewport agree by construction), Ray-tracing (IVA only) switch.
- Multi-instance semantics: highlight + gizmo + part-frame fields all edit through the context
  instance; coverage in 'selected' mode shows only that instance (EditorScene.ts:1544-1555).
- Lights are scale-inert (KSA ignores light scale; scale drags on light/seat-only selections push
  no undo, EditorScene.ts:434-447). Range is world meters regardless of owner scale — light
  markers are never parented under scaled placement groups (LightObject.ts:236-240).

### 1.9 IVA seats & seat view

- **Add**: Toolbar → Add → "IVA Seat" (origin, facing +X — KSA defaults; AddButton.tsx:73).
- **Visuals** (`IvaSeatObject`): sky-blue eye sphere + forward cone (+X) + contrasting pink up
  stick (−Z; the only roll cue) + **CSS2D numeric badge** showing the 1-based cycle order (authored
  data: the game's `C` key cycles seats in document order; badge restamped every reconcile). One
  visual per seat (part-level data). Optional indicative 45° gaze cone (Settings switch;
  deliberately NOT the real 90° hemisphere clamp — documented at IvaSeatObject.ts:145-151).
- **Marker size / gaze cone**: Settings modal → IVA seats (SettingsButton.tsx:84-110);
  `$ivaSeatSettings` (settingsStore.ts:48-55); rebuild-on-change.
- **Inspector** (`IvaSeatHeader`, TransformInspector.tsx:1009-1131): "Seat N of M" + reorder
  up/down (cycle order is exported data), "IVA opens on this seat" chip on index 0, **"Sit in this
  seat"** (enters seat view; allowed on locked layers — camera-only), **"Add kitten at this seat"**
  (drops a kitten aide at the seat with yaw-only orientation, editorStore.ts:1265), exported
  Forward/Up axes readout (derived from the rotation gizmo via `seatAxesFromRotation`), six
  axis-aim presets (+X nose … −Z), **"Aim at selection"** (intent atom → scene computes selection
  centroid → `aimIvaSeat`; keeps current up to avoid camera roll, EditorScene.ts:1416-1448),
  no-`<Internal>`-geometry warning.
- **Seat view (a proto-mode)** — `$seatView` atom (seat **id**, ephemeral, ivaStore.ts:41):
  - Camera snapshots orbit state, `OrbitControls` fully disabled, camera placed at the seat eye
    point at KSA's exact 50° FOV; pointer-drag free-look with the **game's own clamps** ported
    (`ksa/ivaLook.ts` via `clampSeatLook`; direction-is-the-state feedback loop documented at
    ivaStore.ts:44-55 — do NOT refactor to a yaw/pitch accumulator, it provably escapes the
    clamps). Grab/grabbing cursors; drag deltas negated as the game negates them
    (Viewport.ts:319-346).
  - While seated: transform gizmo suppressed, click-selection suppressed, **all seat markers
    hidden** (applyLayerView composes this, EditorScene.ts:946-955).
  - Document changes re-pose/re-clamp the seated camera live; a deleted seat (or project swap)
    exits cleanly (applySeatView, EditorScene.ts:737-755).
  - Chrome: `SeatViewBar` (SeatViewBar.tsx) — bottom-center floating bar (`absolute inset-x-0
    bottom-14 z-30`): prev/next seat (wraps, follows selection), "Seat N / M", info tooltip about
    honest limits (flexo draws every SubPart, interior or not), Exit button with `Esc` kbd chip.
  - Hotkey: **Escape** exits (registry.ts:202-216 — gated on the atom, never preventDefault so it
    can't shadow dialog dismissal).
  - Alternate entry: Assets list seat row (AssetsList.tsx:705) also enters seat view.
- Seats are scale-pinned (KSA has no seat size; marker size is a view setting).

### 1.10 Kittens (editor-only scale/ergonomics aides)

- **Add**: Toolbar → Add → Kitten → Hunter/Polaris/Banjo (AddButton.tsx:143-152); also "Add kitten
  at this seat" from the seat inspector. Data: `KittenInstance` (ksa/types.ts:276-283) — transform
  + kind + fixed kitten layer id. **Never exported** to KSA XML.
- **Visuals** (`KittenObject`, src/three/KittenObject.ts): loads the game's character GLTFs, bakes
  bind-pose skinned meshes into static meshes with per-instance KSA materials; helmet/visor/MMU
  attachments baked at socket-bone transforms; per-kind head/eye materials. Async build with the
  same guarded reconcile as SubParts (EditorScene.ts:866-904).
- Selectable, transformable (gizmo + bulk), layered, highlight color/strength configurable
  (Settings → Selection highlight → Kittens).
- Related but separate: Add → "Make Kitten Mesh" converts kittens into exportable SubParts
  (custom-assets area).

### 1.11 Connector display

- `ConnectorObject` (src/three/ConnectorObject.ts): offwhite cube + facing cone (+X); global cube
  size in Settings → Connectors → "Connector size" (`$connectorSettings.size`, default 0.125 m);
  rebuild-on-change (EditorScene.ts:593-596). Selected = green. Participates in selection, layers,
  bulk transforms. **There is no per-connector show/hide toggle in the View menu — visibility is
  via the Layers system (connectors live on layers).** Connector authoring/semantics belong to
  another area; the display + size setting belong here.
- KSA constraint (verified in decomp): connectors cannot animate with joints — deployed-pose
  authoring is the only workaround.

### 1.12 Layer view composition (dependency, owned by layers area but enforced here)

`applyLayerView` (EditorScene.ts:912-977) applies visibility + opacity fade per entity from
`$layerView`, composed with `$hideInterior` and seat-view marker hiding. Light coverage/preview
children have their own composed visibility gates so `group.visible` keeps a single writer.

### 1.13 Misc viewport HUD surfaces in this area

- `TransformHud` (TransformHud.tsx): bottom-center pill showing rotate-pair axes + step and nudge
  axis + step; clickable to cycle. Hidden on phones.
- `WorkspaceLoadProgress` (LoadProgress.tsx): bottom-center HDR/asset download progress panel.
- Coverage red dots (scene object, not DOM).
- `debugCalibration`: `?debug=dockingport` URL param loads a calibration model
  (ViewportCanvas.tsx:18-22).

---

## 2. UI surface map

All surfaces are absolutely-positioned overlays inside the `fixed inset-0` app root; none
participate in layout. Canvas fills the window underneath everything.

| Surface | Kind | Mount / position | Notes |
|---|---|---|---|
| Editor toolbar | floating bar | `absolute left-3 top-3 right-[19rem] lg:left-1/2 lg:-translate-x-1/2` (app.tsx:78) | Centered on desktop; below `lg` it left-aligns and reserves right space for the inspector; flex-wraps to two rows on tablets. |
| View popover | toolbar popover | react-aria Popover under the View button; portal; `max-h-[80vh]` scroll | One long scrolling column mixing camera, grids, visibility, light-viz, and lighting — dense. Phone: bottom sheet. |
| Measure popover | toolbar popover | same pattern, 22rem | Mixes settings, tools, list, containers, units. Phone: bottom sheet. |
| Settings modal | dialog | react-aria Modal `variant="center"` | Viewport/connector/seat/highlight/kitten-texture settings. |
| RightPanel (inspector) | sidebar (floating overlay) | `absolute right-3 top-3 bottom-3`, width 240–640px persisted; collapsible | Floats OVER the canvas; container is pointer-events-none with children opting back in (RightPanel.tsx:72-90). Cause of the off-center orbit complaint. |
| MeasurementEditor / ContainerEditor | floating card | `FloatingEditorPanel`: desktop `absolute left-3 top-1/2 -translate-y-1/2 z-10`; phone `inset-x-2 bottom-20` | Both share left-center anchor; mutually exclusive by state so never simultaneous. Not draggable. |
| MeasurementInfo | HUD | `absolute bottom-3 left-3`, pointer-events-none | **Overlaps the FloatingInspector's default bottom-left anchor** (uiStore.ts:49-52). |
| SeatViewBar | floating bar | `absolute inset-x-0 bottom-14 z-30 flex justify-center` | Only chrome in seat view. Sits above TransformHud (bottom-2) and WorkspaceLoadProgress. |
| TransformHud | HUD | `absolute inset-x-0 bottom-2` centered pill | Keyboard-tool status; desktop only. |
| WorkspaceLoadProgress | HUD | bottom-center ~1rem up | HDR download bars; can stack visually near TransformHud/SeatViewBar. |
| FPS overlay | HUD | stats.js DOM node absolute top-left of viewport host, z-10 (Viewport.ts:162-168) | Under the toolbar visually; imperative DOM, not React. |
| CSS2D label overlay | HUD layer | absolute full-size div over canvas, pointer-events:none (Viewport.ts:93-100) | Hosts measurement labels + seat badges; one per viewport. |
| Coverage dots | in-scene | three.js Points | Cleared via inspector "Clear". |
| Seat gaze cones, light volumes, grids, axes | in-scene | three.js | Toggled via Settings / View. |
| FloatingInspector, SelectionToolbar, MultiSelectToolbar, ChainPalette, ImportReportCard | adjacent areas | (documented by their owners) | Compete for the same overlay space; listed for stacking context. |

Stacking is mostly source-order + ad-hoc z-10/z-30; react-aria popovers/modals portal above
everything. Known collisions: MeasurementInfo vs FloatingInspector default anchor (both
bottom-left); toolbar popovers can cover the top of the RightPanel below `lg`; SeatViewBar
hardcodes `bottom-14` to clear the TransformHud.

---

## 3. State & data flow

### Stores and persistence

| Store | Key | Persistence | Contents |
|---|---|---|---|
| `$grids` | `flexo:grids` | localStorage | per-axis enabled + spacing |
| `$hideInterior` | `flexo:hideInterior` | localStorage | bool |
| `$cameraSnap` / `$cameraRestore` | — | ephemeral one-shot (nonce) | commands |
| `$cameraState` | — | ephemeral atom, but snapshotted into **project autosave** | position/target/up |
| `$lighting` | `flexo:lighting` | localStorage | env preset, intensity, sky, blur, exposure, tonemap |
| `$measurementSettings` | `flexo:measure` | localStorage | unit, bounds mode, 3 switches |
| `$measurements` | — | **project snapshot** (projectStore.ts:161) | placed lines |
| `$measureTool` / `$activeMeasurementId` / `$activeEndpoint` / `$selectionBounds` | — | ephemeral | interaction state |
| `$containers` | — | **project snapshot** | placed containers |
| `$containerSettings` | `flexo:containers` | localStorage | warn precision |
| `$activeContainerId` / `$containerGizmoMode` | — | ephemeral | |
| `$colliderSettings` | `flexo:colliders` | localStorage | precision, margin, orientToSelection |
| `$colliderFitRequest` / `$coverageRequest` / `$coverageReport` | — | ephemeral intents/report | |
| `$ivaSeatAimRequest` | — | ephemeral intent | |
| `$seatView` / `$seatLook` | — | ephemeral | seat id / clamped look dir |
| `$connectorSettings` | `flexo:connectorSettings` | localStorage | cube size |
| `$ivaSeatSettings` | `flexo:ivaSeatSettings` | localStorage | marker size, gaze cone |
| `$lightSettings` | `flexo:lightSettings` | localStorage | marker size, showVolumes, exposure mode/value, livePreview — read through `lightSettings()` resolver for field defaulting (settingsStore.ts:125-127; NOT migration) |
| `$lightPreviewCount` | — | ephemeral (deliberately) | scene→UI cap report |
| `$selectionHighlight` | `flexo:selectionHighlight` | localStorage | mesh/kitten tint |
| `$showFpsCounter` | `flexo:showFpsCounter` | localStorage | bool |
| `$inspectorVisible` / `$inspectorWidth` | `flexo:inspector*` | localStorage | right panel |
| Document entities (colliders, seats, lights, kittens, connectors, placements) | — | `$part` → project snapshot → KSA XML export (except kittens/measurements/containers, editor-only) | |

Camera, measurements, containers autosave with the project (projectStore.ts:469-471 subscriptions);
selection/tool/snap deliberately don't.

### Undo/redo

- Document mutations (colliders/seats/lights/kittens/placements) all `pushUndo` in editorStore.
- Measurements and containers ARE in undo (their stores call `pushUndo`) even though they're
  editor-only data — verified measurementStore.ts:98,122,128 / containerStore.ts:103,131,137.
- Gizmo drags: one undo push at drag start, streaming updates after
  (EditorScene onDragStart, EditorScene.ts:417-448; MeasurementLayer.ts:357-360).
- View state (grids/lighting/settings/camera/seat view/measure tool) is **not** undoable.

### Cross-store / scene wiring patterns (must survive conceptually)

- **Intent atoms** for scene-dependent ops (fit, coverage, seat aim) — state/UI stay three-free.
- **One-shot nonce atoms** for camera commands.
- **Scene→UI reports**: `$lightPreviewCount`, `$selectionBounds`, `$coverageReport`.
- **Single writer of `group.visible`** (`applyLayerView`); coverage/preview compose on children.
- `EditorScene.sub()` centralizes invalidation for the on-demand loop.

---

## 4. Pain points (with evidence)

1. **Window-filling canvas + overlay sidebar = off-center orbit.** ViewportCanvas.tsx:31-38
   (`absolute inset-0`) vs RightPanel.tsx:77-81 (450px floating overlay). The orbit target projects
   to the window center, not the visible center. Also wastes the strip under the panel for picking
   (clicks there hit the panel). v2's docked sidebars should make the canvas host the remaining
   cell; `Viewport`'s ResizeObserver already copes.
2. **View popover is a grab-bag.** ViewButton.tsx mixes camera snaps, grids, an IVA-related
   visibility toggle, light-viz controls (which conceptually belong with lights), and global
   scene lighting in one 80vh scrolling popover. Light coverage/exposure/preview controls are far
   from the light inspector that they modulate.
3. **Settings split across two homes.** Marker sizes (connector/seat/light…) — except light marker
   size, which is *not* in the Settings modal at all (only `$lightSettings.markerSize` default;
   grep shows no UI writes to markerSize — check: SettingsButton has connector+seat sizes only).
   Meanwhile light-viz settings live in the View popover. Users must learn which knob lives where.
4. **Collider fit knobs partially unexposed.** `$colliderSettings.margin` and `orientToSelection`
   exist and affect fits (EditorScene.ts:1374-1379) but no UI writes them (grep: only precision has
   a switch, TransformInspector.tsx:670-675). Dead-but-live preference.
5. **No user-facing camera reset.** `resetCamera` only fires on project switch
   (projectStore.ts:376,402). A skewed `up` after top/bottom snaps can only be fixed by snapping
   again.
6. **Measure tool has no Esc/cancel or hotkey; no visible mode indicator** beyond the crosshair
   cursor and the button label inside a closed popover (EditorScene.ts:478-484). Half-placed
   point-to-point state is invisible until the second click.
7. **Floating-surface collisions.** MeasurementInfo (bottom-3 left-3) vs FloatingInspector default
   anchor (bottom-left, uiStore.ts:49-52); SeatViewBar hardcoded `bottom-14` to clear TransformHud;
   WorkspaceLoadProgress also bottom-center. No shared docking/stacking system.
8. **EditorScene is a 2225-line god-object**: reconciliation for 6 entity kinds, selection policy,
   gizmo attach policy for 4 proxy targets (selection pivot, pose proxy, engine proxy, per-instance
   frames), animation preview, seat view, coverage, fit, aim, measure picking. The per-entity
   reconcile/rebuild patterns (connector/seat/light rebuild trios, EditorScene.ts:1477-1513) are
   copy-paste variants. v2 should keep the semantics but this file is the refactor hot spot.
9. **Rebuild-on-setting-change** (connectors/seats/lights markers dispose+recreate on size change)
   is fine at current scale but is O(entities) per keystroke of a size field.
10. **Proto-modes are implicit.** Seat view, measure picking, engine exhaust placement, pose editing
    each suppress selection/gizmo through ad-hoc flags (EditorScene.ts:273-277). A real mode system
    in v2 could make these first-class (with mode chrome, Esc semantics, and mutual exclusion) —
    but must preserve the exact suppression semantics.
11. **Popover-closes-to-act friction**: "Add reference line", container adds, point-to-point all
    close the Measure popover to use the viewport, forcing reopen for the next tool
    (MeasureButton.tsx close() calls).
12. **`$hideInterior` discoverability**: an IVA-critical toggle lives mid-View-popover; the seat
    inspector warns about missing interior geometry but doesn't link the toggle.
13. **Snap camera targets origin, not selection** (Viewport.ts:186-188) — with off-origin work the
    snap yanks the view away from the working area. Possibly intentional; still a UX gap (no
    "frame selection" command exists at all).

---

## 5. Invariants & constraints (MUST survive)

**Rendering / three-layer**
- On-demand render loop and the "everything that changes a pixel invalidates" contract
  (RenderLoop.ts; EditorScene.sub). FPS counter = the only continuous mode.
- Single writer of `group.visible` = `applyLayerView`; all other visibility composes on children.
- three.js raycasts invisible objects — every selection path must keep the explicit
  layer-visible/locked guards (EditorScene.ts:323 et al).
- CSS2D label lifecycle: labels must be unparented on dispose or they leak into the overlay
  forever (IvaSeatObject.ts:227-247).
- Dispose discipline: every entity class owns its GPU resources; `UNIT_SPHERE` shell geometry is a
  module singleton and must never be disposed per-object (LightObject.ts:68-73).
- StrictMode-safe mount/dispose of EditorScene (ViewportCanvas.tsx).

**KSA game-contract semantics**
- Coordinates: Y-up meters; "facing = local +X" convention for connectors, seat forward, light aim,
  exhaust. Seat up = local −Z. Euler/quaternion conversions only through `three/coords.ts`.
- Colliders: KSA composes only position+rotation of the owner — placement scale is ignored (warn,
  don't compensate, TransformInspector.tsx:537-556). No per-instance colliders; one document
  entity drawn per placement; unplaced-owner = dead data rendered once in Part frame.
- Lights: owner scale DOES apply to a light's position offset (lightWorld ≠ colliderWorld —
  coords.ts documents the contrast, EditorScene.ts:1176-1183); Range is world meters; scale
  pinned; Spot aims along +X; coverage math is `LightPrePass.comp` verbatim (lightFalloff.ts +
  GLSL mirror) — panel sparkline and 3D shells must keep using the same exposure so they agree by
  construction. `<Emissive>` is white-only; color comes from `<Light Color>` (memory:
  analysis/KSA_EMISSIVE_AND_LUT.md).
- IVA: seat look clamps are the game's own (`ivaLook.ts` port); the **direction-is-the-state**
  clamp feedback loop (ivaStore.ts:44-55, Viewport.ts:289-317) must not be replaced by a yaw/pitch
  accumulator — measured divergence documented. 50° FOV = KSA `GameSettings.FieldOfView`. Seat
  cycle order is exported data (document order); seat has no size (scale pinned to 1). Gaze cone
  is deliberately 45° indicative, NOT the real 90° hemisphere — do not "fix" it.
- Hide interior mirrors `PartModel.cs`'s `!Template.Internal` gate.
- Kittens/measurements/containers are editor-only and never exported.
- Connectors cannot animate with joints (decomp-verified); no UI should suggest otherwise.

**Editor semantics**
- Instance-context editing for SubPart-owned colliders/lights (last-clicked visual = the frame the
  gizmo and inspector write through; `$lightEditContext` shared atom).
- Gizmo locks: locked layers; posed animation preview (never bake a preview pose into the
  document); seat view.
- Selection-suppression OR-composition across modes.
- Mutual exclusion of measurement edit / container edit / mesh selection.
- Undo push-once-at-drag-start + streaming updates pattern for all gizmos.
- Point-to-point vertex snapping and ground-plane fallback.
- Measurements/containers persist per project; view prefs per browser; `lightSettings()`-style
  field defaulting for persisted objects (this is field defaulting, NOT data migration — the
  project constitution forbids migration code).

**Project conventions**
- ALL numeric fields use `useNumberDraft`-based inputs (`PreciseNumberInput` / `NumberField`) with
  `inputMode="url"` — never ad-hoc `Number(v)` TextFields.
- No manual memoization (React Compiler); react-aria kit components; nanostores.
- Viewport must own focus on pointerdown so global hotkeys work (ViewportCanvas.tsx:29-37).

---

## 6. Hotkeys registered in/affecting this area

From `src/ui/hotkeys/registry.ts` (single source for bindings AND the help overlay — keep that
property):

- **Escape** — leave IVA seat view (gated on `$seatView`; `preventDefault: false` so it never
  shadows dialog dismissal) — registry.ts:202-216.
- **W/S, A/D, Q/E** — rotate selection about the mapped axes; **R** cycles the axis mapping;
  **F / ⇧F** rotation step (selection-transform area, but they act in the viewport and show in
  TransformHud).
- **↑/↓ (+Shift ×10)** — nudge selection along active axis; **←/→** change axis; **⇧←/⇧→** step.
- **Delete/Backspace** — delete selection (includes colliders/seats/lights/kittens/measurement? —
  no: measurements delete via their own editor/list buttons only).
- **⌘C/⌘V/⌘Z/⌘Y/⌘⇧Z/⌘K**, **?** help — global.
- Modifier semantics: **Ctrl/Cmd/Shift-click = additive select** (SelectionManager.ts:73);
  >4px drag = orbit not click; measure pick uses the same 4px rule.
- Escape during a gizmo drag cancels it (TransformControls built-in; referenced registry.ts:211).
- Notably ABSENT: camera-snap hotkeys, measure-tool hotkeys, hide-interior toggle, grid toggle.

---

## 7. Cross-area dependencies

**Others → this area**
- Layers: `$layerView`, `isLayerVisible/Locked` gate all selection + visibility here.
- Animation editor: `$inspectorMode==='anim'`, preview atoms drive `applyAnimationPreview`;
  SubPart-owned colliders/lights follow the pose; pose proxy + pivot helper live in EditorScene.
- Engine designer: nozzle handles/proxy + `$effectiveToolMode` (clamps Scale away) live in
  EditorScene; nozzle picks bypass depth order (SelectionManager.ts:78-84).
- Action chains: `ChainPreviewLayer` ghosts clone built SubPartObjects (`$chainEval`).
- Assets list: `revealEntity` scroll-sync on viewport clicks; seat rows can enter seat view;
  "Interior (IVA only)" flag feeds `$hideInterior` resolution (`resolveInternal`).
- Project store: writes `$cameraRestore`, `$measurements`, `$containers` on load; calls
  `resetCamera`.
- Custom assets: `$customCatalog` changes force targeted SubPartObject rebuilds
  (EditorScene.ts:520-533); `initTextureSupport` before any builds (EditorScene.ts:283).
- Import: `ViewportDropZone` wraps the canvas for .glb drop.

**This area → others**
- `$lighting` is global — the Add-Part/SubPart preview viewports and wiki `PartPreviewViewport`
  all apply the same `SceneEnvironment`, so a part looks the same everywhere.
- Toasts (`ui/kit` toast) are the scene's only user-notification channel (EditorScene.ts:148-149,
  1427-1432).
- `TransformGizmo` / snap (`$snap`) shared with the selection-tools area.
- `$selectionBounds` consumed by MeasurementInfo; `$coverageReport` by the collider inspector;
  `$lightPreviewCount` by ViewButton.

---

## 8. Open questions for v2

1. **Where do View-popover contents land in a menubar world?** Camera snaps → View menu; grids →
   View menu or a status-bar quick toggle; but scene lighting (env/tonemap/exposure) could be a
   View menu, a right-sidebar "Scene" tab, or a persistent quick-access strip. Light-viz controls
   (coverage/exposure/preview) could move next to the light inspector instead.
2. **Should the canvas be inset by docked sidebars (true layout) or keep full-bleed with a camera
   `setViewOffset` compensation?** Inset is simpler and fixes picking under panels; full-bleed
   keeps the 3D visible behind translucent panels (current aesthetic).
3. **Which proto-modes become real modes?** Seat view and measure picking are the strongest
   candidates (own chrome, Esc semantics, suppression). Is seat view a "mode" in the v2 mode bar
   or a transient preview inside whatever mode is active? (It's camera-only and allowed on locked
   layers — arguably orthogonal to edit modes.)
4. **Measurements/containers: sidebar tab vs floating cards?** The floating editors are small and
   viewport-adjacent; a right-sidebar tab would collide with the inspector-shows-selection model
   since measurements are not `$part` entities.
5. **Camera-snap target**: keep origin-centered snaps, or snap around the current target /
   selection? Add "frame selection" and "reset camera" commands?
6. **Expose or drop `$colliderSettings.margin` / `orientToSelection`** (currently persisted but
   UI-less)? Same question for a light `markerSize` UI (persisted, no visible control found).
7. **Per-entity-kind visibility toggles** (connectors/seats/lights/colliders as global show/hide,
   like most DCCs) vs the current layers-only model? Users coming from other editors expect a
   "display filters" cluster; flexo currently routes everything through layers.
8. **Status bar** (v2 has one): natural home for TransformHud content, measure-tool state, light
   preview cap warnings, FPS, load progress — which of these move there vs stay as HUD?
9. **One gizmo or three?** Selection gizmo (TransformGizmo), measurement endpoint gizmo, container
   gizmo are three separate TransformControls instances with duplicated orbit-disable/undo wiring.
   Consolidation is tempting but the mutual-exclusion state machine is what actually matters.
10. **Marker sizes as world-meters vs screen-space**: all markers (connector cube, seat, light
    bulb) are fixed world sizes; tiny parts drown in markers, huge parts lose them. Screen-space
    constant sizing is a defensible alternative but changes the "flush cone against cube" look and
    the raycast targets.
