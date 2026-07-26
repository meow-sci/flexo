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
| `samplePoints.ts` | Shared world-space geometry sampler (bbox corners or every vertex) for collider fitting and container containment warnings. |
| `Grid.ts` | Origin grid (XZ plane) + colored axes (1 cell = 1 m). |
| `SelectionManager.ts` | Raycast click-to-select (fires on pointerup only when the pointer barely moved, so orbit/gizmo drags aren't clicks). |
| `TransformGizmo.ts` | Wraps `TransformControls` (translate/rotate/scale); disables orbit while dragging; emits transform changes. |
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
| Any editor store (`$part`, selection, layers, settings, animation preview, …) | `EditorScene.sub()` — the ONLY way this class subscribes; it invalidates after each callback. **Never call `store.subscribe` directly here.** |
| Async SubPart / kitten builds | explicit `viewport.invalidate()` in the `.then` — geometry lands long after the store change that asked for it |
| Camera (orbit, pan, zoom, damping, snap, restore) | `OrbitControls`' `change` event. Damping keeps re-firing until it settles, so inertia still animates and then stops |
| Any of the three `TransformControls` (selection gizmo, measurement endpoint, container) | their `change` event — covers hover-axis highlight, attach/detach and drag steps |
| `MeasurementLayer` / `ContainerLayer` | every mutation funnels through `refresh()`, which invalidates at the end |
| Environment / tonemapping / exposure | `$lighting` subscription invalidates twice: once for the synchronous half, once when the async HDR + PMREM lands |
| Resize | `handleResize()` |
| WebGL context restored | `webglcontextrestored` listener — an on-demand loop has no "next frame" to repair a blank canvas |

`RenderLoop.setContinuous(true)` is the escape hatch for the rare case that needs
a frame per vsync. Only the stats.js FPS overlay uses it: the counter exists to
measure how fast the scene *can* draw, and would otherwise read ~0 fps whenever
the user stopped moving. Turning the overlay on is therefore also opting into the
idle cost it reports.

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

- Clicking a mesh → `SelectionManager` resolves `instanceId` from `userData` →
  `selectPlacement(index)`. Clicking empty space → `selectPlacement(-1)`.
- `EditorScene.updateSelection()` (subscribed to `$selectedIndex`) toggles the
  highlight (per-instance emissive, saved/restored) and attaches the gizmo to the
  selected object's group. It **never re-attaches mid-drag** (would reset the drag).
- Gizmo: mode follows `$toolMode`; snap follows `$snap`
  (`setTranslationSnap`/`setRotationSnap`). On drag start it pushes one undo
  snapshot; on `objectChange` it reads the transform via
  `coords.readPlacementTransform` and calls `updatePlacementTransform`.

Because the gizmo writes through the store and the scene reconciles from the store,
the transform [inspector](./editor-state.md) and the gizmo are two-way synced.

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

## Layer visibility & lock

`EditorScene` subscribes to `$layerView` and `applyLayerVisibility()` sets each
entity's `group.visible` from its layer's visibility (on reconcile and after async
builds). A hidden layer renders nothing; three's raycaster also skips
`visible === false`, so hidden entities are non-clickable. The click-select
callback additionally rejects hits in a **locked** layer. See [layers.md](./layers.md).

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
