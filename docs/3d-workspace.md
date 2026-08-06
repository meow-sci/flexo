# 3D Workspace

The full-screen three.js viewport where SubParts are placed and manipulated.
All code is under `src/three/`.

## Components

| File | Responsibility |
|---|---|
| `Viewport.ts` | Renderer, scene, perspective camera, lights, reference grid, `OrbitControls`, render loop, resize. Also sets ACES tonemapping + sRGB output + `RoomEnvironment` IBL (see [texturing.md](./texturing.md)). |
| `RenderLoop.ts` | The on-demand frame driver shared by the editor viewport and all three preview viewports — see [Rendering is on-demand](#rendering-is-on-demand). |
| `EditorScene.ts` | Owns the `Viewport`; subscribes to the store and reconciles `SubPartObject`s; wires selection + gizmo. The bridge between state and scene. |
| `SubPartObject.ts` | One placed SubPart: a `THREE.Group` (carrying `userData.instanceId`) holding the atlas mesh + its material. |
| `MeshAtlasCache.ts` | Loads GLB atlases (`GLTFLoader`), extracts geometry by node name, bakes the node's local transform, caches per `atlasUrl#node`. |
| `ColliderObject.ts` | One collision primitive: a fat-line wireframe + a low-alpha fill (the raycast target). Geometry is **unit-normalised**, so the group's `scale` IS the collider's size in meters and the scale gizmo edits dimensions directly. See [colliders.md](./colliders.md). |
| `wireShapes.ts` | Shared unit-box wireframe builders (box / cylinder / sphere / capsule outlines) used by `ColliderObject` AND `ContainerLayer`. |
| `IvaSeatObject.ts` | One IVA camera vantage point: an eye sphere + a **+X** forward cone + a **−Z** up stick + a CSS2D index badge (and an optional indicative gaze cone). Sized off `$ivaSeatSettings`, never off the document. See [iva-seats.md](./iva-seats.md). |
| `LightObject.ts` | One cast-light marker: a color-tinted bulb sphere + a **+X** aim cone (Spot only), plus the optional **coverage** children — a boundary wireframe on the range sphere and a 16-shell `InstancedMesh` shaded with KSA's exact falloff (`lightVolume.ts` + a GLSL mirror of `lightFalloff.ts`). A SubPart-owned light is drawn once **per placement** of its owning template, positioned via `coords.lightWorld` (owner scale applies to the offset — deliberately unlike colliders). Sized off `$lightSettings`, never off the document. See [lights.md](./lights.md). |
| `lightVolume.ts` | The pure (three-free) half of the coverage viz: shell radii and the auto/absolute display exposure. |
| `samplePoints.ts` | Shared world-space geometry sampler (bbox corners or every vertex) for collider fitting and container containment warnings. |
| `Grid.ts` | Origin grid (XZ plane) + colored axes (1 cell = 1 m). |
| `AxisGizmo.ts` | Corner **X/Y/Z** orientation triad, drawn in a second scissored pass over a finished frame (private scene + ortho camera, so it never affects framing/bounds). Not used by the editor viewport — it is opt-in via `PartPreviewViewport`'s `axisGizmo` option, which only the `partpreview` mini app sets. Colors come from `axisColors.ts`, shared with that app's HTML dimension readout. See [wiki-part-preview.md](./wiki-part-preview.md). |
| `SelectionManager.ts` | Raycast click-to-select (fires on pointerup only when the pointer barely moved, so orbit/gizmo drags aren't clicks). |
| `TransformGizmo.ts` | Wraps `TransformControls` (translate/rotate/scale); disables orbit while dragging; emits transform changes. **Build and Engine only** — posing uses `PoseGizmo`. |
| `PoseGizmo.ts` | The animation-specific pose gizmo: rings sized to the joint, a screen-space free-drag disc, axis stems/handles, per-gesture `X`/`Y`/`Z` axis locks and working-pivot rotation. Drives the same `pose-proxy` object `TransformGizmo` used to. See [Animation viewport layers](#animation-viewport-layers). |
| `JointMarkerLayer.ts` | A pickable marker per joint of the open clip, drawn at the joint's rest frame at `restAnchorTime`, plus the `◇` working-pivot glyph. |
| `TrajectoryLayer.ts` | Read-only motion trails: the member-set centroid path per animated joint, keyframe ticks, the anchor ring and a playhead bead. |
| `ViewportCanvas.tsx` | React glue: mounts `EditorScene` into a div in a `useEffect`, disposes on unmount (StrictMode-safe). |

## Rendering is on-demand

Nothing is drawn until someone asks for it. `RenderLoop` schedules a single
`requestAnimationFrame` per `invalidate()` call (coalescing repeats), draws once,
and then goes completely quiet. There is no free-running loop.

This is not a micro-optimisation. A free-running `setAnimationLoop` costs a full
render + MSAA resolve + tab composite **every vsync**, whether or not anything
moved. Measured on a 120 Hz display with an EMPTY workspace, that was ~39% CPU
across the browser's renderer and GPU processes — and essentially none of it in
app JS, which is why it never showed up in a JS profile. On demand, the same
idle state costs ~1%.

**The rule: anything that can change a pixel must invalidate.** The wiring is
kept next to the mutation, not sprinkled at call sites:

| Source of change | How it invalidates |
|---|---|
| Any editor store (`$part`, selection, layers, settings, the animation playhead `$playheadSec` + its park/pin flags, …) | `EditorScene.sub()` — the ONLY way this class subscribes; it invalidates after each callback. **Never call `store.subscribe` directly here.** |
| Async SubPart / kitten builds | explicit `viewport.invalidate()` in the `.then` — geometry lands long after the store change that asked for it |
| Camera (orbit, pan, zoom, damping, snap, restore) | `OrbitControls`' `change` event. Damping keeps re-firing until it settles, so inertia still animates and then stops |
| Any of the three `TransformControls` (selection gizmo, measurement endpoint, container) | their `change` event — covers hover-axis highlight, attach/detach and drag steps |
| `MeasurementLayer` / `ContainerLayer` / `ChainPreviewLayer` | every mutation funnels through `refresh()`, which invalidates at the end |
| Environment / tonemapping / exposure | `$lighting` subscription invalidates twice: once for the synchronous half, once when the async HDR + PMREM lands |
| Resize | `handleResize()` |
| WebGL context restored | `webglcontextrestored` listener — an on-demand loop has no "next frame" to repair a blank canvas |

`RenderLoop.setContinuous(true)` is the escape hatch for the rare case that needs
a frame per vsync. Only the stats.js FPS overlay uses it: the counter exists to
measure how fast the scene *can* draw, and would otherwise read ~0 fps whenever
the user stopped moving. Turning the overlay on is therefore also opting into the
idle cost it reports.

While the overlay is up, `Viewport` also publishes the frame rate to
`statusStore.$fpsReport` (rounded, at most every 500 ms) so the status bar can show the
number next to the bell; the graph panel itself stays in the viewport. Switching the
counter off clears the atom and returns the loop to on-demand — the reporting adds no
frames of its own.

A missed invalidate does not crash — it shows as a viewport that is silently one
edit out of date. When adding a new scene mutation, ask what wakes the frame.

## Reconciliation (store → scene)

`EditorScene` holds `Map<instanceId, SubPartObject>` and a `building: Set`. On every
`$part` change (and when the catalog index loads) it:
1. Removes objects whose `instanceId` is no longer in `$part.placements` (dispose).
2. For each placement: if an object exists, `setPlacement` (update transform); else
   if not already building and the catalog has the template, async-build it. After
   the async build it re-checks the placement still exists (else disposes), adds to
   the scene, and re-runs selection sync.

Async builds (`SubPartObject.create`) load geometry + material in parallel.

## Selection & gizmo (both via the store)

- Clicking a mesh → `SelectionManager` resolves `{kind, id}` from `userData` →
  `select([{kind, id}])`, or `toggleRef({kind, id})` when a ⇧/⌘/⌃ modifier makes the click
  additive. Clicking empty space clears — but only when the click is NOT additive.
  Selection is by stable **id**, never by index ([editor-state.md](./editor-state.md)).
- `EditorScene.updateSelection()` (subscribed to `$selection`) toggles the
  highlight (per-instance emissive, saved/restored) and attaches the gizmo to the
  selected object's group. It **never re-attaches mid-drag** (would reset the drag).
- **Marquee box select**: the `B` tool (Select ▸ Box Select) arms a one-shot **replace**
  marquee for the next drag; `⇧`-drag starting on empty canvas **adds**, `⌥⇧`-drag
  **subtracts**. A plain drag is still orbit. The hit rule is the pure
  `src/three/marqueeSelect.ts` (screen-space AABB intersection, inclusive edges, one hit per
  entity however many instances it draws), fed by boxes `EditorScene` projects once at
  pointerdown — orbit is disabled for the gesture, so the projection cannot go stale.
  Entities on hidden or locked layers are never included, exactly as for a click. The
  rectangle itself is a **DOM** overlay (`src/ui/MarqueeOverlay.tsx`, `z.canvasOverlay`), so
  dragging it never wakes the on-demand render loop. Esc cancels mid-drag (Escape-ladder
  rung 5, via the `$activeTool` slot's `onCancel`). No marquee ever creates an undo step.
- Gizmo: mode follows `$toolMode`; the handle axes follow `$gizmoSpace` (**W** = world,
  **L** = the entity's own axes); snap follows `$snap`
  (`setTranslationSnap`/`setRotationSnap`). On drag start it pushes one undo
  snapshot; on `objectChange` it reads the transform via
  `coords.readPlacementTransform` and calls `updatePlacementTransform`.
- **⌥-drag duplicate**: holding ⌥ when a gizmo drag STARTS duplicates the selection in place
  and drags the copies. The duplicate and the movement land in ONE undo step, so a single ⌘Z
  removes the copies rather than leaving them stacked on the originals.
- **Snap and the ⌃ invert**: snap is on/off + a translate step (m) and a rotate step (°),
  persisted in `snapStore` (`flexo:snapEnabled` / `flexo:snapTranslateStep` /
  `flexo:snapRotateStep`) and applied to the gizmo through the existing `$snap` atom. Holding
  **⌃ during a drag** gives the temporary OPPOSITE of the toggle — snap-off users get one
  snapped drag, snap-on users get one free one. Scale never snaps.

Because the gizmo writes through the store and the scene reconciles from the store,
the transform [inspector](./editor-state.md) and the gizmo are two-way synced.

### The Tool bar window

Gizmo *parameters* live in a floating **Tool bar** (`src/ui/build/ToolBarWindow.tsx`), one of
the two windows v2 ships: Move / Rotate / Scale, the **W/L** space toggle, and the snap magnet
with a ▾ popover carrying the two step sizes. It appears whenever a gizmo target exists (a
selection, a posed joint, or an exhaust being placed), drags by its strip, remembers its
position in `flexo:layout` → `float.toolbar`, and hides from **Window ▸ Tool Bar**. Selection
ACTIONS (duplicate / chain / delete) are deliberately NOT here — they are left-sidebar and Edit
menu material. On phone it is a pinned strip above the condensed status bar (`ToolBarStrip`).

The tool switcher reads `$effectiveToolMode`, not `$toolMode`, so exhaust placement's
Scale→Move clamp is displayed truthfully instead of showing dead handles.

### The scale gizmo as a dimension editor

A `ColliderObject`'s wire/fill geometry is normalised into `[-0.5, 0.5]³`, so its group
`scale` is literally the shape's size in meters. That makes scale-mode gizmo drags edit
KSA dimensions with no special-casing — the write-back just runs the result through
`normalizeColliderSize` so a non-uniform drag on a cylinder or sphere snaps back to a
shape KSA can represent. It is the same trick `ContainerLayer` uses for reference
containers.

A **SubPart-owned** collider is drawn once per placement of its template (KSA has no
per-instance collider), positioned via `coords.colliderWorld`. Since no single object
could unambiguously receive a drag, the gizmo is suppressed for those until Phase 3.

### The IVA seat marker

An `IvaSeatObject` is a `THREE.Group` whose id rides `userData.selectable` on the group **and
on every child mesh** (the raycast hits a mesh, never the group). Its anatomy is deliberate:

- an **eye sphere** at the local origin — the vantage point, and the click target;
- a **forward cone along local +X**, built exactly like `ConnectorObject`'s facing arrow so
  the two markers read consistently — this is `<ForwardAxis>`;
- a short **up stick along local −Z** in a contrasting colour — this is `<UpAxis>`, and it is
  not decoration: without it a seat rolled 90° looks identical to an unrolled one;
- a **CSS2D index badge** showing the 1-based cycle order (the seat IVA opens on is `1`),
  hosted by the same `labelRenderer` `MeasurementLayer` drives;
- an optional translucent **gaze cone** (`$ivaSeatSettings.showGazeCone`, default off), a
  45° half-angle cone that is *indicative only* — the game's real limit is a 90° hemisphere,
  which is a half-space with no readable shape.

The marker never scales with the document (a seat's `scale` is unused); its size is the global
`$ivaSeatSettings.markerSize`, and `EditorScene` **rebuilds** every marker when that setting
changes, exactly as it does for connectors. `reconcileIvaSeats` re-applies the document index
on every pass, which is what renumbers the badges after a reorder.

### Light markers

A `LightObject` is the same idea for a Part's cast lights (see [lights.md](./lights.md)): a
bulb sphere tinted with the light's own color (floored toward mid-gray when near black so it
stays visible) plus, for a `Spot`, an aim cone along local **+X** — the direction KSA casts
the beam. Its id + `instanceIndex` ride `userData.selectable` on the group and every child
mesh, because a **SubPart-owned light is drawn once per placement of its owning template**
(the collider multi-instance pattern): all markers are views of ONE document light, they
follow their placements — including the joint-animation preview pose — and a click records
which instance was hit so the highlight (and, in a later phase, the gizmo) works through that
placement's frame — the gizmo attaches to that instance and writes back through it.
Positioning goes through `coords.lightWorld`, never `colliderWorld` — the owner's scale applies
to a light's position offset, unlike a collider's — and the objects are top-level scene
children (never parented under scaled placement groups) because KSA's light `Range` is world
meters regardless of owner scale, so a scaled parent would distort the coverage volume.

Each marker also carries two **coverage** children (see [lights.md](./lights.md)): a
`LineSegments` boundary wireframe — three great circles for a Point, KSA's 12-ray + rim-circle
language for a Spot, but with the rims placed on the **range sphere** instead of the game debug
draw's `Range · tan(angle)` disc, which explodes to kilometres for Core's 1.57 rad floodlight —
and an `InstancedMesh` of 16 concentric spheres whose fragment shader evaluates KSA's exact
attenuation, then a display-only Reinhard curve. The volume is additive, `depthWrite: false`,
`BackSide` (exactly one face per shell whether the camera is outside or inside), and
`frustumCulled = false` (instance scaling invalidates the unit sphere's bounds). **Neither child
is ever a raycast target** (`raycast = () => {}`) — only the bulb and the aim cone are
clickable. Their visibility is `$lightSettings.showVolumes` composed with the layer's, applied
to the CHILDREN's `.visible` flags by `EditorScene.applyLightCoverage`, because `applyLayerView`
is the single writer of `group.visible`.

Marker size is the global `$lightSettings.markerSize`; changing it rebuilds every marker
(there is no in-place resize). The coverage settings do **not** rebuild — the exposure is
pushed into the existing shell materials as a uniform, which is what makes dragging the
Intensity field re-shade live. The unit sphere the shells instance is one module-level
geometry shared by every light and is never disposed per object.

### Nozzle-exhaust handles

A `NozzleHandleObject` marks one nozzle exhaust placement while the Engine designer is open
(see [engines.md](./engines.md)): a cube at the LOCATION plus a cone along the DIRECTION, the
`ConnectorObject` cube+cone language with the cone aimed at an arbitrary vector instead of
local +X. They differ from every other marker in three deliberate ways:

- **N per engine, not one.** `EditorScene` reconciles a `Map<targetKey, NozzleHandleObject>`
  from `$resolvedNozzleTargets` — one handle per nozzle × flavor × **placement of the owning
  template** × channel, amber for the thrust pair and **cyan** for an FX override (KSA's own
  debug-arrow colours). The gizmo's target is at full opacity, the rest dimmed. The placement
  axis is the collider/light multi-instance pattern again (a SubPart-owned nozzle is
  instantiated per placement, which is how a stock RCS block gets 4 thrusters from one
  `<DeLavalNozzle>`), so a drag through one handle moves its siblings in sync — the
  `NozzleRef` names the placement its write-back frame comes from, exactly as
  `$lightEditContext` does for lights. Handles are **disposed**, not hidden, when the designer
  closes: three.js raycasts invisible objects, so a hidden-but-pickable marker would keep
  stealing clicks.
- **`depthTest: false`** (plus `renderOrder`), because an exhaust point sits inside or at the
  lip of the very bell it describes — a depth-tested marker would be swallowed by it.
  `SelectionManager` therefore also lets a `kind: 'nozzle'` hit **win over distance**, since
  honouring depth order would make a visibly-on-top handle unclickable.
- **Clicking one is not a document selection.** It routes to `setActiveNozzleRef` and leaves
  the mesh/connector selection untouched (the engine's own SubPart is usually what's
  selected while you place its exhaust). The gizmo still drags a *proxy*
  (`engine-exhaust-proxy`), the same way `PoseGizmo` drags the animation `pose-proxy` — posed
  with both the position and the orientation of the exhaust axis, which is what gives the
  rotate rings meaning.

### Animation viewport layers

Animation mode adds three layers, all off in every other mode (`$mode` gates each). They are
described in full in `plans/flexo_v2/design/design-animation-mode.md` §9; the parts that
matter for this file are the ones that touch the gizmo contract and the render loop.

- **`PoseGizmo`** replaces `TransformControls` for posing. It is flexo's only hand-built
  gizmo, because posing a hinge is a different job from placing a SubPart: **Rotate** draws
  three rings whose radius is the member set's bounding-sphere radius (clamped 0.3–3 m AND
  24–160 px, so they wrap a big panel and stay grabbable on a small bracket) plus an outer
  camera-plane ring; **Move** draws a central free-drag disc that translates in the camera
  plane — multi-axis in one gesture — plus three axis stems; **Scale** draws three axis
  handles and a centre uniform handle. Handle geometry is unit-sized and the whole subtree is
  SCALED, so a camera move is one `scale.setScalar`, not a rebuild.
  - It keeps the gizmo contract verbatim: **one `pushUndo` at drag start**, streaming writes
    after, orbit disabled and picking suppressed for the duration, `⌃` inverts the snap
    setting for that drag only, and Escape (ladder rung 4) restores the drag-start frame
    rather than popping the undo step.
  - **Per-gesture axis lock**: tapping `X`/`Y`/`Z` mid-drag locks the gesture to that
    joint-LOCAL axis, the same letter again to the WORLD axis, a third time frees it, with a
    coloured guide line through the gizmo. The listener is attached at drag start and removed
    at drag end — pointer-capture-local, deliberately not a hotkey-registry binding.
  - **Working pivot**: with `$workingPivot` set, a rotation is computed about that point
    (`ΔW = T(p)·R·T(p)⁻¹·W_joint`) and written back as the joint pose; translation ignores it.
  - The gizmo does not touch the document. `EditorScene.handlePoseGizmoChange` decides what
    the new frame MEANS: at the rest-anchor column (`$pivotRouting`) Move is `moveJointPivot`
    and Rotate is `reorientJointPivot` (Scale is absent — a pivot stays unit-scaled, so it
    degrades to Move and the Tool bar disables it); every other column is a plain
    `setJointPose`. That routing is the fix for v1's t=0 special case, which disagreed with
    `restAnchorTime` on any imported KSA deploy clip.
- **`JointMarkerLayer`** draws every joint of the open clip at `jointWorld(anim, joint,
  restAnchorTime(anim))` — the modelled frame, which is what puts the marker ON the geometry
  for a deploy import. Inactive joints are screen-constant octahedra; the active one is a
  0.4-unit axis triad with a CSS2D name label. The markers live in `EditorScene.root` because
  that is what `SelectionManager` raycasts: a hit resolves to `kind: 'joint'` and simply sets
  `$activeJointId`, changing no selection. Their pick volume is an invisible ~12 px sphere, and
  `SelectionManager` lets a joint hit win over distance (the nozzle-handle rule) since a
  pivot usually sits inside the mesh it swings. The set is **rebuilt/removed**, never hidden —
  three.js raycasts invisible objects.
- **`TrajectoryLayer`** draws the member-set CENTROID path per animated joint (a pure hinge's
  origin never moves, so an origin-only trail would draw nothing for the commonest rig), with
  keyframe ticks, a ringed anchor tick and a playhead bead. It lives on `viewport.scene`, so
  it is never pickable. Curves rebuild only on document / clip / joint / preference change;
  the high-frequency `$playheadSec` is subscribed IMPERATIVELY inside the layer and moves only
  the bead. `View ▸ Motion Trails ▸ Selected / All / Off` and the transport `↝` menu both write
  the persisted `flexo:animTrails`.

While a posed preview locks the placement gizmo (the selection contains something the clip
drives and the playhead is off the rest anchor), `EditorScene` publishes
`$posedPlacementLock`, and the status bar says so with a click action back to rest — v1
detached the gizmo silently.

### Chain preview ghosts

While an action-chain session is open, `ChainPreviewLayer` draws what
Apply would produce: one translucent accent-green clone per evaluated instance. It is the
only overlay built by *cloning* document objects rather than authoring its own geometry, so
its rules are about not paying for that twice:

- Its group lives on **`viewport.scene`, not `EditorScene.root`** (the `MeasurementLayer`
  precedent) — ghosts are an editor aid, so they stay out of the exported `flexo-part`
  hierarchy, out of `applyLayerView`'s visibility/opacity bookkeeping, and out of the pick
  set. Every cloned node additionally gets a no-op `raycast`, so a ghost can never steal a
  click from the real object underneath it.
- `Group.clone(true)` shares geometry by reference and **every cloned mesh's material is
  replaced with one module-level singleton** (`MeshBasicMaterial`, unlit + translucent).
  A refresh therefore allocates no GPU resources and disposes none — `refresh()` is
  `group.clear()` plus re-clone, cheap enough to run on every keystroke, and the singleton
  outlives the layer. Swapping the material also means a selected seed's highlight emissive
  never bleeds into its ghosts.
- A **cap of 500 ghosts** (`PREVIEW_MAX_GHOSTS`; the chain itself may evaluate up to 2000
  instances). Past it the preview stops adding and the palette footer says it was capped.
- A seed is ghosted **only when the chain moves it** (any of its 9 transform numbers differs
  by more than `1e-9` from the live placement) — that is what makes a pure-transform chain,
  which creates nothing, previewable. Instances whose source object is still loading are
  skipped, not queued.
- Refresh triggers: the `$chainEval` subscription (which recomputes on session edits *and*
  `$part` changes, so gizmo-dragging a seed re-flows the array live, and closing the session
  clears the ghosts), plus the async `SubPartObject.create` completion block, so a seed that
  finished loading mid-session gets its ghosts. Both end in `viewport.invalidate()`.

### Seat view (the IVA camera preview)

`Viewport` has a second camera mode. `EditorScene` resolves `$seatView` (a seat **id**) against
the document to a pose and calls `viewport.enterSeatView({ position, forward, up })`, which
snapshots the orbit camera, disables `OrbitControls` **and skips `controls.update()`** — it
re-aims at `controls.target` unconditionally, ignoring `enabled`, and would undo every
`lookAt`. `$seatLook` holds the current unit **look direction** (not a yaw/pitch accumulator);
a pointer drag applies its delta to that stored direction and runs `clampSeatLook` **once**, so
the clamp always eats its own output and converges exactly as the game's per-frame loop does —
re-composing from a raw accumulator instead lets a single pass under-correct and escape both
clamps (see [iva-seats.md](./iva-seats.md)). `applySeatCamera` then sets
`camera.position`/`up`/`lookAt`, guarding a degenerate `cross(look, up)` so a pole case keeps
the last good roll. The FOV needs no change: flexo's camera is already 50°, which is KSA's own.

While seated, three things are suppressed — the transform gizmo, click-selection, and **the
seat markers themselves** (you are inside the one you sat in, so it would fill the screen).
`exitSeatView` restores the orbit camera exactly and removes the handlers; `dispose()` calls it
too, so a leaked pointer handler can never outlive the canvas. A previewed seat that no longer
exists exits cleanly rather than parking the camera on a stale eye point.

## Camera commands

Three camera moves, each a command (**View** menu, the ⌘K palette, and — for framing — a key).
The UI side lives in `viewStore` intent atoms (`frameCamera`/`snapCamera`/`resetCamera`) that
`EditorScene` consumes, because only the scene can answer "around what".

| Command | Key | Behavior |
|---|---|---|
| **Frame Selection** (`view.frameSelection`) | `F` | Fits the selection and re-centers the orbit target on it, keeping the current view direction. **Frame-all fallback**: with nothing selected it frames the whole part — placements, colliders, lights, connectors, IVA seats and kittens, whatever the scene holds — and an empty part lands on the origin at the default distance. The fallback measures only what is actually DRAWN (`computeVisibleWorldBounds`), so hidden layers and a light marker's hidden coverage shells never inflate the box. |
| **Camera Snap ▸** six directions (`view.cameraSnap:<dir>`) | — | Axis-aligned view at the current distance, orbiting the **selection centroid** (the selection's world bounds centre) — or the origin when nothing is selected. |
| **Reset Camera** (`view.resetCamera`) | — | Back to the default three-quarter pose. |

`F` was v1's rotate-step key. It is Frame Selection now, and the rotation step moved to
`[` / `]`.

## Viewport keys

Every binding is declared once in the scoped hotkey registry (`src/ui/hotkeys/registry.ts`)
and shown in **Help ▸ Keyboard Shortcuts…** (`?`), which is generated from it. The keys the
3D workspace owns are **viewport-scoped**: they are live only when no overlay dialog is open,
you are not typing in a field, and focus is not inside an interactive list — a focused
Outliner/asset list keeps its own row navigation. They stay live in *every* mode.

| Keys | Action |
|---|---|
| `W`/`S` · `A`/`D` · `Q`/`E` | Rotate the selection about the three cycling axis pairs |
| `R` | Cycle the rotation-axis mapping |
| `[` / `]` | Rotation step smaller / larger (**was `F`/`⇧F` in v1**) |
| `↑` `↓` · `⇧↑` `⇧↓` · `←` `→` · `⇧←` `⇧→` | Nudge · fast nudge · cycle nudge axis · cycle nudge step |
| `F` | Frame Selection (above) |
| `T` / `⇧T` | Cycle the gizmo tool Move → Rotate → Scale (forward / back) |
| `M` | Arm the point-to-point measure tool (`Esc` cancels — see below) |
| `⌘A` · `⌥⌘A` · `⇧⌘I` | Select all · deselect · invert |
| `⌘C` `⌘X` `⌘V` `⌘D` `⌫` | Copy · cut · paste in place · duplicate · delete |

App-level chords stay **global** (they keep working with a dialog open): `⌘Z`/`⇧⌘Z`,
`⌘K` (command palette), `⇧⌘K` (action chain), `1`–`5` (switch mode — gated so they never fire
behind a dialog), `?` (Help), `Esc`.

`Esc` is ONE binding running an ordered ladder (`src/ui/hotkeys/escLadder.ts`): dirty numeric
field revert → menu/popover/dialog dismiss → palette close → **gizmo drag cancel** →
armed-tool cancel → chain cancel → animation unwind → seat-view exit → nothing. Escape never
clears the selection and never leaves a mode. The gizmo rung is the scene's: `$gizmoCancel`
makes `TransformControls.reset()` restore the drag-start transform.

The armed-tool rung is fully generic: it runs `disarmTool()` on the single `$activeTool` slot,
so it cancels the marquee, the measure tool (pending point included) and exhaust placement
without knowing anything about them. Seat view keeps its own rung further down, because its
Escape must never be `preventDefault`ed. See
[editor-state.md](./editor-state.md#the-transient-tools--one-slot-four-tenants) for the tenant
table.

## Measure — the point-to-point tool

`M` (or **Tools ▸ Measure Point-to-Point**, the Outliner's Aids `＋ p2p`, or the ⌘K palette)
arms it in the `$activeTool` slot: crosshair cursor, click-selection suppressed, gizmo
untouched. The first click raycasts the part meshes and snaps to the **nearest face vertex**,
falling back to the Y=0 ground plane in empty space; the second completes the measurement,
which activates (taking the left sidebar's focus slot) and disarms the tool. More than 4px of
pointer movement is an orbit, not a pick. One undo step, `'add measurement'`, on completion.

The status bar's tool segment reads `Measure — click first point` and then
`Measure — click second point`, and the left sidebar shows a tool parameter card naming the
placed point (`A placed at (x, y, z) — click point B`). Escape cancels the pending point and
disarms in one press; switching modes cancels it, half-placed pick and all.

## Display Filters

**View ▸ Display Filters** toggles whole entity KINDS (connectors, colliders, IVA seats,
lights, kittens, measurement aids) independently of layers — `viewStore.$kindVisibility`, a
persisted per-browser view preference (`flexo:kindVisibility`), never document state and never
undone. `EditorScene.isKindDisplayed` is the ONE predicate the three enforcement sites share:
`applyLayerView` composes it into `group.visible`, the click-select guards read it, and so does
the marquee's box projection — so a hidden kind is invisible, unclickable and unmarquee-able by
the same rule a hidden LAYER is. SubParts have no filter and are always displayed.

## Layer visibility & lock

`EditorScene` subscribes to `$layerView` and `applyLayerVisibility()` sets each
entity's `group.visible` from its layer's visibility (on reconcile and after async
builds). A hidden layer renders nothing — but three's raycaster does NOT skip
`visible === false` objects, so the click-select callback explicitly rejects hits on
hidden layers (and on **locked** ones). Those per-kind guards are load-bearing, not
belt-and-braces. See [layers.md](./layers.md).

That pass is the **only** writer of `group.visible`, which is what keeps the other visibility
rules from fighting it: the persisted **Hide interior** toggle (`$hideInterior`) and the
seat-view marker suppression *compose* with the layer state (an entity draws iff its layer is
visible AND nothing else hides it) instead of overwriting it.

## Coordinate & transform mapping

All XML/store ↔ three.js transform conversion is isolated in `coords.ts`. See
[coordinates.md](./coordinates.md), including the `?debug=dockingport` calibration.

## Lighting / look

`HemisphereLight` (low) + `DirectionalLight` (key) + `RoomEnvironment` PMREM
environment for IBL reflections, with `ACESFilmicToneMapping`. Tune
`renderer.toneMappingExposure` in `Viewport.ts`. See [texturing.md](./texturing.md).

## Notes
- `RenderLoop` drives rendering on demand (see above); `dispose()` cancels any
  pending frame, disconnects the `ResizeObserver`, disposes
  controls/env-render-target/renderer, and removes the canvas. StrictMode
  double-invoke in dev is handled by clean disposal.
- The three preview viewports (`SubPartPreviewViewport`, `PartPreviewViewport`,
  `ModelPreviewViewport`) each own a second WebGL context and follow the same
  on-demand rule: they invalidate on controls `change`, resize, lighting, context
  restore, and whenever their content is set.
