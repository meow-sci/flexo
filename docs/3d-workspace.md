# 3D Workspace

The full-screen three.js viewport where SubParts are placed and manipulated.
All code is under `src/three/`.

## Components

| File | Responsibility |
|---|---|
| `Viewport.ts` | Renderer, scene, perspective camera, lights, reference grid, `OrbitControls`, render loop, resize. Also sets ACES tonemapping + sRGB output + `RoomEnvironment` IBL (see [texturing.md](./texturing.md)). |
| `EditorScene.ts` | Owns the `Viewport`; subscribes to the store and reconciles `SubPartObject`s; wires selection + gizmo. The bridge between state and scene. |
| `SubPartObject.ts` | One placed SubPart: a `THREE.Group` (carrying `userData.instanceId`) holding the atlas mesh + its material. |
| `MeshAtlasCache.ts` | Loads GLB atlases (`GLTFLoader`), extracts geometry by node name, bakes the node's local transform, caches per `atlasUrl#node`. |
| `ColliderObject.ts` | One collision primitive: a fat-line wireframe + a low-alpha fill (the raycast target). Geometry is **unit-normalised**, so the group's `scale` IS the collider's size in meters and the scale gizmo edits dimensions directly. See [colliders.md](./colliders.md). |
| `wireShapes.ts` | Shared unit-box wireframe builders (box / cylinder / sphere / capsule outlines) used by `ColliderObject` AND `ContainerLayer`. |
| `samplePoints.ts` | Shared world-space geometry sampler (bbox corners or every vertex) for collider fitting and container containment warnings. |
| `Grid.ts` | Origin grid (XZ plane) + colored axes (1 cell = 1 m). |
| `SelectionManager.ts` | Raycast click-to-select (fires on pointerup only when the pointer barely moved, so orbit/gizmo drags aren't clicks). |
| `TransformGizmo.ts` | Wraps `TransformControls` (translate/rotate/scale); disables orbit while dragging; emits transform changes. |
| `ViewportCanvas.tsx` | React glue: mounts `EditorScene` into a div in a `useEffect`, disposes on unmount (StrictMode-safe). |

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

## Layer visibility & lock

`EditorScene` subscribes to `$layerView` and `applyLayerVisibility()` sets each
entity's `group.visible` from its layer's visibility (on reconcile and after async
builds). A hidden layer renders nothing; three's raycaster also skips
`visible === false`, so hidden entities are non-clickable. The click-select
callback additionally rejects hits in a **locked** layer. See [layers.md](./layers.md).

## Coordinate & transform mapping

All XML/store ↔ three.js transform conversion is isolated in `coords.ts`. See
[coordinates.md](./coordinates.md), including the `?debug=dockingport` calibration.

## Lighting / look

`HemisphereLight` (low) + `DirectionalLight` (key) + `RoomEnvironment` PMREM
environment for IBL reflections, with `ACESFilmicToneMapping`. Tune
`renderer.toneMappingExposure` in `Viewport.ts`. See [texturing.md](./texturing.md).

## Notes
- `setAnimationLoop` drives rendering; `dispose()` stops the loop, disconnects the
  `ResizeObserver`, disposes controls/env-render-target/renderer, and removes the
  canvas. StrictMode double-invoke in dev is handled by clean disposal.
